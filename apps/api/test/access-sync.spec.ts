/**
 * اختبارات وحدة على طبقتين حرجتين:
 *  1) PermissionService: حساب الصلاحيات الفعلية + توسيع النطاق + deny/extra الخاص بالشعبة.
 *  2) SyncEngineService: مسار push (idempotency، حماية الحقول المعتمدة، دمج الحقول) ومسار pull (cursor).
 * تُستخدم بدائل (fakes) لعميل Prisma حتى تُختبر منطق الطبقات نفسها — لا نسخة مبسطة منه.
 */
import { describe, expect, it, vi } from 'vitest';
import { PermissionService } from '../src/security/permission.service.js';
import { SyncEngineService } from '../src/sync/sync-engine.service.js';
import type { AccessContext } from '../src/security/access.guard.js';

/**
 * أدوات فحص نصوص SQL داخل الاختبارات:
 *  - safeStringify: JSON.stringify ينكسر على BigInt (seq الضخم) — نحوّده لنص.
 *  - sqlOf: Prisma.sql يُسلسل كمصفوفة [str1, val1, str2, ...] بينما $queryRawUnsafe
 *    يمرر نصًا خامًا، لذا نوحّد الشكلين قبل المطابقة (وإلا انزلقت الاستعلامات إلى الفرع الافتراضي).
 */
function safeStringify(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
}
function sqlOf(q: unknown): string {
  if (typeof q === 'string') return q;
  if (Array.isArray(q)) return q.filter((x) => typeof x === 'string').join('?');
  const o = q as { text?: string; sql?: string; strings?: string[] };
  if (typeof o?.text === 'string') return o.text;
  if (typeof o?.sql === 'string') return o.sql;
  if (Array.isArray(o?.strings)) return o.strings.join('?');
  return safeStringify(q);
}

const USER_ID = '11111111-1111-1111-1111-111111111111';
const DEPT_ID = '22222222-2222-2222-2222-222222222222';
const SUB_ID = '33333333-3333-3333-3333-333333333333';
const FACILITY_ID = '44444444-4444-4444-4444-444444444444';
const RECORD_ID = '55555555-5555-5555-5555-555555555555';

const role = (code: string, perms: string[]) => ({
  id: `role-${code}`,
  code,
  permissions: perms.map((p) => ({ permission: { code: p } })),
  subDeptGrants: [] as Array<Record<string, unknown>>,
});

function fakePrismaFor(userOverrides: Record<string, unknown> = {}, permissions: string[] = ['maint.wo.view']) {
  return {
    user: {
      findFirst: vi.fn(async () => {
        const o = userOverrides as { deletedAt?: unknown };
        // مثل حيثر Prisma: deletedAt: null ⇒ المستخدم المحذوف منطقيًا لا يُوجد
        if (o.deletedAt !== undefined && o.deletedAt !== null) return null;
        return {
          id: USER_ID,
          facilityId: FACILITY_ID,
          departmentId: DEPT_ID,
          subDeptId: SUB_ID,
          version: 7,
          deletedAt: null,
          username: 'heat.tech',
          subDept: { id: SUB_ID, code: 'MAINT-HEAT', nameAr: 'شعبة المعدات الحرارية', department: { id: DEPT_ID, code: 'MAINT', nameAr: 'قسم الصيانة' } },
          roles: [
            {
              userId: USER_ID,
              roleId: 'role-tech',
              scopeKind: 'SUBDEPT',
              scopeSubDeptId: SUB_ID,
              scopeDepartmentId: null,
              expiresAt: null,
              role: role('FIELD_TECHNICIAN', permissions),
            },
            {
              userId: USER_ID,
              roleId: 'role-head',
              scopeKind: 'DEPT',
              scopeSubDeptId: null,
              scopeDepartmentId: DEPT_ID,
              expiresAt: null,
              role: role('SECTION_HEAD', permissions),
            },
          ],
          ...userOverrides,
        };
      }),
    },
    roleSubDeptGrant: { findMany: vi.fn(async () => []) },
    permission: {
      findMany: vi.fn(async (args?: { where?: { code?: { in?: string[] } } }) => {
        const codes = args?.where?.code?.in ?? [];
        return codes.map((c) => ({ id: `perm-${c}`, code: c }));
      }),
    },
    $queryRaw: vi.fn(async () => []),
    $queryRawUnsafe: vi.fn(async () => []),
    $executeRaw: vi.fn(async () => 1),
    $executeRawUnsafe: vi.fn(async () => 1),
    audit: vi.fn(async () => undefined),
  };
}

/* ════════════════════ بدائل محرك المزامنة ════════════════════ */

/** أعمدة جدول work_orders كما يراها discoverColumns (مقتطف يمثل الواقع) */
// كما هي في القاعدة: udt_name هو ما تُبنى منه الصريحة، وcreatedAt/updatedAt/facilityId موجودة هنا
// رغم أنها ممنوعة على العميل — المحرك هو من يرشّح DENIED_COLUMNS، لا جدول information_schema.
const COLUMNS = [
  { column: 'id', type: 'uuid', udt: 'uuid', notNull: true, hasDefault: false },
  { column: 'number', type: 'character varying', udt: 'varchar', notNull: true, hasDefault: false },
  { column: 'title', type: 'character varying', udt: 'varchar', notNull: true, hasDefault: false },
  { column: 'description', type: 'text', udt: 'text', notNull: true, hasDefault: false },
  { column: 'status', type: 'USER-DEFINED', udt: 'WoStatus', notNull: true, hasDefault: true },
  { column: 'priority', type: 'USER-DEFINED', udt: 'WoPriority', notNull: true, hasDefault: true },
  { column: 'estHours', type: 'numeric', udt: 'numeric', notNull: false, hasDefault: false },
  { column: 'actualEndAt', type: 'timestamp without time zone', udt: 'timestamp', notNull: false, hasDefault: false },
  { column: 'planStartAt', type: 'timestamp without time zone', udt: 'timestamp', notNull: false, hasDefault: false },
  { column: 'subDeptId', type: 'uuid', udt: 'uuid', notNull: false, hasDefault: false },
  { column: 'createdById', type: 'uuid', udt: 'uuid', notNull: true, hasDefault: false },
  { column: 'facilityId', type: 'uuid', udt: 'uuid', notNull: true, hasDefault: false },
  { column: 'departmentId', type: 'uuid', udt: 'uuid', notNull: true, hasDefault: false }, // يختمها serverStamp في كل أمر شغل
  { column: 'deletedAt', type: 'timestamp without time zone', udt: 'timestamp', notNull: false, hasDefault: false },
  { column: 'createdAt', type: 'timestamp without time zone', udt: 'timestamp', notNull: true, hasDefault: false },
  { column: 'updatedAt', type: 'timestamp without time zone', udt: 'timestamp', notNull: true, hasDefault: false },
  { column: 'version', type: 'integer', udt: 'int4', notNull: true, hasDefault: true },
  { column: 'clientOpId', type: 'character varying', udt: 'varchar', notNull: false, hasDefault: false },
  { column: 'isOfflineCreated', type: 'boolean', udt: 'bool', notNull: true, hasDefault: true },
];

/**
 * بديل لعميل Prisma يسجّل كل SQL ينفذه المحرك في calls[].
 * المحرك يستخدم $queryRaw (نصوص Prisma.sql) للاستعلامات البنيوية،
 * و$queryRawUnsafe لقراءة الصفوف والأعمدة، و$executeRawUnsafe للكتابة —
 * نفرض نفس التقسيم حتى لا تختبر البدائل نسخة مبسطة من المنطق.
 */
function syncFake(opts: { existing?: Record<string, unknown> | null; dupOp?: boolean; columns?: typeof COLUMNS; rawRows?: (sql: string) => unknown[] | undefined } = {}) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const prisma: Record<string, unknown> = {
    $queryRaw: vi.fn(async (q: unknown) => {
      const sql = sqlOf(q);
      calls.push({ sql, params: [] });
      if (opts.rawRows) {
        const forced = opts.rawRows(sql);
        if (forced !== undefined) return forced;
      }
      if (sql.includes('information_schema')) return opts.columns ?? COLUMNS;
      if (sql.includes('"opId" FROM sync_idempotency')) return opts.dupOp ? [{ opId: 'op-fixed-0001' }] : [];
      if (sql.includes('"resultJson" FROM sync_idempotency')) return opts.dupOp ? [{ resultJson: { outcome: 'DEDUPLICATED', serverSeq: 4242 } }] : [];
      if (sql.includes('last_value')) return [{ seq: 4242n }];
      if (sql.includes('MAX(seq)')) return [{ max: 4242n }];
      if (sql.includes('SELECT 1 FROM')) return [{ one: 1 }]; // فحص النطاق: السجل داخل شعبة المستخدم
      if (sql.includes('sync_change_log')) return [];
      return [];
    }),
    $queryRawUnsafe: vi.fn(async (sql: string, ...params: unknown[]) => {
      calls.push({ sql, params });
      if (opts.rawRows) {
        const forced = opts.rawRows(sql);
        if (forced !== undefined) return forced;
      }
      if (sql.includes("AND column_name IN ('createdAt', 'updatedAt')")) {
        // طلب «أي أعمدة وقت إلزامية بلا default»: يُجاب بدقّة، لا بإرجاع كل الأعمدة (وإلا تكرّر id في الإدراج)
        return (opts.columns ?? COLUMNS).filter((c) => c.column === 'createdAt' || c.column === 'updatedAt').map((c) => ({ column: c.column }));
      }
      if (sql.includes('next_business_number')) return [{ n: 'WO-2026-000099' }]; // رقم العمل يُولّد في القاعدة
      if (sql.includes('information_schema.columns')) return opts.columns ?? COLUMNS;
      if (sql.includes('WHERE id = $1::uuid LIMIT 1')) return opts.existing && Object.keys(opts.existing).length ? [opts.existing] : [];
      if (sql.includes('SELECT 1 FROM')) return [{ one: 1 }];
      if (sql.startsWith('SELECT')) return [];
      return [];
    }),
    $executeRaw: vi.fn(async (q: unknown, ...params: unknown[]) => {
      calls.push({ sql: sqlOf(q), params });
      return 1;
    }),
    $executeRawUnsafe: vi.fn(async (sql: string, ...params: unknown[]) => {
      calls.push({ sql, params });
      return 1;
    }),
    audit: vi.fn(async () => undefined),
  };
  return { prisma, calls };
}

function pushBody(ops: Array<Record<string, unknown>>) {
  // تُكمّل الحقول الإلزامية في عقد المزامنة (opId/clientTimestamp/kind) حتى يبقى كل اختبار مركّزًا على جانب واحد
  const filled = ops.map((op, i) => ({
    opId: `op-fixed-000${i + 1}`,
    kind: 'PATCH',
    clientTimestamp: '2026-09-07T08:00:00.000Z',
    ...op,
  }));
  return { deviceId: 'device-android-01', userId: USER_ID, schemaVersion: 3, ops: filled } as never;
}

/** سياق وصول مبني يدويًا — يحاكي ما يبنيه AccessGuard بعد التحقق من الـ JWT */
function access(grants: Array<[string, string]>, extra: Partial<AccessContext> = {}): AccessContext {
  const set = new Map(grants);
  return {
    userId: USER_ID,
    deviceId: 'device-android-01',
    profile: {
      userId: USER_ID,
      username: 'heat.tech',
      facilityId: FACILITY_ID,
      departmentId: DEPT_ID,
      subDeptId: SUB_ID,
      version: 7,
      roles: ['FIELD_TECHNICIAN'],
      permissions: grants.map(([code, scope]) => ({ code, scope, maxScope: scope }) as never),
      isFacilityWide: grants.some(([, s]) => s === 'ALL'),
    } as never,
    grants: set,
    can: (code: string) => set.get(code) !== undefined,
    scopeOf: (code: string) => set.get(code),
    ...extra,
  } as unknown as AccessContext;
}

describe('PermissionService', () => {
  it('takes the widest scope per permission and never loses grants', async () => {
    const svc = new PermissionService(fakePrismaFor() as never);
    const profile = await svc.load(USER_ID);
    expect(profile).not.toBeNull();
    const view = profile!.permissions.find((p) => p.code === 'maint.wo.view');
    expect(view?.scope).toBe('DEPT'); // SUBDEPT (تقني) ∪ DEPT (رئيس شعبة) → الأوسع
    expect(profile!.roles.sort()).toEqual(['FIELD_TECHNICIAN', 'SECTION_HEAD']);
    // منح الموظفين الذاتيين يضاف تلقائيًا لكل مستخدم مُصادَق عليه
    expect(profile!.permissions.map((p) => p.code)).toContain('hr.leave.request');
    expect(profile!.userId).toBe(USER_ID);
  });

  it('takes the widest scope per permission and never loses grants', async () => {
    const svc = new PermissionService(fakePrismaFor() as never);
    const profile = await svc.load(USER_ID);
    expect(profile).not.toBeNull();
    const view = profile!.permissions.find((p) => p.code === 'maint.wo.view');
    expect(view?.scope).toBe('DEPT'); // SUBDEPT (تقني) ∪ DEPT (رئيس شعبة) → الأوسع
    expect(profile!.roles.sort()).toEqual(['FIELD_TECHNICIAN', 'SECTION_HEAD']);
    // منح الموظفين الذاتيين يضاف تلقائيًا لكل مستخدم مُصادَق عليه
    expect(profile!.permissions.map((p) => p.code)).toContain('hr.leave.request');
    expect(profile!.userId).toBe(USER_ID);
  });

  it('ignores expired grants', async () => {
    const prisma = fakePrismaFor({
      roles: [
        {
          userId: USER_ID,
          roleId: 'role-head',
          scopeKind: 'ALL',
          scopeSubDeptId: null,
          scopeDepartmentId: null,
          expiresAt: new Date('2020-01-01'), // منتهية
          role: role('DEPT_MANAGER', ['maint.wo.close']),
        },
      ],
    });
    const svc = new PermissionService(prisma as never);
    const profile = await svc.load(USER_ID);
    expect(profile!.roles).toEqual([]);
    expect(profile!.permissions.find((p) => p.code === 'maint.wo.close')).toBeUndefined();
  });

  it('applies sub-department deny/extra on top of the role grants', async () => {
    const prisma = fakePrismaFor({
      subDept: { id: SUB_ID, code: 'MAINT-VALVE', nameAr: 'شعبة الصمامات', department: { id: DEPT_ID, code: 'MAINT', nameAr: 'قسم الصيانة' } },
      roles: [
        {
          userId: USER_ID,
          roleId: 'role-head',
          scopeKind: 'SUBDEPT',
          scopeSubDeptId: SUB_ID,
          scopeDepartmentId: DEPT_ID,
          expiresAt: null,
          role: {
            ...role('SECTION_HEAD', ['maint.wo.close', 'maint.wo.execute']),
            subDeptGrants: [{ subDeptId: SUB_ID, scopeKind: 'SUBDEPT', denyJson: ['maint.wo.close'], extraJson: ['maint.asset.manage'] }],
          },
        },
      ],
    });
    const svc = new PermissionService(prisma as never);
    const profile = await svc.load(USER_ID);
    const codes = profile!.permissions.map((p) => p.code);
    expect(codes).toContain('maint.wo.execute');
    expect(codes).toContain('maint.asset.manage'); // extra خاص بالشعبة
    expect(codes).not.toContain('maint.wo.close'); // deny خاص بالشعبة
  });

  it('returns null for a soft-deleted user', async () => {
    const prisma = fakePrismaFor({ deletedAt: new Date('2026-01-01') });
    const svc = new PermissionService(prisma as never);
    expect(await svc.load(USER_ID)).toBeNull();
  });

  it('builds scope filters per scope kind (SELF ⊂ TEAM ⊂ SUBDEPT ⊂ DEPT ⊂ ALL)', async () => {
    const svc = new PermissionService(fakePrismaFor() as never);
    const profile = (await svc.load(USER_ID))!;
    const build = (scope: string) => svc.buildScopeWhere(profile, { code: 'maint.wo.view', scope } as never);
    expect(build('ALL')).toEqual({});
    expect(build('DEPT')).toEqual({ departmentId: DEPT_ID });
    const sub = build('SUBDEPT') as unknown as { OR: Array<Record<string, unknown>> };
    expect(sub.OR).toHaveLength(2);
    expect(sub.OR[0]).toEqual({ subDeptId: SUB_ID });
    expect(sub.OR[1]).toEqual({ createdById: USER_ID });
    expect(build('SELF')).toEqual({ createdById: USER_ID });
    expect(build('TEAM')).toEqual({ createdById: USER_ID });
    // صلاحية غير ممنوحة ⇒ مرشّح لا يطابق أي سجل (وليس "كل السجلات")
    expect(svc.buildScopeWhere(profile, undefined)).toEqual({ id: '00000000-0000-0000-0000-000000000000' });
  });
});

describe('SyncEngineService.push', () => {
  it('merges a real field change and writes only the changed column', async () => {
    const { prisma, calls } = syncFake({ existing: { status: 'IN_PROGRESS', description: 'old', subDeptId: SUB_ID } });
    const engine = new SyncEngineService(prisma as never);
    const res = await engine.push(
      pushBody([{ entity: 'workOrder', recordId: RECORD_ID, data: { description: 'cleaned seal faces and reassembled' } }]),
      access([['sync.push', 'SUBDEPT'], ['maint.wo.execute', 'SUBDEPT']]),
    );
    expect(res.results[0]!.outcome).toBe('MERGED');
    expect(res.results[0]!.serverKeptFields).toBeUndefined(); // لا حقول محمية في هذه العملية
    const update = calls.find((c) => c.sql.startsWith('UPDATE work_orders'));
    expect(update?.sql).toContain('"description"');
    expect(update?.sql).not.toContain('"status"');
    expect(String(update?.params[1])).toContain('cleaned seal faces and reassembled');
    expect(String(update?.params[1])).toContain('old'); // لم يُلغَ نص الخادم (append)
  });

  it('is a no-op when the client sends exactly what the server already has (replayed op)', async () => {
    const desc = 'cleaned seal faces and reassembled';
    const { prisma, calls } = syncFake({ existing: { status: 'IN_PROGRESS', description: desc, subDeptId: SUB_ID } });
    const engine = new SyncEngineService(prisma as never);
    const res = await engine.push(pushBody([{ entity: 'workOrder', recordId: RECORD_ID, data: { description: desc } }]), access([['sync.push', 'SUBDEPT'], ['maint.wo.execute', 'SUBDEPT']]));
    expect(res.results[0]!.outcome).toBe('APPLIED');
    expect(calls.some((c) => c.sql.startsWith('UPDATE work_orders'))).toBe(false);
  });

  it('keeps protected lifecycle fields on the server even for a closed record', async () => {
    const { prisma, calls } = syncFake({
      existing: { status: 'CLOSED', description: 'server', approverId: 'u9', actualEndAt: '2026-09-06T10:00:00Z', subDeptId: SUB_ID },
    });
    const engine = new SyncEngineService(prisma as never);
    const res = await engine.push(
      pushBody([{ entity: 'workOrder', recordId: RECORD_ID, data: { status: 'IN_PROGRESS', actualEndAt: '2026-09-07T10:00:00Z' } }]),
      access([['sync.push', 'SUBDEPT'], ['maint.wo.execute', 'SUBDEPT']]),
    );
    expect(res.results[0]!.outcome).toBe('MERGED'); // مسودة الميدان تُحفظ…
    expect(res.results[0]!.serverKeptFields).toContain('status'); // …لكن الحالة بقيت للخادم
    const upd = calls.find((c) => c.sql.startsWith('UPDATE work_orders'));
    expect(upd?.sql).toContain('"actualEndAt"');
    expect(upd?.sql).not.toContain('"status"');
    expect(upd?.params).not.toContain('IN_PROGRESS');
  });

  it('stamps identity columns with the server value and logs the client attempt', async () => {
    const { prisma, calls } = syncFake({ existing: null as never });
    const engine = new SyncEngineService(prisma as never);
    await engine.push(
      pushBody([
        {
          entity: 'workOrder',
          recordId: RECORD_ID,
          kind: 'UPSERT',
          data: {
            title: 'Pump seal leak',
            description: 'observed during round',
            priority: 'HIGH', // enum في القاعدة: يحتاج صريحة وإلا 42804
            estHours: 2, // numeric: نصّ العميل لا يُسند إليه مباشرة
            planStartAt: '2026-09-09T06:00:00.000Z', // timestamp
            createdById: 'attacker',
            facilityId: 'other-facility',
          },
        },
      ]),
      access([['sync.push', 'SUBDEPT'], ['maint.wo.create', 'SUBDEPT'], ['maint.wo.view', 'SUBDEPT']]),
    );
    const insert = calls.find((c) => c.sql.includes('INSERT INTO work_orders'));
    expect(insert).toBeDefined();
    expect(insert!.params).not.toContain('attacker'); // هوية المستخدم لا تأتي من العميل
    expect(insert!.sql).toContain('"createdById"'); // بل يُختم من قبل الخادم
    expect(insert!.sql).toContain('"facilityId"');
    // صريحة لكل معامل بحسب نوع عموده: encode() يُرجع نصًا، وPostgreSQL لا يُسند text إلى uuid/numeric/enum
    expect(insert!.sql).toContain('$1::"uuid"');
    expect(insert!.sql).toMatch(/"facilityId" = |\$\d+::"uuid"/);
    expect(insert!.sql).toContain('::"numeric"');
    expect(insert!.sql).toContain('::"WoPriority"');
    expect(insert!.sql).toContain('::"timestamp"');
    // لا يُترك أي معامل بلا صريحة: نصّ واحد خارج القاعدة يكفي لإسقاط الإدراج كله بـ42804
    const ph = insert!.sql.match(/\$\d+/g) ?? [];
    const casted = insert!.sql.match(/\$\d+::"/g) ?? [];
    expect(casted.length).toBe(ph.length);
    // أوقات لا تملؤها القاعدة على INSERT (trg_touch على UPDATE وحده) + رقم عمل من نفس تسلسل مسار REST
    expect(insert!.sql).toContain('"createdAt"');
    expect(insert!.sql).toContain('"updatedAt"');
    expect(insert!.sql).toContain('now()');
    expect(insert!.params).toContain('WO-2026-000099');
    expect(calls.some((c) => c.sql.includes('sync_conflicts'))).toBe(true);
  });

  it('deduplicates a re-sent op (network retry after an outage)', async () => {
    const { prisma, calls } = syncFake({ dupOp: true });
    const engine = new SyncEngineService(prisma as never);
    const res = await engine.push(pushBody([{ entity: 'workOrder', recordId: RECORD_ID, data: { description: 'dup' } }]), access([['sync.push', 'SUBDEPT']]));
    expect(res.results[0]!.outcome).toBe('DEDUPLICATED');
    expect(res.results[0]!.serverSeq).toBe(4242);
    expect(calls.some((c) => c.sql.startsWith('UPDATE work_orders'))).toBe(false);
  });

  it('rejects pushes for entities the user has no permission for', async () => {
    const { prisma } = syncFake({ existing: {} });
    const engine = new SyncEngineService(prisma as never);
    const res = await engine.push(pushBody([{ entity: 'labResult', recordId: RECORD_ID, data: { value: 0.42 } }]), access([['sync.push', 'SUBDEPT']]));
    expect(res.results[0]!.outcome).toBe('REJECTED');
    expect(res.results[0]!.reasonAr).toContain('lab.result.enter');
  });

  it('rejects an unknown schema version instead of corrupting data', async () => {
    const { prisma } = syncFake();
    const engine = new SyncEngineService(prisma as never);
    await expect(
      engine.push({ deviceId: 'device-android-01', userId: USER_ID, schemaVersion: 1, ops: [] } as never, access([['sync.push', 'SUBDEPT']])),
    ).rejects.toThrow();
  });

  it('blocks an append-only record delete coming from a device', async () => {
    const { prisma } = syncFake({ existing: { status: 'OK' } });
    const engine = new SyncEngineService(prisma as never);
    const res = await engine.push(pushBody([{ entity: 'workOrderLog', recordId: RECORD_ID, kind: 'DELETE' }]), access([['sync.push', 'SUBDEPT'], ['maint.wo.execute', 'SUBDEPT']]));
    expect(res.results[0]!.outcome).toBe('REJECTED');
    expect(res.results[0]!.reasonAr).toContain('append-only');
  });
});

describe('SyncEngineService.pull', () => {
  it('returns changes with the new cursor and updates device progress', async () => {
    const { prisma, calls } = syncFake({
      rawRows: (sql) => {
        if (sql.includes('FROM sync_change_log cl')) {
          return [{ seq: 101n, entity: 'workOrder', recordId: RECORD_ID, version: 4, deleted: false, payload: { title: 'T', syncSeq: 101, passwordHash: 'leak' } }];
        }
        if (sql.includes('last_value')) return [{ seq: 101n }];
        return [];
      },
    });
    const engine = new SyncEngineService(prisma as never);
    const res = await engine.pull({ deviceId: 'device-android-01', sinceCursor: 100, limit: 500 }, access([['sync.pull', 'DEPT']]));
    expect(res.cursor).toBe(101);
    expect(res.hasMore).toBe(false);
    expect(res.changes[0]!.seq).toBe(101);
    expect(res.changes[0]!.data.passwordHash).toBeUndefined(); // لا تُسرَّب الحقول الحساسة عبر Change Feed
    expect(calls.some((c) => c.sql.includes('devices'))).toBe(true);
  });

  it('asks for a full resync when the change log was pruned beyond retention', async () => {
    const { prisma } = syncFake({
      rawRows: (sql) => {
        if (sql.includes('last_value')) return [{ seq: 9_000_000n }]; // الخادم تقدّم كثيرًا (سجل مُنظَّف)
        if (sql.includes('FROM sync_change_log cl')) return []; // لا تغييرات بعد الـ cursor
        return [];
      },
    });
    const engine = new SyncEngineService(prisma as never);
    const res = await engine.pull({ deviceId: 'device-android-01', sinceCursor: 10, limit: 500 }, access([['sync.pull', 'ALL']]));
    expect(res.fullResyncRequired).toBe(true);
    expect(res.changes).toEqual([]);
    expect(res.resyncReasonAr).toContain('إعادة مزامنة');
  });
});
