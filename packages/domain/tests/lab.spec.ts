import { describe, expect, it } from 'vitest';
import {
  allowedOosNext,
  buildCertificateRows,
  canIssueCertificate,
  canOosTransition,
  canSampleTransition,
  evaluateSpec,
  OOS_TRANSITIONS,
  OOS_STATUSES,
  SAMPLE_STATUSES,
  severityForVerdict,
  statusAfterResultEntry,
} from '../src/lab.js';
import { PERMISSION_DEFS, ACCESS_MATRIX, isPermissionCode, resolveGrants, withinCeiling } from '../src/index.js';
import type { PermissionCode } from '../src/index.js';

describe('lab: spec evaluation (نفس الحساب في الخادم والواجهة)', () => {
  it('ضمن المجال ⇒ PASS بلا خرق', () => {
    expect(evaluateSpec(46.2, { minVal: 46, maxVal: 46.4 })).toMatchObject({ inSpec: true, breach: null, deviationPct: null });
  });

  it('أدنى من الحد ⇒ LOW مع نسبة خروج محسوبة من عرض المجال', () => {
    const v = evaluateSpec(45.9, { minVal: 46, maxVal: 46.4 });
    expect(v).toMatchObject({ inSpec: false, breach: 'LOW', limit: 46 });
    expect(v.deviationPct).toBeCloseTo((46 / (46.4 - 46)) * 100, 1);
  });

  it('أعلى من الحد ⇒ HIGH', () => {
    expect(evaluateSpec(1.2, { minVal: 0, maxVal: 0.55 })).toMatchObject({ inSpec: false, breach: 'HIGH', limit: 0.55 });
  });

  it('حد أدنى أحادي (نقاء الأمونيا) ⇒ النسبة تقاس من الحد نفسه', () => {
    const v = evaluateSpec(99.0, { minVal: 99.5, maxVal: null });
    expect(v.inSpec).toBe(false);
    expect(v.breach).toBe('LOW');
    expect(v.deviationPct).toBeCloseTo((99.5 / 99.5) * 100, 1); // 100% من مرجع الحد
  });

  it('لا مواصفة ⇒ لا حكم (لا إنذار كاذب قبل إدخال المواصفة)', () => {
    expect(evaluateSpec(1234, null)).toEqual({ inSpec: true, breach: null, deviationPct: null, limit: null });
    expect(evaluateSpec(1234, {})).toMatchObject({ inSpec: true });
  });

  it('قيمة غير رقمية ⇒ لا حكم (تُرفض في DTO لا هنا)', () => {
    expect(evaluateSpec(Number.NaN, { minVal: 1, maxVal: 2 })).toMatchObject({ inSpec: true, breach: null });
  });

  it('الحدود المتساوية (min=max) لا تقسم على صفر', () => {
    const v = evaluateSpec(0.9, { minVal: 1, maxVal: 1 });
    expect(v.inSpec).toBe(false);
    expect(Number.isFinite(v.deviationPct ?? 0)).toBe(true);
  });

  it('درجة الخطورة تتبع مقدار الخروج، والسلامة الحرجة تُصعّد فورًا', () => {
    expect(severityForVerdict({ inSpec: false, breach: 'LOW', deviationPct: 1, limit: 1 })).toBe('MINOR');
    expect(severityForVerdict({ inSpec: false, breach: 'LOW', deviationPct: 10, limit: 1 })).toBe('MAJOR');
    expect(severityForVerdict({ inSpec: false, breach: 'HIGH', deviationPct: 40, limit: 1 })).toBe('CRITICAL');
    expect(severityForVerdict({ inSpec: false, breach: 'HIGH', deviationPct: null, limit: 1 })).toBe('MAJOR');
    expect(severityForVerdict({ inSpec: false, breach: 'LOW', deviationPct: 1, limit: 1 }, { isSafetyCritical: true })).toBe('CRITICAL');
  });
});

describe('lab: OOS & sample state machines', () => {
  it('كل حالة في السجل لها مسار معرّف، والمغلقة نهائية', () => {
    for (const s of OOS_STATUSES) expect(OOS_TRANSITIONS[s]).toBeInstanceOf(Array);
    expect(allowedOosNext('CLOSED')).toEqual([]);
    expect(allowedOosNext('REJECTED')).toEqual([]);
    expect(allowedOosNext('UNKNOWN_STATE')).toEqual([]);
  });

  it('انتقالات مشروعة وغير مشروعة (لا إغلاق بلا CAPA ولا قفز من OPEN إلى CLOSED)', () => {
    expect(canOosTransition('OPEN', 'INVESTIGATING')).toBe(true);
    expect(canOosTransition('OPEN', 'CLOSED')).toBe(false);
    expect(canOosTransition('CAPA_DEFINED', 'EFFECTIVENESS_CHECK')).toBe(true);
    expect(canOosTransition('CLOSED', 'INVESTIGATING')).toBe(false);
    expect(canOosTransition('INVESTIGATING', 'CAPA_DEFINED')).toBe(true);
  });

  it('لا يمكن إعادة عينة مُلغاة إلى التحليل، ويمكن إعادة RESULTED إلى ANALYZING؟ لا — الرفض ثم التحليل', () => {
    expect(canSampleTransition('RESULTED', 'VERIFIED')).toBe(true);
    expect(canSampleTransition('RESULTED', 'ANALYZING')).toBe(false);
    expect(canSampleTransition('REJECTED', 'ANALYZING')).toBe(true);
    expect(canSampleTransition('VOIDED', 'IN_QUEUE')).toBe(false);
  });

  it('إدخال النتائج يحدد حالة العينة: مقبول قبل الاعتماد ومرفوض بعده', () => {
    expect(statusAfterResultEntry('COLLECTED')).toBe('RESULTED');
    expect(statusAfterResultEntry('ANALYZING')).toBe('RESULTED');
    expect(statusAfterResultEntry('RESULTED')).toBe('RESULTED');
    expect(statusAfterResultEntry('VERIFIED')).toBeNull();
    expect(statusAfterResultEntry('VOIDED')).toBeNull();
    expect(statusAfterResultEntry('REJECTED')).toBeNull();
  });

  it('سجل حالات العينة يغطي كل قيم enum SampleStatus في القاعدة', () => {
    // مكرر عمدًا: أي إضافة حالة في schema.prisma بلا مسار في الآلة يجب أن يُكتشف هنا
    expect([...SAMPLE_STATUSES].sort()).toEqual(['ANALYZING', 'COLLECTED', 'IN_QUEUE', 'REJECTED', 'RESULTED', 'VERIFIED', 'VOIDED']);
  });
});

describe('lab: certificate (CoA) assembly', () => {
  const parameter = { code: 'UREA_N', nameAr: 'نسبة النيتروجين', unit: '%' };
  const specs = [{ parameterId: 'p1', minVal: 46, maxVal: 46.4 }];

  it('يستبعد النتائج غير المعتمدة افتراضيًا ويُدرجها عند الطلب الصريح', () => {
    const rows = [
      { value: 46.2, parameterId: 'p1', parameter, verifiedAt: '2026-09-01T08:00:00.000Z' },
      { value: 45.1, parameterId: 'p2', parameter: { ...parameter, code: 'UREA_BI' }, verifiedAt: null },
    ];
    expect(buildCertificateRows(rows, specs)).toHaveLength(1);
    expect(buildCertificateRows(rows, specs, { includeUnverified: true })).toHaveLength(2);
  });

  it('الحكم في الشهادة = مواصفة + علامة الخرق المخزنة (لا يُعاد اختراع القرار)', () => {
    const rows = [{ value: 46.2, parameterId: 'p1', parameter, verifiedAt: new Date('2026-09-01') }];
    expect(buildCertificateRows(rows, specs)[0]).toMatchObject({ verdict: 'PASS', minVal: 46, maxVal: 46.4 });
    expect(buildCertificateRows([{ ...rows[0], isOutOfSpec: true }], specs)[0].verdict).toBe('FAIL');
  });

  it('القيمة العشرية تُصدَّر نصًا كما أُدخلت (لا فقدان دقة في الطباعة)', () => {
    const rows = [{ value: '46.20000', parameterId: 'p1', parameter, verifiedAt: new Date('2026-09-01') }];
    expect(buildCertificateRows(rows, specs)[0].value).toBe('46.20000');
  });

  it('الشهادة لا تُصدر قبل الاعتماد، ولا مع حالة OOS مفتوحة', () => {
    expect(canIssueCertificate({ sampleStatus: 'RESULTED', verifiedCount: 4, openOosCount: 0 }).ok).toBe(false);
    expect(canIssueCertificate({ sampleStatus: 'VERIFIED', verifiedCount: 0, openOosCount: 0 }).reasonAr).toContain('نتائج معتمدة');
    const blocked = canIssueCertificate({ sampleStatus: 'VERIFIED', verifiedCount: 4, openOosCount: 2 });
    expect(blocked.ok).toBe(false);
    expect(blocked.reasonAr).toContain('خارج المطابقة');
    expect(canIssueCertificate({ sampleStatus: 'VERIFIED', verifiedCount: 4, openOosCount: 0 }).ok).toBe(true);
  });
});

describe('lab: permissions contract (الضمان الذي كشف منحًا أوسع من السقف)', () => {
  const READ_OF: Record<string, PermissionCode> = {
    'lab.sample.create': 'lab.sample.view',
    'lab.result.enter': 'lab.result.view',
    'lab.result.verify': 'lab.result.view',
    'lab.oos.manage': 'lab.oos.view',
  };

  it('كل رمز كتابة مخبري ممنوح يجلب معه رمز القراءة المقابل', () => {
    const offenders: string[] = [];
    for (const g of resolveGrants()) {
      const set = new Set(g.permissions);
      for (const [write, read] of Object.entries(READ_OF)) {
        if (set.has(write) && !set.has(read)) offenders.push(`${g.subDeptCode ?? '(global)'}/${g.role}: ${write} بلا ${read}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('الرموز الثلاثة الجديدة معرّفة ومشروعة السقف ولا تبقى ميتة', () => {
    for (const code of ['lab.sample.view', 'lab.result.view', 'lab.oos.view'] as PermissionCode[]) {
      expect(isPermissionCode(code)).toBe(true);
      const def = PERMISSION_DEFS.find((d) => d.code === code)!;
      expect(def.module).toBe('lab');
      expect(def.code.split('.').at(-1)).toBe('view'); // الدلالة المعتمدة للتفويض: الرمز الكامل (انظر ملاحظة def)
      expect(withinCeiling(def.maxScope, code)).toBe(true);
    }
    const used = new Set(resolveGrants().flatMap((g) => g.permissions));
    for (const code of Object.keys(READ_OF).concat(Object.values(READ_OF)) as PermissionCode[]) expect(used.has(code), code).toBe(true);
  });

  it('لا شعبة تملك lab.result.verify إلا المختبر ومدير المعمل (الاعتماد مركزية مقصودة)', () => {
    const withVerify = resolveGrants().filter((g) => g.permissions.includes('lab.result.verify'));
    expect(withVerify.map((g) => g.subDeptCode)).toEqual(['PROD-LAB', 'PROD-LAB', null]);
    expect(withVerify.every((g) => g.role === 'SECTION_HEAD' || g.role === 'LAB_SUPERVISOR' || g.role === 'PLANT_MANAGER')).toBe(true);
    // التأكد أن المصفوفة لم تتسع صدفة: المحلل لا يعتمد نتائج نفسه
    const analyst = ACCESS_MATRIX.find((r) => r.subDeptCode === 'PROD-LAB')!.grants.find((g) => g.role === 'LAB_ANALYST')!;
    expect(analyst.permissions).not.toContain('lab.result.verify');
  });
});
