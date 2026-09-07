/**
 * مخزن Dexie (IndexedDB) المطبِّق لواجهة LocalStore في @newport/domain.
 * التصميم:
 *  - جدول records واحد بمفتاح `${entity}:${id}` يبسّط المزامنة الكاملة ويمنع انحراف المخططات بين الكيانات.
 *  - pendingOp يحمل opId كمفتاح أساسي ⇒ تكرار نفس العملية مستحيل (idempotency على الجهاز نفسه).
 *  - meta يخزّن cursor/آخر مزامنة/انحراف الساعة.
 * كل الكتابة تتم من نفس طبقة الوصول (repo.ts) حتى لا تكتب الشاشة مباشرة في قاعدة البيانات المحلية.
 */
import Dexie, { type Table } from 'dexie';
import {
  MemoryStore,
  type ChangeOp,
  type EntityRecord,
  type LocalConflict,
  type LocalStore,
  type PendingOp,
  type PushOutcome,
  type SyncEntity,
  type SyncStateKey,
} from '@newport/domain';

interface Row {
  key: string;
  entity: string;
  id: string;
  version: number;
  deleted: number;
  data: Record<string, unknown>;
  updatedAt: number;
}
interface PendingRow {
  opId: string;
  entity: string;
  recordId: string;
  op: ChangeOp;
  attempts: number;
  lastError?: string;
  lastErrorAt?: string;
}
interface ConflictRow {
  opId: string;
  entity: string;
  recordId: string;
  outcome: string;
  reasonAr: string;
  server?: Record<string, unknown>;
  client: Record<string, unknown>;
  at: string;
}
interface MetaRow {
  key: string;
  value: string;
}

class NewportDb extends Dexie {
  records!: Table<Row, string>;
  pendingOps!: Table<PendingRow, string>;
  conflicts!: Table<ConflictRow, string>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super('newport-bfc-l1');
    this.version(1).stores({
      records: 'key, entity, id, updatedAt, [entity+id]',
      pendingOps: 'opId, entity, recordId, attempts',
      conflicts: 'opId, entity, recordId',
      meta: 'key',
    });
  }
}

const key = (entity: string, id: string) => `${entity}:${id}`;

export class DexieStore implements LocalStore {
  private readonly db = new NewportDb();

  async read(entity: SyncEntity, id: string): Promise<EntityRecord | null> {
    const row = await this.db.records.get(key(entity, id));
    if (!row) return null;
    return { id: row.id, version: row.version, deleted: row.deleted === 1, data: row.data };
  }

  async write(entity: SyncEntity, id: string, rec: EntityRecord): Promise<void> {
    await this.db.records.put({
      key: key(entity, id),
      entity,
      id,
      version: rec.version,
      deleted: rec.deleted ? 1 : 0,
      data: rec.data,
      updatedAt: Date.now(),
    });
  }

  async delete(entity: SyncEntity, id: string): Promise<void> {
    await this.db.records.delete(key(entity, id));
  }

  async listIds(entity: SyncEntity): Promise<string[]> {
    const rows = await this.db.records.where('entity').equals(entity).toArray();
    return rows.map((r) => r.id);
  }

  async pending(): Promise<PendingOp[]> {
    const rows = await this.db.pendingOps.orderBy('attempts').toArray();
    return rows.map((r) => ({ op: r.op, attempts: r.attempts, lastError: r.lastError, lastErrorAt: r.lastErrorAt }));
  }

  async addPending(op: ChangeOp): Promise<void> {
    await this.db.pendingOps.put({ opId: op.opId, entity: op.entity, recordId: op.recordId, op, attempts: 0 });
  }

  async resolvePending(opId: string, _outcome?: string): Promise<void> {
    await this.db.pendingOps.delete(opId);
  }

  async failPending(opId: string, error: string): Promise<void> {
    const row = await this.db.pendingOps.get(opId);
    if (!row) return;
    await this.db.pendingOps.put({ ...row, attempts: row.attempts + 1, lastError: error, lastErrorAt: new Date().toISOString() });
  }

  async getState(k: SyncStateKey): Promise<string | null> {
    const row = await this.db.meta.get(k);
    return row?.value ?? null;
  }

  async setState(k: SyncStateKey, v: string): Promise<void> {
    await this.db.meta.put({ key: k, value: v });
  }

  async conflicts(): Promise<LocalConflict[]> {
    const rows = await this.db.conflicts.toArray();
    return rows.map((r) => ({
      opId: r.opId,
      entity: r.entity as SyncEntity,
      recordId: r.recordId,
      outcome: r.outcome as PushOutcome,
      reasonAr: r.reasonAr,
      server: r.server,
      client: r.client,
      at: r.at,
    }));
  }

  async addConflict(c: LocalConflict): Promise<void> {
    await this.db.conflicts.put(c);
  }

  async clearConflict(opId: string): Promise<void> {
    await this.db.conflicts.delete(opId);
  }

  /** إحصاءات تُعرض في شريط الحالة */
  async stats(): Promise<{ records: number; pending: number; conflicts: number }> {
    const [records, pending, conflicts] = await Promise.all([this.db.records.count(), this.db.pendingOps.count(), this.db.conflicts.count()]);
    return { records, pending, conflicts };
  }

  /** مسح بيانات القراءة فقط بعد طلب إعادة مزامنة كاملة (الطابور المعلق يبقى مصونًا) */
  async wipeRemoteRecords(): Promise<void> {
    await this.db.transaction('rw', this.db.records, this.db.pendingOps, async () => {
      const queued = new Set((await this.db.pendingOps.toArray()).map((p) => key(p.entity, p.recordId)));
      const doomed = (await this.db.records.toArray()).filter((r) => !queued.has(r.key)).map((r) => r.key);
      await this.db.records.bulkDelete(doomed);
    });
  }
}

/** إن لم يتوفر IndexedDB (بيئة اختبار/WebView قديم) نسقط إلى مخزن في الذاكرة دون أن تنكهر الواجهة */
export function createStore(): LocalStore & { stats?: () => Promise<{ records: number; pending: number; conflicts: number }>; wipeRemoteRecords?: () => Promise<void> } {
  const hasIdb = typeof globalThis.indexedDB !== 'undefined';
  return hasIdb ? new DexieStore() : new MemoryStore();
}

export type { ChangeOp };
