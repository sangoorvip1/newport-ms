/**
 * اختبارات طبقة الميدان: طابور الدفع دون اتصال، الدمج عند عودة الشبكة، وحل التعارضات،
 * إضافة إلى اختبار جولة كاملة لمخزن SQLite عبر قاعدة بيانات زائفة تنفّذ نفس SQL المستخدم.
 */
import { describe, expect, it, vi } from 'vitest';
import { MemoryStore, SyncClient, newUuidV7, type PushResponse, type PullResponse, type SyncTransport } from '@newport/domain';
import { SqliteStore } from '../src/db/sqliteStore.js';
import { FieldRepo, ValidationError } from '../src/data/fieldRepo.js';
import type { FieldSync } from '../src/state/sync.js';
import type { SQLiteDatabase, SQLiteStatement } from 'expo-sqlite';

function syncWith(store: MemoryStore) {
  const calls: Array<{ path: string; body?: unknown }> = [];
  const transport: SyncTransport = {
    async request<T>(input: { method: 'GET' | 'POST'; path: string; body?: unknown }) {
      calls.push({ path: input.path, body: input.body });
      if (input.path === '/v1/sync/push') {
        const body = input.body as { ops: Array<{ opId: string; entity: string; recordId: string }> };
        const res: PushResponse = {
          serverTime: new Date().toISOString(),
          nextCursor: 900,
          results: body.ops.map((op) => ({ opId: op.opId, recordId: op.recordId, outcome: 'APPLIED' as const, serverVersion: 5 })),
        };
        return res as T;
      }
      const pull: PullResponse = { serverTime: new Date().toISOString(), cursor: 900, hasMore: false, changes: [] };
      return pull as T;
    },
  };
  const client = new SyncClient(store, transport, { deviceId: 'device-test', userId: 'user-1', now: () => new Date('2026-09-07T08:00:00Z') });
  return { client, calls };
}

/** SyncClient + FieldRepo عبر كائن بحقل sync (نفس ما يراه التطبيق) */
function fakeSync(store: MemoryStore) {
  const { client, calls } = syncWith(store);
  const sync = { client, store, nudge: () => undefined, access: { can: () => true } } as unknown as FieldSync;
  return { sync, repo: new FieldRepo(sync), calls, client, store };
}

describe('FieldRepo (offline-first writes)', () => {
  it('queues a valid shift log locally and pushes it on the next cycle', async () => {
    const store = new MemoryStore();
    const { repo, client, calls } = fakeSync(store);
    const id = await repo.submitShiftLog({ unitCode: 'UREA', shiftDate: '2026-09-07', shiftCode: 'A', productionTons: 720.5, events: [], params: [{ paramCode: '401-TI-101', value: 182, unit: 'C' }] });
    const rec = await store.read('shiftLog', id);
    expect(rec?.data.productionTons).toBe(720.5);
    expect((rec?.data as { isOfflineCreated?: boolean }).isOfflineCreated).toBe(true);
    expect(await client.pendingCount()).toBe(1);
    expect(calls.length).toBe(0); // لا شبكة بعد
    await client.syncOnce();
    expect(await client.pendingCount()).toBe(0);
    expect((await store.read('shiftLog', id))?.version).toBe(5); // اعتمدنا نسخة الخادم
    expect(calls.map((c) => c.path)).toEqual(['/v1/sync/push', '/v1/sync/pull']);
  });

  it('rejects an incomplete work order with zod messages (no partial record is queued)', async () => {
    const store = new MemoryStore();
    const { repo, client } = fakeSync(store);
    await expect(repo.createWorkOrder({ title: 'ab', description: 'short', priority: 'WRONG' } as never)).rejects.toBeInstanceOf(ValidationError);
    expect(await client.pendingCount()).toBe(0);
    expect(await store.listIds('workOrder')).toEqual([]);
  });

  it('accepts a valid offline work order with a client-generated UUIDv7', async () => {
    const store = new MemoryStore();
    const { repo, client } = fakeSync(store);
    const id = await repo.createWorkOrder({
      title: 'تسريب من مضخة مكثف',
      description: ' لوحظ تسريب عند الجلبة أثناء جولة الليل',
      priority: 'URGENT',
      sourceType: 'BREAKDOWN',
      requestedSubDeptCode: 'MAINT-ROT',
      requirePermit: false,
    });
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect((await store.read('workOrder', id))?.data.status).toBe('SUBMITTED');
    expect(await client.pendingCount()).toBe(1);
  });

  it('appends a note without erasing the server copy', async () => {
    const store = new MemoryStore();
    const { repo, client } = fakeSync(store);
    const id = newUuidV7();
    await store.write('workOrder', id, { id, version: 2, deleted: false, data: { description: 'night shift: vibration noted', status: 'IN_PROGRESS' } });
    await repo.appendNote(id, 'morning shift: seal replaced');
    const pending = await store.pending();
    const desc = (pending[0]?.op.data as { description: string }).description;
    expect(desc).toContain('night shift');
    expect(desc).toContain('seal replaced');
    await client.syncOnce();
    expect((await store.read('workOrder', id))?.data.description).toContain('seal replaced');
  });
});

/* ──────────── مخزن SQLite عبر قاعدة زائفة تنفّذ نفس عبارات SQL ──────────── */

type Row = Record<string, unknown>;
class FakeDb implements SQLiteDatabase {
  records = new Map<string, Row>();
  pendingOps = new Map<string, Row>();
  conflicts = new Map<string, Row>();
  meta = new Map<string, Row>();
  executed: string[] = [];

  execSync(source: string): void {
    this.executed.push(source);
  }
  async execAsync(source: string): Promise<void> {
    this.executed.push(source);
  }
  async withTransactionAsync(tx: (t: { execAsync: (s: string, p?: unknown[]) => Promise<unknown> }) => Promise<void>): Promise<void> {
    await tx({ execAsync: async (s, p) => (this.prepareSync(s), this.prepareSync(s).executeSync(p)) });
  }
  prepareSync(source: string): SQLiteStatement {
    const norm = source.replace(/\s+/g, ' ').trim();
    return {
      executeSync: <T,>(params: unknown[] = []) => ({ rows: this.run(norm, params) }) as { rows: T[] },
      executeAsync: async <T,>(params: unknown[] = []) => ({ rows: this.run(norm, params) }) as { rows: T[] },
    };
  }

  private run(sql: string, p: unknown[]): Row[] {
    // ── records ──
    if (sql.startsWith('SELECT * FROM records WHERE key = ?')) {
      const r = this.records.get(String(p[0]));
      return r ? [r] : [];
    }
    if (sql.startsWith('INSERT INTO records')) {
      this.records.set(String(p[0]), { key: p[0], entity: p[1], id: p[2], version: Number(p[3]), deleted: Number(p[4]), dataJson: String(p[5]), updatedAt: Number(p[6]) });
      return [];
    }
    if (sql.startsWith('DELETE FROM records WHERE key = ?')) {
      this.records.delete(String(p[0]));
      return [];
    }
    if (sql.startsWith('SELECT id FROM records WHERE entity = ? AND deleted = 0')) {
      return [...this.records.values()].filter((r) => r.entity === p[0] && r.deleted === 0).map((r) => ({ id: r.id }));
    }
    if (sql.startsWith('DELETE FROM records WHERE key NOT IN')) {
      this.records.clear();
      return [];
    }
    if (sql.startsWith('DELETE FROM records WHERE deleted = 1')) {
      for (const [k, r] of [...this.records.entries()]) if (r.deleted === 1 && Number(r.updatedAt) < Number(p[0])) this.records.delete(k);
      return [];
    }
    // ── pendingOps ──
    if (sql.startsWith('SELECT * FROM pendingOps')) return [...this.pendingOps.values()];
    if (sql.startsWith('INSERT INTO pendingOps')) {
      const key = String(p[0]);
      if (!this.pendingOps.has(key)) this.pendingOps.set(key, { opId: p[0], entity: p[1], recordId: p[2], opJson: String(p[3]), attempts: 0, lastError: null, lastErrorAt: null });
      return [];
    }
    if (sql.startsWith('DELETE FROM pendingOps')) {
      this.pendingOps.delete(String(p[0]));
      return [];
    }
    if (sql.startsWith('UPDATE pendingOps SET attempts')) {
      const r = this.pendingOps.get(String(p[2]));
      if (r) this.pendingOps.set(String(p[2]), { ...r, attempts: Number(r.attempts) + 1, lastError: p[0], lastErrorAt: p[1] });
      return [];
    }
    // ── conflicts ──
    if (sql.startsWith('SELECT * FROM conflicts')) return [...this.conflicts.values()];
    if (sql.startsWith('INSERT INTO conflicts')) {
      this.conflicts.set(String(p[0]), { opId: p[0], entity: p[1], recordId: p[2], outcome: p[3], reasonAr: p[4], serverJson: p[5], clientJson: p[6], at: p[7] });
      return [];
    }
    if (sql.startsWith('DELETE FROM conflicts')) {
      this.conflicts.delete(String(p[0]));
      return [];
    }
    // ── meta ──
    if (sql.startsWith('SELECT value FROM meta')) {
      const r = this.meta.get(String(p[0]));
      return r ? [{ value: r.value }] : [];
    }
    if (sql.startsWith('INSERT INTO meta')) {
      this.meta.set(String(p[0]), { key: p[0], value: String(p[1]) });
      return [];
    }
    // ── إحصاءات ──
    if (sql.includes('SELECT (SELECT COUNT(*) FROM records) AS n')) return [{ n: this.records.size }];
    if (sql.includes('SELECT COUNT(*) AS n FROM pendingOps')) return [{ n: this.pendingOps.size }];
    if (sql.includes('SELECT COUNT(*) AS n FROM conflicts')) return [{ n: this.conflicts.size }];
    if (sql.includes('SELECT COUNT(*) AS n FROM records')) return [{ n: this.records.size }];
    if (sql.includes('pragma_page_count')) return [{ n: 4096 * 12 }];
    throw new Error('unhandled sql: ' + sql.slice(0, 90));
  }
}

describe('SqliteStore', () => {
  it('declares every table + index the store relies on', async () => {
    const db = new FakeDb();
    db.execSync(SqliteStore.ddl);
    for (const t of ['records', 'pendingOps', 'conflicts', 'meta']) expect(SqliteStore.ddl).toContain(`CREATE TABLE IF NOT EXISTS ${t}`);
    expect(SqliteStore.ddl).toContain('PRAGMA journal_mode = WAL');
  });

  it('round-trips records, the queue, conflicts and meta state', async () => {
    const db = new FakeDb();
    const store = SqliteStore.fromDb(db as unknown as SQLiteDatabase);
    const id = newUuidV7();
    await store.write('workOrder', id, { id, version: 3, deleted: false, data: { title: 'Ammonia pump', description: 'leak', tags: ['a'] } });
    const rec = await store.read('workOrder', id);
    expect(rec?.version).toBe(3);
    expect((rec?.data as { tags: string[] }).tags).toEqual(['a']); // JSON يُحفظ ويُسترجع كما هو
    expect(await store.listIds('workOrder')).toEqual([id]);

    await store.addPending({ opId: 'op-1', entity: 'workOrder', recordId: id, kind: 'PATCH', data: { description: 'x' }, clientTimestamp: new Date().toISOString() });
    expect((await store.pending())[0]?.op.opId).toBe('op-1');
    await store.addPending({ opId: 'op-1', entity: 'workOrder', recordId: id, kind: 'PATCH', data: { description: 'dup' }, clientTimestamp: new Date().toISOString() });
    expect((await store.pending()).length).toBe(1); // مفتاح أساسي واحد ⇒ لا تكرار على الجهاز
    await store.failPending('op-1', 'offline');
    expect((await store.pending())[0]?.attempts).toBe(1);
    await store.resolvePending('op-1');
    expect(await store.pending()).toEqual([]);

    await store.setState('cursor', '900');
    expect(await store.getState('cursor')).toBe('900');
    await store.setState('cursor', '910');
    expect(await store.getState('cursor')).toBe('910');

    await store.addConflict({ opId: 'op-9', entity: 'workOrder', recordId: id, outcome: 'CONFLICT', reasonAr: 'تعارض', client: { a: 1 }, server: { a: 2 }, at: '2026-09-07T08:00:00Z' });
    const [c] = await store.conflicts();
    expect(c?.client).toEqual({ a: 1 });
    expect(c?.server).toEqual({ a: 2 });
    await store.clearConflict('op-9');
    expect(await store.conflicts()).toEqual([]);
  });

  it('compacts only old tombstones (recent records stay for the sync diff)', async () => {
    const db = new FakeDb();
    const store = SqliteStore.fromDb(db as unknown as SQLiteDatabase);
    const fresh = newUuidV7();
    const stale = newUuidV7();
    await store.write('workOrder', fresh, { id: fresh, version: 1, deleted: true, data: { n: 'fresh tombstone' } });
    await store.write('workOrder', stale, { id: stale, version: 1, deleted: true, data: { n: 'stale tombstone' } });
    // نجعل أحدهما قديمًا (200 يوم) تمامًا كما يحدث بعد تنظيف سجل التغييرات على الخادم
    (db.records.get(`workOrder:${stale}`) as { updatedAt: number }).updatedAt = Date.now() - 200 * 86_400_000;
    expect(await store.compact(180)).toBe(1);
    expect(db.records.size).toBe(1);
    expect([...db.records.values()][0]).toMatchObject({ deleted: 1 });
    // حذف سجل حيّ ليس من صلاحية التنظيف
    await store.write('workOrder', fresh, { id: fresh, version: 2, deleted: false, data: { n: 'alive' } });
    expect(await store.compact(0)).toBe(0);
  });

  it('drives the client sync loop over SQLite-backed storage', async () => {
    const store = SqliteStore.fromDb(new FakeDb() as unknown as SQLiteDatabase);
    const transport: SyncTransport = {
      async request<T>(input: { path: string; body?: unknown }) {
        if (input.path === '/v1/sync/push') {
          const body = input.body as { ops: Array<{ opId: string; recordId: string; entity: string }> };
          return {
            serverTime: '',
            nextCursor: 1234,
            results: body.ops.map((o) => ({ opId: o.opId, recordId: o.recordId, outcome: 'MERGED' as const, serverVersion: 7, serverKeptFields: ['status'] })),
          } as T;
        }
        return { serverTime: '', cursor: 1234, hasMore: false, changes: [] } as T;
      },
    };
    const client = new SyncClient(store, transport, { deviceId: 'd', userId: 'u', newId: () => 'op-x' });
    const id = newUuidV7();
    await client.queue({ entity: 'workOrder', id, kind: 'UPSERT', data: { title: 'T', description: 'D' } });
    const report = await client.syncOnce();
    expect(report.pushed.merged).toBe(1);
    expect(await client.pendingCount()).toBe(0);
    expect((await store.read('workOrder', id))?.version).toBe(7);
    expect(await store.getState('cursor')).toBe('1234');
  });
});
