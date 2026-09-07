/**
 * عقد المخطط ↔ عقد المزامنة: كل اسم جدول/حقل في SYNC_META يجب أن يكون موجودًا فعلًا في Prisma.
 *
 * لماذا هذا الملف؟ محرك المزامنة يكتب SQL خامًا بأسماء جداول/أعمدة مأخوذة من SYNC_META، لذا
 * أي اسم قديم (مثل work_order_logs بدل wo_logs) لا يُظهر خطأً وقت الترجمة — يفشل أول push حيّ.
 * الاختبار يربط الطرفين نصيًا بلا الحاجة لقاعدة بيانات.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SYNC_ENTITIES, SYNC_META } from '@newport/domain';
import { ENTITY_MAP } from '../src/sync/sync-engine.service.js';

const schemaPath = join(__dirname, '..', 'prisma', 'schema.prisma');
const schema = readFileSync(schemaPath, 'utf8');

interface Model {
  name: string;
  table: string;
  fields: Set<string>;
}

const models: Model[] = [...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)].map(([, name, body]) => {
  const fields = new Set<string>();
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('//') || line.startsWith('@')) continue;
    const m = /^(\w+)\s+[?\w[\]]+/.exec(line);
    if (m) fields.add(m[1]!);
  }
  const map = /@@map\("([^"]+)"\)/.exec(body);
  return { name, table: map?.[1] ?? name, fields };
});
const byTable = new Map(models.map((m) => [m.table, m]));

describe('sync contract ↔ prisma schema', () => {
  it('every SYNC_META entity has a physical table in the schema', () => {
    const missing = SYNC_ENTITIES.filter((e) => !byTable.has(SYNC_META[e].table)).map((e) => `${e} → ${SYNC_META[e].table}`);
    expect(missing, `جداول غير موجودة في schema.prisma:\n${missing.join('\n')}`).toEqual([]);
  });

  it('server ENTITY_MAP and shared SYNC_META agree on the table name', () => {
    const drift = SYNC_ENTITIES.filter((e) => ENTITY_MAP[e].table !== SYNC_META[e].table).map(
      (e) => `${e}: server=${ENTITY_MAP[e].table} shared=${SYNC_META[e].table}`,
    );
    expect(drift, drift.join('\n')).toEqual([]);
  });

  it('protected/append fields are real columns (no invented names)', () => {
    const bad: string[] = [];
    for (const e of SYNC_ENTITIES) {
      const model = byTable.get(SYNC_META[e].table);
      if (!model) continue;
      for (const group of [SYNC_META[e].protectedFields ?? [], SYNC_META[e].appendFields ?? []]) {
        for (const f of group) if (!model.fields.has(f)) bad.push(`${e}.${f} (model ${model.name})`);
      }
    }
    expect(bad, `حقول غير موجودة في المخطط:\n${bad.join('\n')}`).toEqual([]);
  });

  it('syncable tables carry the bookkeeping columns the engine writes', () => {
    const required = ['version', 'syncSeq'];
    const bad: string[] = [];
    for (const e of SYNC_ENTITIES) {
      const model = byTable.get(SYNC_META[e].table);
      if (!model) continue;
      // append_only جداول حدثية تُدار من Change Feed فقط، فلا تُشترط فيها version
      if (SYNC_META[e].merge === 'append_only') continue;
      for (const col of required) if (!model.fields.has(col)) bad.push(`${e} (${model.name}) بلا ${col}`);
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });

  it('raw SQL layer quotes camelCase columns and covers every sync entity', () => {
    const migration = readFileSync(
      join(__dirname, '..', 'prisma', 'migrations', '20260907000001_postgres_extensions_views_rls', 'migration.sql'),
      'utf8',
    );
    // كل كيان متزامن يجب أن يكون مذكورًا في قائمة ربط trg_sync داخل الترحيل
    const missing = SYNC_ENTITIES.filter((e) => !migration.includes(`'${e}'`)).map((e) => e as string);
    expect(missing, `كيانات بلا مؤجّل change-log: ${missing.join(', ')}`).toEqual([]);
    // SQL صالح: لا تعليقات بنمط shell (#) ولا مراجع snake_case للأعمدة
    const hashLines = migration.split('\n').filter((l) => l.trimStart().startsWith('#'));
    expect(hashLines.map((l) => l.trim()).slice(0, 3), 'أسطر # تكسر SQL في PostgreSQL').toEqual([]);
    // لا مراجع snake_case للأعمدة داخل SQL (أعمدة Prisma كلها camelCase مقبَّس)
    // نُقيل النصوص بين علامتي اقتباس أولًا: أسماء GUC مثل 'app.user_id' ومعرّفات مقبَّسة
    // ليست مراجع أعمدة، وإلا أعطت الفحص إنذارًا كاذبًا (حدث هذا فعلًا).
    const stripQuoted = (l: string) => l.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""');
    const offenders = migration
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .filter((l) => /\b(?:deleted_at|updated_at|created_at|sub_dept_id|department_id|user_id|parts_cost|labor_cost|contractor_cost|end_at|start_at)\b/.test(stripQuoted(l)));
    expect(offenders.map((o) => o.trim()).slice(0, 5), 'مراجع snake_case بلا اقتباس:\n' + offenders.join('\n')).toEqual([]);
  });
});
