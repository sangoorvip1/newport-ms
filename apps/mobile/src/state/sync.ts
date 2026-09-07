/**
 * حالة المزامنة في تطبيق الميدان (بدون react-query حتى يبقى خفيفًا على 4G):
 *  - SyncClient واحد من @newport/domain فوق SQLite.
 *  - دورة تلقائية عند استعادة الشبكة + نبضة بعد كل حفظ (debounce) + تراجع أسّي عند الفشل.
 *  - كل كتابات الشاشات تمر عبر FieldRepo: اكتب محليًا أولًا، ثم ادفع.
 */
import { AccessView, SyncClient, backoffMs, type LocalStore, type SyncRunReport } from '@newport/domain';
import { openStore } from '../db/sqliteStore.js';
import { currentTokens, ensureDeviceId, syncTransport, apiFetch } from '../net/api.js';

export interface FieldStatus {
  ready: boolean;
  online: boolean;
  running: boolean;
  pending: number;
  conflicts: number;
  records: number;
  lastReport?: SyncRunReport;
  lastError?: string;
  nextRetryAt?: number;
}

export interface MeResponse {
  userId: string;
  roles: string[];
  departmentId: string;
  subDepartmentId: string;
  facilityWide: boolean;
  permissions: Array<{ code: string; scope: string }>;
  offlineEnabledPermissions: string[];
  /** true ⇒ الجلسة مقيدة حتى تغيير كلمة المرور الافتراضية */
  mustChangePwd?: boolean;
}

type Listener = (s: FieldStatus) => void;

export class FieldSync {
  readonly store!: LocalStore;
  client!: SyncClient;
  access = new AccessView([]);
  me: MeResponse | null = null;
  status: FieldStatus = { ready: false, online: true, running: false, pending: 0, conflicts: 0, records: 0 };
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private nudger: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private readonly IDLE_MS = 45_000;

  private constructor() {}

  static async create(): Promise<FieldSync> {
    const s = new FieldSync();
    const store = await openStore();
    // حقول Store مُعرَّفة لاحقًا (openStore async) — تحويل واحد مركزي بدل تكراره
    (s as unknown as { store: LocalStore }).store = store;
    s.client = new SyncClient(store, syncTransport, { deviceId: await ensureDeviceId(), userId: '' });
    s.status = { ...s.status, ready: true };
    return s;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.status);
    return () => this.listeners.delete(fn);
  }
  private notify(): void {
    for (const l of this.listeners) l(this.status);
  }
  private patch(p: Partial<FieldStatus>): void {
    this.status = { ...this.status, ...p };
    this.notify();
  }

  /** جلسة مقيدة: كلمة المرور الافتراضية لم تُغيَّر — الخادم يرفض كل شيء عدا تغييرها */
  restricted = false;

  async loadMe(): Promise<MeResponse | null> {
    try {
      const me = await apiFetch<MeResponse>('/v1/auth/me');
      this.me = me;
      this.access = AccessView.from(me);
      this.client.setUser(me.userId);
      this.restricted = me.mustChangePwd === true;
      return me;
    } catch (e) {
      const body = (e as { body?: { changePasswordRequired?: boolean } })?.body;
      this.restricted = body?.changePasswordRequired === true;
      return null; // دون شبكة: نعمل بصلاحيات آخر جلسة إن وُجدت، أو بلا صلاحيات مُخزنة
    }
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    await this.refreshStats();
    this.schedule(1_500);
  }
  stop(): void {
    this.started = false;
    if (this.timer) clearTimeout(this.timer);
    if (this.nudger) clearTimeout(this.nudger);
    this.timer = null;
    this.nudger = null;
  }
  nudge(): void {
    if (!this.started) return;
    if (this.nudger) clearTimeout(this.nudger);
    this.nudger = setTimeout(() => void this.run(), 600);
  }
  private schedule(delay: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.run().finally(() => this.schedule(this.status.nextRetryAt ? Math.max(3_000, this.status.nextRetryAt - Date.now()) : this.IDLE_MS));
    }, delay);
  }

  async run(): Promise<void> {
    if (!currentTokens().access) {
      this.patch({ online: false });
      return;
    }
    this.patch({ running: true });
    try {
      const report = await this.client.syncOnce();
      this.patch({
        online: report.online,
        lastReport: report,
        lastError: report.online ? undefined : (report.resyncReasonAr ?? 'الشبكة غير متاحة'),
        nextRetryAt: report.online ? undefined : Date.now() + backoffMs(2, 3_000, 5 * 60_000),
      });
    } catch (e) {
      this.patch({ online: false, lastError: String((e as Error).message ?? e), nextRetryAt: Date.now() + backoffMs(3, 3_000, 5 * 60_000) });
    } finally {
      this.patch({ running: false });
      await this.refreshStats();
    }
  }

  async refreshStats(): Promise<void> {
    const [pending, conflicts] = await Promise.all([this.client.pendingCount().catch(() => 0), this.client.conflicts().then((c) => c.length).catch(() => 0)]);
    const stats = (this.store as unknown as { stats?: () => Promise<{ records: number }> }).stats;
    const records = stats ? (await stats.call(this.store).catch(() => ({ records: 0 }))).records : 0;
    this.patch({ pending, conflicts, records });
  }

  /** مزامنة كاملة يدوية من شاشة الإعدادات (عند الشك في انحراف البيانات) */
  async forceFullResync(): Promise<SyncRunReport> {
    const wipe = (this.store as unknown as { wipeRemoteRecords?: () => Promise<void> }).wipeRemoteRecords;
    await wipe?.call(this.store);
    await this.store.setState('cursor', '0');
    const r = await this.client.fullResync();
    await this.refreshStats();
    return r;
  }
}
