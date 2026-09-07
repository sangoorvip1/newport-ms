/**
 * منطق المختبر المشترك (الخادم + سطح المكتب + الهاتف).
 *
 * لماذا في `packages/domain` لا داخل `apps/api`؟
 *  - المُحلِّل يحتاج أن يرى «هل النتيجة خارج المطابقة؟» قبل أن يرفعها (شبكة معدومة في المختبر)،
 *    وشعبة الإنتاج تحتاج أن تعرف أن العينة لم تُعتمد بعد قبل أن تثق بالنتيجة.
 *  - التناقض بين العميل والخادم في حساب الحكم = صراع مزامنة لاحقًا؛ لذا الحساب في حزمة واحدة.
 *
 * ملاحظة دقة: الخادم هو من يكتب `isOutOfSpec` ويُنشئ حالة OOS (لا يثق العميل مطلقًا)؛
 * دوال هنا تُستعمل للتحقق المسبق في الواجهة وللاختبار الموحد للسلوك.
 */

/** حدود المواصفة كما في `lab_specs` (min/max قد يكونان مفتوحين) */
export interface SpecBounds {
  minVal?: number | null;
  maxVal?: number | null;
}

export type BreachDirection = 'LOW' | 'HIGH' | null;

export interface SpecVerdict {
  inSpec: boolean;
  breach: BreachDirection;
  /** مقدار الخروج عن الحد كنسبة من عرض المجال (أو من الحد نفسه إذا كان أحاديًا) */
  deviationPct: number | null;
  /** الحد الذي خُرق، للعرض في الواجهة */
  limit: number | null;
}

/**
 * حكم المطابقة. القيم غير المحدودة أو NaN تُعيد `inSpec:false` بسبب `INVALID_INPUT`؟
 * لا — تُعيد `inSpec:true` مع `breach:null` لأن «لا مواصفة» لا يعني «خارج المطابقة»؛
 * الفصل في ذلك يعود إلى `LabSpec` نفسه (غياب المواصفة = لا حكم)، وهذا يمنع إنذارًا كاذبًا
 * لكل تحليل يجرى قبل إدخال المواصفة في النظام.
 */
export function evaluateSpec(value: number, spec: SpecBounds | null | undefined): SpecVerdict {
  const none: SpecVerdict = { inSpec: true, breach: null, deviationPct: null, limit: null };
  if (!spec || !Number.isFinite(value)) return none;
  const min = typeof spec.minVal === 'number' && Number.isFinite(spec.minVal) ? spec.minVal : null;
  const max = typeof spec.maxVal === 'number' && Number.isFinite(spec.maxVal) ? spec.maxVal : null;
  if (min !== null && value < min) return { inSpec: false, breach: 'LOW', deviationPct: pctDeviation(min, max, min), limit: min };
  if (max !== null && value > max) return { inSpec: false, breach: 'HIGH', deviationPct: pctDeviation(max, max, min), limit: max };
  return { inSpec: true, breach: null, deviationPct: null, limit: null };
}

/** نسبة الخروج: على مجال مفتوح تُقاس من الحد نفسه، وعلى مجال مغلق من عرضه */
function pctDeviation(limit: number, max: number | null, min: number | null): number | null {
  const span = min !== null && max !== null && max > min ? max - min : Math.abs(limit);
  if (!span || !Number.isFinite(span) || span === 0) return null;
  return Math.round((Math.abs(limit) / span) * 10_000) / 100;
}

/** درجة الخطورة — تُستعمل لاختيار مسار CAPA ولترتيب قائمة المتابعة */
export type OosSeverity = 'MINOR' | 'MAJOR' | 'CRITICAL';

export function severityForVerdict(verdict: SpecVerdict, opts: { productGrade?: string; isSafetyCritical?: boolean } = {}): OosSeverity {
  if (opts.isSafetyCritical) return 'CRITICAL';
  const d = verdict.deviationPct;
  if (d === null) return 'MAJOR'; // خروج بلا مجال معروف ⇒ لا نستخفّ به
  if (d >= 25) return 'CRITICAL';
  if (d >= 5) return 'MAJOR';
  return 'MINOR';
}

/**
 * آلة حالة حالة خارج المطابقة. مقصود أن تكون أضيق منenum القاعدة (العمود VarChar(24)):
 * لا إغلاق بلا CAPA مكتوب ولا تجاهل بلا مُحقِّق — ينفّذها `LabService.updateOos`.
 */
export const OOS_STATUSES = ['OPEN', 'INVESTIGATING', 'CAPA_DEFINED', 'EFFECTIVENESS_CHECK', 'CLOSED', 'REJECTED'] as const;
export type OosStatus = (typeof OOS_STATUSES)[number];

export const OOS_TRANSITIONS: Record<OosStatus, OosStatus[]> = {
  OPEN: ['INVESTIGATING', 'REJECTED'],
  INVESTIGATING: ['CAPA_DEFINED', 'REJECTED'],
  CAPA_DEFINED: ['EFFECTIVENESS_CHECK', 'INVESTIGATING'],
  EFFECTIVENESS_CHECK: ['CLOSED', 'INVESTIGATING'],
  CLOSED: [],
  REJECTED: [],
};

export function canOosTransition(from: string, to: string): boolean {
  const list = OOS_TRANSITIONS[from as OosStatus];
  return !!list && list.includes(to as OosStatus);
}

export function allowedOosNext(from: string): OosStatus[] {
  return OOS_TRANSITIONS[from as OosStatus] ?? [];
}

/** آلة حالة العينة — مطابقة لـ enum `SampleStatus` في القاعدة، وقيد على ما يقبله العميل */
export const SAMPLE_STATUSES = ['COLLECTED', 'IN_QUEUE', 'ANALYZING', 'RESULTED', 'VERIFIED', 'REJECTED', 'VOIDED'] as const;
export type SampleStatus = (typeof SAMPLE_STATUSES)[number];

export const SAMPLE_TRANSITIONS: Record<SampleStatus, SampleStatus[]> = {
  COLLECTED: ['IN_QUEUE', 'ANALYZING', 'VOIDED'],
  IN_QUEUE: ['ANALYZING', 'VOIDED'],
  ANALYZING: ['RESULTED', 'IN_QUEUE', 'VOIDED'],
  RESULTED: ['VERIFIED', 'REJECTED'],
  VERIFIED: ['REJECTED'], // اعتماد نتيجة ثم إسقاطها بعد مراجعة لاحقة — يُسجَّل سببه
  REJECTED: ['ANALYZING'], // إعادة تحليل بعد الرفض
  VOIDED: [],
};

export function canSampleTransition(from: string, to: string): boolean {
  const list = SAMPLE_TRANSITIONS[from as SampleStatus];
  return !!list && list.includes(to as SampleStatus);
}

/** حالة العينة الناتجة عن إدخال نتائج (لا يقبل الخادم إدخال نتائج على عينة مُعتمدة) */
export function statusAfterResultEntry(current: string): SampleStatus | null {
  if (current === 'COLLECTED' || current === 'IN_QUEUE' || current === 'ANALYZING') return 'RESULTED';
  if (current === 'RESULTED') return 'RESULTED'; // إعادة إدخال قبل الاعتماد مسموحة
  return null; // VERIFIED / REJECTED / VOIDED ⇒ مرفوض
}

export interface CertificateRow {
  parameterCode: string;
  nameAr: string;
  unit: string | null;
  value: string;
  minVal: number | null;
  maxVal: number | null;
  verdict: 'PASS' | 'FAIL';
  method: string | null;
  verifiedAt: string | null;
}

/**
 * بناء صفوف شهادة التحليل (CoA). تُستعمل في الخادم عند `GET /v1/lab/certificates/:id`
 * وفي معاينة سطح المكتب، فيتطابق النص المطبوع مع المخزَّن.
 * النتيجة غير المعتمدة (verifiedAt=null) تُستبعد دائمًا — الشههادة لا تُصدر ما لم يُدقَّق فيه.
 */
export interface CertificateResultRow {
  value: number | string;
  parameterId: string;
  unit?: string | null;
  isOutOfSpec?: boolean;
  method?: string | null;
  remarks?: string | null;
  verifiedAt?: Date | string | null;
  parameter: { code: string; nameAr: string; unit?: string | null };
}

/** المواصفة المطبَّقة على مُعامل (تُجلب من lab_specs حسب الوحدة/الدرجة) */
export interface CertificateSpecRow {
  parameterId: string;
  minVal?: number | null;
  maxVal?: number | null;
}

export function buildCertificateRows(
  results: CertificateResultRow[],
  specs: CertificateSpecRow[],
  options: { includeUnverified?: boolean } = {},
): CertificateRow[] {
  const rows: CertificateRow[] = [];
  for (const r of results) {
    const verifiedAt = r.verifiedAt ? new Date(r.verifiedAt).toISOString() : null;
    if (!options.includeUnverified && !verifiedAt) continue;
    const numeric = typeof r.value === 'number' ? r.value : Number(r.value);
    const spec = specs.find((s) => s.parameterId === r.parameterId);
    const verdict = evaluateSpec(numeric, spec ? { minVal: spec.minVal, maxVal: spec.maxVal } : null);
    rows.push({
      parameterCode: r.parameter.code,
      nameAr: r.parameter.nameAr,
      unit: r.unit ?? r.parameter.unit ?? null,
      value: typeof r.value === 'number' ? String(r.value) : r.value,
      minVal: spec?.minVal ?? null,
      maxVal: spec?.maxVal ?? null,
      verdict: verdict.inSpec && !r.isOutOfSpec ? 'PASS' : 'FAIL',
      method: r.method ?? null,
      verifiedAt,
    });
  }
  return rows;
}

/** هل تُصدر الشهادة؟ — كل الصفوف المعتمدة فقط، وبلا حالة OOS مفتوحة على العينة */
export function canIssueCertificate(input: { sampleStatus: string; verifiedCount: number; openOosCount: number }): { ok: boolean; reasonAr?: string } {
  if (input.sampleStatus !== 'VERIFIED') return { ok: false, reasonAr: 'العينة لم تُعتمد بعد — الشهادة تُصدر للنتائج المدقَّقة فقط' };
  if (input.verifiedCount === 0) return { ok: false, reasonAr: 'لا توجد نتائج معتمدة لهذه العينة' };
  if (input.openOosCount > 0) return { ok: false, reasonAr: `توجد ${input.openOosCount} حالة خارج المطابقة مفتوحة على هذه العينة — أغلقها أو اربطها بـ CAPA أولًا` };
  return { ok: true };
}
