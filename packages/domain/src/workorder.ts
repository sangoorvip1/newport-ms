/**
 * آلة حالات أوامر الشغل (Work Orders) وتدفق تصاريح العمل.
 * منطق مشترك بين الخادم وسطح المكتب والهاتف: لا يُقبل أي انتقال خارج هذه الجدولة،
 * والتحقق يحدث على الخادم دائمًا (Source of Truth) حتى لو جاء الطلب من عميل دون اتصال.
 */
import type { PermissionCode } from './permissions.js';

export const WO_STATES = [
  'DRAFT', // مسودة (قد تنشأ من الهاتف دون اتصال)
  'SUBMITTED', // بانتظار الاعتماد
  'APPROVED', // معتمد
  'ASSIGNED', // مُسند لفريق/شعبة
  'IN_PROGRESS', // قيد التنفيذ
  'ON_HOLD', // متوقف مؤقتًا (نقص قطع، انتظار تصريح، انتظار إيقاف وحدة)
  'AWAITING_PARTS', // بانتظار المواد من المخزن
  'AWAITING_PERMIT', // بانتظار تصريح العمل
  'COMPLETED', // انتهى التنفيذ بانتظار الإغلاق
  'CLOSED', // مغلق (تم تسجيل التفاصيل والتكلفة)
  'CANCELLED', // ملغى
  'REJECTED', // مرفوض
] as const;
export type WoState = (typeof WO_STATES)[number];

/** من يستطيع الانتقال، وبأي صلاحية */
export interface Transition {
  to: WoState;
  permission: PermissionCode;
  /** هل يتطلب إدخال بيانات إضافية (حقول مطلوبة) */
  requires?: ReadonlyArray<'reason' | 'labor' | 'parts' | 'actualTimes' | 'rootCause' | 'permitNo'>;
  noteAr: string;
}

export const WO_TRANSITIONS: Record<WoState, ReadonlyArray<Transition>> = {
  DRAFT: [
    { to: 'SUBMITTED', permission: 'maint.wo.create', noteAr: 'رفع الطلب للاعتماد رئيس الشعبة/القسم' },
    { to: 'CANCELLED', permission: 'maint.wo.cancel', requires: ['reason'], noteAr: 'إلغاء قبل الاعتماد' },
  ],
  SUBMITTED: [
    { to: 'APPROVED', permission: 'maint.wo.assign', noteAr: 'اعتماد تقني ومالي أولي' },
    { to: 'REJECTED', permission: 'maint.wo.cancel', requires: ['reason'], noteAr: 'رفض مع سبب' },
  ],
  APPROVED: [
    { to: 'ASSIGNED', permission: 'maint.wo.assign', requires: ['actualTimes'], noteAr: 'إسناد لفريق/شعبة مع تاريخ مستهدف' },
    { to: 'CANCELLED', permission: 'maint.wo.cancel', requires: ['reason'], noteAr: 'إلغاء/دمج مع أمر آخر' },
  ],
  ASSIGNED: [
    { to: 'IN_PROGRESS', permission: 'maint.wo.execute', requires: ['actualTimes'], noteAr: 'بدء التنفيذ (يتطلب تصريحًا ساريًا للأعمال الخطرة)' },
    { to: 'ON_HOLD', permission: 'maint.wo.execute', requires: ['reason'], noteAr: 'توقف مؤقت' },
    { to: 'AWAITING_PARTS', permission: 'maint.wo.execute', requires: ['reason'], noteAr: 'بانتظار المواد' },
  ],
  IN_PROGRESS: [
    { to: 'COMPLETED', permission: 'maint.wo.execute', requires: ['labor', 'parts'], noteAr: 'إنهاء التنفيذ وتسجيل العمالة والمواد' },
    { to: 'ON_HOLD', permission: 'maint.wo.execute', requires: ['reason'], noteAr: 'توقف مؤقت' },
    { to: 'AWAITING_PARTS', permission: 'maint.wo.execute', noteAr: 'نقص قطع غيار' },
    { to: 'AWAITING_PERMIT', permission: 'maint.wo.execute', noteAr: 'الحاجة لتصريح/عزل إضافي' },
  ],
  ON_HOLD: [{ to: 'IN_PROGRESS', permission: 'maint.wo.execute', noteAr: 'استئناف بعد زوال سبب التوقف' }],
  AWAITING_PARTS: [{ to: 'IN_PROGRESS', permission: 'maint.wo.execute', noteAr: 'توفر المواد وصرفها' }],
  AWAITING_PERMIT: [{ to: 'IN_PROGRESS', permission: 'maint.permit.approve', noteAr: 'إصدار تصريح العمل' }],
  COMPLETED: [
    { to: 'CLOSED', permission: 'maint.wo.close', requires: ['actualTimes', 'rootCause'], noteAr: 'إغلاق فني ومالي (يُقفل السجل ضد التعديل)' },
    { to: 'IN_PROGRESS', permission: 'maint.wo.execute', requires: ['reason'], noteAr: 'إعادة فتح للتنقص' },
  ],
  CLOSED: [
    { to: 'IN_PROGRESS', permission: 'maint.wo.cancel', requires: ['reason'], noteAr: 'إعادة فتح استثنائية بموافقة رئيس القسم وتُسجَّل في سجل التدقيق' },
  ],
  CANCELLED: [{ to: 'DRAFT', permission: 'maint.wo.cancel', noteAr: 'إعادة تنشيط (نادر، يتطلب تبرير)' }],
  REJECTED: [{ to: 'DRAFT', permission: 'maint.wo.create', noteAr: 'تصحيح الطلب وإعادة تقديمه' }],
};

export function canTransition(from: WoState, to: WoState, perms: ReadonlySet<string>): Transition | null {
  const t = (WO_TRANSITIONS[from] ?? []).find((x) => x.to === to);
  if (!t) return null;
  return perms.has(t.permission) ? t : null;
}

export function allowedNextStates(from: WoState, perms: ReadonlySet<string>): WoState[] {
  return (WO_TRANSITIONS[from] ?? []).filter((t) => perms.has(t.permission)).map((t) => t.to);
}

/** أولويات وساعات الاستجابة (SLA) — تُحسب من لحظة SUBMITTED حتى بدء/إغلاق التنفيذ */
export const PRIORITIES = ['EMERGENCY', 'URGENT', 'HIGH', 'MEDIUM', 'LOW', 'ROUTINE_PM'] as const;
export type Priority = (typeof PRIORITIES)[number];

export interface SlaPolicy {
  priority: Priority;
  responseHours: number;
  resolveHours: number;
  nameAr: string;
}

export const SLA_POLICIES: SlaPolicy[] = [
  { priority: 'EMERGENCY', responseHours: 0.5, resolveHours: 8, nameAr: 'طارئ (توقف خط/خطر)' },
  { priority: 'URGENT', responseHours: 2, resolveHours: 24, nameAr: 'عاجل (تدهور أداء/احتياطي مفقود)' },
  { priority: 'HIGH', responseHours: 8, resolveHours: 72, nameAr: 'مرتفع' },
  { priority: 'MEDIUM', responseHours: 24, resolveHours: 24 * 7, nameAr: 'متوسط' },
  { priority: 'LOW', responseHours: 48, resolveHours: 24 * 21, nameAr: 'منخفض' },
  { priority: 'ROUTINE_PM', responseHours: 24 * 3, resolveHours: 24 * 30, nameAr: 'صيانة دورية مجدولة' },
];

export function slaFor(priority: Priority): SlaPolicy {
  const p = SLA_POLICIES.find((x) => x.priority === priority);
  if (!p) throw new Error(`no SLA for ${priority}`);
  return p;
}

/** حالة الالتزام بالـ SLA: تُحسب من طوابع زمنية ISO، بلا اعتماد على مكتبة خارجية */
export interface SlaStatus {
  breachedResponse: boolean;
  breachedResolve: boolean;
  responseHours?: number;
  resolveHours?: number;
}

const toMs = (iso?: string | null): number | undefined => (iso ? Date.parse(iso) : undefined);

export function computeSla(input: {
  priority: Priority;
  submittedAt?: string | null;
  startedAt?: string | null;
  closedAt?: string | null;
  now?: number;
}): SlaStatus {
  const policy = slaFor(input.priority);
  const submitted = toMs(input.submittedAt);
  const started = toMs(input.startedAt);
  const closed = toMs(input.closedAt);
  const now = input.now ?? Date.now();
  const responseMs = started !== undefined && submitted !== undefined ? started - submitted : undefined;
  const resolveMs = closed !== undefined && submitted !== undefined ? closed - submitted : undefined;
  return {
    responseHours: responseMs === undefined ? undefined : +(responseMs / 3_600_000).toFixed(2),
    resolveHours: resolveMs === undefined ? undefined : +(resolveMs / 3_600_000).toFixed(2),
    breachedResponse:
      responseMs === undefined ? now - (submitted ?? now) > policy.responseHours * 3_600_000 : responseMs > policy.responseHours * 3_600_000,
    breachedResolve:
      resolveMs === undefined ? now - (submitted ?? now) > policy.resolveHours * 3_600_000 : resolveMs > policy.resolveHours * 3_600_000,
  };
}

/** تدفق تصريح العمل (PTW) */
export const PERMIT_STATES = [
  'REQUESTED',
  'AWAITING_ISOLATION',
  'APPROVED_BY_AREA',
  'APPROVED_BY_HSE',
  'OPEN',
  'EXTENDED',
  'CLOSED',
  'CANCELLED',
] as const;
export type PermitState = (typeof PERMIT_STATES)[number];

export const PERMIT_TYPES = ['HOT_WORK', 'COLD_WORK', 'CONFINED_SPACE', 'WORKING_AT_HEIGHT', 'EXCAVATION', 'ELECTRICAL_ISO', 'NDE', 'LIFTING'] as const;
export type PermitType = (typeof PERMIT_TYPES)[number];

export const PERMIT_TRANSITIONS: Record<PermitState, ReadonlyArray<{ to: PermitState; permission: PermissionCode }>> = {
  REQUESTED: [
    { to: 'AWAITING_ISOLATION', permission: 'maint.permit.approve' },
    { to: 'APPROVED_BY_AREA', permission: 'maint.permit.approve' },
    { to: 'CANCELLED', permission: 'maint.permit.create' },
  ],
  AWAITING_ISOLATION: [{ to: 'APPROVED_BY_AREA', permission: 'maint.permit.approve' }],
  APPROVED_BY_AREA: [
    { to: 'APPROVED_BY_HSE', permission: 'maint.permit.approve' },
    { to: 'CANCELLED', permission: 'maint.permit.approve' },
  ],
  APPROVED_BY_HSE: [{ to: 'OPEN', permission: 'maint.permit.approve' }],
  OPEN: [
    { to: 'EXTENDED', permission: 'maint.permit.approve' },
    { to: 'CLOSED', permission: 'maint.permit.approve' },
  ],
  EXTENDED: [{ to: 'CLOSED', permission: 'maint.permit.approve' }],
  CLOSED: [],
  CANCELLED: [],
};
