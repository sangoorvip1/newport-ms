/**
 * سجل الصلاحيات (Permission Registry) — المرجع الوحيد المعتمد.
 * يُولَّد منه: (1) جدول permissions في قاعدة البيانات، (2) مصفوفة الصلاحيات لكل شعبة،
 * (3) مفاتيح التحكّم في الواجهات (`can(P.WO_CREATE)`).
 *
 * قواعد التسمية: <module>.<entity>.<action>
 *   module: org | auth | prod | maint | lab | wh | hr | com | fin | doc | audit | sync | report | notif
 *   action: view | create | update | approve | close | export | admin | sync ...
 *
 * كل صلاحية تحمل "نطاق" (Scope) يحدد حدود البيانات المسموح برؤيتها/تعديلها:
 *   SELF  : سجلات المستخدم نفسه فقط
 *   TEAM  : الفريق/الوردية/الشعبة التي ينتمي إليها
 *   SUBDEPT: الشعبة (sub_department) التي يعمل بها (أو المسند إليها)
 *   DEPT  : القسم الذي تتبع له شعبته
 *   ALL   : كامل المنشأة (Line 1) — للوظائف المركزية
 */

export type ScopeKind = 'SELF' | 'TEAM' | 'SUBDEPT' | 'DEPT' | 'ALL' | 'NONE';

export type DataScope = 'SELF' | 'TEAM' | 'SUBDEPT' | 'DEPT' | 'ALL';

export interface PermissionDef {
  code: PermissionCode;
  module: string;
  action: string;
  nameAr: string;
  nameEn: string;
  /**
   * سقف النطاق المسموح به لهذه الصلاحية: لا يجوز أن يُمنح المستخدم هذه الصلاحية
   * بنطاق أوسع من هذا السقف (يُتحقق آليًا في اختبار مصفوفة الصلاحيات).
   * النطاق الفعلي المستخدم في الفلترة هو نطاق المنح (grant scope) وليس هذا السقف.
   */
  maxScope: DataScope;
  /** هل يُسمح بالكتابة خارج الشبكة (تُضاف إلى outbox المزامنة) */
  offlineCapable?: boolean;
}

const def = (
  code: string,
  nameAr: string,
  nameEn: string,
  maxScope: DataScope = 'SUBDEPT',
  offlineCapable = false,
): PermissionDef => {
  const [module, action] = code.split('.') as [string, string];
  if (!module || !action) throw new Error(`bad permission code: ${code}`);
  return { code: code as PermissionCode, module, action, nameAr, nameEn, maxScope, offlineCapable };
};

export const PERMISSION_DEFS = [
  // ── المنظمة / المستخدمون ────────────────────────────────────────────────
  def('org.dept.view', 'عرض الهيكل التنظيمي', 'View organization structure', 'ALL'),
  def('org.dept.manage', 'إدارة الأقسام والشعب والوظائف', 'Manage departments/sections/positions', 'ALL'),
  def('org.user.view', 'عرض المستخدمين', 'View users', 'ALL'),
  def('org.user.manage', 'إنشاء/تعطيل المستخدمين وتعيين الشعب', 'Create/deactivate users & assign sections', 'ALL'),
  def('org.role.manage', 'إدارة الأدوار وربطها بالشعب والصلاحيات', 'Manage roles & permission grants', 'ALL'),
  def('org.delegation.manage', 'التفويض أثناء الإجازات/الانتداب', 'Manage delegations', 'ALL'),

  // ── المصادقة والمزامنة ──────────────────────────────────────────────────
  def('auth.login', 'تسجيل الدخول', 'Authenticate', 'ALL'),
  def('sync.pull', 'سحب التغييرات إلى الجهاز', 'Pull server changes', 'ALL', true),
  def('sync.push', 'رفع التغييرات من الجهاز', 'Push local (offline) changes', 'ALL', true),
  def('notif.view', 'استقبال الإشعارات', 'Receive notifications', 'ALL'),

  // ── الإنتاج ────────────────────────────────────────────────────────────
  def('prod.log.view', 'عرض سجلوبات الوردية الإنتاجية', 'View shift logs', 'DEPT'),
  def('prod.log.create', 'تسجيل وردية إنتاجية (يوريا/أمونيا/أبراج)', 'Write shift log', 'SUBDEPT', true),
  def('prod.log.update', 'تعديل سجلوبة الوردية (قبل الاعتماد)', 'Edit shift log', 'SUBDEPT', true),
  def('prod.log.approve', 'اعتماد سجلوبة الوردية', 'Approve shift log', 'ALL'),
  def('prod.param.create', 'إدراج قراءات تشغيلية (T/P/F/L)', 'Log process parameters', 'SUBDEPT', true),
  def('prod.param.view', 'عرض القراءات التشغيلية ومنحنياتها', 'View process parameters', 'DEPT'),
  def('prod.alarm.ack', 'إقرار الإنذارات/الانحرافات', 'Acknowledge alarms & deviations', 'SUBDEPT', true),
  def('prod.downtime.create', 'تسجيل ساعات التوقف الإنتاجي', 'Record downtime', 'SUBDEPT', true),
  def('prod.downtime.view', 'عرض تحليل التوقفات', 'View downtime analysis', 'ALL'),
  def('prod.utility.manage', 'إدارة تشغيل أبراج التبريد (خلايا/مرواح/كيمائيات)', 'Manage cooling tower operation', 'SUBDEPT', true),

  // ── المختبر ─────────────────────────────────────────────────────────────
  def('lab.sample.create', 'فتح طلب تحليل / سحب عينة', 'Create sample request', 'SUBDEPT', true),
  def('lab.result.enter', 'إدخال نتائج التحاليل', 'Enter lab results', 'SUBDEPT', true),
  def('lab.result.verify', 'تدقيق/اعتماد نتائج التحليل', 'Verify lab results', 'ALL'),
  def('lab.report.export', 'تصدير شهادات التحليل', 'Export certificates of analysis', 'SUBDEPT'),
  def('lab.oos.manage', 'إدارة حالات خارج المطابقة (OOS/CAPA)', 'Manage out-of-spec cases', 'ALL'),

  // ── الصيانة ─────────────────────────────────────────────────────────────
  def('maint.asset.view', 'عرض سجل الأصول/المعدات', 'View asset register', 'ALL'),
  def('maint.asset.manage', 'إدارة الأصول وشجرة المعدات', 'Manage assets & equipment tree', 'DEPT'),
  def('maint.wo.view', 'عرض أوامر الشغل', 'View work orders', 'ALL'),
  def('maint.wo.create', 'طلب/فتح أمر شغل', 'Create work order', 'SUBDEPT', true),
  def('maint.wo.assign', 'إسناد أوامر الشغل للشُّعَب والفنيين', 'Assign work orders', 'ALL'),
  def('maint.wo.execute', 'تنفيذ وتحديث حالة أمر الشغل', 'Execute & update work order', 'SUBDEPT', true),
  def('maint.wo.close', 'إغلاق أمر الشغل وتسجيل التفاصيل', 'Close work order', 'ALL', true),
  def('maint.wo.cancel', 'إلغاء/تأجيل أمر الشغل', 'Cancel or defer work order', 'DEPT'),
  def('maint.pm.manage', 'إدارة خطط الصيانة الوقائية (PM) وتوليد أوامر الشغل', 'Manage PM plans', 'DEPT'),
  def('maint.condition.record', 'تسجيل قراءات الحالة (اهتزاز/حرارة/سمك/تزييت)', 'Record condition monitoring', 'SUBDEPT', true),
  def('maint.condition.view', 'عرض تقارير الحالة والاتجاهات', 'View condition monitoring reports', 'DEPT'),
  def('maint.permit.view', 'عرض تصاريح العمل', 'View permits to work', 'ALL'),
  def('maint.permit.create', 'طلب تصريح عمل (ساخن/بارد/مكان مغلق/عمل على ارتفاع)', 'Request permit to work', 'SUBDEPT', true),
  def('maint.permit.approve', 'اعتماد/عزل وتصريح العمل (ISO/Loto)', 'Approve permit / isolation', 'ALL'),
  def('maint.backlog.view', 'عرض مخزون الأعمال والتكاليف', 'View backlog & maintenance cost', 'ALL'),
  def('maint.downtime.verify', 'تدقيق أسباب التوقف المشترك مع الإنتاج', 'Verify downtime causes with production', 'DEPT'),

  // ── المخازن ─────────────────────────────────────────────────────────────
  def('wh.item.view', 'عرض أصناف المخزون والرصيد', 'View catalog & balances', 'DEPT'),
  def('wh.req.create', 'طلب صرف مواد/قطع غيار لأمر شغل', 'Create material requisition', 'SUBDEPT', true),
  def('wh.req.approve', 'اعتماد طلبات الصرف', 'Approve requisitions', 'DEPT'),
  def('wh.issue', 'تنفيذ الصرف وتقليل الرصيد', 'Issue stock', 'DEPT'),
  def('wh.grn', 'استلام مواد (GRN) وإضافتها للرصيد', 'Receive stock (GRN)', 'DEPT'),
  def('wh.return', 'إرجاع مواد إلى المخزن', 'Return materials', 'SUBDEPT', true),
  def('wh.stocktake', 'الجرد الدوري وتسوية الأرصدة', 'Stock count & adjustments', 'DEPT'),
  def('wh.manage', 'إدارة المخازن والأماكن والحدود الدنيا', 'Manage warehouses & reorder limits', 'DEPT'),

  // ── الموارد البشرية / البصمة ────────────────────────────────────────────
  def('hr.emp.view', 'عرض بيانات الموظفين', 'View employee master', 'ALL'),
  def('hr.emp.manage', 'إدارة بيانات الموظفين والعقود', 'Manage employee master & contracts', 'SUBDEPT'),
  def('hr.att.view', 'عرض سجلات البصمة والحضور', 'View biometric punches & attendance', 'ALL'),
  def('hr.att.all', 'عرض بصمة جميع الأقسام', 'View attendance across all sections', 'ALL'),
  def('hr.att.correct', 'تصحيح/معالجة البصمات الناقصة', 'Resolve missing/invalid punches', 'ALL'),
  def('hr.att.import', 'استيراد السجلات من أجهزة البصمة', 'Import raw logs from devices', 'ALL'),
  def('hr.att.export_payroll', 'تصدير كشوط الحضور إلى الرواتب', 'Export attendance to payroll', 'ALL'),
  def('hr.shift.view', 'عرض جداول الوردیات/الدوام', 'View shift rosters', 'ALL'),
  def('hr.shift.manage', 'إدارة جداول الوردیات والتناوبات', 'Manage shift rosters', 'ALL'),
  def('hr.leave.view', 'عرض طلبات الإجازات الخاصة', 'View own leave requests', 'SELF'),
  def('hr.leave.request', 'تقديم طلب إجازة/مهمة/ساعات إضافية', 'Request leave / mission / OT', 'SELF', true),
  def('hr.leave.approve', 'اعتماد الإجازات والساعات الإضافية', 'Approve leave & overtime', 'ALL'),
  def('hr.form.create', 'تعبئة النماذج الميدانية (استمارة)', 'Submit mobile form record', 'SUBDEPT', true),
  def('hr.form.view', 'عرض النماذج الميدانية', 'View mobile form records', 'DEPT'),

  // ── التجارية ─────────────────────────────────────────────────────────────
  def('com.order.view', 'عرض أوامر البيع/أوامر الحمل (ZSD)', 'View sales/delivery orders', 'ALL'),
  def('com.order.create', 'إدخال أوامر البيع والتحميل', 'Create sales orders & loading', 'DEPT', true),
  def('com.order.confirm', 'تأكيد الكميات المسلّمة والتواقيع', 'Confirm delivered quantities', 'DEPT'),
  def('com.customer.manage', 'إدارة بيانات العملاء وحساباتهم', 'Manage customers', 'DEPT'),
  def('com.pricing.manage', 'إدارة الأسعار والعقود والحصص', 'Manage pricing, contracts & quotas', 'SUBDEPT'),
  def('com.report.export', 'تصدير تقارير الكميات المسلّمة', 'Export delivery reports', 'DEPT'),

  // ── المالية ─────────────────────────────────────────────────────────────
  def('fin.coa.view', 'عرض دليل الحسابات والأقيسة', 'View chart of accounts', 'ALL'),
  def('fin.journal.manage', 'تسجيل قيود يومية/سندات قبض وصرف', 'Post journals, receipts & payments', 'ALL'),
  def('fin.cost.view', 'عرض مراكز التكلفة وتوزيع المصروفات', 'View cost centres & allocation', 'ALL'),
  def('fin.po.view', 'عرض أوامر الشراء والموردين', 'View purchase orders', 'ALL'),
  def('fin.po.approve', 'اعتماد أوامر الشراء وفق سلطات التوقيع', 'Approve purchase orders (DoA)', 'ALL'),
  def('fin.invoice.manage', 'الفواتير والتسوية مع التجارية', 'Invoicing & matching with commercial', 'ALL'),
  def('fin.grn_finance', 'مطابقة الاستلام مع الفاتورة (3-way match)', 'Invoice/GRN/PO matching', 'ALL'),
  def('fin.payroll.view', 'عرض الرواتب ضمن الصلاحية', 'View payroll', 'ALL'),
  def('fin.payroll.run', 'تسوية الرواتب والصرف', 'Run & release payroll', 'ALL'),
  def('fin.ar_collect', 'متابعة التحصيل وأعمار الديون', 'AR follow-up & ageing', 'ALL'),
  def('fin.budget.view', 'عرض الموازنة التشغيلية والاستهلاك', 'View budget & consumption', 'ALL'),
  def('fin.budget.manage', 'إعداد الموازنة وربطها بمراكز التكلفة', 'Manage annual budget', 'ALL'),
  def('fin.rate.manage', 'أسعار الصرف ومؤشر الأسعار', 'Manage exchange rates', 'ALL'),

  // ── الوثائق / التدقيق / التقارير ────────────────────────────────────────
  def('doc.upload', 'رفع المخططات والتقارير والصور', 'Upload documents/photos', 'ALL', true),
  def('doc.view', 'عرض/تحميل الوثائق', 'View & download documents', 'ALL'),
  def('doc.manage', 'إدارة التصنيف والدوران والتوثيق', 'Manage document control', 'ALL'),
  def('report.view', 'عرض لوحات المؤشرات والتقارير', 'View dashboards & reports', 'ALL'),
  def('report.export', 'تصدير تقارير (Excel/PDF)', 'Export reports', 'ALL'),
  def('report.kpi.manage', 'تعريف أهداف المؤشرات (KPI)', 'Define KPI targets', 'ALL'),
  def('audit.view', 'عرض سجل التدقيق', 'View audit trail', 'ALL'),
  def('audit.export', 'تصدير سجل التدقيق', 'Export audit trail', 'ALL'),
  def('admin.system', 'إعدادات النظام العامة (نماذج، أكواد، تكاملات)', 'System configuration', 'ALL'),
] as const satisfies readonly PermissionDef[];

export const PERMISSION_CODES = PERMISSION_DEFS.map((p) => p.code) as unknown as PermissionCode[];

export type PermissionCode =
  | 'org.dept.view' | 'org.dept.manage' | 'org.user.view' | 'org.user.manage' | 'org.role.manage' | 'org.delegation.manage'
  | 'auth.login' | 'sync.pull' | 'sync.push' | 'notif.view'
  | 'prod.log.view' | 'prod.log.create' | 'prod.log.update' | 'prod.log.approve' | 'prod.param.create' | 'prod.param.view'
  | 'prod.alarm.ack' | 'prod.downtime.create' | 'prod.downtime.view' | 'prod.utility.manage'
  | 'lab.sample.create' | 'lab.result.enter' | 'lab.result.verify' | 'lab.report.export' | 'lab.oos.manage'
  | 'maint.asset.view' | 'maint.asset.manage' | 'maint.wo.view' | 'maint.wo.create' | 'maint.wo.assign' | 'maint.wo.execute'
  | 'maint.wo.close' | 'maint.wo.cancel' | 'maint.pm.manage' | 'maint.condition.record' | 'maint.condition.view'
  | 'maint.permit.view' | 'maint.permit.create' | 'maint.permit.approve' | 'maint.backlog.view' | 'maint.downtime.verify'
  | 'wh.item.view' | 'wh.req.create' | 'wh.req.approve' | 'wh.issue' | 'wh.grn' | 'wh.return' | 'wh.stocktake' | 'wh.manage'
  | 'hr.emp.view' | 'hr.emp.manage' | 'hr.att.view' | 'hr.att.all' | 'hr.att.correct' | 'hr.att.import' | 'hr.att.export_payroll'
  | 'hr.shift.view' | 'hr.shift.manage' | 'hr.leave.view' | 'hr.leave.request' | 'hr.leave.approve' | 'hr.form.create' | 'hr.form.view'
  | 'com.order.view' | 'com.order.create' | 'com.order.confirm' | 'com.customer.manage' | 'com.pricing.manage' | 'com.report.export'
  | 'fin.coa.view' | 'fin.journal.manage' | 'fin.cost.view' | 'fin.po.view' | 'fin.po.approve' | 'fin.invoice.manage'
  | 'fin.grn_finance' | 'fin.payroll.view' | 'fin.payroll.run' | 'fin.ar_collect' | 'fin.budget.view' | 'fin.budget.manage' | 'fin.rate.manage'
  | 'doc.upload' | 'doc.view' | 'doc.manage' | 'report.view' | 'report.export' | 'report.kpi.manage'
  | 'audit.view' | 'audit.export' | 'admin.system';

const REGISTRY: Map<PermissionCode, PermissionDef> = new Map(
  PERMISSION_DEFS.map((p) => [p.code, p] as [PermissionCode, PermissionDef]),
);

export function permission(code: PermissionCode): PermissionDef {
  const found = REGISTRY.get(code);
  if (!found) throw new Error(`Unknown permission: ${code}`);
  return found;
}

export function isPermissionCode(x: string): x is PermissionCode {
  return REGISTRY.has(x as PermissionCode);
}

/** كل صلاحيات الوحدة النمطية (للتجميع في الأدوار) */
export function permissionsOfModule(module: string): PermissionCode[] {
  return PERMISSION_DEFS.filter((p) => p.module === module).map((p) => p.code);
}
