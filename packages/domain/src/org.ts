/**
 * الهيكل التنظيمي المرجعي لمعمل الأسمدة الجنوبية – الخط الأول (Newport LP. LTD)
 * المرجع الوحيد المعتمد لبناء البيانات (Seed) وصلاحيات الوصول (RBAC/ABAC).
 *
 * ملاحظة معمارية: هذه الثوابت تُستخدم لـ (1) توليد seed قاعدة البيانات،
 * (2) توليد مصفوفة الصلاحيات، (3) التحقق في واجهات المستخدم (إخفاء/إظهار الشعب).
 * أي تعديل تنظيمي لاحق يتم عبر الجدول `sub_departments` في قاعدة البيانات،
 * ويبقى هذا الملف "خريطة البداية" فقط.
 */

export type DeptKind = 'TECHNICAL' | 'ADMIN';
export type SubDeptKind =
  | 'PRODUCTION'
  | 'UREA'
  | 'AMMONIA'
  | 'MAINTENANCE'
  | 'HEAT_EQUIPMENT'
  | 'ROTATING_EQUIPMENT'
  | 'ELECTRICAL'
  | 'VALVE'
  | 'INSTRUMENTATION'
  | 'GENERAL_MAINTENANCE'
  | 'LAB'
  | 'COOLING_TOWER'
  | 'BIOMETRIC'
  | 'COMMERCIAL'
  | 'FINANCE';

export interface SubDeptDef {
  code: string;
  nameAr: string;
  nameEn: string;
  kind: SubDeptKind;
  /** طبيعة العمل الميداني: يفعّل وضع الحقل في تطبيق الهاتف (نماذج غير متصل/Offline-first) */
  fieldWork: boolean;
}

export interface DeptDef {
  code: string;
  nameAr: string;
  nameEn: string;
  kind: DeptKind;
  subDepartments: SubDeptDef[];
}

export const ORG_STRUCTURE: DeptDef[] = [
  {
    code: 'PROD',
    nameAr: 'قسم الإنتاج',
    nameEn: 'Production Department',
    kind: 'TECHNICAL',
    subDepartments: [
      { code: 'PROD-UREA', nameAr: 'شعبة اليوريا', nameEn: 'Urea Section', kind: 'UREA', fieldWork: false },
      { code: 'PROD-AMM', nameAr: 'شعبة الأمونيا', nameEn: 'Ammonia Section', kind: 'AMMONIA', fieldWork: false },
      { code: 'PROD-CT', nameAr: 'شعبة أبراج التبريد', nameEn: 'Cooling Towers Section', kind: 'COOLING_TOWER', fieldWork: true },
      { code: 'PROD-LAB', nameAr: 'المختبر', nameEn: 'Laboratory Section', kind: 'LAB', fieldWork: true },
    ],
  },
  {
    code: 'MAINT',
    nameAr: 'قسم الصيانة',
    nameEn: 'Maintenance Department',
    kind: 'TECHNICAL',
    subDepartments: [
      { code: 'MAINT-HEAT', nameAr: 'شعبة المعدات الحرارية', nameEn: 'Heat Equipment Section', kind: 'HEAT_EQUIPMENT', fieldWork: true },
      { code: 'MAINT-ROT', nameAr: 'شعبة المعدات الدوارة', nameEn: 'Rotating Equipment Section', kind: 'ROTATING_EQUIPMENT', fieldWork: true },
      { code: 'MAINT-ELEC', nameAr: 'شعبة الكهرباء', nameEn: 'Electrical Section', kind: 'ELECTRICAL', fieldWork: true },
      { code: 'MAINT-VALVE', nameAr: 'شعبة الصمامات', nameEn: 'Valves Section', kind: 'VALVE', fieldWork: true },
      { code: 'MAINT-INST', nameAr: 'شعبة الآلات الدقيقة', nameEn: 'Instrumentation Section', kind: 'INSTRUMENTATION', fieldWork: true },
      { code: 'MAINT-GEN', nameAr: 'شعبة المعدات العامة', nameEn: 'General Maintenance / Civil Section', kind: 'GENERAL_MAINTENANCE', fieldWork: true },
    ],
  },
  {
    code: 'ADMIN',
    nameAr: 'الأقسام الإدارية',
    nameEn: 'Administrative Sections',
    kind: 'ADMIN',
    subDepartments: [
      { code: 'ADM-BIO', nameAr: 'شعبة البصمة', nameEn: 'Biometric / Attendance Section', kind: 'BIOMETRIC', fieldWork: false },
      { code: 'ADM-COM', nameAr: 'الشعبة التجارية', nameEn: 'Commercial Section', kind: 'COMMERCIAL', fieldWork: false },
      { code: 'ADM-FIN', nameAr: 'الشعبة المالية', nameEn: 'Finance Section', kind: 'FINANCE', fieldWork: false },
    ],
  },
];

export const ALL_SUBDEPTS: SubDeptDef[] = ORG_STRUCTURE.flatMap((d) => d.subDepartments);

export const DEPT_BY_CODE = Object.fromEntries(ORG_STRUCTURE.map((d) => [d.code, d]));
export const SUBDEPT_BY_CODE = Object.fromEntries(ALL_SUBDEPTS.map((s) => [s.code, s]));

/** المصانع / الخطوط (مستوى أعلى من الأقسام) — التوسع المستقبلي للخط الثاني والثالث */
export const FACILITY = {
  code: 'BFC-L1',
  nameAr: 'معمل الأسمدة الجنوبية – الخط الأول',
  nameEn: 'Basra Fertilizer Complex – Line 1',
  city: 'البصرة / Basra',
  contractor: 'Newport LP. LTD',
};

export const SHIFT_CODES = ['A', 'B', 'C', 'D'] as const;
export type ShiftCode = (typeof SHIFT_CODES)[number];

/** أنواع المعدات الحرارية الشائعة في خط اليوريا/الأمونيا — تُستخدم في تصنيف الأصول */
export const EQUIPMENT_CLASSES = [
  'PSV', // Safety/relief valves
  'HX', // Heat exchanger
  'RST', // Reactor/Stripper
  'CT', // Cooling tower cell
  'VESSEL',
  'COLUMN',
  'FURNACE',
  'COMPRESSOR',
  'PUMP',
  'TURBINE',
  'MOTOR',
  'MV', // Medium/low voltage switchgear
  'TRANSFORMER',
  'SWAY_FRAME', // تحليل اهتزازي
  'CONTROL_VALVE',
  'ANALYZER',
  'UTILITY',
  'CIVIL',
] as const;
export type EquipmentClass = (typeof EQUIPMENT_CLASSES)[number];
