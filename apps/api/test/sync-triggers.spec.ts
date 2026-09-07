/**
 * عقد مشغّلات المزامنة على PostgreSQL حيّ (يُتخطّى بأدب إن لم تُوجَد قاعدة).
 *
 * يغطي انتكاسات حدثت فعلًا أثناء البناء، حتى لا تعود:
 *  1) `trg_bump_version` كان يُعلَّق على كل جدول فيه version+syncSeq — بما فيه users،
 *     فتُبطِل عملية الدخول (تحديث lastLoginAt) الرمزَ الموقَّع → 401 على كل طلب بعد login.
 *  2) `trg_sync` كان يُعلَّق مرّتين على نفس الجدول (documents + woAttachment) فتتضاعف
 *     دفعة التغييرات لكل صف.
 *  3) تسلسلات الأرقام بقيت خلف صفوف مُدخلة يدويًا (seed تجريبي/ترحيل) ← P2002 على `number`.
 */
import { describe, expect, it } from 'vitest';
import { SYNC_ENTITIES, SYNC_META } from '@newport/domain';

/** فحوص تحتاج قاعدة حيّة؛ العنوان الافتراضي هو قاعدة التطوير الموثّقة في docs/04 */
const CANDIDATE_URLS = [process.env.DATABASE_URL, 'postgresql://newport:newport@127.0.0.1:5432/newport'].filter(
  (x): x is string => !!x,
);

let resolved: string | null | undefined;

async function ping(url: string): Promise<boolean> {
  const { default: pg } = await import('pg');
  const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 1500 });
  try {
    await c.connect();
    await c.query('SELECT 1 FROM sync_entity_registry LIMIT 1');
    return true;
  } catch {
    return false;
  } finally {
    await c.end().catch(() => undefined);
  }
}

/** يعيد عنوان قاعدة حيّة (مرة واحدة)، أو null عندما لا توجد — فيُتخطّى الاختبار لا يفشل */
async function liveDb(): Promise<string | null> {
  if (resolved === undefined) {
    resolved = null;
    for (const u of CANDIDATE_URLS) {
      if (await ping(u)) {
        resolved = u;
        break;
      }
    }
  }
  return resolved;
}

async function q<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const { default: pg } = await import('pg');
  const c = new pg.Client({ connectionString: (await liveDb())!, connectionTimeoutMillis: 5000 });
  await c.connect();
  try {
    const r = await c.query(sql, params);
    return r.rows as T[];
  } finally {
    await c.end();
  }
}

describe('sync trigger surface (live postgres)', () => {
  it('sync_entity_registry = 19 كيانًا مطابقة لـ SYNC_ENTITIES وبنفس الجداول', async (ctx) => {
    if (!(await liveDb())) return ctx.skip();
    const rows = await q<{ entity: string; table: string }>(
      `SELECT entity, table_name AS "table" FROM sync_entity_registry ORDER BY entity`,
    );
    expect(rows.map((r) => r.entity)).toEqual([...SYNC_ENTITIES].sort());
    const drift = rows.filter((r) => r.table !== SYNC_META[r.entity as keyof typeof SYNC_META].table);
    expect(drift, `جدول مختلف عن التعاقد المشترك: ${JSON.stringify(drift)}`).toEqual([]);
  });

  it('trg_sync معلّق مرة واحدة على كل جدول من جداول المزامنة', async (ctx) => {
    if (!(await liveDb())) return ctx.skip();
    const rows = await q<{ tbl: string; n: string }>(
      `SELECT relname AS tbl, count(*) AS n
         FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE t.tgname = 'trg_sync' AND NOT t.tgisinternal
        GROUP BY 1 ORDER BY 1`,
    );
    expect(rows.length, 'عدد الجداول الحاملة لـ trg_sync').toBe(SYNC_ENTITIES.length);
    expect(rows.filter((r) => Number(r.n) !== 1), 'مؤجّل مكرّر على نفس الجدول').toEqual([]);
    expect(rows.map((r) => r.tbl).sort()).toEqual([...new Set(SYNC_ENTITIES.map((e) => SYNC_META[e].table))].sort());
  });

  it('trg_bump_version لا يلمس users (وإلا أبطل JWT عند كل دخول)', async (ctx) => {
    if (!(await liveDb())) return ctx.skip();
    const rows = await q<{ tbl: string }>(
      `SELECT relname AS tbl FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE t.tgname = 'trg_bump_version' AND NOT t.tgisinternal`,
    );
    const tables = rows.map((r) => r.tbl);
    expect(tables).not.toContain('users');
    expect(tables).not.toContain('refresh_tokens');
    const registryTables = new Set(SYNC_ENTITIES.map((e) => SYNC_META[e].table));
    expect(tables.filter((t) => !registryTables.has(t)), 'رفع إصدار على جدول خارج السجل').toEqual([]);
  });

  it('fn_align_number_sequences يُبقي wo_number_seq فوق أعلى رقم موجود', async (ctx) => {
    if (!(await liveDb())) return ctx.skip();
    await q(`SELECT * FROM fn_align_number_sequences()`);
    const [seq] = await q<{ last_value: string }>(`SELECT last_value::text AS last_value FROM wo_number_seq`);
    const [maxRow] = await q<{ maxn: string | null }>(
      `SELECT MAX((substring(number FROM '[0-9]+$'))::int)::text AS maxn FROM work_orders`,
    );
    const maxUsed = Number(maxRow?.maxn ?? 0);
    expect(Number(seq!.last_value), 'تسلسل أرقام أوامر الشغل يجب أن يسبقه رقم حر').toBe(maxUsed + 1);
  });

  it('لا سطر في أي migration يبدأ بـ # (Postgres يرفضه — ليس تعليقًا)', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dir = join(__dirname, '..', 'prisma', 'migrations');
    const offenders: string[] = [];
    for (const folder of readdirSync(dir)) {
      const lines = readFileSync(join(dir, folder, 'migration.sql'), 'utf8').split('\n');
      lines.forEach((l, i) => {
        if (l.trimStart().startsWith('#')) offenders.push(`${folder}:${i + 1}: ${l.trim().slice(0, 60)}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
