#!/usr/bin/env node
/**
 * يولّد ملحقًا توثيقيًا للمخطط من `prisma/schema.prisma` (لا يُحرَّر يدويًا).
 * الاستخدام: node scripts/gen-schema-docs.mjs   (أو: npm run docs:schema -w @newport/api)
 * المخرجات: docs/generated/schema.catalog.md
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const apiRoot = join(here, '..');
const docsRoot = join(apiRoot, '..', '..', 'docs', 'generated');
const schema = readFileSync(join(apiRoot, 'prisma', 'schema.prisma'), 'utf8');

/** تقسيم الـ models إلى مجموعات وظيفية لعرض أسهل للمراجعة */
const GROUPS = [
  ['المرجع التنظيمي', /^(Company|Facility|Department|SubDepartment|Position|Shift|WorkCalendar|Holiday)$/, 'الأقسام والشعب والورديات — المرجع الذي يُبنى عليه كل الصلاحيات'],
  ['الموظفون والصلاحيات', /^(User|Role|RolePermission|RoleSubDeptGrant|RefreshToken|Device|UserDevice)$/, 'RBAC/ABAC: أدوار، منح شعبة×دور، أجهزة، جلسات'],
  ['الأصول والصيانة', /^(Asset|AssetUnit|AssetHierarchy|AssetReading|Document|WorkOrder|WorkOrderLog|WorkOrderAssignment|WorkOrderLabor|WorkOrderPart|SparePart|PartIssue|Requisition|RequisitionLine|PermitToWork|PMPlan|PMPlanInstance|FailureCode|DowntimeEvent)$/, 'أوامر العمل، قطع الغيار، التصاريح، الصيانة الوقائية'],
  ['الإنتاج', /^(ProductionUnit|ShiftLog|ShiftLogEvent|ProcessParam|ProcessParamDef|Downtime|AlarmEvent|AlarmAck|ProductionTarget|UtilityReading)$/, 'سجلات الوردية وقراءات العمليات والأعطال والإنذارات'],
  ['المختبر', /^(LabSample|LabResult|LabResultParameter|LabParameter|LabSpecification|LabOosEvent|CalibrationRecord)$/, 'العيّنات والنتائج والمواصفات وحالات عدم المطابقة'],
  ['الحضور والبصمة', /^(Employee|AttendancePunch|AttendanceDailySummary|AttendanceCorrection|AttendanceException|LeaveRequest|LeaveType|OvertimeRequest)$/, 'جهاز البصمة، التقييم اليومي، التصحيحات، الإجازات'],
  ['التجارة والمالية', /^(Customer|SalesOrder|SalesOrderLine|Invoice|InvoiceLine|Payment|CostCenter|BudgetLine|ValuationEntry|Contractor|ContractorTimesheet)$/, 'الطلبات والفواتير والتكاليف والمقاولون'],
  ['المخزون', /^(Warehouse|StorageLocation|StockItem|StockMovement|StockCount|Supplier|PurchaseOrder|PurchaseOrderLine|GoodsReceipt)$/, 'المخازن والحركات والأوامر الشرائية'],
  ['المستندات والتدفقات', /^(DocumentVersion|DocumentApproval|Notification|NotificationAck|MobileFormTemplate|MobileFormRecord|FormTemplate|FormData)$/, 'إدارة المستندات والنماذج الميدانية والإشعارات'],
  ['المزامنة والتدقيق', /^(SyncChangeLog|SyncIdempotency|SyncConflict|AppSetting|IntegrationConfig|AuditTrail|ReportSnapshot|KpiSnapshot|ReportSchedule|SyncDeviceState)$/, 'Change Feed، منع التكرار، التعارضات، سجل التدقيق، اللقطات'],
];

const models = [...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)].map(([, name, body]) => {
  const fields = [];
  const attrs = [];
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('@@')) attrs.push(line);
    else if (!line.startsWith('//')) fields.push(line);
  }
  const pk = attrs.find((a) => a.startsWith('@@id')) ?? '';
  const map = /@@map\("([^"]+)"\)/.exec(attrs.join('\n'));
  const uniq = attrs.filter((a) => a.startsWith('@@unique'));
  const idx = attrs.filter((a) => a.startsWith('@@index'));
  return { name, fields, attrs, map: map?.[1] ?? null, uniq, idx, pk, table: map?.[1] ?? null };
});

const used = new Set();
const sections = GROUPS.map(([title, re, why]) => {
  const list = models.filter((m) => re.test(m.name) && !used.has(m.name));
  list.forEach((m) => used.add(m.name));
  if (!list.length) return '';
  const rows = list
    .map((m) => {
      const keys = m.fields
        .map((f) => f.split(/\s+/)[0])
        .filter((k, i, a) => a.indexOf(k) === i);
      return `| \`${m.name}\` | ${m.table ? '`' + m.table + '`' : '—'} | ${keys.length} | ${m.uniq.length} | ${m.idx.length} |`;
    })
    .join('\n');
  return [`### ${title}`, '', why, '', '| نموذج Prisma | جدول PostgreSQL | أعمدة | قيود uniqueness | فهارس |', '|---|---|---|---|---|', rows].join('\n');
}).filter(Boolean);

const rest = models.filter((m) => !used.has(m.name));
if (rest.length) {
  const rows = rest
    .map((m) => {
      const keys = m.fields.map((f) => f.split(/\s+/)[0]).filter((k, i, a) => a.indexOf(k) === i);
      return `| \`${m.name}\` | ${m.table ? '`' + m.table + '`' : '—'} | ${keys.length} | ${m.uniq.length} | ${m.idx.length} |`;
    })
    .join('\n');
  sections.push(['### أخرى', '', '', '| نموذج Prisma | جدول | أعمدة | uniqueness | فهارس |', '|---|---|---|---|---|', rows].join('\n'));
}

const details = models
  .map((m) => {
    const fields = m.fields.map((f) => '  ' + f).join('\n');
    const attrs = m.attrs.filter((a) => !a.startsWith('@@map')).join('\n');
    return [`#### \`${m.name}\`${m.table ? ` → جدول \`${m.table}\`` : ''}`, '', '```prisma', fields, attrs, '```', ''].join('\n');
  })
  .join('\n');

const enums = [...schema.matchAll(/^enum\s+(\w+)\s*\{([\s\S]*?)^\}/gm)].map(([, name, body]) => {
  const values = body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//'));
  return `- **${name}** (${values.length}): ${values.join(', ')}`;
});

const out = [
  '# كتالوج المخطط (مولّد)',
  '',
  '> يولَّد هذا الملف من `apps/api/prisma/schema.prisma` — لا يُحرَّر يدويًا.',
  `> الأمر: \`node apps/api/scripts/gen-schema-docs.mjs\``,
  '',
  `**الإجمالي:** ${models.length} نموذج · ${enums.length} نوع عددي (enum) · جدول ` + '`sync_change_log`' + ' والتفاصيل في `schema.postgres.sql`.',
  '',
  '## الجداول حسب المجموعة الوظيفية',
  '',
  ...sections,
  '',
  '## الأنواع العددية (enums)',
  '',
  ...enums,
  '',
  '## تفاصيل النماذج (الحقول كاملة)',
  '',
  '> قاعدة تسمية صارمة: `@@map` يحوّل اسم الجدول إلى snake_case، أما الأعمدة فتبقى camelCase بين علامتي اقتباس في أي SQL خام.',
  '',
  details,
  '',
].join('\n');

mkdirSync(docsRoot, { recursive: true });
writeFileSync(join(docsRoot, 'schema.catalog.md'), out);
console.log(`✓ docs/generated/schema.catalog.md — ${models.length} نموذج، ${enums.length} enum`);
