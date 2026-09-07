/**
 * إدارة دورة المزامنة في سطح المكتب:
 *  - محرك واحد (SyncClient من @newport/domain) يعمل فوق Dexie.
 *  - نبض دوري عند توفّر الشبكة + دفع فوري عند حفظ سجل (debounced) + إعادة محاولة بتراجع أسّي.
 *  - يقرأ المستخدم الحالي من نفس الجلسة (JWT)؛ بلا جلسة لا مزامنة.
 */
import { SyncClient, backoffMs, type LocalStore, type SyncRunReport } from '@newport/domain';
import { apiFetch, currentTokens, deviceId, syncTransport } from './api.js';
import { createStore } from './dexieStore.js';

export const localStore: LocalStore & { stats?: () => Promise<{ records: number; pending: number; conflicts: number }>; wipeRemoteRecords?: () => Promise<void> } = createStore();

export interface SyncHandle {
  client: SyncClient;
  bindUser(userId: string): void;
  /** يدعى بعد كل حفظ في الواجهة (debounce 700ms) */
  nudge: () => void;
  start: () => void;
  stop: () => void;
  subscribe: (fn: (s: SyncStatus) => void) => () => void;
  status: SyncStatus;
}

export interface SyncStatus {
  running: boolean;
  online: boolean;
  lastReport?: SyncRunReport;
  lastError?: string;
  pending: number;
  conflicts: number;
  records: number;
  nextRetryAt?: number;
  startedAt?: number;
}

const LISTENERS = new Set<(s: SyncStatus) => void>();

export function createSyncHandle(): SyncHandle {
  const client = new SyncClient(localStore, syncTransport, {
    deviceId: deviceId(),
    userId: '',
  });
  const status: SyncStatus = { running: false, online: true, pending: 0, conflicts: 0, records: 0 };
  let timer: ReturnType<typeof setTimeout> | null = null;
  let nudger: ReturnType<typeof setTimeout> | null = null;
  let stopped = true;

  const notify = () => {
    for (const l of LISTENERS) l({ ...status });
  };

  const refreshStats = async () => {
    const [pending, conflicts, stats] = await Promise.all([
      client.pendingCount().catch(() => 0),
      client.conflicts().then((c) => c.length).catch(() => 0),
      localStore.stats?.().catch(() => ({ records: 0, pending: 0, conflicts: 0 })) ?? Promise.resolve({ records: 0, pending: 0, conflicts: 0 }),
    ]);
    status.pending = pending;
    status.conflicts = conflicts;
    status.records = stats.records;
  };

  const run = async (): Promise<void> => {
    if (!currentTokens().access) {
      status.online = false;
      notify();
      return;
    }
    status.running = true;
    status.startedAt = Date.now();
    notify();
    try {
      const report = await client.syncOnce();
      status.lastReport = report;
      status.online = report.online;
      status.lastError = report.online ? undefined : (report.resyncReasonAr ?? 'الشبكة غير متاحة');
      if (report.fullResyncRequired) {
        await localStore.wipeRemoteRecords?.();
        status.lastError = 'أُعيدت المزامنة كاملة بعد تغيّر المخطط';
      }
      if (!report.online) {
        const attempts = (await localStore.pending())[0]?.attempts ?? 1;
        const delay = backoffMs(Math.min(attempts, 8), 2_000, 5 * 60_000);
        status.nextRetryAt = Date.now() + delay;
      } else {
        status.nextRetryAt = undefined;
      }
    } catch (e) {
      status.online = false;
      status.lastError = String((e as Error).message ?? e);
      status.nextRetryAt = Date.now() + backoffMs(3, 2_000, 5 * 60_000);
    } finally {
      status.running = false;
      await refreshStats();
      notify();
    }
  };

  const schedule = (delay: number) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void run().finally(() => schedule(status.nextRetryAt ? Math.max(2_000, status.nextRetryAt - Date.now()) : IDLE_MS));
    }, delay);
  };

  const IDLE_MS = 30_000;

  return {
    client,
    status,
    subscribe(fn) {
      LISTENERS.add(fn);
      fn({ ...status });
      return () => LISTENERS.delete(fn);
    },
    /** تُستدعى بعد نجاح fetchMe لربط الطابور بمعرّف المستخدم */
    bindUser(userId: string) {
      client.setUser(userId);
    },
    nudge() {
      if (stopped) return;
      if (nudger) clearTimeout(nudger);
      nudger = setTimeout(() => void run(), 700);
    },
    start() {
      if (!stopped) return;
      stopped = false;
      void refreshStats().then(notify);
      schedule(1_000);
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (nudger) clearTimeout(nudger);
      timer = null;
      nudger = null;
    },
  };
}

/** الخادم يعيد قائمة صلاحيات مُصدَّقة — تُستخدم لبناء القوائم وفلتة الأزرار */
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

export const fetchMe = () => apiFetch<MeResponse>('/v1/auth/me');
