import { PERMISSION_DEFS, type PermissionCode, type DataScope } from './permissions.js';

import { ORG_STRUCTURE, type DeptDef } from './org.js';

/** الأدوار الوظيفية (Job Roles) — مرتبطة بنمط السلوك لا بالشعبة، لتفادي تضخم الأدوار */
export const ROLES = {
  SYS_ADMIN: 'SYS_ADMIN',
  PLANT_MANAGER: 'PLANT_MANAGER',
  DEPT_MANAGER: 'DEPT_MANAGER',
  SECTION_HEAD: 'SECTION_HEAD',
  SHIFT_SUPERVISOR: 'SHIFT_SUPERVISOR',
  CONTROL_ROOM_OPERATOR: 'CONTROL_ROOM_OPERATOR',
  FIELD_TECHNICIAN: 'FIELD_TECHNICIAN',
  PLANNER: 'PLANNER',
  LAB_ANALYST: 'LAB_ANALYST',
  LAB_SUPERVISOR: 'LAB_SUPERVISOR',
  STORE_KEEPER: 'STORE_KEEPER',
  WAREHOUSE_SUPERVISOR: 'WAREHOUSE_SUPERVISOR',
  HR_OFFICER: 'HR_OFFICER',
  PAYROLL_OFFICER: 'PAYROLL_OFFICER',
  COMMERCIAL_OFFICER: 'COMMERCIAL_OFFICER',
  ACCOUNTANT: 'ACCOUNTANT',
  FINANCE_MANAGER: 'FINANCE_MANAGER',
  HSE_OFFICER: 'HSE_OFFICER',
  DOC_CONTROLLER: 'DOC_CONTROLLER',
  AUDITOR: 'AUDITOR',
  READONLY_GUEST: 'READONLY_GUEST',
} as const;

export type RoleCode = keyof typeof ROLES;

export interface RoleDef {
  code: RoleCode;
  nameAr: string;
  nameEn: string;
  /** هل الدور يُمنح على مستوى الشعبة (sub-dept) أم القسم أم المنشأة كاملة */
  defaultScope: DataScope;
  /** الأدوار التي يحلّ محلّها عند التفويض (delegation) */
  delegatableTo?: RoleCode[];
  descriptionAr: string;
}

export const ROLE_DEFS: RoleDef[] = [
  { code: 'SYS_ADMIN', nameAr: 'مدير النظام', nameEn: 'System Administrator', defaultScope: 'ALL', delegatableTo: [], descriptionAr: 'إدارة الهيكل التنظيمي، المستخدمين، الأدوار، التكاملات، وسجل التدقيق. لا يملك صلاحيات اعتماد تشغيلية.' },
  { code: 'PLANT_MANAGER', nameAr: 'مدير المعمل/المشروع', nameEn: 'Plant Manager', defaultScope: 'ALL', delegatableTo: ['DEPT_MANAGER'], descriptionAr: 'رؤية واعتماد كاملة على مستوى الخط الأول، سياسات التشغيل والصيانة والتصاريح.' },
  { code: 'DEPT_MANAGER', nameAr: 'رئيس القسم', nameEn: 'Department Manager', defaultScope: 'DEPT', delegatableTo: ['SECTION_HEAD'], descriptionAr: 'اعتماد أوامر الشغل والإجازات والموازنة داخل قسمه، وإسناد العمل بين الشعب.' },
  { code: 'SECTION_HEAD', nameAr: 'رئيس الشعبة', nameEn: 'Section Head / Supervisor', defaultScope: 'SUBDEPT', delegatableTo: ['SHIFT_SUPERVISOR'], descriptionAr: 'توزيع العمل على منتسبي الشعب، اعتماد مخرجاتهم، وإغلاق أوامر الشغل.' },
  { code: 'SHIFT_SUPERVISOR', nameAr: 'مشرف الوردية', nameEn: 'Shift Supervisor', defaultScope: 'SUBDEPT', delegatableTo: ['CONTROL_ROOM_OPERATOR'], descriptionAr: 'قيادة الوردية، اعتماد سجلوبة الإنتاج، تنسيق الاستجابات العاجلة.' },
  { code: 'CONTROL_ROOM_OPERATOR', nameAr: 'مراقب سيطرة', nameEn: 'Control Room Operator', defaultScope: 'SUBDEPT', descriptionAr: 'قراءات تشغيلية، إنذارات، سجلوبة وردية، طلب صيانة عاجل.' },
  { code: 'FIELD_TECHNICIAN', nameAr: 'فني صيانة (ميداني)', nameEn: 'Field Technician', defaultScope: 'SUBDEPT', descriptionAr: 'تنفيذ أوامر الشغل من الهاتف دون اتصال، صور، قطع غيار، تصاريح.' },
  { code: 'PLANNER', nameAr: 'مخطط صيانة', nameEn: 'Maintenance Planner', defaultScope: 'DEPT', descriptionAr: 'خطط PM، جداول التوقفات (shutdown)، القطع الحرجة، المؤشرات.' },
  { code: 'LAB_ANALYST', nameAr: 'محلل مختبر', nameEn: 'Lab Analyst', defaultScope: 'SUBDEPT', descriptionAr: 'سحب العينات وإدخال النتائج ومطابقة الحدود.' },
  { code: 'LAB_SUPERVISOR', nameAr: 'مسؤول المختبر', nameEn: 'Lab Supervisor', defaultScope: 'SUBDEPT', delegatableTo: ['LAB_ANALYST'], descriptionAr: 'تدقيق النتائج، اعتماد الشهادات، إدارة OOS/CAPA.' },
  { code: 'STORE_KEEPER', nameAr: 'أمين المخزن', nameEn: 'Store Keeper', defaultScope: 'DEPT', descriptionAr: 'الاستلام والصرف والجرد وتحديث الأرصدة.' },
  { code: 'WAREHOUSE_SUPERVISOR', nameAr: 'مسؤول المخازن', nameEn: 'Warehouse Supervisor', defaultScope: 'DEPT', delegatableTo: ['STORE_KEEPER'], descriptionAr: 'اعتماد الصرف، الحدود الدنيا، التسويات، تقارير المخزون.' },
  { code: 'HR_OFFICER', nameAr: 'موظف الموارد البشرية', nameEn: 'HR Officer', defaultScope: 'ALL', descriptionAr: 'البصمة، معالجة النواقص، الإجازات، الجداول، البيانات الوظيفية.' },
  { code: 'PAYROLL_OFFICER', nameAr: 'موظف الرواتب', nameEn: 'Payroll Officer', defaultScope: 'ALL', descriptionAr: 'تسوية المستحقات والتسديدات والتصدير إلى المالية.' },
  { code: 'COMMERCIAL_OFFICER', nameAr: 'الموظف التجاري', nameEn: 'Commercial Officer', defaultScope: 'DEPT', descriptionAr: 'أوامر البيع والتحميل وحسابات العملاء والأسعار.' },
  { code: 'ACCOUNTANT', nameAr: 'محاسب', nameEn: 'Accountant', defaultScope: 'ALL', descriptionAr: 'القيود، السندات، التسويات، مطابقة الفواتير.' },
  { code: 'FINANCE_MANAGER', nameAr: 'المدير المالي', nameEn: 'Finance Manager', defaultScope: 'ALL', delegatableTo: ['ACCOUNTANT'], descriptionAr: 'الموازنة، سلطات الصرف، التحصيل، التقارير المالية.' },
  { code: 'HSE_OFFICER', nameAr: 'مسؤول السلامة', nameEn: 'HSE Officer', defaultScope: 'ALL', descriptionAr: 'تصاريح العمل، العزل (LOTO)، الحوادث، المعدات الحرارية الحرجة.' },
  { code: 'DOC_CONTROLLER', nameAr: 'مسؤول الوثائق', nameEn: 'Document Controller', defaultScope: 'ALL', descriptionAr: 'تحكم النسخ، المخططات، تعليمات التشغيل، سجل التعليمات.' },
  { code: 'AUDITOR', nameAr: 'مدقق (داخلي/خارجي)', nameEn: 'Auditor', defaultScope: 'ALL', descriptionAr: 'قراءة شاملة على مستوى المنشأة + سجل التدقيق، دون تعديل.' },
  { code: 'READONLY_GUEST', nameAr: 'مستخدم عرض فقط', nameEn: 'Read-only Guest', defaultScope: 'DEPT', descriptionAr: 'لوحات ومؤشرات للشركة المالكة/الجهة الطالبة، دون بيانات الموظفين.' },
];

/* ──────────────────────────────────────────────────────────────────────────
 * مجموعات صلاحيات جاهزة (Permission Sets) — تُجمَّع لضمان اتساق المصفوفة
 * ────────────────────────────────────────────────────────────────────────── */
const S = {
  base: ['auth.login', 'sync.pull', 'sync.push', 'notif.view', 'org.dept.view', 'hr.leave.view', 'hr.leave.request', 'doc.view', 'doc.upload', 'hr.att.view', 'prod.log.view'] as PermissionCode[],
  report: ['report.view', 'report.export'] as PermissionCode[],
  hrOwn: ['hr.shift.view', 'hr.form.view', 'hr.att.view', 'hr.leave.view', 'hr.leave.request'] as PermissionCode[],
  woExecutor: ['maint.wo.view', 'maint.wo.execute', 'maint.wo.close', 'maint.asset.view', 'maint.condition.record', 'maint.permit.view', 'maint.permit.create', 'wh.req.create', 'wh.return', 'prod.downtime.create', 'hr.form.create'] as PermissionCode[],
  woApprover: ['maint.wo.view', 'maint.wo.create', 'maint.wo.assign', 'maint.wo.execute', 'maint.wo.close', 'maint.wo.cancel', 'maint.asset.view', 'maint.asset.manage', 'maint.condition.view', 'maint.condition.record', 'maint.pm.manage', 'maint.backlog.view', 'maint.downtime.verify', 'maint.permit.view', 'maint.permit.create', 'maint.permit.approve', 'wh.item.view', 'wh.req.create', 'wh.req.approve', 'wh.return', 'report.view', 'report.export', 'prod.log.view', 'prod.downtime.view', 'hr.att.view', 'hr.emp.view', 'hr.shift.view', 'hr.leave.approve', 'hr.form.view', 'doc.upload'] as PermissionCode[],
  shiftLog: ['prod.log.view', 'prod.log.create', 'prod.log.update', 'prod.param.create', 'prod.param.view', 'prod.alarm.ack', 'prod.downtime.create', 'prod.downtime.view'] as PermissionCode[],
  shiftLogHead: ['prod.log.view', 'prod.log.create', 'prod.log.update', 'prod.log.approve', 'prod.param.create', 'prod.param.view', 'prod.alarm.ack', 'prod.downtime.create', 'prod.downtime.view', 'maint.wo.view', 'maint.wo.create', 'lab.sample.create', 'fin.cost.view', 'report.view', 'report.export', 'doc.upload', 'hr.att.view', 'hr.shift.view', 'hr.leave.approve'] as PermissionCode[],
  doc: ['doc.upload'] as PermissionCode[],
  /** حد أدنى للقراءة فقط: مزامنة سحب + إشعارات + عرض، بلا رفع ولا طلبات */
  baseReadOnly: ['auth.login', 'sync.pull', 'notif.view', 'org.dept.view', 'doc.view', 'hr.att.view', 'prod.log.view'] as PermissionCode[],
};

/**
 * صلاحيات معرّفة لكنها غير ممنوحة في المرحلة الأولى (v1) — تُفعَّل في المرحلة الثانية.
 * أي إضافة غير مُبرَّرة تفشل في اختبار `tests/permissions.spec.ts`.
 */
export const DEFERRED_PHASE2_PERMISSIONS: PermissionCode[] = [
  'hr.emp.manage', // إدارة الملاك الكامل: مرتبطة بترحيل بيانات العقود من نظام الموارد البشرية المركزي (المرحلة 2)
];

/** صلاحيات الموظف الذاتي (Self-service) تُفعَّل مع بوابة الموظف */
export const SELF_SERVICE_PERMISSIONS: PermissionCode[] = ['hr.leave.view', 'hr.leave.request', 'hr.form.create'];

export interface Grant {
  role: RoleCode;
  /** عند الحذف يُستخدم defaultScope الخاص بالدور */
  scope?: DataScope;
  permissions?: PermissionCode[];
  /** صلاحيات تُضاف لهذا الدور داخل هذه الشعبة فقط */
  extra?: PermissionCode[];
  /** صلاحيات تُحجب حتى لو وردت في مجموعة الدور */
  deny?: PermissionCode[];
}

export interface SubDeptAccess {
  subDeptCode: string;
  purposeAr: string;
  grants: Grant[];
}

const uniq = (a: PermissionCode[]) => Array.from(new Set(a));

export const ACCESS_MATRIX: SubDeptAccess[] = [
  {
    subDeptCode: 'PROD-UREA',
    purposeAr: 'تشغيل وحدة اليوريا (غرفة السيطرة/الحبيبات/التعبئة) وسجلوبات الوردية وجودة المنتج النهائية.',
    grants: [
      { role: 'SECTION_HEAD', permissions: [...S.shiftLogHead, 'lab.result.enter', 'lab.report.export', 'lab.oos.manage', 'wh.item.view'] as PermissionCode[] },
      { role: 'SHIFT_SUPERVISOR', permissions: [...S.shiftLog, 'maint.wo.create', 'lab.sample.create', 'doc.upload'] },
      { role: 'CONTROL_ROOM_OPERATOR', permissions: [...S.shiftLog, 'maint.wo.create'] },
      { role: 'FIELD_TECHNICIAN', permissions: [...S.woExecutor, 'prod.param.create'] },
    ],
  },
  {
    subDeptCode: 'PROD-AMM',
    purposeAr: 'تشغيل وحدة الأمونيا (الإصلاح/التحويل/التخليق/الفصل) ومراقبة السمية والانحرافات.',
    grants: [
      { role: 'SECTION_HEAD', permissions: [...S.shiftLogHead, 'prod.utility.manage', 'lab.sample.create'] as PermissionCode[] },
      { role: 'SHIFT_SUPERVISOR', permissions: [...S.shiftLog, 'maint.wo.create', 'lab.sample.create', 'doc.upload'] },
      { role: 'CONTROL_ROOM_OPERATOR', permissions: [...S.shiftLog, 'maint.wo.create', 'lab.sample.create'] },
    ],
  },
  {
    subDeptCode: 'PROD-CT',
    purposeAr: 'تشغيل أبراج التبريد: الخلايا والمراوح ومعالجة المياه (Cycles/BI) وتنظيف الحشوات.',
    grants: [
      { role: 'SECTION_HEAD', permissions: [...S.shiftLogHead, 'prod.utility.manage', 'lab.sample.create'] as PermissionCode[] },
      { role: 'SHIFT_SUPERVISOR', permissions: [...S.shiftLog, 'prod.utility.manage', 'maint.wo.create', 'lab.sample.create'] },
      { role: 'FIELD_TECHNICIAN', permissions: [...S.woExecutor, 'prod.utility.manage', 'prod.param.create'] },
    ],
  },
  {
    subDeptCode: 'PROD-LAB',
    purposeAr: 'تحاليل العمليات والمنتج (NH3/Urea/Sub-mic/Boiler/CW)، شهادات التحليل، ومطابقة المواصفات.',
    grants: [
      { role: 'SECTION_HEAD', permissions: ['lab.sample.create', 'lab.result.enter', 'lab.result.verify', 'lab.report.export', 'lab.oos.manage', 'prod.param.view', 'prod.downtime.view', 'maint.wo.create', 'maint.wo.view', 'report.view', 'report.export', 'doc.upload', 'hr.att.view'] as PermissionCode[] },
      { role: 'LAB_SUPERVISOR', permissions: ['lab.sample.create', 'lab.result.enter', 'lab.result.verify', 'lab.report.export', 'lab.oos.manage', 'prod.param.view', 'doc.upload'] as PermissionCode[] },
      { role: 'LAB_ANALYST', permissions: ['lab.sample.create', 'lab.result.enter', 'lab.oos.manage', 'prod.param.view', 'doc.upload'] as PermissionCode[] },
    ],
  },
  {
    subDeptCode: 'MAINT-HEAT',
    purposeAr: 'المعدات الحرارية: المبادل الحراري، المفكك (Stripper)، أوعية الضغط، الفلنجات، اختبار التسرب، مواد حرارية.',
    grants: [
      { role: 'SECTION_HEAD', permissions: S.woApprover },
      { role: 'FIELD_TECHNICIAN', permissions: [...S.woExecutor, 'lab.sample.create', 'lab.result.enter'] },
      { role: 'HSE_OFFICER', scope: 'DEPT', permissions: ['maint.permit.approve', 'maint.permit.view', 'maint.wo.view'] },
    ],
  },
  {
    subDeptCode: 'MAINT-ROT',
    purposeAr: 'المعدات الدوارة: الضواغط، المضخات، المراوح، تحليل الاهتزاز، المحاذاة بالليزر، التزييت.',
    grants: [
      { role: 'SECTION_HEAD', permissions: S.woApprover },
      { role: 'FIELD_TECHNICIAN', permissions: S.woExecutor },
    ],
  },
  {
    subDeptCode: 'MAINT-ELEC',
    purposeAr: 'الكهرباء: MV/LV، المحركات، لوحات التوزيع، الصيانة الوقائية للعزل، الأنظمة الكهروميكانيكية.',
    grants: [
      { role: 'SECTION_HEAD', permissions: S.woApprover },
      { role: 'FIELD_TECHNICIAN', permissions: [...S.woExecutor, 'maint.condition.record', 'maint.permit.approve'] },
    ],
  },
  {
    subDeptCode: 'MAINT-VALVE',
    purposeAr: 'الصمامات: بنش تست لصمامات السلامة (PSV)، إصلاح الصمامات، سجل الصيانة والاختبارات، إعادة التركيب.',
    grants: [
      { role: 'SECTION_HEAD', permissions: [...S.woApprover, 'maint.asset.manage', 'wh.item.view'] },
      { role: 'FIELD_TECHNICIAN', permissions: S.woExecutor },
    ],
  },
  {
    subDeptCode: 'MAINT-INST',
    purposeAr: 'الآلات الدقيقة: أجهزة القياس، صمامات التحكم، أنظمة DCS/ESD/F&G، المحللات، عيارات (Calibration).',
    grants: [
      { role: 'SECTION_HEAD', permissions: [...S.woApprover, 'maint.asset.manage'] },
      { role: 'FIELD_TECHNICIAN', permissions: S.woExecutor },
    ],
  },
  {
    subDeptCode: 'MAINT-GEN',
    purposeAr: 'المعدات العامة: الأعمال المدنية، الهياكل، العزل الحراري والصباغة، الرافعات، الصيانة العامة للمبنى.',
    grants: [
      { role: 'SECTION_HEAD', permissions: S.woApprover },
      { role: 'FIELD_TECHNICIAN', permissions: [...S.woExecutor, 'maint.permit.create'] },
    ],
  },
  {
    subDeptCode: 'ADM-BIO',
    purposeAr: 'البصمة والانضباط: سحب سجلات الأجهزة، معالجة النواقص، بطاقة الملاك، جهات التعريف، التصدير إلى الرواتب.',
    grants: [
      { role: 'HR_OFFICER', scope: 'ALL', permissions: ['hr.att.all', 'hr.att.correct', 'hr.att.import', 'hr.att.export_payroll', 'hr.shift.view', 'hr.shift.manage', 'hr.leave.approve', 'hr.emp.view', 'org.delegation.manage', 'report.view', 'report.export', 'doc.upload', 'auth.login', 'notif.view', 'sync.pull'] as PermissionCode[] },
      { role: 'SECTION_HEAD', scope: 'SUBDEPT', permissions: ['hr.att.view', 'hr.att.correct', 'hr.shift.view', 'hr.shift.manage', 'hr.emp.view', 'hr.leave.approve', 'report.view'] as PermissionCode[] },
      { role: 'PAYROLL_OFFICER', scope: 'ALL', permissions: ['hr.att.view', 'hr.att.export_payroll', 'hr.emp.view', 'fin.payroll.view', 'report.view', 'report.export'] as PermissionCode[] },
      { role: 'SYS_ADMIN', scope: 'ALL', permissions: ['admin.system', 'org.dept.view'] },
    ],
  },
  {
    subDeptCode: 'ADM-COM',
    purposeAr: 'الشعبة التجارية: أوامر البيع/التحميل، العملاء ووكلاء التوزيع، الكميات المسلّمة، الأسعار والعقود.',
    grants: [
      { role: 'SECTION_HEAD', permissions: ['com.order.view', 'com.order.create', 'com.order.confirm', 'com.customer.manage', 'com.pricing.manage', 'com.report.export', 'fin.coa.view', 'fin.cost.view', 'fin.invoice.manage', 'report.view', 'report.export', 'doc.upload', 'doc.manage', 'hr.att.view', 'maint.wo.create', 'prod.downtime.view'] as PermissionCode[] },
      { role: 'COMMERCIAL_OFFICER', scope: 'DEPT', permissions: ['com.order.view', 'com.order.create', 'com.order.confirm', 'com.customer.manage', 'com.report.export', 'report.view', 'doc.upload', 'prod.log.view'] as PermissionCode[] },
    ],
  },
  {
    subDeptCode: 'ADM-FIN',
    purposeAr: 'الشعبة المالية: القيود والسندات، أوامر الشراء وسلطات التوقيع، الرواتب، التحصيل، الموازنة وتكاليف الصيانة.',
    grants: [
      { role: 'SECTION_HEAD', permissions: ['fin.coa.view', 'fin.journal.manage', 'fin.cost.view', 'fin.po.view', 'fin.po.approve', 'fin.invoice.manage', 'fin.grn_finance', 'fin.payroll.view', 'fin.payroll.run', 'fin.ar_collect', 'fin.budget.view', 'fin.budget.manage', 'fin.rate.manage', 'maint.backlog.view', 'report.view', 'report.export', 'doc.upload', 'doc.manage', 'audit.view', 'hr.emp.view', 'hr.att.export_payroll'] as PermissionCode[] },
      { role: 'FINANCE_MANAGER', scope: 'ALL', permissions: ['fin.po.approve', 'fin.budget.manage', 'fin.payroll.run', 'fin.ar_collect', 'fin.rate.manage', 'fin.journal.manage', 'fin.invoice.manage', 'fin.grn_finance', 'fin.coa.view', 'fin.cost.view', 'report.view', 'report.export', 'audit.view'] as PermissionCode[] },
      { role: 'ACCOUNTANT', scope: 'ALL', permissions: ['fin.journal.manage', 'fin.invoice.manage', 'fin.grn_finance', 'fin.ar_collect', 'fin.coa.view', 'fin.cost.view', 'fin.po.view', 'report.view', 'report.export', 'doc.upload'] as PermissionCode[] },
      { role: 'AUDITOR', scope: 'ALL', permissions: ['fin.coa.view', 'fin.journal.manage', 'fin.cost.view', 'fin.po.view', 'audit.view', 'audit.export', 'report.view', 'report.export'] as PermissionCode[] },
    ],
  },
];

/** صلاحيات أفقية (Cross-cutting) تُمنح على مستوى المنشأة بغض النظر عن الشعبة */
export const GLOBAL_GRANTS: Record<string, { scope: DataScope; permissions: PermissionCode[] }> = {
  SYS_ADMIN: {
    scope: 'ALL',
    permissions: uniq([
      'org.dept.manage', 'org.user.manage', 'org.user.view', 'org.role.manage', 'admin.system', 'audit.view', 'audit.export',
      'doc.manage', 'report.kpi.manage', 'auth.login', 'notif.view', 'sync.pull', 'org.dept.view', 'hr.emp.view',
    ]),
  },
  PLANT_MANAGER: {
    scope: 'ALL',
    permissions: uniq([
      ...S.report, 'prod.log.approve', 'maint.wo.view', 'maint.wo.assign', 'maint.wo.close', 'maint.permit.approve',
      'maint.backlog.view', 'maint.asset.view', 'lab.result.verify', 'fin.budget.view', 'fin.cost.view', 'fin.po.approve',
      'com.order.view', 'hr.leave.approve', 'hr.att.all', 'hr.shift.view', 'org.delegation.manage', 'audit.view', 'doc.manage', 'report.kpi.manage',
    ] as PermissionCode[]),
  },
  DEPT_MANAGER: {
    scope: 'DEPT',
    permissions: uniq([
      'prod.log.approve', 'maint.wo.assign', 'maint.wo.close', 'maint.wo.cancel', 'maint.pm.manage', 'maint.asset.manage',
      'maint.backlog.view', 'maint.permit.approve', 'maint.downtime.verify', 'wh.req.approve', 'wh.issue', 'wh.grn', 'wh.stocktake',
      'wh.manage', 'hr.leave.approve', 'hr.shift.manage', 'hr.att.correct', 'hr.form.view', 'prod.downtime.view', 'prod.param.view',
      'com.order.confirm', 'fin.cost.view', 'fin.budget.view', 'report.view', 'report.export', 'doc.view', 'doc.upload',
      'audit.view', 'auth.login', 'sync.pull', 'sync.push', 'notif.view', 'org.dept.view',
    ] as PermissionCode[]),
  },
  HSE_OFFICER: {
    scope: 'ALL',
    permissions: uniq(['maint.permit.approve', 'maint.permit.view', 'maint.wo.view', 'prod.downtime.view', 'lab.oos.manage', 'report.view', 'doc.upload', 'auth.login', 'notif.view', 'sync.pull', 'sync.push']),
  },
  DOC_CONTROLLER: {
    scope: 'ALL',
    permissions: uniq(['doc.manage', 'doc.upload', 'doc.view', 'report.export', 'auth.login', 'notif.view', 'sync.pull', 'admin.system']),
  },
  PLANNER: {
    scope: 'DEPT',
    permissions: uniq(['maint.pm.manage', 'maint.wo.assign', 'maint.wo.view', 'maint.backlog.view', 'wh.item.view', 'wh.req.approve', 'prod.downtime.view', 'maint.condition.view', 'report.view', 'report.export', 'fin.cost.view', 'auth.login', 'sync.pull', 'sync.push', 'notif.view']),
  },
  READONLY_GUEST: {
    scope: 'DEPT',
    permissions: uniq(['report.view', 'prod.log.view', 'prod.param.view', 'maint.wo.view', 'maint.backlog.view', 'wh.item.view', 'com.order.view', 'fin.budget.view', 'auth.login', 'notif.view']),
  },
};

export interface ResolvedGrant {
  subDeptCode: string | null;
  role: RoleCode;
  scope: DataScope;
  permissions: PermissionCode[];
}

/** أدوار قراءة فقط: لا تُمنح حدًّا أدنى كتابيًا (لا رفع مزامنة، لا طلب إجازة، لا رفع وثائق) */
export const READ_ONLY_ROLES: ReadonlySet<RoleCode> = new Set<RoleCode>(['AUDITOR', 'READONLY_GUEST']);

const SCOPE_RANK: Record<DataScope | 'NONE' | 'SELF', number> = { NONE: 0, SELF: 0, TEAM: 0, SUBDEPT: 1, DEPT: 2, ALL: 3 };

/** هل منح الصلاحية `p` بنطاق `scope` يبقى تحت سقفها الأقصى؟ (نفس القاعدة التي يفحصها permissions.spec) */
export function withinCeiling(scope: DataScope, p: PermissionCode): boolean {
  const def = PERMISSION_DEFS.find((x) => x.code === p);
  if (!def) return false;
  if (scope === 'SELF' || def.maxScope === 'ALL') return true;
  return (SCOPE_RANK[scope] ?? 0) <= (SCOPE_RANK[def.maxScope] ?? 0);
}

/** يحسب المنح الفعّالة (شعبة × دور × صلاحيات) بعد تطبيق extra/deny */
export function resolveGrants(): ResolvedGrant[] {
  const out: ResolvedGrant[] = [];
  const roleById = new Map(ROLE_DEFS.map((r) => [r.code, r]));
  for (const row of ACCESS_MATRIX) {
    for (const g of row.grants) {
      const roleDef = roleById.get(g.role);
      const base = g.permissions ?? [];
      if (base.length === 0) throw new Error(`grant ${row.subDeptCode}/${g.role} has no permissions declared`);
      // الحد الأدنى الميداني: تسجيل الدخول + المزامنة دون اتصال + الإشعارات + عرض الهيكل +
      // إجازة الموظف + الوثائق. بدونه يفقد FIELD_TECHNICIAN قدرة الرفع من الهاتف — وهو سبب
      // وجود التطبيق المحمول أصلًا. يُمنح محترمًا لسقف كل صلاحية (maxScope) حتى لا يتسع النطاق.
      const scope = g.scope ?? roleDef?.defaultScope ?? 'SUBDEPT';
      const minimum = READ_ONLY_ROLES.has(g.role) ? S.baseReadOnly : S.base;
      const allowedMinimum = minimum.filter((p) => !(g.deny ?? []).includes(p) && withinCeiling(scope, p));
      const perms = uniq([...base, ...allowedMinimum, ...(g.extra ?? [])].filter((p) => !(g.deny ?? []).includes(p)));
      out.push({ subDeptCode: row.subDeptCode, role: g.role, scope, permissions: perms });
    }
  }
  for (const [role, g] of Object.entries(GLOBAL_GRANTS)) {
    out.push({ subDeptCode: null, role: role as RoleCode, scope: g.scope, permissions: uniq(g.permissions) });
  }
  return out;
}

/** كل صلاحية معرّفة يجب أن تُستخدم في مكانٍ ما (منع الصلاحيات الميتة) */
/** منحة الموظف الذاتي: تُمنح لكل مستخدم مُصادَق عليه (تُطبَّق على مستوى طبقة التفويض، نطاق SELF) */
export const EVERY_USER_GRANT: { role: RoleCode | 'EVERY_USER'; scope: 'SELF'; permissions: PermissionCode[] } = {
  role: 'EVERY_USER',
  scope: 'SELF',
  permissions: ['hr.leave.view', 'hr.leave.request', 'hr.form.create', 'hr.att.view', 'hr.shift.view', 'hr.form.view', 'doc.upload'],
};

export function unusedPermissions(): PermissionCode[] {
  const used = new Set<PermissionCode>();
  for (const g of resolveGrants()) g.permissions.forEach((p) => used.add(p));
  EVERY_USER_GRANT.permissions.forEach((p) => used.add(p));
  return PERMISSION_DEFS.map((p) => p.code).filter((c) => !used.has(c));
}

/** كل صلاحية مستخدمة في المصفوفة يجب أن تكون معرّفة في السجل */
export function unknownPermissions(): string[] {
  const known = new Set<string>(PERMISSION_DEFS.map((p) => p.code));
  const bad: string[] = [];
  for (const g of [...resolveGrants(), EVERY_USER_GRANT as ResolvedGrant]) g.permissions.forEach((p) => { if (!known.has(p)) bad.push(`${g.role}:${p}`); });
  return bad;
}

/** الصلاحيات ذات النطاق SELF معفاة من اختبار السقف الأعلى (نطاقها أدنى من كل ما عداه) */
/** الصلاحيات التي تُمنح بنطاق SELF (الموظف نفسه) — معفاة من اختبار السقف الأعلى */
export const SELF_ONLY_PERMISSIONS: PermissionCode[] = EVERY_USER_GRANT.permissions;

export function departmentsWithAccess(): Array<DeptDef & { access: SubDeptAccess[] }> {
  return ORG_STRUCTURE.map((d) => ({
    ...d,
    access: ACCESS_MATRIX.filter((a) => d.subDepartments.some((s) => s.code === a.subDeptCode)),
  }));
}
