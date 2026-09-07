/**
 * اختبارات نطاق المختبر (منطق `LabService.sampleScope` + حارس ملكية العينة).
 *
 * هذه الطبقة حرجة لأنها المكان الذي تُفسَّر فيه القاعدة: «العينة مملوكة للشعبة المنتجة،
 * والمختبر وحدة خدمة ترى قسمها» — خطأ هنا يعني إما عمى للمحلل أو تسريبًا بين الشعب.
 * تُستعمل بدائل Prisma تسجّل شرط الـ where الفعلي الذي سيذهب إلى القاعدة.
 */
import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { LabService } from '../src/lab/lab.service.js';
import type { AccessContext } from '../src/security/access.guard.js';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const DEPT_ID = '22222222-2222-2222-2222-222222222222';
const LAB_SUB_ID = '33333333-3333-3333-3333-333333333333';
const UREA_SUB_ID = '66666666-6666-6666-6666-666666666666';
const MAINT_HEAT_SUB_ID = '88888888-8888-8888-8888-888888888888';
const FACILITY_ID = '44444444-4444-4444-4444-444444444444';

type Grant = { code: string; scope: 'SELF' | 'TEAM' | 'SUBDEPT' | 'DEPT' | 'ALL' };

function makeAccess(grants: Grant[], opts: { subDeptId?: string | null; isFacilityWide?: boolean } = {}): AccessContext {
  // null صريح يعني «بلا شعبة» (أدوار عامة) — لا يُستبدل بالافتراضي
  const subDeptId = 'subDeptId' in opts ? opts.subDeptId : LAB_SUB_ID;
  const permissions = grants.map((g) => ({ code: g.code as never, scope: g.scope, departmentId: DEPT_ID, subDeptId: opts.subDeptId ?? LAB_SUB_ID }));
  return {
    userId: USER_ID,
    deviceId: 'test-device',
    ip: '127.0.0.1',
    profile: {
      userId: USER_ID,
      facilityId: FACILITY_ID,
      departmentId: DEPT_ID,
      subDeptId: subDeptId ?? null,
      isFacilityWide: !!opts.isFacilityWide,
      mustChangePwd: false,
      permissions,
      roles: ['LAB_ANALYST'],
    },
    grants: new Map(permissions.map((p) => [p.code as never, p as never])),
    can: (code: string) => permissions.some((p) => p.code === code),
  } as unknown as AccessContext;
}

/** بديل Prisma يلتقط الشرط المرسل إلى القاعدة ويعيد صفحات فارغة */
function makePrisma(subDeptKind: 'LAB' | 'UREA' = 'LAB') {
  const captured: { sampleWhere?: unknown; created?: unknown; audit: unknown[] } = { audit: [] };
  const prisma = {
    labSample: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
      create: vi.fn(async ({ data }: { data: unknown }) => {
        captured.created = data;
        return { id: '01A0LAB0-0000-7000-8000-000000000001', sampleNumber: 'SMP-2026-000001', status: 'COLLECTED', collectedAt: new Date('2026-09-07T08:00:00Z'), subDept: { code: 'PROD-LAB', nameAr: 'المختبر' }, ...(data as object) };
      }),
      update: vi.fn(async () => ({})),
    },
    labOosCase: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []), count: vi.fn(async () => 0), groupBy: vi.fn(async () => []), create: vi.fn(async () => ({})), update: vi.fn(async () => ({})) },
    labResult: { findFirst: vi.fn(async () => null), count: vi.fn(async () => 0), upsert: vi.fn(async () => ({})), findUnique: vi.fn(async () => ({ id: 'r1' })), update: vi.fn(async () => ({})) },
    labParameter: { findUnique: vi.fn(async () => ({ id: 'p1', code: 'UREA_N', nameAr: 'النيتروجين', unit: '%', method: 'Kjeldahl' })), findMany: vi.fn(async () => []) },
    labSpec: { findMany: vi.fn(async () => []) },
    user: { findMany: vi.fn(async () => []) },
    subDepartment: {
      findUnique: vi.fn(async () => ({ kind: subDeptKind })),
      findFirst: vi.fn(async ({ where }: { where: { code?: string } }) =>
        where.code === 'PROD-LAB'
          ? { id: LAB_SUB_ID, departmentId: DEPT_ID, code: 'PROD-LAB' }
          : where.code === 'PROD-UREA'
            ? { id: UREA_SUB_ID, departmentId: DEPT_ID, code: 'PROD-UREA' }
            : where.code === 'MAINT-HEAT'
              ? { id: MAINT_HEAT_SUB_ID, departmentId: '77777777-7777-7777-7777-777777777777', code: 'MAINT-HEAT' }
              : null,
      ),
    },
    workOrder: { findFirst: vi.fn(async () => null) },
    // listSamples يقرأ [rows, total] في $transaction واحدة — نعيد الشكل الصحيح لا مصفوفة أصفار
    $transaction: vi.fn(async (arg: unknown) => (Array.isArray(arg) ? [[], 0] : arg)),
    $queryRaw: vi.fn(async () => [{ n: 'SMP-2026-000001' }]),
    async withScope(_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) {
      const tx = {
        ...this,
        $queryRaw: this.$queryRaw,
        labSample: this.labSample,
        labResult: this.labResult,
        labOosCase: this.labOosCase,
        labParameter: this.labParameter,
      };
      return fn(tx);
    },
    async audit(_tx: unknown, entry: unknown) {
      captured.audit.push(entry);
    },
  };
  // raw: البديل نفسه بدون cast — للفحص على الدوال المزيفة (toHaveBeenCalled)
  return { prisma: prisma as never, raw: prisma, captured };
}

async function listWith(prisma: unknown, access: AccessContext) {
  const svc = new LabService(prisma as never);
  const whereSpy = (prisma as { labSample: { findMany: ReturnType<typeof vi.fn> } }).labSample.findMany;
  await svc.listSamples({ take: 10 }, access);
  const arg = whereSpy.mock.calls[0]![0] as { where: Record<string, unknown> };
  const { deletedAt: _d, take: _t, skip: _s, ...scopePart } = arg.where;
  return scopePart;
}

describe('lab: نطاق القراءة على lab_samples', () => {
  it('شعبة المختبر (kind=LAB) بنطاق SUBDEPT ترى عينات قسمها كله', async () => {
    const { prisma } = makePrisma('LAB');
    const access = makeAccess([{ code: 'lab.sample.view', scope: 'SUBDEPT' }]);
    const scope = await listWith(prisma, access);
    expect(scope).toEqual({ subDept: { departmentId: DEPT_ID } });
  });

  it('شعبة إنتاج بنطاق SUBDEPT ترى عيناتها أو ما جمعته هي فقط', async () => {
    const { prisma } = makePrisma('UREA');
    const access = makeAccess([{ code: 'lab.sample.view', scope: 'SUBDEPT' }], { subDeptId: UREA_SUB_ID });
    const scope = await listWith(prisma, access);
    expect(scope).toEqual({ OR: [{ subDeptId: UREA_SUB_ID }, { collectedById: USER_ID }] });
  });

  it('نطاق DEPT لا يحتاج استعلام kind إطلاقًا', async () => {
    const { prisma, captured } = makePrisma('UREA');
    const access = makeAccess([{ code: 'lab.sample.view', scope: 'DEPT' }], { subDeptId: UREA_SUB_ID });
    const scope = await listWith(prisma, access);
    expect(scope).toEqual({ subDept: { departmentId: DEPT_ID } });
    // prisma مُمرَّر إلى Service كـ never، لذا نصل للدالة المزيفة عبر cast صريح
    expect((prisma as unknown as { subDepartment: { findUnique: ReturnType<typeof vi.fn> } }).subDepartment.findUnique).not.toHaveBeenCalled();
    expect(captured.audit).toHaveLength(0);
  });

  it('ALL أو facility-wide ⇒ بلا قيد إضافي (عدا deletedAt)', async () => {
    const a = makePrisma('LAB');
    expect(await listWith(a.prisma, makeAccess([{ code: 'lab.sample.view', scope: 'ALL' }]))).toEqual({});
    const b = makePrisma('LAB');
    expect(await listWith(b.prisma, makeAccess([{ code: 'lab.sample.view', scope: 'SUBDEPT' }], { isFacilityWide: true }))).toEqual({});
  });

  it('بلا رمز قراءة ⇒ 403 مع الرمز المطلوب ومنح المستخدم (نفس عقد بقية الطبقات)', async () => {
    const { prisma } = makePrisma('LAB');
    const svc = new LabService(prisma as never);
    await expect(svc.listSamples({}, makeAccess([{ code: 'prod.log.view', scope: 'SUBDEPT' }]))).rejects.toMatchObject({
      status: 403,
      response: expect.objectContaining({ required: 'lab.sample.view' }),
    });
  });

  it('SELF/TEAM لا يتسربان إلى كل القسم', async () => {
    const t = makePrisma('LAB');
    expect(await listWith(t.prisma, makeAccess([{ code: 'lab.sample.view', scope: 'TEAM' }]))).toEqual({ subDeptId: LAB_SUB_ID });
    // SELF يجب أن يبقى الأضيق حتى لأدوار المختبر — لا يُوسَّع بحجة «وحدة خدمة»
    const s = makePrisma('LAB');
    expect(await listWith(s.prisma, makeAccess([{ code: 'lab.sample.view', scope: 'SELF' }]))).toEqual({ collectedById: USER_ID });
  });
});

describe('lab: ملكية العينة عند الإنشاء (الحارس الذي يمنع انتحال الشعبة)', () => {
  const body = (extra: Record<string, unknown> = {}) =>
    ({
      unitCode: 'UREA',
      sampleType: 'PRODUCT',
      collectedAt: '2026-09-07T07:45:00.000Z',
      isFastTracked: false,
      ...extra,
    }) as never;

  it('رئيس شعبة إنتاج يفتح عينة لشعبته فقط', async () => {
    const { prisma, captured } = makePrisma('UREA');
    const svc = new LabService(prisma as never);
    const out = await svc.createSample(body({ forSubDeptCode: 'PROD-UREA' }), makeAccess([{ code: 'lab.sample.create', scope: 'SUBDEPT' }], { subDeptId: UREA_SUB_ID }));
    expect(out.sampleNumber).toBe('SMP-2026-000001');
    expect((captured.created as { subDeptId: string }).subDeptId).toBe(UREA_SUB_ID);
    expect(captured.audit[0]).toMatchObject({ action: 'CREATE', entityType: 'labSample' });
  });

  it('المحلل لا يفتح عينة باسم شعبة أخرى ⇒ 403 مفسَّر', async () => {
    const { prisma } = makePrisma('LAB');
    const svc = new LabService(prisma as never);
    await expect(svc.createSample(body({ forSubDeptCode: 'PROD-UREA' }), makeAccess([{ code: 'lab.sample.create', scope: 'SUBDEPT' }]))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.createSample(body({ forSubDeptCode: 'PROD-UREA' }), makeAccess([{ code: 'lab.sample.create', scope: 'SUBDEPT' }]))).rejects.toMatchObject({
      response: expect.objectContaining({ messageAr: expect.stringContaining('PROD-UREA') }),
    });
  });

  it('نطاق DEPT يسمح بالنيابة عن شعب القسم، ALL يسمح لكل الأقسام', async () => {
    const dept = makePrisma('LAB');
    await new LabService(dept.prisma as never).createSample(body({ forSubDeptCode: 'PROD-UREA' }), makeAccess([{ code: 'lab.sample.create', scope: 'DEPT' }]));
    expect((dept.captured.created as { subDeptId: string }).subDeptId).toBe(UREA_SUB_ID);

    // نطاق ALL يتجاوز حتى حدّ القسم: عينة صيانة من مختبر الإنتاج مشروعة (طلب تحليل طارئ)
    const all = makePrisma('LAB');
    await new LabService(all.prisma as never).createSample(body({ forSubDeptCode: 'MAINT-HEAT' }), makeAccess([{ code: 'lab.sample.create', scope: 'ALL' }]));
    expect((all.captured.created as { subDeptId: string }).subDeptId).toBe(MAINT_HEAT_SUB_ID);
  });

  it('بلا forSubDeptCode تُستعمل شعبة المستخدم، وغيابها خطأ صريح لا صامت', async () => {
    const okCase = makePrisma('LAB');
    await new LabService(okCase.prisma as never).createSample(body(), makeAccess([{ code: 'lab.sample.create', scope: 'SUBDEPT' }]));
    expect((okCase.captured.created as { subDeptId: string }).subDeptId).toBe(LAB_SUB_ID);

    const noSub = makePrisma('LAB');
    await expect(new LabService(noSub.prisma as never).createSample(body(), makeAccess([{ code: 'lab.sample.create', scope: 'SUBDEPT' }], { subDeptId: null }))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('رمز شعبة غير موجود ⇒ 400 (لا إنشاء صامت ببيانات معلّقة)', async () => {
    const { prisma } = makePrisma('LAB');
    await expect(new LabService(prisma as never).createSample(body({ forSubDeptCode: 'PROD-GHOST' }), makeAccess([{ code: 'lab.sample.create', scope: 'ALL' }]))).rejects.toBeInstanceOf(BadRequestException);
  });
});
