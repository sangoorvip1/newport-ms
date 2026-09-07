# ‎02 — تصميم قاعدة البيانات (الجداول، الحقول، العلاقات)

**المصدر الحقيقي للمخطط**: `apps/api/prisma/schema.prisma` → DDL مولّد في `docs/generated/schema.postgres.sql`.
**كتالوج كامل مولّد لكل جدول وحقل**: `docs/generated/schema.catalog.md` (يُعاد توليده بـ `npm run docs:schema -w @newport/api`).

| المقياس | القيمة |
|---|---|
| نماذج Prisma / جداول SQL | **85** |
| أنواع عددية (enum) | **25** |
| مفاتيح خارجية (FK) | **93** |
| فهارس | **145** |
| أسطر DDL المولّد | **2286** |
| كيانات مزامَنة | **20** |
| صلاحيات معرَّفة | **91** (واحدة مؤجَّلة صراحةً للمرحلة الثانية: `hr.emp.manage`) |
| أدوار | **21** — منح «شعبة × دور» في المصفوفة: **36** |
| أقسام / شعب | **3 / 13** |

---

## 1. قواعد التسمية والانضباط الهيكلي

| القاعدة | التفصيل | الأثر العملي |
|---|---|---|
| الجداول snake_case | `@@map("work_orders")` | استعلامات SQL الخام تُكتب `FROM work_orders` |
| **الأعمدة camelCase** | لا يوجد `@map` على الحقول | يجب اقتباسها دائمًا: `SELECT "subDeptId" …` — `deleted_at` بلا اقتباس **يفشل** |
| مفاتيح | `String @id @default(uuid(7)) @db.Uuid` | UUIDv7 قابل للترتيب الزمني → إنشاء السجلات من جهاز بلا اتصال لا يتصادم |
| الحذف | `deletedAt DateTime?` (حذف منطقي) | التقارير الاحتياطية والحسابات لا تفقد سجلًا؛ `wipeRemoteRecords` على الجهاز يحترم الطابور |
| الطوابع | `createdAt`, `updatedAt @updatedAt` (+ trigger `trg_touch` على القاعدة) | ساعة الخادم هي المرجع، لا ساعة الجهاز |
| أرقام المستندات | تسلسلات SQL (`wo_number_seq`، `lab_sample_number_seq`، `permit_number_seq`، `grn/mi/req/pr/po/so/si/je/oos/incident`) عبر `next_business_number()` | لا فجوات ولا تنافس؛ تنسيق `WO-2026-000123` |

**أعمدة المزامنة الإلزامية** على كل جدول قابل للمزامنة:

```prisma
version       Int      @default(1)   // يزيد على الخادم لكل تعديل ناجح (قفل تفاؤلي)
syncSeq       BigInt?                // تسلسل التغيير (يُختم من trg_bump_version / sync_change_log)
deletedAt     DateTime?              // tombstone
clientOpId    String?                // opId الأخير الذي طُبِّق — لإثبات idempotency server-side
isOfflineCreated Boolean @default(false)
```

## 2. المجموعات الوظيفية للـ 85 جدولًا

| مجموعة | أمثلة جوهرية | الدور |
|---|---|---|
| المرجع التنظيمي | `companies`, `facilities`, `departments`, `sub_departments`, `positions`, `shifts`, `work_calendar` | تثبيت الهيكل المطلوب حرفيًا؛ كل الصلاحيات تُبنى عليه |
| الموظف والصلاحيات | `users`, `employees`, `roles`, `role_permissions`, `role_subdept_grants`, `permissions`, `refresh_tokens`, `devices` | RBAC + ABAC + جلسات الأجهزة |
| الأصول والصيانة | `assets`, `asset_units`, `asset_readings`, `work_orders`, `work_order_logs`, `work_order_labor`, `part_issues`, `spare_parts`, `requisitions`, `permits_to_work`, `pm_plans`, `pm_plan_instances`, `failure_codes`, `downtime_events` | CMMS كامل (انظر §5) |
| الإنتاج | `production_units`, `production_shift_logs`, `process_params`, `process_param_defs`, `alarms`, `alarm_acks`, `production_targets`, `utility_readings` | سجل الوردية والقراءات (انظر §6) |
| المختبر | `lab_samples`, `lab_results`, `lab_result_parameters`, `lab_parameters`, `lab_specifications`, `lab_oos_events`, `calibration_records` | عيّنات/نتائج/مواصفات + حالات OOS |
| الحضور والبصمة | `biometric_devices`, `attendance_punches`, `attendance_daily_summary`, `attendance_corrections`, `leave_types`, `leave_requests`, `overtime_requests` | إدخال ZKTeco + التقييم اليومي (انظر §7) |
| التجارة والمالية | `customers`, `sales_orders`, `invoices`, `invoice_lines`, `payments`, `cost_centers`, `journal_entries`, `contractors` | شعبة تجارية/مالية بلا مخزون مكرر |
| المخزون | `warehouses`, `storage_locations`, `stock_items`, `stock_movements`, `goods_receipts`, `purchase_orders`, `suppliers`, `stock_counts` | إصدار أولي مهيكل للمزامنة |
| المستندات والنماذج | `documents`, `document_versions`, `mobile_form_templates`, `mobile_form_records`, `notifications` | مرفقات المصور الميداني ونماذج الجولات |
| المزامنة والتدقيق | `sync_change_log`, `sync_idempotency`, `sync_conflicts`, `sync_entity_registry`, `audit_trails`, `app_settings`, `integration_configs`, KPI snapshots | بنية تحتية تشغيلية |

## 3. الهيكل التنظيمي المطلوب (مرجوح حرفيًا)

`sub_departments.code` هو المفتاح المنطقي لكل سياسة وصول:

| القسم (`departments.code`) | الشعبة (`sub_departments.code`) | `isFieldWork` |
|---|---|---|
| `PROD` — قسم الإنتاج | `PROD-UREA` اليوريا · `PROD-AMM` الأمونيا · `PROD-CT` أبراج التبريد · `PROD-LAB` المختبر | أبراج التبريد والمختبر = ميداني |
| `MAINT` — قسم الصيانة | `MAINT-HEAT` المعدات الحرارية · `MAINT-ROT` المعدات الدوارة · `MAINT-ELEC` الكهرباء · `MAINT-VALVE` الصمامات · `MAINT-INST` الآلات الدقيقة · `MAINT-GEN` المعدات العامة | كلها ميدانية |
| `ADMIN` — الأقسام الإدارية | `ADM-BIO` البصمة · `ADM-COM` الشعبة التجارية · `ADM-FIN` الشعبة المالية | مكتبي |

المرجع الثابت في `packages/domain/src/org.ts` يُستعمل لـ (1) seed، (2) توليد المصفوفة، (3) فحص الانحراف `GET /api/v1/org/drift` — فلا ينحرف الكود عن القاعدة. التوسّع لخط ثانٍ/ثالث يتم بإضافة صف `facilities` + شعب جديدة، **لا بتعديل الكود**.

## 4. العلاقات الحرجة (كما هي في المخطط)

```
Facility 1─N Department 1─N SubDepartment 1─N Employee
                                   │            └─ 1─N AttendancePunch (device raw)
                                   │            └─ 1─N AttendanceDailySummary (تقييم اليوم)
                                   └─ 1─N User (حساب النظام) ─N:N─ Role ─N:N─ Permission
Facility 1─N Asset(← AssetUnit) 1─N AssetReading
Asset 1─N WorkOrder 1─N WorkOrderLog / WorkOrderLabor / PartIssue / Requisition→RequisitionLine
                      └─1─N PermitToWork (شرط بدء التنفيذ)
SubDepartment(مختبر) 1─N LabSample 1─N LabResult 1─N LabResultParameter ─→ LabSpecification (حكم OOS)
ProductionUnit 1─N ProductionShiftLog 1─N ProcessParam
Sync: User.syncCursor / Device.lastPullCursor ←→ sync_change_log.seq (feed)
```

نمط مُتَّبع عند الحاجة: عمود FK مفهرس **بلا علاقة Prisma** عندما لا تكون العلاقة كاملة أو لا تُستخدم في `include` (يمنع أخطاء بناء relations في Prisma)، بينما يبقى `ON DELETE` مؤمَّنًا في DDL المولّد. مثال: `AttendancePunch.employeeId → Employee(id)` مع علاقة مصرَّحة لأن `attendance.dailyRows` تحتاج `include: { employee: … }`.

## 5. أوامر العمل: الجدول الآلي للحالة

`work_orders.status` هو enum من آلة الحالة المشتركة (`WO_TRANSITIONS` في `@newport/domain`)، ومساراته:

```
DRAFT → SUBMITTED → APPROVED → ASSIGNED → IN_PROGRESS → COMPLETED → CLOSED
                          │            │          ├→ ON_HOLD / AWAITING_PARTS / AWAITING_PERMIT
                          └→ REJECTED  └→ CANCELLED          CLOSED → IN_PROGRESS (بصلاحية maint.wo.cancel + تدقيق)
```

- لا يُقبل من العميل عبر المزامنة أي تغيير مباشر على `status` (الحقول الحامية في `SYNC_META.workOrder.protectedFields`)؛ الانتقالات تتم عبر `POST /api/v1/maintenance/work-orders/:id/transition` مع `updateMany` بعد `version` (قفل تفاؤلي ⇒ 409 عند تضارب التحرير).
- قاعدة أمان إضافية: لا يبدأ `IN_PROGRESS` إذا كان `requirePermit || isSafetyCritical` ولا توجد تصريح نشِط.
- SLA لكل أولوية (ساعات استجابة/معالجة): EMERGENCY 0.5/8 · URGENT 2/24 · HIGH 8/72 · MEDIUM 24/168 · LOW 48/504 · ROUTINE_PM 72/720، وتُحسب في `computeSla` (مشترك بين الخادم والواجهة).

## 6. الإنتاج: سجل الوردية والقراءات

```prisma
model ProductionShiftLog {           // جدول واحد لكل (وحدة، تاريخ، وردية)
  unitCode   ProdUnit                // UREA | AMMONIA | COOLING_TOWER | UTILITY | LAB
  shiftDate  DateTime
  shiftCode  ShiftCode                // A | B | C | D
  productionTons Decimal?
  availabilityPct Decimal?
  approvedById String?                 // اعتماد مشرف الوردية — حقل محمي في المزامنة
  version Int / syncSeq BigInt / deletedAt …
}
model ProcessParam { shiftLogId; paramCode; value Decimal; unit; assetTag? }  // 1─N تحت السجل
```
القيود: `@@unique([unitId, shiftDate, shiftCode])` (يمنع تكرار السجل عند إعادة الدفع)، و`eventsJson` للأحداث النصية، و`notes` حقل **append** عند التعارض.

## 7. البصمة: من الجهاز إلى الراتب

```
BiometricDevice (ZKTeco) ──import──► attendance_punches (@@unique(deviceId, rawRecordId))
                                         │  إعادة الحساب idempotent عبر reconciliationHash (FNV-1a)
                                         ▼
                              attendance_daily_summary  (لكل موظف/يوم)
   firstInAt · lastOutAt · workedMinutes · lateMinutes · overtimeMinutes · nightShiftPct
   status ∈ {PRESENT, LATE, ABSENT, HALF_DAY, OVERTIME, OFF, REST} · exceptionsJson[] · isLocked
                                         │  تصحيح يدوي (طلب + قرار) عبر attendance_corrections
                                         ▼
                              GET /api/v1/time/payroll-export?month=YYYY-MM  (CSV للأقسام المالية)
```
قواعد التقييم (منفَّذة في `packages/domain/src/attendance.ts` ومُغطّاة باختبارات): `Asia/Baghdad` ثابت (UTC+3)، نافذة بصمة ±4 ساعات حول الوردية، حد تأخير/سماح، **علاوة ليلية +15% للوردية B**، والجمعة ×2 للإضافي، واستثناءات `OUT_OF_WINDOW_PUNCHES / TOO_MANY_PUNCHES / CONTAINS_MANUAL_PUNCH / CONTAINS_MOBILE_PUNCH`.

## 8. طبقة SQL المضافة (غير قابلة للتعبير في Prisma)

`apps/api/prisma/migrations/20260907000001_postgres_extensions_views_rls/migration.sql` — 376 سطرًا تحتوي:

| العنصر | العدد | الوظيفة |
|---|---|---|
| امتدادات | 5 | `pg_trgm`, `citext`, `uuid-ossp`, `btree_gin`, `pg_stat_statements` |
| تسلسلات أرقام المستندات | 13 | مع دالة `next_business_number(prefix)` |
| `CREATE SEQUENCE sync_change_log_seq` | 1 | تسلسل Change Feed المشترك (bigint) |
| دوال/trigger | 5 | `trg_touch` (updatedAt)، `trg_sync_*` (كتابة `sync_change_log`)، `trg_bump_version` (يزيد `version`)، `trg_stamp_entity_seq` (يختم `syncSeq` عبر `sync_entity_registry`)، `trg_audit_immutable` (يمنع UPDATE/DELETE على `audit_trails`) |
| عرض/ماديات | 4 views | `mv_maintenance_kpi_daily` (MTTR/MTBF/خطة الانصياع)، `mv_production_daily`، `mv_attendance_daily`، `mv_stock_critical` — تُجدَّل تشغيليًا |
| RLS | 4 policies | `p_wo_scope` (أوامر العمل)، `p_slog_scope` (سجل الوردية)، `p_punch_scope` (البصمة)، `p_je_finance` (القيود المالية) |
| قيود CHECK | 19 | تحمي تنسيق camelCase/الرموز (مثل `code ~ '^MAINT-[A-Z]+$'`) |

**لماذا تُكتب `syncSeq` من trigger وليس من Prisma؟** لأن المسار الذي يكتبه Prisma يمر بقواعد مختلفة؛ ختم `syncSeq` + `version` في المحرّك يجعل الـ Change Feed صحيحًا حتى للعمليات اليدوية/الإصلاحية (runbook) التي ينفذها DBA.

> ملاحظة تنفيذية موثّقة: المحفّزات لا تستطيع ختم `syncSeq` في `sync_change_log.payload` لنفس الصف (يُنشأ التسلسل بعد الإدراج)، لذا أُنشئ trigger ثانٍ `AFTER INSERT ON sync_change_log` يربط `payload.syncSeq` عبر `sync_entity_registry` مع `EXCEPTION WHEN undefined_table OR undefined_column THEN RETURN NULL` حتى لا ينكهر الترحيل عند إضافة جدول جديد.

## 9. فهرسة مقصودة (أمثلة من الـ DDL)

```sql
CREATE INDEX ix_wo_status_sub_dept   ON work_orders ("subDeptId", status, "createdAt" DESC);
CREATE INDEX ix_wo_assigned_open     ON work_orders ("assignedToId", status) WHERE "deletedAt" IS NULL;
CREATE INDEX ix_punch_employee_time  ON attendance_punches ("employeeId", "punchedAt");
CREATE INDEX ix_slog_unit_date_shift ON production_shift_logs ("unitId", "shiftDate", "shiftCode");
CREATE INDEX ix_wo_search_trgm       ON work_orders USING gin ((("title" || ' ' || "description") gin_trgm_ops));
CREATE INDEX ix_change_entity        ON sync_change_log (entity, seq);
```
الفهارس الجزئية (`WHERE "deletedAt" IS NULL`) ضرورية هنا لأن كل الجداول تستخدم الحذف المنطقي، وإلا كبر الفهرس بلا فائدة.

## 10. كيف تُنشئ القاعدة فعليًا

```bash
export DATABASE_URL="postgresql://newport:***@localhost:5432/newport?schema=public"
npm run db:generate -w @newport/api                 # أنواع Prisma
cd apps/api && npx prisma migrate deploy            # 1) DDL Prisma  2) ترحيل الامتدادات/RLS/الviews
npm run seed -w @newport/api                         # idempotent: الهيكل + 91 صلاحية + 21 دورًا + 36 منحًا + 23 مستخدمًا
# أو بالكامل عبر Docker:  docker compose -f deploy/docker-compose.yml up -d
```
لإعادة توليد ملفات التوثيق بعد أي تعديل على المخطط:
```bash
npm run db:ddl -w @newport/api                 # docs/generated/schema.postgres.sql
npm run docs:schema -w @newport/api            # docs/generated/schema.catalog.md
npm run matrix -w @newport/domain              # docs/generated/permissions.matrix.{json,md}
```
