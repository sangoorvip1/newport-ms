/**
 * مخزن SQLite على الجهاز (expo-sqlite) المطبِّق لواجهة LocalStore في @newport/domain.
 *
 * القرار: جدول واحد للسجلات (records) بمفتاح نصي `entity:id` بدل جدول لكل كيان، لأن:
 *  - مخطط الخادم يتوسّع (كيانات جديدة) ولا نريد ترحيل قاعدة الجهاز في كل إصدار؛
 *  - الدمج/إعادة المزامنة الكاملة تصير عملية واحدة (DELETE + INSERT) لا 19 عملية؛
 *  - الحقل `pending` يبقى صغيرًا ويستفيد من فهرس (entity, attempts) لتسلسل الدفع حسب الأولوية.
 */
import { MemoryStore, type ChangeOp, type EntityRecord, type LocalConflict, type LocalStore, type PendingOp, type SyncEntity, type SyncStateKey } from '@newport/domain';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

interface Row {
  key: string;
  entity: string;
  id: string;
  version: number;
  deleted: number;
  dataJson: string;
  updatedAt: number;
}
interface PendingRow {
  opId: string;
  entity: string;
  recordId: string;
  opJson: string;
  attempts: number;
  lastError: string | null;
  lastErrorAt: string | null;
}
interface ConflictRow {
  opId: string;
  entity: string;
  recordId: string;
  outcome: string;
  reasonAr: string;
  serverJson: string | null;
  clientJson: string;
  at: string;
}

const DDL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS records (
  key TEXT PRIMARY KEY, entity TEXT NOT NULL, id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0, deleted INTEGER NOT NULL DEFAULT 0,
  dataJson TEXT NOT NULL, updatedAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_records_entity ON records(entity, updatedAt DESC);
CREATE TABLE IF NOT EXISTS pendingOps (
  opId TEXT PRIMARY KEY, entity TEXT NOT NULL, recordId TEXT NOT NULL,
  opJson TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
  lastError TEXT, lastErrorAt TEXT
);
CREATE INDEX IF NOT EXISTS ix_pending_entity ON pendingOps(entity, attempts);
CREATE TABLE IF NOT EXISTS conflicts (
  opId TEXT PRIMARY KEY, entity TEXT NOT NULL, recordId TEXT NOT NULL,
  outcome TEXT NOT NULL, reasonAr TEXT NOT NULL, serverJson TEXT, clientJson TEXT NOT NULL, at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

export class SqliteStore implements LocalStore {
  private constructor(private readonly db: SQLiteDatabase) {}

  static async open(name = 'newport-field.db'): Promise<SqliteStore> {
    const db = await openDatabaseAsync(name);
    db.execSync(DDL);
    return new SqliteStore(db);
  }

  /** يُستخدم في الاختبارات ومع بيئات التطوير التي لا توفر الجسر الأصلي (نفس الكود، مصدر بيانات مختلف) */
  static fromDb(db: SQLiteDatabase): SqliteStore {
    return new SqliteStore(db);
  }

  /** تعريف الجداول — يُصدَّر ليُستخدم في ترحيل الاختبارات وفي فحص صيغة SQL */
  static readonly ddl = DDL;

  private all<T>(sql: string, params: unknown[] = []): T[] {
    return this.db.prepareSync(sql).executeSync<T>(params).rows;
  }
  private run(sql: string, params: unknown[] = []): void {
    this.db.prepareSync(sql).executeSync(params);
  }

  async read(entity: SyncEntity, id: string): Promise<EntityRecord | null> {
    const [row] = this.all<Row>('SELECT * FROM records WHERE key = ? LIMIT 1', [`${entity}:${id}`]);
    if (!row) return null;
    return { id: row.id, version: row.version, deleted: row.deleted === 1, data: JSON.parse(row.dataJson) as Record<string, unknown> };
  }

  async write(entity: SyncEntity, id: string, rec: EntityRecord): Promise<void> {
    this.run(
      `INSERT INTO records (key, entity, id, version, deleted, dataJson, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET version = excluded.version, deleted = excluded.deleted,
                                      dataJson = excluded.dataJson, updatedAt = excluded.updatedAt`,
      [`${entity}:${id}`, entity, id, rec.version, rec.deleted ? 1 : 0, JSON.stringify(rec.data), Date.now()],
    );
  }

  async delete(entity: SyncEntity, id: string): Promise<void> {
    this.run('DELETE FROM records WHERE key = ?', [`${entity}:${id}`]);
  }

  async listIds(entity: SyncEntity): Promise<string[]> {
    return this.all<{ id: string }>('SELECT id FROM records WHERE entity = ? AND deleted = 0 ORDER BY updatedAt DESC', [entity]).map((r) => r.id);
  }

  async pending(): Promise<PendingOp[]> {
    return this.all<PendingRow>('SELECT * FROM pendingOps ORDER BY attempts ASC, rowid ASC').map((r) => ({
      op: JSON.parse(r.opJson) as ChangeOp,
      attempts: r.attempts,
      lastError: r.lastError ?? undefined,
      lastErrorAt: r.lastErrorAt ?? undefined,
    }));
  }

  async addPending(op: ChangeOp): Promise<void> {
    this.run(
      `INSERT INTO pendingOps (opId, entity, recordId, opJson, attempts) VALUES (?, ?, ?, ?, 0)
       ON CONFLICT(opId) DO NOTHING`,
      [op.opId, op.entity, op.recordId, JSON.stringify(op)],
    );
  }

  async resolvePending(opId: string): Promise<void> {
    this.run('DELETE FROM pendingOps WHERE opId = ?', [opId]);
  }

  async failPending(opId: string, error: string): Promise<void> {
    this.run('UPDATE pendingOps SET attempts = attempts + 1, lastError = ?, lastErrorAt = ? WHERE opId = ?', [error, new Date().toISOString(), opId]);
  }

  async getState(key: SyncStateKey): Promise<string | null> {
    return this.all<{ value: string }>('SELECT value FROM meta WHERE key = ? LIMIT 1', [key])[0]?.value ?? null;
  }

  async setState(key: SyncStateKey, value: string): Promise<void> {
    this.run('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
  }

  async conflicts(): Promise<LocalConflict[]> {
    return this.all<ConflictRow>('SELECT * FROM conflicts ORDER BY at DESC').map((r) => ({
      opId: r.opId,
      entity: r.entity as SyncEntity,
      recordId: r.recordId,
      outcome: r.outcome as LocalConflict['outcome'],
      reasonAr: r.reasonAr,
      server: r.serverJson ? (JSON.parse(r.serverJson) as Record<string, unknown>) : undefined,
      client: JSON.parse(r.clientJson) as Record<string, unknown>,
      at: r.at,
    }));
  }

  async addConflict(c: LocalConflict): Promise<void> {
    this.run(
      `INSERT INTO conflicts (opId, entity, recordId, outcome, reasonAr, serverJson, clientJson, at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(opId) DO UPDATE SET reasonAr = excluded.reasonAr, serverJson = excluded.serverJson, clientJson = excluded.clientJson, at = excluded.at`,
      [c.opId, c.entity, c.recordId, c.outcome, c.reasonAr, c.server ? JSON.stringify(c.server) : null, JSON.stringify(c.client), c.at],
    );
  }

  async clearConflict(opId: string): Promise<void> {
    this.run('DELETE FROM conflicts WHERE opId = ?', [opId]);
  }

  /** إحصاءات للشريط العلوي في تطبيق الميدان */
  async stats(): Promise<{ records: number; pending: number; conflicts: number; bytes: number }> {
    const r = this.all<{ n: number }>('SELECT (SELECT COUNT(*) FROM records) AS n')[0];
    const p = this.all<{ n: number }>('SELECT COUNT(*) AS n FROM pendingOps')[0];
    const c = this.all<{ n: number }>('SELECT COUNT(*) AS n FROM conflicts')[0];
    const pg = this.all<{ n: number }>('SELECT page_count * page_size AS n FROM pragma_page_count(), pragma_page_size()')[0];
    return { records: r?.n ?? 0, pending: p?.n ?? 0, conflicts: c?.n ?? 0, bytes: pg?.n ?? 0 };
  }

  /** مسح نسخة الخادم (للإعادة المزامنة الكاملة) مع الإبقاء على ما لم يُدفع بعد */
  async wipeRemoteRecords(): Promise<void> {
    this.run('DELETE FROM records WHERE key NOT IN (SELECT entity || ":" || recordId FROM pendingOps)');
  }

  /** تنظيف دوري: السجلات المدفوعة والقديمة جدًا (تُستدعى من الإعدادات، ليست تلقائية) */
  async compact(olderThanDays = 180): Promise<number> {
    const cut = Date.now() - olderThanDays * 86_400_000;
    const before = this.all<{ n: number }>('SELECT COUNT(*) AS n FROM records')[0]?.n ?? 0;
    this.run('DELETE FROM records WHERE deleted = 1 AND updatedAt < ?', [cut]);
    const after = this.all<{ n: number }>('SELECT COUNT(*) AS n FROM records')[0]?.n ?? 0;
    return before - after;
  }
}

/**
 * فتح المخزن: SQLite على الجهاز، ومع بديل في الذاكرة إذا كان الجسر الأصلي غير متاح
 * (Expo Go بدون plugin، أو بيئة اختبار). البديل يبقى كامل السلوك لأن الواجهة واحدة.
 */
export async function openStore(): Promise<LocalStore> {
  try {
    return await SqliteStore.open();
  } catch {
    return new MemoryStore();
  }
}
