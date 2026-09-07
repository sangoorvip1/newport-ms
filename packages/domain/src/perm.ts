/** مفاتيح تحكّم موحّدة للواجهات (سطح المكتب + الهاتف) لمنع كتابة النصوص في كل مكان */
import type { PermissionCode } from './permissions.js';

export const P = {
  // org
  DEPT_VIEW: 'org.dept.view' as PermissionCode,
  DEPT_MANAGE: 'org.dept.manage' as PermissionCode,
  USER_VIEW: 'org.user.view' as PermissionCode,
  USER_MANAGE: 'org.user.manage' as PermissionCode,
  ROLE_MANAGE: 'org.role.manage' as PermissionCode,
  // production
  PROD_LOG_VIEW: 'prod.log.view' as PermissionCode,
  PROD_LOG_CREATE: 'prod.log.create' as PermissionCode,
  PROD_LOG_APPROVE: 'prod.log.approve' as PermissionCode,
  PROD_PARAM_CREATE: 'prod.param.create' as PermissionCode,
  PROD_UTILITY: 'prod.utility.manage' as PermissionCode,
  PROD_DOWNTIME: 'prod.downtime.create' as PermissionCode,
  // lab
  LAB_SAMPLE: 'lab.sample.create' as PermissionCode,
  LAB_RESULT_ENTER: 'lab.result.enter' as PermissionCode,
  LAB_RESULT_VERIFY: 'lab.result.verify' as PermissionCode,
  LAB_EXPORT: 'lab.report.export' as PermissionCode,
  // maintenance
  WO_VIEW: 'maint.wo.view' as PermissionCode,
  WO_CREATE: 'maint.wo.create' as PermissionCode,
  WO_ASSIGN: 'maint.wo.assign' as PermissionCode,
  WO_EXECUTE: 'maint.wo.execute' as PermissionCode,
  WO_CLOSE: 'maint.wo.close' as PermissionCode,
  WO_CANCEL: 'maint.wo.cancel' as PermissionCode,
  PM_MANAGE: 'maint.pm.manage' as PermissionCode,
  CM_RECORD: 'maint.condition.record' as PermissionCode,
  PERMIT_CREATE: 'maint.permit.create' as PermissionCode,
  PERMIT_APPROVE: 'maint.permit.approve' as PermissionCode,
  ASSET_MANAGE: 'maint.asset.manage' as PermissionCode,
  // warehouse
  WH_REQ: 'wh.req.create' as PermissionCode,
  WH_REQ_APPROVE: 'wh.req.approve' as PermissionCode,
  WH_ISSUE: 'wh.issue' as PermissionCode,
  WH_GRN: 'wh.grn' as PermissionCode,
  // hr
  ATT_VIEW: 'hr.att.view' as PermissionCode,
  ATT_ALL: 'hr.att.all' as PermissionCode,
  ATT_CORRECT: 'hr.att.correct' as PermissionCode,
  ATT_IMPORT: 'hr.att.import' as PermissionCode,
  SHIFT_MANAGE: 'hr.shift.manage' as PermissionCode,
  LEAVE_REQUEST: 'hr.leave.request' as PermissionCode,
  LEAVE_APPROVE: 'hr.leave.approve' as PermissionCode,
  FORM_CREATE: 'hr.form.create' as PermissionCode,
  // commercial / finance
  COM_ORDER: 'com.order.create' as PermissionCode,
  COM_CONFIRM: 'com.order.confirm' as PermissionCode,
  FIN_JOURNAL: 'fin.journal.manage' as PermissionCode,
  FIN_PO_APPROVE: 'fin.po.approve' as PermissionCode,
  FIN_PAYROLL: 'fin.payroll.run' as PermissionCode,
  FIN_BUDGET: 'fin.budget.view' as PermissionCode,
  // shared
  DOC_VIEW: 'doc.view' as PermissionCode,
  DOC_UPLOAD: 'doc.upload' as PermissionCode,
  REPORT_VIEW: 'report.view' as PermissionCode,
  REPORT_EXPORT: 'report.export' as PermissionCode,
  AUDIT_VIEW: 'audit.view' as PermissionCode,
  ADMIN_SYSTEM: 'admin.system' as PermissionCode,
} as const;

/** مجموعة صلاحيات من استجابة تسجيل الدخول → map للتحقق السريع O(1) */
export function toPermissionSet(grants: Array<{ code: string; scope: string }>): Set<PermissionCode> {
  return new Set(grants.map((g) => g.code as PermissionCode));
}

export function hasAny(perms: ReadonlySet<string>, codes: PermissionCode[]): boolean {
  return codes.some((c) => perms.has(c));
}
