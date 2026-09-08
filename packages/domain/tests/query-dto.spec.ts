/**
 * اختبارات وسائط الاستعلام في قوائم القراءة (packages/domain/src/dto.ts).
 *
 * لماذا تُختبر وحدها: هذه الوسائط هي الباب الذي دخل منه 500 الخام إلى العميل. القياس
 * (2026-09-08): `?skip=-5` و`?take=abc` و`?status=NOPE` و`?date=أمس` و`?to=bad` كانت كلها
 * ترجع «تعذّر إتمام الطلب… أبلغ المشرف»، لأن القيمة كانت تصل Prisma بلا فحص. الفحص الآن في
 * الحزمة المشتركة، فيُختبر هنا مرة واحدة بدل أن يتكرر في كل متحكّم.
 * قيد زائد يفعله التاريخ: الشكل وحده لا يكفي — 2026-02-30 و2026-13-45 يطابقان النمط لكنّهما
 * يصنعان Invalid Date، وكلاهما يجب أن يرجع 400 لا 500.
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  attendanceDailyQueryDto,
  auditListQueryDto,
  documentListQueryDto,
  isoDateField,
  isoMonthField,
  labOosListQueryDto,
  labSampleListQueryDto,
  orgUserListQueryDto,
  pageFields,
  paramTrendListQueryDto,
  payrollExportQueryDto,
  queryFlag,
  shiftLogListQueryDto,
  workOrderListQueryDto,
} from '../src/dto.js';

/**
 * وسط الاستعلام نصوص دائمًا (شريط العنوان)، فالحالات تُكتب كما تصل فعلًا.
 * `fields` تُمرَّر إما حقلًا واحدًا (يُغلَّف تحت `v`) أو مجموعة حقول جاهزة.
 */
type Schema<T> = { safeParse(data: unknown): { success: boolean; data?: T; error?: unknown } };
const wrap = (inner: unknown): z.ZodType<Record<string, unknown>> =>
  inner instanceof z.ZodType ? z.object({ v: inner as z.ZodTypeAny }) : z.object(inner as z.ZodRawShape);
const ok = <T extends Record<string, unknown>>(schema: Schema<T>, q: Record<string, string>): T => {
  const r = schema.safeParse(q);
  expect(r.success, `كان متوقعًا القبول: ${JSON.stringify(q)}`).toBe(true);
  return r.data as T;
};
const bad = (schema: Schema<Record<string, unknown>>, q: Record<string, string>) => {
  expect(schema.safeParse(q).success, `كان متوقعًا الرفض: ${JSON.stringify(q)}`).toBe(false);
};

describe('أعلام الاستعلام (?flag=true)', () => {
  it('تقبل true/false نصيًّا وتغيب إلى false', () => {
    expect(ok(wrap(queryFlag()), { v: 'true' }).v).toBe(true);
    expect(ok(wrap(queryFlag()), { v: 'false' }).v).toBe(false);
    expect(ok(wrap(queryFlag()), {}).v).toBe(false);
    expect(ok(wrap(queryFlag(true)), {}).v).toBe(true);
  });
  it('ترفض القيم الغامضة بدل تخمينها', () => {
    for (const v of ['1', 'yes', 'TRUE', '']) bad(wrap(queryFlag()), { v });
  });
  it('documentListQueryDto: mine=true كان يرجع 400 لأنه نصّ لا boolean', () => {
    expect(ok(documentListQueryDto, { mine: 'true' }).mine).toBe(true);
    expect(ok(documentListQueryDto, {}).mine).toBe(false);
    expect(ok(documentListQueryDto, { take: '5' }).take).toBe(5);
    bad(documentListQueryDto, { take: '900' }); // السقف 100
    bad(documentListQueryDto, { entityId: 'xyz' });
  });
});

describe('الترقيم take/skip', () => {
  it('يحوّل النص إلى رقم ويحدّ النطاق', () => {
    expect(ok(wrap(pageFields), { take: '50', skip: '0' })).toEqual({ take: 50, skip: 0 });
    expect(ok(wrap(pageFields), {})).toEqual({});
  });
  it('يرفض ما كان يُسقط الخادم', () => {
    const cases: Array<Record<string, string>> = [{ skip: '-5' }, { take: 'abc' }, { take: '2.5' }, { take: '0' }, { take: '5000' }, { skip: 'x'.repeat(9) }];
    for (const q of cases) bad(wrap(pageFields), q);
  });
});

describe('تواريخ الأيام والشهور', () => {
  it('تقبل الصيغة الصحيحة فقط', () => {
    expect(ok(wrap(isoDateField), { v: '2026-09-08' }).v).toBe('2026-09-08');
    expect(ok(wrap(isoMonthField), { v: '2026-09' }).v).toBe('2026-09');
  });
  it('ترفض الشكل الخاطئ والتاريخ غير الموجود في التقويم', () => {
    for (const v of ['أمس', '2026-9-8', '08/09/2026', '2026-09-08T10:00:00Z', '2026-02-30', '2026-13-45', '']) bad(wrap(isoDateField), { v });
    for (const v of ['2026-13', '2026-0', '202611', '2026-00']) bad(wrap(isoMonthField), { v });
  });
  it('daily بلا date يرجع 400 معلنًا لا 500 صامتًا', () => {
    bad(attendanceDailyQueryDto, {});
    bad(attendanceDailyQueryDto, { date: 'أمس' });
    bad(attendanceDailyQueryDto, { date: '2026-09-08', subDeptId: 'xyz' });
    expect(ok(attendanceDailyQueryDto, { date: '2026-09-08' }).subDeptId).toBeUndefined();
  });
});

describe('فلاتر أوامر العمل والمختبر والتدقيق', () => {
  it('تقبل القيم المعروفة وتُدخل الافتراضيات', () => {
    expect(ok(workOrderListQueryDto, { status: 'DRAFT', priority: 'HIGH', onlyMy: 'true', q: 'مضخة' })).toMatchObject({
      status: 'DRAFT',
      priority: 'HIGH',
      onlyMy: true,
      includeClosed: false,
    });
    expect(ok(labSampleListQueryDto, { status: 'RESULTED', onlyMine: 'true' })).toMatchObject({ status: 'RESULTED', onlyMine: true });
    expect(ok(labOosListQueryDto, { status: 'OPEN', take: '10' })).toMatchObject({ status: 'OPEN', take: 10 });
  });
  it('ترفض حالة غير معروفة بدل تمريرها إلى WHERE', () => {
    bad(workOrderListQueryDto, { status: 'NOPE' });
    bad(workOrderListQueryDto, { priority: 'NOPE' });
    bad(workOrderListQueryDto, { from: 'أمس' });
    bad(labSampleListQueryDto, { status: 'NOPE' });
    bad(labSampleListQueryDto, { to: 'bad' });
    bad(labOosListQueryDto, { status: 'NOPE' });
  });
  it('معرّفات التدقيق يجب أن تكون uuid', () => {
    bad(auditListQueryDto, { entityId: 'xyz' });
    bad(auditListQueryDto, { actorId: 'xyz' });
    bad(auditListQueryDto, { from: 'zzz' });
    expect(ok(auditListQueryDto, { entityType: 'workOrder', from: '2026-09-08T00:00:00Z' }).entityType).toBe('workOrder');
  });
  it('قائمة المستخدمين ودفتر الوردية والانعطاف القياسي', () => {
    expect(ok(orgUserListQueryDto, { includeInactive: 'true' }).includeInactive).toBe(true);
    bad(orgUserListQueryDto, { subDeptId: 'xyz' });
    expect(ok(shiftLogListQueryDto, { days: '7', shiftCode: 'A' })).toMatchObject({ days: 7, shiftCode: 'A' });
    bad(shiftLogListQueryDto, { days: '0' });
    bad(shiftLogListQueryDto, { shiftCode: 'E' });
    expect(ok(paramTrendListQueryDto, { paramCode: 'UREA_N' }).days).toBe(30); // الافتراضي كان 30 في المتحكّم يدويًا
    bad(paramTrendListQueryDto, {}); // paramCode مطلوب
    expect(ok(payrollExportQueryDto, { month: '2026-08' }).month).toBe('2026-08');
    bad(payrollExportQueryDto, { month: '2026-13' });
  });
});
