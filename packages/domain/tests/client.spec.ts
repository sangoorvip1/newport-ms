/**
 * اختبارات طبقة العميل (packages/domain/src/client.ts) — تُشغَّل على بدائل المخزن والناقل،
 * وهي نفسها الكود الذي ينفذه تطبيق سطح المكتب (Dexie) وتطبيق الموبايل (SQLite).
 */
import { describe, expect, it } from 'vitest';
import { MemoryStore, SyncClient, backoffMs, mergeServerRecord, type EntityRecord, type LocalStore, type SyncTransport } from '../src/client.js';
import { SCHEMA_VERSION, type PushResponse, type PullResponse, type SyncEntity } from '../src/sync.js';

const REC = '7c9e6679-7425-40de-988b-5e64e70e2b1a';
const REC2 = '7c9e6679-7425-40de-988b-5e64e70e2b2b';

interface Recorded {
  method: string;
  path: string;
  body?: unknown;
  query?: Record<string, string | number>;
}

/** ناقل زائف: ردود مبرمجة لكل مسار + سجل بالطلبات */
function fakeTransport(handlers: Partial<Record<string, (req: Recorded) => unknown>>, opts: { fail?: boolean } = {}): { transport: SyncTransport; calls: Recorded[] } {
  const calls: Recorded[] = [];
  return {
    calls,
    transport: {
      async request<T>(input: { method: 'GET' | 'POST'; path: string; body?: unknown; query?: Record<string, string | number> }): Promise<T> {
        const rec: Recorded = { method: input.method, path: input.path, body: input.body, query: input.query };
        if (opts.fail) throw new Error('ENOTFOUND sync.newport.local');
        calls.push(rec);
        const h = handlers[input.path];
        if (!h) throw new Error(`unexpected call ${input.path}`);
        return h(rec) as T;
      },
    },
  };
}

function storeWith(seed: Array<[SyncEntity, EntityRecord]> = []): MemoryStore {
  const st = new MemoryStore();
  for (const [entity, rec] of seed) void st.write(entity, rec.id, rec);
  return st;
}

function client(store: LocalStore, transport: SyncTransport) {
  let n = 0;
  return new SyncClient(store, transport, {
    deviceId: 'device-win-01',
    userId: 'user-1',
    newId: () => `op-test-${++n}`,
    now: () => new Date('2026-09-07T08:00:00Z'),
  });
}

describe('SyncClient.queue', () => {
  it('writes locally right away and enqueues one op', async () => {
    const store = storeWith();
    const { transport, calls } = fakeTransport({});
    const c = client(store, transport);
    const op = await c.queue({ entity: 'workOrder', id: REC, kind: 'UPSERT', data: { title: 'Ammonia pump seal leak', status: 'IN_PROGRESS' } });
    const rec = await store.read('workOrder', REC);
    expect(rec?.version).toBe(1); // نسخة محلية جديدة
    expect(rec?.data.title).toBe('Ammonia pump seal leak');
    expect((await store.pending()).map((p) => p.op.opId)).toEqual([op.opId]);
    expect(op.opId).toBe('op-test-1');
    expect(op.baseVersion).toBe(0);
    expect(calls).toHaveLength(0); // الطابور لا يُرسل إلا بدورة مزامنة
  });

  it('PATCH keeps untouched fields from the local copy', async () => {
    const store = storeWith([['workOrder', { id: REC, version: 4, deleted: false, data: { title: 'old', description: 'keep me', version: 4 } }]]);
    const { transport } = fakeTransport({});
    const c = client(store, transport);
    const op = await c.queue({ entity: 'workOrder', id: REC, kind: 'PATCH', data: { description: 'replaced seal' } });
    const rec = await store.read('workOrder', REC);
    expect(rec?.data.title).toBe('old');
    expect(rec?.data.description).toBe('replaced seal');
    expect(op.baseVersion).toBe(4);
  });

  it('keeps append-only records deletable-but-not-removed locally', async () => {
    const store = storeWith([['workOrderLog', { id: REC2, version: 1, deleted: false, data: { note: 'log line' } }]]);
    const { transport } = fakeTransport({});
    const c = client(store, transport);
    await c.queue({ entity: 'workOrderLog', id: REC2, kind: 'DELETE' });
    const rec = await store.read('workOrderLog', REC2);
    expect(rec?.deleted).toBe(false); // سجل حدثي: لا يُوسم بالحذف، والخادم سيرفض الحذف أصلًا
    expect((await store.pending())[0]?.op.kind).toBe('DELETE');
  });
});

describe('SyncClient.syncOnce — push', () => {
  it('pushes batches and clears the queue only for accepted ops', async () => {
    const store = storeWith([['workOrder', { id: REC, version: 1, deleted: false, data: { title: 'A', description: 'd', version: 1 } }]]);
    const c0 = client(store, fakeTransport({}).transport);
    const accepted = await c0.queue({ entity: 'workOrder', id: REC, kind: 'UPSERT', data: { title: 'A' } });
    const rejected = await c0.queue({ entity: 'shiftLog', id: REC2, kind: 'UPSERT', data: { note: 'x' } });

    const push = (req: Recorded) =>
      ({
        serverTime: '2026-09-07T08:00:05Z',
        nextCursor: 555,
        results: [
          { opId: accepted.opId, recordId: REC, outcome: 'APPLIED', serverVersion: 9 },
          { opId: rejected.opId, recordId: REC2, outcome: 'REJECTED', reasonAr: 'لا تملك صلاحية prod.log.create' },
        ],
      }) satisfies PushResponse;
    const pull = () => ({ serverTime: '2026-09-07T08:00:05Z', cursor: 555, hasMore: false, changes: [] }) satisfies PullResponse;
    const { transport, calls } = fakeTransport({ '/v1/sync/push': push, '/v1/sync/pull': pull });
    const c = client(store, transport);

    const report = await c.syncOnce();
    expect(report.pushed.applied).toBe(1);
    expect(report.pushed.rejected).toBe(1);
    expect(report.cursor).toBe(555);
    expect(await store.getState('cursor')).toBe('555');
    const left = await store.pending();
    expect(left.map((p) => p.op.opId)).toEqual([rejected.opId]); // المرفوض يبقى للطابور
    expect(left[0]?.attempts).toBe(1);
    expect((await store.read('workOrder', REC))?.version).toBe(9); // اعتمدنا رقم نسخة الخادم
    const body = calls.find((x) => x.path === '/v1/sync/push')?.body as { schemaVersion: number; deviceId: string; ops: unknown[] };
    expect(body.schemaVersion).toBe(SCHEMA_VERSION);
    expect(body.deviceId).toBe('device-win-01');
    expect(body.ops).toHaveLength(2);
  });

  it('stores a conflict for user review and adopts the server protected fields locally', async () => {
    const store = storeWith([['workOrder', { id: REC, version: 3, deleted: false, data: { status: 'IN_PROGRESS', description: 'local note', version: 3 } }]]);
    const c0 = client(store, fakeTransport({}).transport);
    const op = await c0.queue({ entity: 'workOrder', id: REC, kind: 'PATCH', data: { description: 'local note' } });
    const push = () =>
      ({
        serverTime: '2026-09-07T08:00:05Z',
        nextCursor: 610,
        results: [
          {
            opId: op.opId,
            recordId: REC,
            outcome: 'CONFLICT' as const,
            reasonAr: 'السجل معتمد على الخادم',
            serverRecord: { status: 'CLOSED', description: 'server closed note', version: 8 },
          },
        ],
      }) satisfies PushResponse;
    const { transport } = fakeTransport({ '/v1/sync/push': push, '/v1/sync/pull': () => ({ serverTime: '', cursor: 610, hasMore: false, changes: [] }) });
    const c = client(store, transport);
    const report = await c.syncOnce();
    expect(report.pushed.conflicts).toBe(1);
    const [conflict] = await c.conflicts();
    expect(conflict?.reasonAr).toContain('معتمد');
    expect(conflict?.server?.status).toBe('CLOSED');
    const rec = await store.read('workOrder', REC);
    expect(rec?.data.status).toBe('CLOSED'); // حقل محمي: الخادم يحسم
    expect(String(rec?.data.description)).toContain('local note'); // وملاحظة الميدان لم تُلغَ (append)
  });

  it('survives a network outage without losing the queue', async () => {
    const store = storeWith();
    const { transport } = fakeTransport({}, { fail: true });
    const c = client(store, transport);
    await c.queue({ entity: 'workOrder', id: REC, kind: 'UPSERT', data: { title: 'offline note' } });
    const report = await c.syncOnce();
    expect(report.online).toBe(false);
    expect(report.pushed.failed).toBe(0);
    expect((await store.pending()).length).toBe(1);
    expect(await store.getState('networkOnline')).toBe('0');
    expect((await store.read('workOrder', REC))?.data.title).toBe('offline note'); // العمل الميداني محفوظ على الجهاز
  });

  it('deduplicated replay of the same op is not counted twice', async () => {
    const store = storeWith([['workOrder', { id: REC, version: 1, deleted: false, data: { title: 'A', version: 1 } }]]);
    const c0 = client(store, fakeTransport({}).transport);
    const op = await c0.queue({ entity: 'workOrder', id: REC, kind: 'UPSERT', data: { title: 'A' } });
    const push = () =>
      ({ serverTime: '', nextCursor: 700, results: [{ opId: op.opId, recordId: REC, outcome: 'DEDUPLICATED' as const, serverSeq: 700 }] }) satisfies PushResponse;
    const { transport } = fakeTransport({ '/v1/sync/push': push, '/v1/sync/pull': () => ({ serverTime: '', cursor: 700, hasMore: false, changes: [] }) });
    const report = await client(store, transport).syncOnce();
    expect(report.pushed.dedup).toBe(1);
    expect((await store.pending()).length).toBe(0);
  });
});

describe('SyncClient.syncOnce — pull', () => {
  it('applies remote changes and advances the cursor page by page', async () => {
    const store = storeWith();
    const { transport } = fakeTransport({
      '/v1/sync/pull': (req) => {
        const since = Number(req.query?.sinceCursor ?? 0);
        if (since === 0) {
          return {
            serverTime: '2026-09-07T08:00:10Z',
            cursor: 2,
            hasMore: true,
            changes: [{ seq: 1, entity: 'workOrder', recordId: REC, version: 5, deleted: false, data: { title: 'from server', version: 5 } }],
          } satisfies PullResponse;
        }
        return {
          serverTime: '2026-09-07T08:00:10Z',
          cursor: 3,
          hasMore: false,
          changes: [{ seq: 2, entity: 'asset', recordId: REC2, version: 1, deleted: true, data: { tag: 'P-101' } }],
        } satisfies PullResponse;
      },
    });
    const c = client(store, transport);
    const report = await c.syncOnce();
    expect(report.pulled).toBe(2);
    expect(report.cursor).toBe(3);
    expect(report.hasMore).toBe(false);
    expect((await store.read('workOrder', REC))?.data.title).toBe('from server');
    expect((await store.read('asset', REC2))?.deleted).toBe(true); // tombstone يبقى محليًا
    expect((await store.getState('cursor'))).toBe('3');
  });

  it('resets to a full resync when the server asks for it', async () => {
    const store = storeWith();
    void store.setState('cursor', '120');
    const { transport } = fakeTransport({
      '/v1/sync/pull': () =>
        ({
          serverTime: '',
          cursor: 120,
          hasMore: false,
          changes: [],
          fullResyncRequired: true,
          resyncReasonAr: 'سجل التغييرات تجاوز مدة الاحتفاظ — مطلوب إعادة مزامنة كاملة',
        }) satisfies PullResponse,
    });
    const report = await client(store, transport).syncOnce();
    expect(report.fullResyncRequired).toBe(true);
    expect(report.resyncReasonAr).toContain('إعادة مزامنة');
    expect(await store.getState('cursor')).toBe('0');
  });

  it('server wins for assets even when the local copy looks newer', async () => {
    const store = storeWith([['asset', { id: REC2, version: 99, deleted: false, data: { tag: 'local-edit' } }]]);
    const { transport } = fakeTransport({
      '/v1/sync/pull': () =>
        ({
          serverTime: '',
          cursor: 4,
          hasMore: false,
          changes: [{ seq: 4, entity: 'asset', recordId: REC2, version: 2, deleted: false, data: { tag: 'P-101', criticality: 'HIGH' } }],
        }) satisfies PullResponse,
    });
    await client(store, transport).syncOnce();
    const rec = await store.read('asset', REC2);
    expect(rec?.data.tag).toBe('P-101');
    expect(rec?.version).toBe(2);
  });
});

describe('SyncClient conflicts + helpers', () => {
  it('resolving with "server" drops the local op; "local" re-queues it', async () => {
    const store = storeWith([['workOrder', { id: REC, version: 3, deleted: false, data: { description: 'mine', version: 3 } }]]);
    const c0 = client(store, fakeTransport({}).transport);
    const op = await c0.queue({ entity: 'workOrder', id: REC, kind: 'PATCH', data: { description: 'mine' } });
    await store.addConflict({
      opId: op.opId,
      entity: 'workOrder',
      recordId: REC,
      outcome: 'CONFLICT',
      reasonAr: 'تعارض',
      client: { description: 'mine' },
      server: { description: 'server', status: 'CLOSED', version: 7 },
      at: '2026-09-07T08:00:00Z',
    });
    const c = client(store, fakeTransport({}).transport);
    await c.resolveConflict(op.opId, 'server');
    expect((await store.pending()).length).toBe(0);
    expect((await store.read('workOrder', REC))?.data.description).toBe('server');
    expect(await c.conflicts()).toEqual([]);

    await c.queue({ entity: 'workOrder', id: REC, kind: 'PATCH', data: { description: 'mine again' } });
    const [second] = await store.pending();
    await store.addConflict({
      opId: second!.op.opId,
      entity: 'workOrder',
      recordId: REC,
      outcome: 'CONFLICT',
      reasonAr: 'تعارض',
      client: { description: 'mine again' },
      server: { description: 'server' },
      at: '2026-09-07T08:05:00Z',
    });
    await c.resolveConflict(second!.op.opId, 'local');
    const q = await store.pending();
    expect(q.map((x) => x.op.opId)).toContain(`${second!.op.opId}-forced`); // أعيدت الجدولة بنسخة الجهاز
  });

  it('mergeServerRecord keeps append fields and never deletes history for append_only', () => {
    const merged = mergeServerRecord('workOrder', { status: 'CLOSED', description: 'a\nb' }, { description: 'b\nc' });
    expect(merged.status).toBe('CLOSED');
    expect(merged.description).toBe('a\nb\nc');
    const log = mergeServerRecord('workOrderLog', { note: 'server line' }, { note: 'client line' });
    expect(log).toEqual({ note: 'server line' }); // append_only: نسخة الخادم تُقبل كما هي
  });

  it('backoffMs grows exponentially, is capped, and jittered', () => {
    // exp = base × 2^attempts والانتظار يتأرجح بين exp/2 (أدنى) و exp (أعلى)
    expect(backoffMs(1, 1000, 10_000, () => 0)).toBe(1000); // exp=2000 → نصفه
    expect(backoffMs(1, 1000, 10_000, () => 1)).toBe(2000); // exp كاملًا
    expect(backoffMs(2, 1000, 10_000, () => 0.5)).toBe(3000); // exp=4000 → منتصف النطاق
    expect(backoffMs(4, 1000, 10_000, () => 1)).toBe(10_000); // exp=16000 مقلوم عند السقف
    expect(backoffMs(50, 1000, 10_000, () => 1)).toBe(10_000); // سقف: لا انتظار أطول من 5 دقائق
    expect(backoffMs(0, 1000, 10_000, () => 1)).toBe(1000); // المحاولة الأولى = الأساس
    const a = backoffMs(3, 1000, 10_000, () => 0);
    const b = backoffMs(3, 1000, 10_000, () => 0.9);
    expect(b).toBeGreaterThan(a); // إزاحة عشوائية تمنع اصطدام كل الأجهزة في نفس الثانية
  });
});
