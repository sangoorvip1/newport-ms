/**
 * طبقة العميل للمزامنة دون اتصال (Offline-first client core).
 *
 * تُستخدم في تطبيقي سطح المكتب (Electron + IndexedDB/Dexie) والموبايل (React Native + SQLite/AsyncStorage):
 * كل ما يحتاجه التطبيق هو تنفيذ LocalStore على مخزنه المحلي، فسلوك المزامنة (قائمة الانتظار،
 * cursor، دمج التعارضات، إعادة المحاولة) مشترك ومُختبَر هنا ولا يُعاد اختراعه في كل واجهة.
 *
 * العقد مع الخادم (apps/api/src/sync) — الإصدار 3:
 *   POST /api/v1/sync/push   { deviceId, userId, schemaVersion, ops[] } → { results[], nextCursor }
 *   GET  /api/v1/sync/pull   ?deviceId&sinceCursor&entities&limit        → { changes[], cursor, hasMore, fullResyncRequired? }
 */
import {
  SCHEMA_VERSION,
  SYNC_META,
  appendValue,
  mergeFieldwise,
  planPushBatches,
  type ChangeOp,
  type PushOutcome,
  type PushResponse,
  type PushResult,
  type PullChange,
  type PullResponse,
  type SyncEntity,
} from './sync.js';
import type { DocumentPendingRecord, DocumentPendingStore } from './documents.js';

/** نسخة من سجل مخزّنة محليًا. `data` يحتوي حقول الجدول + `version`/`deletedAt`. */
export interface EntityRecord<T = Record<string, unknown>> {
  id: string;
  version: number;
  deleted: boolean;
  data: T;
}

/** سجل عملية قيد الإرسال في مخزن الجهاز */
export interface PendingOp {
  op: ChangeOp;
  attempts: number;
  lastErrorAt?: string;
  lastError?: string;
}

export interface LocalConflict {
  opId: string;
  entity: SyncEntity;
  recordId: string;
  outcome: PushOutcome;
  reasonAr: string;
  server?: Record<string, unknown>;
  client: Record<string, unknown>;
  at: string;
}

/** واجهة المخزن المحلي — ينفذها Dexie (سطح المكتب) أو SQLite (الموبايل) */
export interface LocalStore {
  read(entity: SyncEntity, id: string): Promise<EntityRecord | null>;
  write(entity: SyncEntity, id: string, rec: EntityRecord): Promise<void>;
  delete(entity: SyncEntity, id: string): Promise<void>;
  listIds(entity: SyncEntity): Promise<string[]>;
  pending(): Promise<PendingOp[]>;
  addPending(op: ChangeOp): Promise<void>;
  /** يُزيل العملية بعد قبول الخادم (APPLIED/MERGED/DEDUPLICATED) */
  resolvePending(opId: string, outcome: PushOutcome): Promise<void>;
  /** يبقيها في الطابور مع زيادة محاولات إعادة الإرسال */
  failPending(opId: string, error: string): Promise<void>;
  getState(key: SyncStateKey): Promise<string | null>;
  setState(key: SyncStateKey, value: string): Promise<void>;
  conflicts(): Promise<LocalConflict[]>;
  addConflict(c: LocalConflict): Promise<void>;
  clearConflict(opId: string): Promise<void>;
}

export type SyncStateKey =
  | 'cursor'
  | 'schemaVersion'
  | 'lastPushAt'
  | 'lastPullAt'
  | 'clockSkewMs'
  | 'pendingConflicts'
  | 'networkOnline';

/** ناقل HTTP مُحقن: يضيف التوكن وإعادة محاولة refresh في التطبيق */
export interface SyncTransport {
  request<T>(input: { method: 'GET' | 'POST'; path: string; body?: unknown; query?: Record<string, string | number> }): Promise<T>;
}

export interface SyncClientOptions {
  deviceId: string;
  userId: string;
  /** يولّد UUIDv7 (يفضَّل)؛ يجب أن يكون فريدًا عالميًا لأن الخادم يعتمد عليه كمفتاح idempotency */
  newId?: () => string;
  now?: () => Date;
  /** أقصى عدد عمليات في الدفعة الواحدة */
  batchSize?: number;
  /** أقصى عدد صفحات السحب في الجلسة الواحدة (حماية من الدوران اللانهائي) */
  maxPullPages?: number;
}

export interface LocalMutation {
  entity: SyncEntity;
  id: string;
  kind: 'UPSERT' | 'PATCH' | 'DELETE';
  data?: Record<string, unknown>;
}

export interface SyncRunReport {
  pushed: { applied: number; merged: number; conflicts: number; rejected: number; dedup: number; failed: number };
  pulled: number;
  cursor: number;
  hasMore: boolean;
  fullResyncRequired: boolean;
  resyncReasonAr?: string;
  online: boolean;
}

const okOutcome = (o: PushOutcome) => o === 'APPLIED' || o === 'MERGED' || o === 'DEDUPLICATED';

/* ─────────────────────────── أدوات قابلة للاختبار ─────────────────────────── */

/**
 * سياسة إعادة المحاولة الأسّية مع إزاحة عشوائية (jitter):
 * تفيد في المعمل عند عودة الشبكة فجأة بعد انقطاع — لا تريد 400 جهاز يضربون الخادم في نفس الثانية.
 */
export function backoffMs(attempts: number, base = 2_000, cap = 5 * 60_000, rand: () => number = Math.random): number {
  const exp = Math.min(cap, base * 2 ** Math.max(0, attempts));
  return Math.round(exp / 2 + rand() * (exp / 2));
}

/** يولّد opId فريد دون اعتماد خارجي (crypto يتوفّر في Electron و Expo) */
export function makeOpId(rand: () => string): string {
  return `op-${Date.now().toString(36)}-${rand()}`;
}

/**
 * UUIDv7 للمعرّفات التي ينشئها الجهاز أثناء العمل دون اتصال:
 * البادئة تحمل مللي-ثواني الطابع الزمني، فتبقى السجلات مرتّبة تقريبيًا حسب الإنشاء حتى لو وُلّدت في معمل بلا شبكة.
 * (الخادم يقبل أي UUID صالح؛ v7 يفيد فهرسة البِنية وترتيب السجلات في التقارير.)
 */
export function newUuidV7(rand: () => number = Math.random, now: number = Date.now()): string {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(rand() * 256) & 0xff;
  const ts = Math.floor(now);
  bytes[0] = Math.floor(ts / 2 ** 32) & 0xff;
  bytes[1] = Math.floor(ts / 2 ** 24) & 0xff;
  bytes[2] = Math.floor(ts / 2 ** 16) & 0xff;
  bytes[3] = Math.floor(ts / 2 ** 8) & 0xff;
  bytes[4] = ts & 0xff;
  bytes[5] = Math.floor(ts / 2 ** 40) & 0x0f;
  bytes[6] = 0x70 | ((bytes[6] ?? 0) & 0x0f); // version 7
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f); // variant 10
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** هل هذا المعرّف من إنتاج الجهاز (isOfflineCreated) ولا يزال بلا نسخة على الخادم؟ */
export function isLocalOnly(rec: { data?: Record<string, unknown> } | null): boolean {
  return Boolean(rec?.data && (rec.data as { isOfflineCreated?: boolean }).isOfflineCreated);
}

/**
 * تطبيق تغيير قادم من الخادم على نسخة الجهاز.
 *  - append_only: سجل حدثي، يُقبل كما هو دائمًا (لا يعدّل نفسه).
 *  - server_wins: الخادم مصدر الحقيقة (الأصول/جداول الصيانة).
 *  - field_merge: لو كان لدى الجهاز نسخة أحدث غير مُرسَّلة، تُلحق حقوله الحدثية فوق نسخة الخادم بدل فقدانها.
 *  - deletedAt: حذف منطقي (tombstone) لا يُمسح منه السجل حتى يبقى ظاهرًا في تقارير الأقسام.
 */
export function applyRemoteChange(
  store: LocalStore,
  change: PullChange,
  local: EntityRecord | null,
): Promise<EntityRecord> {
  const meta = SYNC_META[change.entity];
  const write = (rec: EntityRecord) => store.write(change.entity, change.recordId, rec).then(() => rec);

  // حذف منطقي قادم من الخادم: نبقي الصف tombstone (لا يُمسح) عدا السجلات الحدثية فهي لا تُحذف أصلًا
  if (change.deleted) {
    if (meta.merge === 'append_only') return write({ id: change.recordId, version: change.version, deleted: false, data: { ...(local?.data ?? {}), ...change.data } });
    return write({ id: change.recordId, version: change.version, deleted: true, data: { ...(local?.data ?? {}), ...change.data } });
  }
  if (!local) return write({ id: change.recordId, version: change.version, deleted: false, data: change.data });
  // الأصول وجداول الصيانة: الخادم مصدر الحقيقة دائمًا
  if (meta.merge === 'server_wins') return write({ id: change.recordId, version: change.version, deleted: false, data: change.data });
  // للكيانات القابلة للدمج: حقول الخادم المحمية تُحسم لصالحه، وحرّة الجهاز تبقى — حتى لو كانت نسخة الجهاز أحدث
  if (meta.merge === 'field_merge') {
    const merged = mergeFieldwise(change.data, local.data, meta);
    return write({ id: local.id, version: change.version, deleted: false, data: { ...merged.merged, version: change.version, __localAhead: local.version > change.version } });
  }
  // reject (سجلات حساسة): نتبنّى نسخة الخادم ونترك نسخة الجهاز في الطابور لتُعرض للمراجعة
  return write({ id: change.recordId, version: change.version, deleted: false, data: change.data });
}

/** دمج سجل محلي مع نسخة الخادم عند التعارض (تُستخدم في شاشة "حل التعارض") */
export function mergeServerRecord(entity: SyncEntity, server: Record<string, unknown>, client: Record<string, unknown>): Record<string, unknown> {
  const meta = SYNC_META[entity];
  if (meta.merge === 'append_only' || meta.merge === 'server_wins') return { ...server };
  const merged = mergeFieldwise(server, client, meta);
  return merged.merged;
}

/* ─────────────────────────── المحرك ─────────────────────────── */

export class SyncClient {
  private readonly newId: () => string;
  private readonly now: () => Date;

  constructor(
    private readonly store: LocalStore,
    private readonly transport: SyncTransport,
    private readonly opts: SyncClientOptions,
  ) {
    this.newId = opts.newId ?? (() => makeOpId(() => Math.random().toString(36).slice(2, 10)));
    this.now = opts.now ?? (() => new Date());
  }

  /** تسجيل تعديل محلي: يُكتب فورًا في المخزن (تجربة فورية للمستخدم) ويُدفع للطابور */
  async queue(m: LocalMutation): Promise<ChangeOp> {
    const guard = SYNC_META[m.entity];
    if (guard?.restOnly) {
      // الفشل هنا مقصود: لو قَبِلنا العملية فستبقى في الطابور إلى الأبد أو تُنشئ سطرًا بـ objectKey وهمي
      throw new Error(`«${m.entity}» لا يُكتب عبر المزامنة — ${guard.descriptionAr}`);
    }
    const current = await this.store.read(m.entity, m.id);
    const data = m.kind === 'PATCH' ? { ...(current?.data ?? {}), ...(m.data ?? {}) } : (m.data ?? {});
    const op: ChangeOp = {
      opId: this.newId(),
      entity: m.entity,
      recordId: m.id,
      kind: m.kind,
      data: m.kind === 'DELETE' ? undefined : data,
      baseVersion: current?.version ?? 0,
      clientTimestamp: this.now().toISOString(),
    };
    if (m.kind !== 'DELETE') {
      await this.store.write(m.entity, m.id, {
        id: m.id,
        version: (current?.version ?? 0) + 1,
        deleted: false,
        data: { ...data, version: (current?.version ?? 0) + 1 },
      });
    } else {
      const meta = SYNC_META[m.entity];
      if (meta.merge !== 'append_only') {
        await this.store.write(m.entity, m.id, { id: m.id, version: (current?.version ?? 0) + 1, deleted: true, data: current?.data ?? {} });
      }
    }
    this.opEntity.set(op.opId, m.entity);
    this.recOp.set(`${m.entity}:${m.id}`, op.opId);
    await this.store.addPending(op);
    return op;
  }

  /** العمليات المعلّقة الجاهزة (لشاشة "بانتظار المزامنة") */
  pendingCount(): Promise<number> {
    return this.store.pending().then((p) => p.length);
  }

  conflicts(): Promise<LocalConflict[]> {
    return this.store.conflicts();
  }

  /** قراءة نسخة الجهاز — تستخدمها الشاشات قبل العرض/الإلحاق */
  readLocal(entity: SyncEntity, id: string): Promise<EntityRecord | null> {
    return this.store.read(entity, id);
  }

  /** ضبط المستخدم بعد تسجيل الدخول (الخادم يربط العمليات بهوية الجلسة، والمعرّف هنا للتشخيص والتقييد) */
  setUser(userId: string): void {
    if (userId) this.boundUserId = userId;
  }
  private userId(): string {
    return this.boundUserId ?? this.opts.userId;
  }
  private boundUserId?: string;

  /** يعالج قرار المستخدم: "خذ نسختي" أو "خذ نسخة الخادم" ثم يعيد الإدراج في الطابور */
  async resolveConflict(opId: string, side: 'local' | 'server'): Promise<void> {
    const [c] = (await this.store.conflicts()).filter((x) => x.opId === opId);
    if (!c) return;
    if (side === 'server') {
      await this.store.write(c.entity, c.recordId, { id: c.recordId, version: Number(c.server?.version ?? 0), deleted: false, data: c.server ?? {} });
      await this.store.clearConflict(opId);
      await this.store.resolvePending(opId, 'MERGED');
      return;
    }
    const op: ChangeOp = { opId: `${opId}-forced`, entity: c.entity, recordId: c.recordId, kind: 'UPSERT', data: c.client, clientTimestamp: this.now().toISOString() };
    await this.store.addConflict({ ...c, opId: `${opId}-forced`, reasonAr: 'إعادة إرسال بعد اختيار نسخة الجهاز', outcome: 'CONFLICT' }).catch(() => undefined);
    await this.store.clearConflict(opId);
    await this.store.resolvePending(opId, 'REJECTED');
    await this.store.addPending(op);
  }

  /**
   * دورة مزامنة كاملة: دفع ثم سحب. آمنة للاستدعاء الدوري (كل 30 ثانية) وعند استعادة الشبكة،
   * وتتحول إلى "pump" صامت عند انقطاع الشبكة: تُبقي الطابور كما هو وتُبلّغ أن الجهاز غير متصل.
   */
  async syncOnce(): Promise<SyncRunReport> {
    const report: SyncRunReport = {
      pushed: { applied: 0, merged: 0, conflicts: 0, rejected: 0, dedup: 0, failed: 0 },
      pulled: 0,
      cursor: await this.readCursor(),
      hasMore: false,
      fullResyncRequired: false,
      online: true,
    };
    try {
      await this.pushAll(report);
    } catch (e) {
      return this.offline(report, e);
    }
    try {
      await this.pullAll(report);
    } catch (e) {
      return this.offline(report, e);
    }
    await this.store.setState('networkOnline', '1');
    return report;
  }

  private offline(report: SyncRunReport, e: unknown): SyncRunReport {
    // انقطاع الشبكة ليس خطأ بيانات: الطابور يبقى كما هو ويُعاد في الدورة التالية
    report.online = false;
    report.resyncReasonAr = String((e as Error)?.message ?? e);
    void this.store.setState('networkOnline', '0');
    return report;
  }

  private async readCursor(): Promise<number> {
    const raw = await this.store.getState('cursor');
    return raw ? Number(raw) : 0;
  }

  /** الدفع على دفعات، وكل عملية تُزال من الطابور عند القبول فقط */
  private async pushAll(report: SyncRunReport): Promise<void> {
    const queue = await this.store.pending();
    if (!queue.length) return;
    const local = (await this.store.getState('schemaVersion')) ?? String(SCHEMA_VERSION);
    if (Number(local) !== SCHEMA_VERSION) {
      await this.store.setState('schemaVersion', String(SCHEMA_VERSION));
      report.fullResyncRequired = true;
      report.resyncReasonAr = 'تغيّر مخطط قاعدة البيانات — ستُعاد مزامنة كاملة';
    }
    const batches = planPushBatches(queue.map((p) => p.op), this.opts.batchSize ?? 200);
    for (const batch of batches) {
      const res = await this.transport.request<PushResponse>({
        method: 'POST',
        path: '/v1/sync/push',
        body: { deviceId: this.opts.deviceId, userId: this.userId(), schemaVersion: SCHEMA_VERSION, ops: batch },
      });
      report.cursor = Math.max(report.cursor, res.nextCursor ?? report.cursor);
      await this.applyResults(res.results ?? [], report);
      await this.store.setState('lastPushAt', this.now().toISOString());
    }
    await this.store.setState('cursor', String(report.cursor));
  }

  private async applyResults(results: PushResult[], report: SyncRunReport): Promise<void> {
    for (const r of results) {
      if (r.outcome === 'APPLIED') report.pushed.applied++;
      else if (r.outcome === 'MERGED') report.pushed.merged++;
      else if (r.outcome === 'DEDUPLICATED') report.pushed.dedup++;
      else if (r.outcome === 'CONFLICT') report.pushed.conflicts++;
      else report.pushed.rejected++;

      if (okOutcome(r.outcome)) {
        await this.store.resolvePending(r.opId, r.outcome);
        const entity = this.entityOf(r.opId);
        const rec = await this.store.read(entity, r.recordId);
        if (rec && typeof r.serverVersion === 'number') {
          await this.store.write(entity, r.recordId, { ...rec, version: r.serverVersion, data: { ...rec.data, version: r.serverVersion } });
        }
        if (r.outcome === 'DEDUPLICATED') await this.store.clearConflict(r.opId).catch(() => undefined);
        continue;
      }

      if (r.outcome === 'CONFLICT' && r.serverRecord) {
        const entity = this.entityOf(r.opId);
        const rec = await this.store.read(entity, r.recordId);
        await this.store.addConflict({
          opId: r.opId,
          entity,
          recordId: r.recordId,
          outcome: 'CONFLICT',
          reasonAr: r.reasonAr ?? 'تعارض مع نسخة الخادم',
          server: r.serverRecord,
          client: rec?.data ?? {},
          at: this.now().toISOString(),
        });
        // السجل المحمي يبقى على الخادم: نحدّث نسخة الجهاز بالحقول المسموح بها فقط ثم نعيد المحاولة تلقائيًا
        const merged = mergeServerRecord(entity, r.serverRecord, rec?.data ?? {});
        await this.store.write(entity, r.recordId, {
          id: r.recordId,
          version: Number(r.serverRecord.version ?? rec?.version ?? 0),
          deleted: false,
          data: merged,
        });
        continue;
      }

      // REJECTED: تبقى العملية في الطابور لتظهر في شاشة الأخطاء (قد تكون صلاحية مؤقتة)
      await this.store.failPending(r.opId, r.reasonAr ?? 'مرفوض من الخادم');
      report.pushed.failed++;
    }
  }

  /** الخادم يعيد opId فقط في النتائج، لذا نحتفظ بخرائط العملية → الكيان محليًا */
  private readonly opEntity = new Map<string, SyncEntity>();
  /** نفس السجل قد يكون في الطابور أكثر من عملية — آخرها هو ما يطابقه الخادم */
  private readonly recOp = new Map<string, string>();

  private entityOf(opId: string): SyncEntity {
    return this.opEntity.get(opId) ?? 'workOrder';
  }

  /** السحب حتى نفاد الصفحات؛ يتحوّل إلى مزامنة كاملة عند طلب الخادم */
  private async pullAll(report: SyncRunReport, pages = this.opts.maxPullPages ?? 50): Promise<void> {
    let cursor = await this.readCursor();
    for (let i = 0; i < pages; i++) {
      const res = await this.transport.request<PullResponse>({
        method: 'GET',
        path: '/v1/sync/pull',
        query: { deviceId: this.opts.deviceId, sinceCursor: cursor, limit: 500 },
      });
      if (res.fullResyncRequired) {
        report.fullResyncRequired = true;
        report.resyncReasonAr = res.resyncReasonAr;
        await this.store.setState('cursor', '0');
        report.cursor = 0;
        return;
      }
      for (const ch of res.changes ?? []) {
        const opId = this.recOp.get(`${ch.entity}:${ch.recordId}`);
        const local = await this.store.read(ch.entity, ch.recordId);
        await applyRemoteChange(this.store, ch, local);
        report.pulled++;
      }
      cursor = res.cursor ?? cursor;
      report.cursor = cursor;
      report.hasMore = Boolean(res.hasMore);
      // مزامنة الساعة: فرق الزمن يُستخدم لعرض "متأخر بـ X دقيقة" على البطاقات
      if (res.serverTime) {
        const skew = new Date(res.serverTime).getTime() - this.now().getTime();
        if (Math.abs(skew) > 30_000) await this.store.setState('clockSkewMs', String(skew));
      }
      if (!res.hasMore) break;
    }
    await this.store.setState('cursor', String(cursor));
    await this.store.setState('lastPullAt', this.now().toISOString());
  }

  /**
   * مزامنة كاملة (بعد تغيّر المخطط أو طلب الخادم): نمسح الطابور المرسل فقط ثم نسحب كل شيء.
   * لا تُمسح التعديلات المحلية غير المُرسَلة — هي أمان بيانات الفني.
   */
  async fullResync(entities?: SyncEntity[]): Promise<SyncRunReport> {
    await this.store.setState('cursor', '0');
    const report: SyncRunReport = {
      pushed: { applied: 0, merged: 0, conflicts: 0, rejected: 0, dedup: 0, failed: 0 },
      pulled: 0,
      cursor: 0,
      hasMore: false,
      fullResyncRequired: false,
      online: true,
    };
    await this.pullAll(report);
    if (entities?.length) {
      for (const e of entities) for (const id of await this.store.listIds(e)) await this.store.read(e, id);
    }
    return report;
  }
}

/** إلحاق ملاحظة نصية بأمان (يُستخدم في الشاشات قبل الإدراج في الطابور) */
export function appendNote(serverText: string | undefined, clientText: string): string {
  const v = appendValue(serverText ?? '', clientText);
  return typeof v === 'string' ? v : serverText ?? '';
}

/**
 * مخزن مرجعي في الذاكرة — يُستخدم في الاختبارات وفي معاينة الواجهة (Storybook/Dev).
 * التنفيذ الفعلي: Dexie في سطح المكتب و expo-sqlite في الموبايل.
 */
export class MemoryStore implements LocalStore, DocumentPendingStore {
  private readonly recs = new Map<string, EntityRecord>();
  private readonly state = new Map<string, string>();
  private queue: PendingOp[] = [];
  private readonly confl = new Map<string, LocalConflict>();
  /** طابور رفع الوثائق (واجهة DocumentPendingStore) — لبيئة التطوير والاختبارات بلا SQLite/Dexie */
  private readonly docs = new Map<string, DocumentPendingRecord>();

  async listPending(): Promise<DocumentPendingRecord[]> {
    return [...this.docs.values()].map((r) => ({ ...r }));
  }
  async savePending(rec: DocumentPendingRecord): Promise<void> {
    this.docs.set(rec.id, { ...rec });
  }
  async forgetPending(id: string): Promise<void> {
    this.docs.delete(id);
  }
  private seq = 0;

  private key(entity: SyncEntity, id: string) {
    return `${entity}:${id}`;
  }
  async read(entity: SyncEntity, id: string) {
    return this.recs.get(this.key(entity, id)) ?? null;
  }
  async write(entity: SyncEntity, id: string, rec: EntityRecord) {
    this.recs.set(this.key(entity, id), rec);
  }
  async delete(entity: SyncEntity, id: string) {
    this.recs.delete(this.key(entity, id));
  }
  async listIds(entity: SyncEntity) {
    return [...this.recs.entries()].filter(([k]) => k.startsWith(`${entity}:`)).map(([k]) => k.slice(entity.length + 1));
  }
  async pending() {
    return this.queue;
  }
  async addPending(op: ChangeOp) {
    if (this.queue.some((p) => p.op.opId === op.opId)) return;
    this.queue.push({ op, attempts: 0 });
    this.seq++;
  }
  async resolvePending(opId: string) {
    this.queue = this.queue.filter((p) => p.op.opId !== opId);
  }
  async failPending(opId: string, error: string) {
    const hit = this.queue.find((p) => p.op.opId === opId);
    if (hit) {
      hit.attempts++;
      hit.lastError = error;
      hit.lastErrorAt = new Date().toISOString();
    }
  }
  async getState(key: SyncStateKey) {
    return this.state.get(key) ?? null;
  }
  async setState(key: SyncStateKey, value: string) {
    this.state.set(key, value);
  }
  async conflicts() {
    return [...this.confl.values()];
  }
  async addConflict(c: LocalConflict) {
    this.confl.set(c.opId, c);
  }
  async clearConflict(opId: string) {
    this.confl.delete(opId);
  }
  /** لاختبارات: عدد المرات التي دُفع فيها */
  get pushes(): number {
    return this.seq;
  }
}

/* ─────────────────────── نافذة الصلاحيات على العميل ─────────────────────── */

const SCOPE_RANK: Record<string, number> = { NONE: 0, SELF: 1, TEAM: 2, SUBDEPT: 3, DEPT: 4, ALL: 5 };

export interface GrantPair {
  code: string;
  scope: string;
}

/**
 * نسخة العميل من قرار الصلاحية. تستخدمها الواجهتان (Electron/React Native) لإخفاء الأزرار
 * وتنعيم القوائم — وهي عرضية فقط: الخادم يعيد القرار نفسه في AccessGuard ولن نثق بالعميل.
 */
export class AccessView {
  private readonly grants = new Map<string, string>();
  readonly roles: string[];
  readonly facilityWide: boolean;

  constructor(grants: GrantPair[], roles: string[] = [], facilityWide = false) {
    this.roles = roles;
    this.facilityWide = facilityWide;
    for (const g of grants) {
      const cur = this.grants.get(g.code);
      if (!cur || (SCOPE_RANK[g.scope] ?? 0) > (SCOPE_RANK[cur] ?? 0)) this.grants.set(g.code, g.scope);
    }
  }
  static from(session: { permissions?: GrantPair[]; roles?: string[]; facilityWide?: boolean }): AccessView {
    return new AccessView(session.permissions ?? [], session.roles ?? [], session.facilityWide ?? false);
  }
  can(code: string): boolean {
    return this.grants.has(code);
  }
  scopeOf(code: string): string | undefined {
    return this.grants.get(code);
  }
  /** هل يرى المستخدم بيانات كل المعمل؟ (تفحص قبل إظهار مرشّحات الأقسام) */
  get isFacilityWide(): boolean {
    return this.facilityWide || this.grants.get('*') === 'ALL' || [...this.grants.values()].includes('ALL');
  }
  /** عدد الصلاحيات الفعلية — يُعرض في شاشة "صلاحياتي" */
  get size(): number {
    return this.grants.size;
  }
  codes(): string[] {
    return [...this.grants.keys()].sort();
  }
  /** فلترة عناصر قائمة حسب صلاحية مطلوبة */
  filter<T>(items: T[], codeFor: (item: T) => string | undefined): T[] {
    return items.filter((i) => {
      const c = codeFor(i);
      return !c || this.can(c);
    });
  }
}