# كتالوج المخطط (مولّد)

> يولَّد هذا الملف من `apps/api/prisma/schema.prisma` — لا يُحرَّر يدويًا.
> الأمر: `node apps/api/scripts/gen-schema-docs.mjs`

**الإجمالي:** 85 نموذج · 25 نوع عددي (enum) · جدول `sync_change_log` والتفاصيل في `schema.postgres.sql`.

## الجداول حسب المجموعة الوظيفية

### المرجع التنظيمي

الأقسام والشعب والورديات — المرجع الذي يُبنى عليه كل الصلاحيات

| نموذج Prisma | جدول PostgreSQL | أعمدة | قيود uniqueness | فهارس |
|---|---|---|---|---|
| `Company` | `companies` | 8 | 0 | 0 |
| `Facility` | `facilities` | 22 | 0 | 1 |
| `Department` | `departments` | 15 | 1 | 1 |
| `SubDepartment` | `sub_departments` | 22 | 1 | 1 |
| `Position` | `positions` | 15 | 1 | 0 |
### الموظفون والصلاحيات

RBAC/ABAC: أدوار، منح شعبة×دور، أجهزة، جلسات

| نموذج Prisma | جدول PostgreSQL | أعمدة | قيود uniqueness | فهارس |
|---|---|---|---|---|
| `User` | `users` | 46 | 0 | 3 |
| `Role` | `roles` | 12 | 0 | 0 |
| `RolePermission` | `role_permissions` | 4 | 0 | 0 |
| `RoleSubDeptGrant` | `role_subdept_grants` | 9 | 1 | 0 |
| `RefreshToken` | `refresh_tokens` | 11 | 0 | 1 |
| `Device` | `devices` | 15 | 0 | 1 |
### الأصول والصيانة

أوامر العمل، قطع الغيار، التصاريح، الصيانة الوقائية

| نموذج Prisma | جدول PostgreSQL | أعمدة | قيود uniqueness | فهارس |
|---|---|---|---|---|
| `Asset` | `assets` | 36 | 0 | 2 |
| `WorkOrder` | `work_orders` | 51 | 0 | 6 |
| `AssetReading` | `asset_readings` | 16 | 0 | 1 |
| `PermitToWork` | `permits_to_work` | 19 | 0 | 3 |
| `Document` | `documents` | 24 | 0 | 3 |
### الإنتاج

سجلات الوردية وقراءات العمليات والأعطال والإنذارات

| نموذج Prisma | جدول PostgreSQL | أعمدة | قيود uniqueness | فهارس |
|---|---|---|---|---|
| `ProductionUnit` | `production_units` | 6 | 0 | 0 |
### المختبر

العيّنات والنتائج والمواصفات وحالات عدم المطابقة

| نموذج Prisma | جدول PostgreSQL | أعمدة | قيود uniqueness | فهارس |
|---|---|---|---|---|
| `CalibrationRecord` | `calibration_records` | 10 | 0 | 1 |
| `LabParameter` | `lab_parameters` | 10 | 0 | 0 |
| `LabSample` | `lab_samples` | 20 | 0 | 1 |
| `LabResult` | `lab_results` | 16 | 1 | 1 |
### الحضور والبصمة

جهاز البصمة، التقييم اليومي، التصحيحات، الإجازات

| نموذج Prisma | جدول PostgreSQL | أعمدة | قيود uniqueness | فهارس |
|---|---|---|---|---|
| `Employee` | `employees` | 28 | 0 | 1 |
| `AttendancePunch` | `attendance_punches` | 12 | 1 | 1 |
| `AttendanceDailySummary` | `attendance_daily_summaries` | 20 | 1 | 1 |
| `AttendanceCorrection` | `attendance_corrections` | 13 | 0 | 1 |
| `LeaveRequest` | `leave_requests` | 16 | 0 | 2 |
### التجارة والمالية

الطلبات والفواتير والتكاليف والمقاولون

| نموذج Prisma | جدول PostgreSQL | أعمدة | قيود uniqueness | فهارس |
|---|---|---|---|---|
| `Customer` | `customers` | 18 | 0 | 0 |
| `SalesOrder` | `sales_orders` | 23 | 0 | 2 |
| `SalesOrderLine` | `sales_order_lines` | 12 | 0 | 2 |
| `CostCenter` | `cost_centers` | 6 | 0 | 0 |
| `BudgetLine` | `budget_lines` | 12 | 1 | 0 |
### المخزون

المخازن والحركات والأوامر الشرائية

| نموذج Prisma | جدول PostgreSQL | أعمدة | قيود uniqueness | فهارس |
|---|---|---|---|---|
| `Warehouse` | `warehouses` | 10 | 0 | 0 |
| `StockItem` | `stock_items` | 20 | 0 | 1 |
| `StockMovement` | `stock_movements` | 14 | 0 | 2 |
| `StockCount` | `stock_counts` | 8 | 0 | 1 |
| `PurchaseOrder` | `purchase_orders` | 13 | 0 | 1 |
### المستندات والتدفقات

إدارة المستندات والنماذج الميدانية والإشعارات

| نموذج Prisma | جدول PostgreSQL | أعمدة | قيود uniqueness | فهارس |
|---|---|---|---|---|
| `MobileFormRecord` | `mobile_form_records` | 18 | 0 | 2 |
| `Notification` | `notifications` | 14 | 0 | 1 |
### المزامنة والتدقيق

Change Feed، منع التكرار، التعارضات، سجل التدقيق، اللقطات

| نموذج Prisma | جدول PostgreSQL | أعمدة | قيود uniqueness | فهارس |
|---|---|---|---|---|
| `AuditTrail` | `audit_trails` | 14 | 0 | 3 |
| `SyncChangeLog` | `sync_change_log` | 12 | 0 | 3 |
| `SyncIdempotency` | `sync_idempotency` | 6 | 0 | 1 |
| `SyncConflict` | `sync_conflicts` | 12 | 0 | 2 |
| `AppSetting` | `app_settings` | 7 | 0 | 0 |
| `IntegrationConfig` | `integration_configs` | 10 | 0 | 0 |
### أخرى


| نموذج Prisma | جدول | أعمدة | uniqueness | فهارس |
|---|---|---|---|---|
| `Permission` | `permissions` | 9 | 0 | 1 |
| `UserRole` | `user_roles` | 11 | 1 | 1 |
| `Delegation` | `delegations` | 12 | 0 | 1 |
| `Approval` | `approvals` | 7 | 1 | 1 |
| `ApprovalStep` | `approval_steps` | 11 | 1 | 0 |
| `ShiftPattern` | `shift_patterns` | 13 | 0 | 0 |
| `ShiftAssignment` | `shift_assignments` | 8 | 1 | 1 |
| `PsvTestRecord` | `psv_test_records` | 13 | 0 | 1 |
| `AssetInspection` | `asset_inspections` | 8 | 0 | 1 |
| `ProductionShiftLog` | `production_shift_logs` | 29 | 1 | 1 |
| `ProcessParameter` | `process_parameters` | 10 | 0 | 2 |
| `ProductionAlarm` | `production_alarms` | 12 | 0 | 1 |
| `EquipmentDowntime` | `equipment_downtimes` | 17 | 0 | 2 |
| `LabSpec` | `lab_specs` | 8 | 1 | 0 |
| `LabOosCase` | `lab_oos_cases` | 11 | 0 | 1 |
| `WoLog` | `wo_logs` | 10 | 0 | 1 |
| `WoLaborEntry` | `wo_labor_entries` | 9 | 0 | 2 |
| `PartRequisition` | `part_requisitions` | 14 | 0 | 1 |
| `PartRequisitionLine` | `part_requisition_lines` | 10 | 0 | 1 |
| `PmPlan` | `pm_plans` | 20 | 0 | 1 |
| `PmPlanInstance` | `pm_plan_instances` | 8 | 1 | 1 |
| `SafetyIncident` | `safety_incidents` | 14 | 0 | 1 |
| `Bin` | `bins` | 6 | 1 | 0 |
| `StockBalance` | `stock_balances` | 12 | 0 | 1 |
| `Grn` | `grns` | 13 | 0 | 1 |
| `GrnLine` | `grn_lines` | 9 | 0 | 1 |
| `MaterialIssue` | `material_issues` | 8 | 0 | 1 |
| `MaterialIssueLine` | `material_issue_lines` | 9 | 0 | 1 |
| `BiometricDevice` | `biometric_devices` | 11 | 0 | 0 |
| `MobileForm` | `mobile_forms` | 14 | 1 | 0 |
| `MobileFormDeployment` | `mobile_form_deployments` | 7 | 1 | 0 |
| `Contract` | `contracts` | 12 | 0 | 1 |
| `SalesInvoice` | `sales_invoices` | 11 | 0 | 1 |
| `ExchangeRate` | `exchange_rates` | 6 | 1 | 0 |
| `Account` | `accounts` | 12 | 0 | 1 |
| `JournalEntry` | `journal_entries` | 14 | 0 | 2 |
| `JournalLine` | `journal_lines` | 10 | 0 | 2 |
| `Vendor` | `vendors` | 12 | 0 | 0 |
| `PurchaseRequisition` | `purchase_requisitions` | 15 | 0 | 1 |
| `PayrollRun` | `payroll_runs` | 12 | 1 | 0 |
| `PayrollLine` | `payroll_lines` | 13 | 1 | 0 |

## الأنواع العددية (enums)

- **DeptKind** (2): TECHNICAL, ADMIN
- **SubDeptKind** (13): UREA, AMMONIA, COOLING_TOWER, LAB, HEAT_EQUIPMENT, ROTATING_EQUIPMENT, ELECTRICAL, VALVE, INSTRUMENTATION, GENERAL_MAINTENANCE, BIOMETRIC, COMMERCIAL, FINANCE
- **JobStatus** (5): ACTIVE, SUSPENDED, TERMINATED, CONTRACTOR, VISITOR
- **ScopeKind** (6): NONE, SELF, TEAM, SUBDEPT, DEPT, ALL
- **Platform** (4): WIN, ANDROID, IOS, WEB
- **ApprovalStatus** (4): PENDING, APPROVED, REJECTED, CANCELLED
- **Criticality** (4): CRITICAL, HIGH, NORMAL, LOW
- **AssetStatus** (6): OPERATIONAL, STANDBY, UNDER_MAINTENANCE, DEFECTIVE, ISOLATED, DECOMMISSIONED
- **LogStatus** (4): DRAFT, SUBMITTED, APPROVED, LOCKED
- **DowntimeKind** (8): PLANNED_SHUTDOWN, PLANNED_MAINTENANCE, UNPLANNED_MAINTENANCE, OPERATIONAL, UTILITY_GAS, ELECTRICAL_TRIP, ENVIRONMENTAL, EXTERNAL
- **SampleStatus** (7): COLLECTED, IN_QUEUE, ANALYZING, RESULTED, VERIFIED, REJECTED, VOIDED
- **WoStatus** (12): DRAFT, SUBMITTED, APPROVED, ASSIGNED, IN_PROGRESS, ON_HOLD, AWAITING_PARTS, AWAITING_PERMIT, COMPLETED, CLOSED, CANCELLED, REJECTED
- **WoPriority** (6): EMERGENCY, URGENT, HIGH, MEDIUM, LOW, ROUTINE_PM
- **WoSource** (6): SHIFT_LOG, LAB, INSPECTION, PM, BREAKDOWN, MANAGEMENT
- **PmStrategy** (4): TIME_BASED, METER_BASED, CONDITION_BASED, FAILURE_FINDER
- **IntervalUom** (5): DAY, WEEK, MONTH, RUN_HOUR, START
- **PermitType** (8): HOT_WORK, COLD_WORK, CONFINED_SPACE, WORKING_AT_HEIGHT, EXCAVATION, ELECTRICAL_ISO, NDE, LIFTING
- **PermitStatus** (8): REQUESTED, AWAITING_ISOLATION, APPROVED_BY_AREA, APPROVED_BY_HSE, OPEN, EXTENDED, CLOSED, CANCELLED
- **MovementKind** (9): GRN, ISSUE, RETURN, TRANSFER_IN, TRANSFER_OUT, SCRAP, COUNT_ADJUST, RESERVE, UNRESERVE
- **PunchType** (4): IN, OUT, BREAK_OUT, BREAK_IN
- **PunchSource** (4): DEVICE, MOBILE, MANUAL, IMPORT
- **LeaveType** (8): ANNUAL, SICK, HAJJ, MATERNITY, UNPAID, MISSION, EMERGENCY, DAY_OFF_SWAP
- **LeaveStatus** (4): PENDING, APPROVED, REJECTED, CANCELLED
- **AccountType** (5): ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE
- **SyncOp** (2): UPSERT, DELETE

## تفاصيل النماذج (الحقول كاملة)

> قاعدة تسمية صارمة: `@@map` يحوّل اسم الجدول إلى snake_case، أما الأعمدة فتبقى camelCase بين علامتي اقتباس في أي SQL خام.

#### `Company` → جدول `companies`

```prisma
  id             String     @id @default(uuid(7)) @db.Uuid
  nameAr         String     @db.VarChar(160)
  nameEn         String     @db.VarChar(160)
  registrationNo String?    @db.VarChar(64)
  taxNo          String?    @db.VarChar(32)
  country        String     @default("IQ") @db.VarChar(2)
  createdAt      DateTime   @default(now())
  facilities     Facility[]

```

#### `Facility` → جدول `facilities`

```prisma
  id          String    @id @default(uuid(7)) @db.Uuid
  companyId   String    @db.Uuid
  code        String    @unique @db.VarChar(24) // BFC-L1
  nameAr      String    @db.VarChar(200)
  nameEn      String    @db.VarChar(200)
  cityAr      String?   @db.VarChar(80)
  timezone    String    @default("Asia/Baghdad") @db.VarChar(40)
  capacityTpd Decimal?  @db.Decimal(12, 2)
  startDate   DateTime?
  isActive    Boolean   @default(true)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  company     Company              @relation(fields: [companyId], references: [id])
  departments Department[]
  positions   Position[]
  users       User[]
  assets      Asset[]
  shiftLogs   ProductionShiftLog[]
  workOrders  WorkOrder[]
  documents   Document[]
  auditTrails AuditTrail[]
  changeLog   SyncChangeLog[]
@@index([companyId, isActive])
```

#### `Department` → جدول `departments`

```prisma
  id             String   @id @default(uuid(7)) @db.Uuid
  facilityId     String   @db.Uuid
  code           String   @db.VarChar(16) // PROD | MAINT | ADMIN
  nameAr         String   @db.VarChar(120)
  nameEn         String   @db.VarChar(120)
  kind           DeptKind @default(TECHNICAL)
  costCenterCode String?  @db.VarChar(24)
  headUserId     String?  @db.Uuid
  sortOrder      Int      @default(0)
  isActive       Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  facility       Facility        @relation(fields: [facilityId], references: [id], onDelete: Cascade)
  subDepartments SubDepartment[]
  users          User[]
@@unique([facilityId, code])
@@index([facilityId, isActive])
```

#### `SubDepartment` → جدول `sub_departments`

```prisma
  id             String      @id @default(uuid(7)) @db.Uuid
  departmentId   String      @db.Uuid
  code           String      @db.VarChar(24) // PROD-UREA …
  nameAr         String      @db.VarChar(120)
  nameEn         String      @db.VarChar(120)
  kind           SubDeptKind
  isFieldWork    Boolean     @default(false)
  costCenterCode String?     @db.VarChar(24)
  headUserId     String?     @db.Uuid
  sortOrder      Int         @default(0)
  isActive       Boolean     @default(true)
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt
  department      Department             @relation(fields: [departmentId], references: [id], onDelete: Cascade)
  positions       Position[]
  users           User[]
  roleGrants      RoleSubDeptGrant[]
  workOrders      WorkOrder[]
  assets          Asset[]
  labSamples      LabSample[]
  employees       Employee[]
  formDeployments MobileFormDeployment[]
@@unique([departmentId, code])
@@index([isActive, kind])
```

#### `Position` → جدول `positions`

```prisma
  id               String  @id @default(uuid(7)) @db.Uuid
  facilityId       String  @db.Uuid
  subDeptId        String  @db.Uuid
  parentPositionId String? @db.Uuid
  code             String  @db.VarChar(32)
  nameAr           String  @db.VarChar(120)
  nameEn           String  @db.VarChar(120)
  isSupervisory    Boolean @default(false)
  isShiftCritical  Boolean @default(false)
  isActive         Boolean @default(true)
  facility Facility      @relation(fields: [facilityId], references: [id])
  subDept  SubDepartment @relation(fields: [subDeptId], references: [id], onDelete: Cascade)
  parent   Position?     @relation("PositionTree", fields: [parentPositionId], references: [id])
  children Position[]    @relation("PositionTree")
  users    User[]
@@unique([subDeptId, code])
```

#### `User` → جدول `users`

```prisma
  id             String    @id @default(uuid(7)) @db.Uuid
  facilityId     String    @db.Uuid
  username       String    @unique @db.VarChar(64)
  passwordHash   String    @db.VarChar(120)
  fullNameAr     String    @db.VarChar(160)
  fullNameEn     String?   @db.VarChar(160)
  email          String?   @db.VarChar(160)
  phone          String?   @db.VarChar(32)
  employeeId     String?   @unique @db.Uuid
  positionId     String?   @db.Uuid
  departmentId   String    @db.Uuid
  subDeptId      String    @db.Uuid
  shiftId        String?   @db.Uuid
  badgeNo        String?   @db.VarChar(32)
  punchId        String?   @db.VarChar(32)
  language       String    @default("ar") @db.VarChar(8)
  theme          String    @default("dark") @db.VarChar(8)
  jobStatus      JobStatus @default(ACTIVE)
  isMfaEnabled   Boolean   @default(false)
  lastLoginAt    DateTime?
  lastSyncAt     DateTime?
  syncCursor     BigInt    @default(0)
  failedAttempts Int       @default(0)
  lockedUntil    DateTime?
  mustChangePwd  Boolean   @default(false)
  version        Int       @default(1)
  syncSeq        BigInt?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  deletedAt      DateTime?
  facility           Facility       @relation(fields: [facilityId], references: [id])
  department         Department     @relation(fields: [departmentId], references: [id])
  subDept            SubDepartment  @relation(fields: [subDeptId], references: [id])
  position           Position?      @relation(fields: [positionId], references: [id])
  employee           Employee?      @relation(fields: [employeeId], references: [id])
  shift              ShiftPattern?  @relation(fields: [shiftId], references: [id])
  roles              UserRole[]
  tokens             RefreshToken[]
  devices            Device[]
  approvals          ApprovalStep[] @relation("Approver")
  delegationsFrom    Delegation[]   @relation("Delegator")
  delegatesTo        Delegation[]   @relation("Delegate")
  auditTrails        AuditTrail[]
  workOrdersCreated  WorkOrder[]    @relation("WOCreatedBy")
  workOrdersAssigned WorkOrder[]    @relation("WOAssignedTo")
  notifications      Notification[]
@@index([subDeptId, jobStatus])
@@index([departmentId])
@@index([punchId])
```

#### `Role` → جدول `roles`

```prisma
  id            String    @id @default(uuid(7)) @db.Uuid
  code          String    @unique @db.VarChar(40)
  nameAr        String    @db.VarChar(120)
  nameEn        String    @db.VarChar(120)
  defaultScope  ScopeKind @default(SUBDEPT)
  isSystem      Boolean   @default(true)
  descriptionAr String?   @db.VarChar(500)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  permissions   RolePermission[]
  users         UserRole[]
  subDeptGrants RoleSubDeptGrant[]

```

#### `Permission` → جدول `permissions`

```prisma
  id               String    @id @default(uuid(7)) @db.Uuid
  code             String    @unique @db.VarChar(64)
  module           String    @db.VarChar(24)
  action           String    @db.VarChar(24)
  nameAr           String    @db.VarChar(200)
  nameEn           String    @db.VarChar(200)
  maxScope         ScopeKind @default(SUBDEPT)
  isOfflineCapable Boolean   @default(false)
  roles RolePermission[]
@@index([module, action])
```

#### `RolePermission` → جدول `role_permissions`

```prisma
  roleId       String @db.Uuid
  permissionId String @db.Uuid
  role       Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)
@@id([roleId, permissionId])
```

#### `UserRole` → جدول `user_roles`

```prisma
  id                String    @id @default(uuid(7)) @db.Uuid
  userId            String    @db.Uuid
  roleId            String    @db.Uuid
  scopeKind         ScopeKind @default(SUBDEPT)
  scopeDepartmentId String?   @db.Uuid
  scopeSubDeptId    String?   @db.Uuid
  grantedById       String?   @db.Uuid
  grantedAt         DateTime  @default(now())
  expiresAt         DateTime?
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  role Role @relation(fields: [roleId], references: [id], onDelete: Cascade)
@@unique([userId, roleId, scopeKind, scopeSubDeptId, scopeDepartmentId])
@@index([roleId])
```

#### `RoleSubDeptGrant` → جدول `role_subdept_grants`

```prisma
  id        String    @id @default(uuid(7)) @db.Uuid
  subDeptId String    @db.Uuid
  roleId    String    @db.Uuid
  scopeKind ScopeKind @default(SUBDEPT)
  isDefault Boolean   @default(true)
  denyJson  Json?
  extraJson Json?
  subDept SubDepartment @relation(fields: [subDeptId], references: [id], onDelete: Cascade)
  role    Role          @relation(fields: [roleId], references: [id], onDelete: Cascade)
@@unique([subDeptId, roleId])
```

#### `RefreshToken` → جدول `refresh_tokens`

```prisma
  id        String    @id @default(uuid(7)) @db.Uuid
  userId    String    @db.Uuid
  tokenHash String    @unique @db.VarChar(128)
  familyId  String    @db.Uuid
  deviceId  String?   @db.VarChar(64)
  ip        String?   @db.VarChar(45)
  userAgent String?   @db.VarChar(250)
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime  @default(now())
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
@@index([userId, expiresAt])
```

#### `Device` → جدول `devices`

```prisma
  id             String    @id @default(uuid(7)) @db.Uuid
  externalId     String    @unique @db.VarChar(64)
  userId         String    @db.Uuid
  platform       Platform
  appVersion     String?   @db.VarChar(24)
  deviceName     String?   @db.VarChar(120)
  pushToken      String?   @db.VarChar(255)
  pushProvider   String?   @db.VarChar(16)
  lastSeenAt     DateTime  @default(now())
  lastSyncAt     DateTime?
  lastPullCursor BigInt    @default(0)
  pendingOps     Int       @default(0)
  isTrusted      Boolean   @default(true)
  createdAt      DateTime  @default(now())
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
@@index([userId, platform])
```

#### `Delegation` → جدول `delegations`

```prisma
  id          String         @id @default(uuid(7)) @db.Uuid
  fromUserId  String         @db.Uuid
  toUserId    String         @db.Uuid
  roleId      String         @db.Uuid
  subDeptId   String?        @db.Uuid
  permissions Json?
  startAt     DateTime
  endAt       DateTime
  reasonAr    String         @db.VarChar(400)
  status      ApprovalStatus @default(PENDING)
  fromUser User @relation("Delegator", fields: [fromUserId], references: [id])
  toUser   User @relation("Delegate", fields: [toUserId], references: [id])
@@index([fromUserId, startAt, endAt])
```

#### `Approval` → جدول `approvals`

```prisma
  id          String         @id @default(uuid(7)) @db.Uuid
  entityType  String         @db.VarChar(48)
  entityId    String         @db.Uuid
  policyCode  String         @db.VarChar(48)
  status      ApprovalStatus @default(PENDING)
  completedAt DateTime?
  steps ApprovalStep[]
@@unique([entityType, entityId, policyCode])
@@index([status])
```

#### `ApprovalStep` → جدول `approval_steps`

```prisma
  id               String         @id @default(uuid(7)) @db.Uuid
  approvalId       String         @db.Uuid
  orderNo          Int
  approverUserId   String?        @db.Uuid
  approverRoleCode String?        @db.VarChar(40)
  status           ApprovalStatus @default(PENDING)
  commentAr        String?        @db.VarChar(500)
  actedAt          DateTime?
  isDelegated      Boolean        @default(false)
  approval Approval @relation(fields: [approvalId], references: [id], onDelete: Cascade)
  approver User?    @relation("Approver", fields: [approverUserId], references: [id])
@@unique([approvalId, orderNo])
```

#### `ShiftPattern` → جدول `shift_patterns`

```prisma
  id                   String  @id @default(uuid(7)) @db.Uuid
  code                 String  @unique @db.VarChar(8)
  nameAr               String  @db.VarChar(80)
  startLocal           String  @db.VarChar(5)
  endLocal             String  @db.VarChar(5)
  isOvernight          Boolean @default(false)
  graceMinutes         Int     @default(15)
  lateThresholdMinutes Int     @default(30)
  otMinMinutes         Int     @default(60)
  nightDiffPct         Decimal @default(0) @db.Decimal(5, 2)
  isActive             Boolean @default(true)
  users       User[]
  assignments ShiftAssignment[]

```

#### `ShiftAssignment` → جدول `shift_assignments`

```prisma
  id         String   @id @default(uuid(7)) @db.Uuid
  employeeId String   @db.Uuid
  shiftId    String   @db.Uuid
  workDate   DateTime @db.Date
  unitCode   String?  @db.VarChar(24)
  noteAr     String?  @db.VarChar(200)
  shift    ShiftPattern @relation(fields: [shiftId], references: [id])
  employee Employee     @relation(fields: [employeeId], references: [id], onDelete: Cascade)
@@unique([employeeId, workDate])
@@index([workDate, shiftId])
```

#### `ProductionUnit` → جدول `production_units`

```prisma
  id        String  @id @default(uuid(7)) @db.Uuid
  code      String  @unique @db.VarChar(24) // AMMONIA | UREA | COOLING_TOWER | UTILITY | LAB
  nameAr    String  @db.VarChar(120)
  subDeptId String? @db.Uuid
  assets    Asset[]
  shiftLogs ProductionShiftLog[]

```

#### `Asset` → جدول `assets`

```prisma
  id             String      @id @default(uuid(7)) @db.Uuid
  facilityId     String      @db.Uuid
  parentId       String?     @db.Uuid
  unitId         String?     @db.Uuid
  tag            String      @unique @db.VarChar(64)
  nameAr         String      @db.VarChar(200)
  nameEn         String?     @db.VarChar(200)
  classCode      String      @db.VarChar(16)
  subDeptId      String?     @db.Uuid
  locationPath   String?     @db.VarChar(200)
  qrCode         String?     @db.VarChar(64)
  manufacturer   String?     @db.VarChar(120)
  modelNo        String?     @db.VarChar(120)
  serialNo       String?     @db.VarChar(64)
  criticality    Criticality @default(NORMAL)
  status         AssetStatus @default(OPERATIONAL)
  installDate    DateTime?
  designData     Json?
  costCenterCode String?     @db.VarChar(24)
  version        Int         @default(1)
  syncSeq        BigInt?
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt
  deletedAt      DateTime?
  facility    Facility            @relation(fields: [facilityId], references: [id])
  parent      Asset?              @relation("AssetTree", fields: [parentId], references: [id])
  children    Asset[]             @relation("AssetTree")
  unit        ProductionUnit?     @relation(fields: [unitId], references: [id])
  subDept     SubDepartment?      @relation(fields: [subDeptId], references: [id])
  pmPlans     PmPlan[]
  workOrders  WorkOrder[]
  readings    AssetReading[]
  psvTests    PsvTestRecord[]
  inspections AssetInspection[]
  downtime    EquipmentDowntime[]
  calibration CalibrationRecord[]
@@index([subDeptId, status])
@@index([classCode])
```

#### `PsvTestRecord` → جدول `psv_test_records`

```prisma
  id               String    @id @default(uuid(7)) @db.Uuid
  assetId          String    @db.Uuid
  testDate         DateTime
  benchNo          String?   @db.VarChar(32)
  setPressureBar   Decimal   @db.Decimal(8, 3)
  popPressureBar   Decimal?  @db.Decimal(8, 3)
  reseatedBar      Decimal?  @db.Decimal(8, 3)
  result           String    @db.VarChar(24) // PASS | FAIL | REPAIRED
  nextTestDue      DateTime?
  technicianUserId String?   @db.Uuid
  workOrderId      String?   @db.Uuid
  remarksAr        String?   @db.VarChar(500)
  asset Asset @relation(fields: [assetId], references: [id])
@@index([assetId, testDate])
```

#### `AssetInspection` → جدول `asset_inspections`

```prisma
  id              String   @id @default(uuid(7)) @db.Uuid
  assetId         String   @db.Uuid
  type            String   @db.VarChar(32) // NDT | THICKNESS | VISUAL | THERMOGRAPHY
  inspectedAt     DateTime
  resultJson      Json
  findingsAr      String?  @db.VarChar(1000)
  inspectorUserId String   @db.Uuid
  asset Asset @relation(fields: [assetId], references: [id])
@@index([assetId, inspectedAt])
```

#### `CalibrationRecord` → جدول `calibration_records`

```prisma
  id               String    @id @default(uuid(7)) @db.Uuid
  assetId          String    @db.Uuid
  loopTag          String?   @db.VarChar(48)
  calibratedAt     DateTime
  dueAt            DateTime?
  asFound          Json?
  asLeft           Json?
  isPass           Boolean   @default(true)
  technicianUserId String    @db.Uuid
  asset Asset @relation(fields: [assetId], references: [id])
@@index([assetId, dueAt])
```

#### `ProductionShiftLog` → جدول `production_shift_logs`

```prisma
  id                String    @id @default(uuid(7)) @db.Uuid
  facilityId        String    @db.Uuid
  unitId            String    @db.Uuid
  shiftDate         DateTime  @db.Date
  shiftCode         String    @db.VarChar(8)
  preparedById      String    @db.Uuid
  status            LogStatus @default(DRAFT)
  productionTons    Decimal?  @db.Decimal(12, 3)
  designRateTph     Decimal?  @db.Decimal(10, 3)
  availabilityPct   Decimal?  @db.Decimal(5, 2)
  downtimeHours     Decimal?  @db.Decimal(7, 2)
  lopiCount         Int       @default(0)
  gasSupplyIssueMin Decimal?  @db.Decimal(8, 2)
  eventsJson        Json?
  notes             String?   @db.Text
  approvedById      String?   @db.Uuid
  approvedAt        DateTime?
  isOfflineCreated  Boolean   @default(false)
  version           Int       @default(1)
  syncSeq           BigInt?
  clientOpId        String?   @db.VarChar(64)
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  deletedAt         DateTime?
  facility   Facility           @relation(fields: [facilityId], references: [id])
  unit       ProductionUnit     @relation(fields: [unitId], references: [id])
  parameters ProcessParameter[]
  labSamples LabSample[]
  workOrders WorkOrder[]
@@unique([unitId, shiftDate, shiftCode])
@@index([facilityId, shiftDate])
```

#### `ProcessParameter` → جدول `process_parameters`

```prisma
  id        String   @id @default(uuid(7)) @db.Uuid
  logId     String?  @db.Uuid
  assetId   String?  @db.Uuid
  paramCode String   @db.VarChar(40)
  value     Decimal  @db.Decimal(14, 4)
  unit      String?  @db.VarChar(16)
  at        DateTime
  isAlarm   Boolean  @default(false)
  source    String   @default("MANUAL") @db.VarChar(16)
  log ProductionShiftLog? @relation(fields: [logId], references: [id], onDelete: SetNull)
@@index([paramCode, at])
@@index([assetId, at])
```

#### `ProductionAlarm` → جدول `production_alarms`

```prisma
  id          String    @id @default(uuid(7)) @db.Uuid
  assetId     String?   @db.Uuid
  tag         String    @db.VarChar(64)
  message     String    @db.VarChar(400)
  severity    String    @db.VarChar(16)
  triggeredAt DateTime
  ackAt       DateTime?
  ackById     String?   @db.Uuid
  actionAr    String?   @db.VarChar(600)
  workOrderId String?   @db.Uuid
  version     Int       @default(1)
  syncSeq     BigInt?
@@index([triggeredAt, severity])
```

#### `EquipmentDowntime` → جدول `equipment_downtimes`

```prisma
  id           String       @id @default(uuid(7)) @db.Uuid
  assetId      String?      @db.Uuid
  unitCode     String       @db.VarChar(24)
  startAt      DateTime
  endAt        DateTime?
  hours        Decimal?     @db.Decimal(8, 2)
  kind         DowntimeKind
  causeCode    String?      @db.VarChar(32)
  causeNotes   String?      @db.Text
  lostTons     Decimal?     @db.Decimal(10, 3)
  workOrderId  String?      @db.Uuid
  loggedById   String       @db.Uuid
  verifiedById String?      @db.Uuid
  verifiedAt   DateTime?
  version      Int          @default(1)
  syncSeq      BigInt?
  asset Asset? @relation(fields: [assetId], references: [id])
@@index([unitCode, startAt])
@@index([assetId, startAt])
```

#### `LabParameter` → جدول `lab_parameters`

```prisma
  id        String   @id @default(uuid(7)) @db.Uuid
  code      String   @unique @db.VarChar(32)
  nameAr    String   @db.VarChar(160)
  unit      String?  @db.VarChar(16)
  method    String?  @db.VarChar(80)
  specMin   Decimal? @db.Decimal(14, 5)
  specMax   Decimal? @db.Decimal(14, 5)
  appliesTo String   @db.VarChar(32)
  results LabResult[]
  specs   LabSpec[]

```

#### `LabSpec` → جدول `lab_specs`

```prisma
  id            String   @id @default(uuid(7)) @db.Uuid
  parameterId   String   @db.Uuid
  productCode   String   @db.VarChar(32)
  grade         String   @default("TECHNICAL") @db.VarChar(32)
  minVal        Decimal? @db.Decimal(14, 5)
  maxVal        Decimal? @db.Decimal(14, 5)
  effectiveFrom DateTime @db.Date
  parameter LabParameter @relation(fields: [parameterId], references: [id])
@@unique([parameterId, productCode, grade, effectiveFrom])
```

#### `LabSample` → جدول `lab_samples`

```prisma
  id            String       @id @default(uuid(7)) @db.Uuid
  sampleNumber  String       @unique @db.VarChar(32)
  subDeptId     String       @db.Uuid
  unitCode      String       @db.VarChar(24)
  sampleType    String       @db.VarChar(40)
  pointTag      String?      @db.VarChar(48)
  collectedById String       @db.Uuid
  collectedAt   DateTime
  status        SampleStatus @default(COLLECTED)
  logId         String?      @db.Uuid
  isFastTracked Boolean      @default(false)
  integrityJson Json?
  workOrderId   String?      @db.Uuid
  version       Int          @default(1)
  syncSeq       BigInt?
  createdAt     DateTime     @default(now())
  deletedAt     DateTime?
  subDept SubDepartment       @relation(fields: [subDeptId], references: [id])
  log     ProductionShiftLog? @relation(fields: [logId], references: [id])
  results LabResult[]
@@index([subDeptId, status, collectedAt])
```

#### `LabResult` → جدول `lab_results`

```prisma
  id           String    @id @default(uuid(7)) @db.Uuid
  sampleId     String    @db.Uuid
  parameterId  String    @db.Uuid
  value        Decimal   @db.Decimal(14, 5)
  unit         String?   @db.VarChar(16)
  isOutOfSpec  Boolean   @default(false)
  method       String?   @db.VarChar(80)
  remarks      String?   @db.VarChar(600)
  enteredById  String    @db.Uuid
  enteredAt    DateTime  @default(now())
  verifiedById String?   @db.Uuid
  verifiedAt   DateTime?
  version      Int       @default(1)
  syncSeq      BigInt?
  sample    LabSample    @relation(fields: [sampleId], references: [id], onDelete: Cascade)
  parameter LabParameter @relation(fields: [parameterId], references: [id])
@@unique([sampleId, parameterId])
@@index([isOutOfSpec])
```

#### `LabOosCase` → جدول `lab_oos_cases`

```prisma
  id          String    @id @default(uuid(7)) @db.Uuid
  code        String    @unique @db.VarChar(32)
  sampleId    String    @db.Uuid
  resultId    String?   @db.Uuid
  severity    String    @db.VarChar(16)
  rootCauseAr String?   @db.Text
  capaAr      String?   @db.Text
  status      String    @default("OPEN") @db.VarChar(24)
  openedById  String    @db.Uuid
  closedAt    DateTime?
  createdAt   DateTime  @default(now())
@@index([status, severity])
```

#### `WorkOrder` → جدول `work_orders`

```prisma
  id               String     @id @default(uuid(7)) @db.Uuid
  number           String?    @unique @db.VarChar(32)
  facilityId       String     @db.Uuid
  assetId          String?    @db.Uuid
  subDeptId        String?    @db.Uuid
  departmentId     String     @db.Uuid
  title            String     @db.VarChar(200)
  description      String     @db.Text
  status           WoStatus   @default(DRAFT)
  priority         WoPriority @default(MEDIUM)
  sourceType       WoSource   @default(MANAGEMENT)
  sourceRef        String?    @db.VarChar(64)
  logId            String?    @db.Uuid
  permitId         String?    @db.Uuid
  createdById      String     @db.Uuid
  assignedToId     String?    @db.Uuid
  approverId       String?    @db.Uuid
  isSafetyCritical Boolean    @default(false)
  requirePermit    Boolean    @default(false)
  planStartAt      DateTime?
  planEndAt        DateTime?
  targetEndAt      DateTime?
  actualStartAt    DateTime?
  actualEndAt      DateTime?
  estHours         Decimal?   @db.Decimal(8, 2)
  laborHours       Decimal?   @db.Decimal(8, 2)
  partsCost        Decimal?   @db.Decimal(16, 2)
  laborCost        Decimal?   @db.Decimal(16, 2)
  contractorCost   Decimal?   @db.Decimal(16, 2)
  currency         String     @default("IQD") @db.VarChar(3)
  costCenterCode   String?    @db.VarChar(24)
  rootCause        String?    @db.VarChar(32)
  closeNotes       String?    @db.Text
  reworkCount      Int        @default(0)
  isOfflineCreated Boolean    @default(false)
  clientOpId       String?    @db.VarChar(64)
  version          Int        @default(1)
  syncSeq          BigInt?
  createdAt        DateTime   @default(now())
  updatedAt        DateTime   @updatedAt
  deletedAt        DateTime?
  facility     Facility            @relation(fields: [facilityId], references: [id])
  asset        Asset?              @relation(fields: [assetId], references: [id])
  subDept      SubDepartment?      @relation(fields: [subDeptId], references: [id])
  createdBy    User                @relation("WOCreatedBy", fields: [createdById], references: [id])
  assignedTo   User?               @relation("WOAssignedTo", fields: [assignedToId], references: [id])
  log          ProductionShiftLog? @relation(fields: [logId], references: [id])
  requisitions PartRequisition[]   @relation("WoRequisitions")
  labor        WoLaborEntry[]
  logs         WoLog[]
  readings     AssetReading[]
@@index([subDeptId, status, priority])
@@index([assetId, status])
@@index([status, targetEndAt])
@@index([createdById])
@@index([permitId])
@@index([syncSeq])
```

#### `WoLog` → جدول `wo_logs`

```prisma
  id            String   @id @default(uuid(7)) @db.Uuid
  woId          String   @db.Uuid
  at            DateTime @default(now())
  byUserId      String   @db.Uuid
  fromStatus    String?  @db.VarChar(24)
  toStatus      String?  @db.VarChar(24)
  textAr        String   @db.VarChar(1200)
  isFromOffline Boolean  @default(false)
  photos        Json?
  wo WorkOrder @relation(fields: [woId], references: [id], onDelete: Cascade)
@@index([woId, at])
```

#### `WoLaborEntry` → جدول `wo_labor_entries`

```prisma
  id         String   @id @default(uuid(7)) @db.Uuid
  woId       String   @db.Uuid
  employeeId String   @db.Uuid
  workDate   DateTime @db.Date
  shiftCode  String?  @db.VarChar(8)
  hours      Decimal  @db.Decimal(6, 2)
  isOvertime Boolean  @default(false)
  rate       Decimal? @db.Decimal(12, 2)
  wo WorkOrder @relation(fields: [woId], references: [id], onDelete: Cascade)
@@index([woId])
@@index([employeeId, workDate])
```

#### `PartRequisition` → جدول `part_requisitions`

```prisma
  id             String    @id @default(uuid(7)) @db.Uuid
  number         String?   @unique @db.VarChar(32)
  woId           String?   @db.Uuid
  costCenterCode String?   @db.VarChar(24)
  purpose        String?   @db.VarChar(400)
  status         String    @default("SUBMITTED") @db.VarChar(24)
  requestedById  String    @db.Uuid
  approvedById   String?   @db.Uuid
  approvedAt     DateTime?
  version        Int       @default(1)
  syncSeq        BigInt?
  createdAt      DateTime  @default(now())
  wo    WorkOrder?            @relation("WoRequisitions", fields: [woId], references: [id])
  lines PartRequisitionLine[]
@@index([status, createdAt])
```

#### `PartRequisitionLine` → جدول `part_requisition_lines`

```prisma
  id             String  @id @default(uuid(7)) @db.Uuid
  requisitionId  String  @db.Uuid
  itemId         String  @db.Uuid
  qtyRequested   Decimal @db.Decimal(12, 3)
  qtyIssued      Decimal @default(0) @db.Decimal(12, 3)
  uom            String  @db.VarChar(12)
  isSubstituted  Boolean @default(false)
  substituteNote String? @db.VarChar(300)
  requisition PartRequisition @relation(fields: [requisitionId], references: [id], onDelete: Cascade)
  item        StockItem       @relation(fields: [itemId], references: [id])
@@index([requisitionId])
```

#### `PmPlan` → جدول `pm_plans`

```prisma
  id              String      @id @default(uuid(7)) @db.Uuid
  code            String      @unique @db.VarChar(32)
  assetId         String      @db.Uuid
  titleAr         String      @db.VarChar(200)
  instructionAr   String?     @db.Text
  strategy        PmStrategy  @default(TIME_BASED)
  intervalValue   Int
  intervalUom     IntervalUom @default(DAY)
  meterTag        String?     @db.VarChar(48)
  estHours        Decimal?    @db.Decimal(6, 2)
  requiredTrades  Json?
  billOfMaterials Json?
  safetyNotesAr   String?     @db.Text
  nextDueAt       DateTime?
  lastDoneAt      DateTime?
  isSapSynced     Boolean     @default(false)
  sapPlanId       String?     @db.VarChar(32)
  isActive        Boolean     @default(true)
  asset     Asset            @relation(fields: [assetId], references: [id])
  instances PmPlanInstance[]
@@index([nextDueAt, isActive])
```

#### `PmPlanInstance` → جدول `pm_plan_instances`

```prisma
  id          String   @id @default(uuid(7)) @db.Uuid
  planId      String   @db.Uuid
  dueAt       DateTime
  status      String   @default("DUE") @db.VarChar(16)
  workOrderId String?  @db.Uuid
  version     Int      @default(1)
  syncSeq     BigInt?
  plan PmPlan @relation(fields: [planId], references: [id], onDelete: Cascade)
@@unique([planId, dueAt])
@@index([status, dueAt])
```

#### `AssetReading` → جدول `asset_readings`

```prisma
  id         String   @id @default(uuid(7)) @db.Uuid
  assetId    String   @db.Uuid
  woId       String?  @db.Uuid
  kind       String   @db.VarChar(24)
  measuredAt DateTime
  byUserId   String   @db.Uuid
  location   String?  @db.VarChar(48)
  valuesJson Json
  unit       String   @db.VarChar(16)
  isAlarm    Boolean  @default(false)
  photos     Json?
  gps        Json?
  version    Int      @default(1)
  syncSeq    BigInt?
  asset Asset      @relation(fields: [assetId], references: [id])
  wo    WorkOrder? @relation(fields: [woId], references: [id])
@@index([assetId, kind, measuredAt])
```

#### `PermitToWork` → جدول `permits_to_work`

```prisma
  id              String       @id @default(uuid(7)) @db.Uuid
  permitNumber    String       @unique @db.VarChar(32)
  workOrderId     String?      @db.Uuid
  type            PermitType
  areaDescription String       @db.VarChar(600)
  validFrom       DateTime
  validTo         DateTime
  status          PermitStatus @default(REQUESTED)
  requestedById   String       @db.Uuid
  areaApproverId  String?      @db.Uuid
  hseApproverId   String?      @db.Uuid
  isolationJson   Json?
  gasTestsJson    Json?
  precautionsJson Json?
  crewJson        Json
  closedAt        DateTime?
  closureNotes    String?      @db.VarChar(800)
  version         Int          @default(1)
  syncSeq         BigInt?
@@index([workOrderId])
@@index([status, validTo])
@@index([type, validFrom])
```

#### `SafetyIncident` → جدول `safety_incidents`

```prisma
  id                String   @id @default(uuid(7)) @db.Uuid
  code              String   @unique @db.VarChar(32)
  occurredAt        DateTime
  severity          String   @db.VarChar(24)
  category          String   @db.VarChar(32)
  descriptionAr     String   @db.Text
  immediateActionAr String?  @db.Text
  rootCauseAr       String?  @db.Text
  correctiveActions Json?
  areaAssetId       String?  @db.Uuid
  reportedById      String   @db.Uuid
  status            String   @default("OPEN") @db.VarChar(24)
  workOrderId       String?  @db.Uuid
  createdAt         DateTime @default(now())
@@index([occurredAt, severity])
```

#### `Warehouse` → جدول `warehouses`

```prisma
  id             String  @id @default(uuid(7)) @db.Uuid
  code           String  @unique @db.VarChar(24)
  nameAr         String  @db.VarChar(160)
  whType         String  @db.VarChar(24) // MAIN | FIELD | CONTRACTOR | SCRAP | HAZMAT
  locationAr     String? @db.VarChar(200)
  keeperUserId   String? @db.Uuid
  accessSubDepts Json? // قائمة الشعب المسموح لها بالصرف من هذا المخزن
  isActive       Boolean @default(true)
  bins     Bin[]
  balances StockBalance[]

```

#### `Bin` → جدول `bins`

```prisma
  id          String  @id @default(uuid(7)) @db.Uuid
  warehouseId String  @db.Uuid
  code        String  @db.VarChar(32)
  label       String? @db.VarChar(80)
  isBulk      Boolean @default(false)
  warehouse Warehouse @relation(fields: [warehouseId], references: [id], onDelete: Cascade)
@@unique([warehouseId, code])
```

#### `StockItem` → جدول `stock_items`

```prisma
  id                  String   @id @default(uuid(7)) @db.Uuid
  partNumber          String   @unique @db.VarChar(64)
  nameAr              String   @db.VarChar(240)
  nameEn              String?  @db.VarChar(240)
  uom                 String   @db.VarChar(12)
  materialGrade       String?  @db.VarChar(64)
  category            String   @db.VarChar(48)
  isCriticalSpare     Boolean  @default(false)
  isCustodyControlled Boolean  @default(false)
  shelfLifeDays       Int?
  stdUnitCost         Decimal? @db.Decimal(16, 2)
  currency            String   @default("IQD") @db.VarChar(3)
  sapMaterialNo       String?  @db.VarChar(24)
  specs               Json?
  isActive            Boolean  @default(true)
  createdAt           DateTime @default(now())
  balances StockBalance[]
  reqLines PartRequisitionLine[]
  grnLines GrnLine[]
  miLines  MaterialIssueLine[]
@@index([category, isCriticalSpare])
```

#### `StockBalance` → جدول `stock_balances`

```prisma
  itemId       String    @db.Uuid
  warehouseId  String    @db.Uuid
  onHandQty    Decimal   @default(0) @db.Decimal(14, 3)
  reservedQty  Decimal   @default(0) @db.Decimal(14, 3)
  minLevel     Decimal?  @db.Decimal(14, 3)
  maxLevel     Decimal?  @db.Decimal(14, 3)
  reorderPoint Decimal?  @db.Decimal(14, 3)
  valuation    Decimal?  @db.Decimal(16, 2)
  lastCountAt  DateTime?
  updatedAt    DateTime  @updatedAt
  item      StockItem @relation(fields: [itemId], references: [id], onDelete: Cascade)
  warehouse Warehouse @relation(fields: [warehouseId], references: [id], onDelete: Cascade)
@@id([itemId, warehouseId])
@@index([warehouseId])
```

#### `StockMovement` → جدول `stock_movements`

```prisma
  id          String       @id @default(uuid(7)) @db.Uuid
  itemId      String       @db.Uuid
  warehouseId String       @db.Uuid
  binId       String?      @db.Uuid
  kind        MovementKind
  qty         Decimal      @db.Decimal(14, 3)
  unitCost    Decimal?     @db.Decimal(16, 4)
  currency    String?      @db.VarChar(3)
  refType     String?      @db.VarChar(32)
  refId       String?      @db.Uuid
  docNo       String?      @db.VarChar(32)
  at          DateTime     @default(now())
  byUserId    String       @db.Uuid
  noteAr      String?      @db.VarChar(300)
@@index([itemId, at])
@@index([refType, refId])
```

#### `Grn` → جدول `grns`

```prisma
  id              String   @id @default(uuid(7)) @db.Uuid
  number          String   @unique @db.VarChar(32)
  poLineRef       String?  @db.VarChar(48)
  vendorId        String?  @db.Uuid
  vendor          Vendor?  @relation(fields: [vendorId], references: [id])
  warehouseId     String   @db.Uuid
  receivedAt      DateTime
  qualitySignById String?  @db.Uuid
  storeSignById   String?  @db.Uuid
  status          String   @default("DRAFT") @db.VarChar(24)
  vehicleNo       String?  @db.VarChar(32)
  notesAr         String?  @db.VarChar(600)
  lines GrnLine[]
@@index([receivedAt, status])
```

#### `GrnLine` → جدول `grn_lines`

```prisma
  id         String   @id @default(uuid(7)) @db.Uuid
  grnId      String   @db.Uuid
  itemId     String   @db.Uuid
  qty        Decimal  @db.Decimal(14, 3)
  uom        String   @db.VarChar(12)
  unitCost   Decimal? @db.Decimal(16, 4)
  serialJson Json?
  grn  Grn       @relation(fields: [grnId], references: [id], onDelete: Cascade)
  item StockItem @relation(fields: [itemId], references: [id])
@@index([grnId])
```

#### `MaterialIssue` → جدول `material_issues`

```prisma
  id             String   @id @default(uuid(7)) @db.Uuid
  number         String   @unique @db.VarChar(32)
  requisitionId  String?  @db.Uuid
  workOrderId    String?  @db.Uuid
  issuedToUserId String   @db.Uuid
  issuedAt       DateTime
  status         String   @default("DRAFT") @db.VarChar(24)
  lines MaterialIssueLine[]
@@index([issuedAt])
```

#### `MaterialIssueLine` → جدول `material_issue_lines`

```prisma
  id           String  @id @default(uuid(7)) @db.Uuid
  issueId      String  @db.Uuid
  itemId       String  @db.Uuid
  qtyRequested Decimal @db.Decimal(14, 3)
  qtyIssued    Decimal @db.Decimal(14, 3)
  qtyReturned  Decimal @default(0) @db.Decimal(14, 3)
  binId        String? @db.Uuid
  issue MaterialIssue @relation(fields: [issueId], references: [id], onDelete: Cascade)
  item  StockItem     @relation(fields: [itemId], references: [id])
@@index([issueId])
```

#### `StockCount` → جدول `stock_counts`

```prisma
  id               String   @id @default(uuid(7)) @db.Uuid
  warehouseId      String   @db.Uuid
  countedAt        DateTime
  scopeJson        Json?
  linesJson        Json
  status           String   @default("OPEN") @db.VarChar(16)
  postedByUserId   String   @db.Uuid
  approvedByUserId String?  @db.Uuid
@@index([warehouseId, countedAt])
```

#### `Employee` → جدول `employees`

```prisma
  id                  String    @id @default(uuid(7)) @db.Uuid
  employeeNumber      String    @unique @db.VarChar(24)
  civilId             String?   @db.VarChar(24)
  nationality         String?   @db.VarChar(48)
  birthDate           DateTime?
  gender              String?   @db.VarChar(8)
  hireDate            DateTime
  terminationDate     DateTime?
  jobTitleAr          String?   @db.VarChar(120)
  jobLevel            String?   @db.VarChar(24)
  contractType        String?   @db.VarChar(24)
  subDeptId           String    @db.Uuid
  punchId             String?   @db.VarChar(32)
  badgeNo             String?   @db.VarChar(32)
  isBiometricEnrolled Boolean   @default(false)
  baseSalary          Decimal?  @db.Decimal(14, 2)
  currency            String    @default("IQD") @db.VarChar(3)
  allowancesJson      Json?
  bankAccount         String?   @db.VarChar(40)
  emergencyJson       Json?
  user             User?
  shiftAssignments ShiftAssignment[]
  leaveRequests    LeaveRequest[]
  corrections      AttendanceCorrection[]
  payrollLines     PayrollLine[]
  punches          AttendancePunch[]
  dailySummaries   AttendanceDailySummary[]
  subDept          SubDepartment            @relation(fields: [subDeptId], references: [id])
@@index([subDeptId])
```

#### `BiometricDevice` → جدول `biometric_devices`

```prisma
  id              String    @id @default(uuid(7)) @db.Uuid
  code            String    @unique @db.VarChar(32)
  nameAr          String    @db.VarChar(160)
  model           String?   @db.VarChar(64)
  ip              String?   @db.VarChar(45)
  port            Int?
  locationAr      String?   @db.VarChar(200)
  pullIntervalSec Int       @default(300)
  lastPullAt      DateTime?
  status          String    @default("ONLINE") @db.VarChar(16)
  pushes AttendancePunch[]

```

#### `AttendancePunch` → جدول `attendance_punches`

```prisma
  id          String      @id @default(uuid(7)) @db.Uuid
  deviceId    String?     @db.Uuid
  employeeId  String      @db.Uuid
  punchedAt   DateTime
  punchType   PunchType
  verifyMode  String?     @db.VarChar(16)
  rawRecordId String?     @db.VarChar(64)
  source      PunchSource @default(DEVICE)
  matchStatus String      @default("OK") @db.VarChar(16)
  syncSeq     BigInt?
  device   BiometricDevice? @relation(fields: [deviceId], references: [id])
  employee Employee         @relation(fields: [employeeId], references: [id])
@@unique([deviceId, rawRecordId])
@@index([employeeId, punchedAt])
```

#### `AttendanceDailySummary` → جدول `attendance_daily_summaries`

```prisma
  id                 String    @id @default(uuid(7)) @db.Uuid
  employeeId         String    @db.Uuid
  workDate           DateTime  @db.Date
  shiftCode          String?   @db.VarChar(8)
  firstInAt          DateTime?
  lastOutAt          DateTime?
  workedMinutes      Int       @default(0)
  scheduledMinutes   Int       @default(0)
  lateMinutes        Int       @default(0)
  earlyOutMinutes    Int       @default(0)
  overtimeMinutes    Int       @default(0)
  nightDiffPct       Decimal   @default(0) @db.Decimal(5, 2)
  fridayMultiplier   Decimal   @default(1) @db.Decimal(3, 1)
  status             String    @db.VarChar(24)
  exceptionsJson     Json?
  punchCount         Int       @default(0)
  reconciliationHash String?   @db.VarChar(16)
  isLocked           Boolean   @default(false)
  calculatedAt       DateTime  @default(now())
  employee Employee @relation(fields: [employeeId], references: [id])
@@unique([employeeId, workDate])
@@index([workDate, status])
```

#### `AttendanceCorrection` → جدول `attendance_corrections`

```prisma
  id                String    @id @default(uuid(7)) @db.Uuid
  employeeId        String    @db.Uuid
  workDate          DateTime  @db.Date
  type              String    @db.VarChar(24)
  reasonAr          String    @db.VarChar(600)
  inTimeOverride    DateTime?
  outTimeOverride   DateTime?
  otMinutesApproved Int?
  status            String    @default("PENDING") @db.VarChar(16)
  requestedById     String    @db.Uuid
  decidedById       String?   @db.Uuid
  decidedAt         DateTime?
  employee Employee @relation(fields: [employeeId], references: [id])
@@index([status, workDate])
```

#### `LeaveRequest` → جدول `leave_requests`

```prisma
  id              String      @id @default(uuid(7)) @db.Uuid
  employeeId      String      @db.Uuid
  type            LeaveType
  fromAt          DateTime
  toAt            DateTime
  daysCount       Decimal?    @db.Decimal(6, 2)
  isPartial       Boolean     @default(false)
  reasonAr        String?     @db.VarChar(600)
  attachmentDocId String?     @db.Uuid
  status          LeaveStatus @default(PENDING)
  approverUserId  String?     @db.Uuid
  decidedAt       DateTime?
  version         Int         @default(1)
  syncSeq         BigInt?
  createdAt       DateTime    @default(now())
  employee Employee @relation(fields: [employeeId], references: [id])
@@index([employeeId, status])
@@index([fromAt])
```

#### `MobileForm` → جدول `mobile_forms`

```prisma
  id                 String    @id @default(uuid(7)) @db.Uuid
  code               String    @db.VarChar(64)
  version            Int       @default(1)
  nameAr             String    @db.VarChar(200)
  jsonSchema         Json
  uiSchema           Json?
  targetSubDeptCodes Json?
  publishStatus      String    @default("DRAFT") @db.VarChar(16)
  isOfflineAllowed   Boolean   @default(true)
  requiresGps        Boolean   @default(false)
  requiresSignature  Boolean   @default(false)
  publishedAt        DateTime?
  deployments MobileFormDeployment[]
  records     MobileFormRecord[]
@@unique([code, version])
```

#### `MobileFormDeployment` → جدول `mobile_form_deployments`

```prisma
  id            String  @id @default(uuid(7)) @db.Uuid
  formId        String  @db.Uuid
  subDeptId     String  @db.Uuid
  isMandatory   Boolean @default(false)
  frequencyCron String? @db.VarChar(40)
  form    MobileForm    @relation(fields: [formId], references: [id], onDelete: Cascade)
  subDept SubDepartment @relation(fields: [subDeptId], references: [id], onDelete: Cascade)
@@unique([formId, subDeptId])
```

#### `MobileFormRecord` → جدول `mobile_form_records`

```prisma
  id                String   @id @default(uuid(7)) @db.Uuid
  formId            String   @db.Uuid
  formCode          String   @db.VarChar(64)
  formVersion       Int
  employeeId        String?  @db.Uuid
  assetId           String?  @db.Uuid
  workOrderId       String?  @db.Uuid
  readings          Json
  photos            Json?
  gps               Json?
  signatureDocId    String?  @db.Uuid
  offlineCapturedAt DateTime
  submittedAt       DateTime @default(now())
  deviceId          String?  @db.VarChar(64)
  clientOpId        String?  @db.VarChar(64)
  version           Int      @default(1)
  syncSeq           BigInt?
  form MobileForm @relation(fields: [formId], references: [id])
@@index([formCode, submittedAt])
@@index([assetId])
```

#### `Customer` → جدول `customers`

```prisma
  id            String   @id @default(uuid(7)) @db.Uuid
  code          String   @unique @db.VarChar(32)
  nameAr        String   @db.VarChar(200)
  nameEn        String?  @db.VarChar(200)
  customerType  String   @db.VarChar(24)
  taxNo         String?  @db.VarChar(32)
  addressAr     String?  @db.VarChar(400)
  contactPerson String?  @db.VarChar(120)
  phone         String?  @db.VarChar(32)
  email         String?  @db.VarChar(120)
  creditLimit   Decimal? @db.Decimal(18, 2)
  creditUsed    Decimal  @default(0) @db.Decimal(18, 2)
  currency      String   @default("IQD") @db.VarChar(3)
  sapCustomerNo String?  @db.VarChar(16)
  isActive      Boolean  @default(true)
  orders    SalesOrder[]
  invoices  SalesInvoice[]
  contracts Contract[]

```

#### `Contract` → جدول `contracts`

```prisma
  id           String   @id @default(uuid(7)) @db.Uuid
  number       String   @unique @db.VarChar(48)
  customerId   String   @db.Uuid
  startDate    DateTime @db.Date
  endDate      DateTime @db.Date
  productCode  String   @db.VarChar(32)
  quantityTons Decimal  @db.Decimal(14, 3)
  pricePerTon  Decimal? @db.Decimal(16, 2)
  currency     String   @default("USD") @db.VarChar(3)
  termsAr      String?  @db.Text
  status       String   @default("ACTIVE") @db.VarChar(16)
  customer Customer @relation(fields: [customerId], references: [id])
@@index([customerId, endDate])
```

#### `SalesOrder` → جدول `sales_orders`

```prisma
  id               String    @id @default(uuid(7)) @db.Uuid
  number           String?   @unique @db.VarChar(32)
  customerId       String    @db.Uuid
  contractId       String?   @db.Uuid
  orderDate        DateTime  @db.Date
  productCode      String    @db.VarChar(32)
  qtyOrderedTons   Decimal   @db.Decimal(14, 3)
  qtyDeliveredTons Decimal   @default(0) @db.Decimal(14, 3)
  pricePerTon      Decimal   @db.Decimal(16, 2)
  currency         String    @default("IQD") @db.VarChar(3)
  fxRate           Decimal?  @db.Decimal(12, 4)
  truckCount       Int       @default(0)
  gatePassNo       String?   @db.VarChar(48)
  depotAr          String?   @db.VarChar(120)
  status           String    @default("OPEN") @db.VarChar(24)
  createdBy        String    @db.Uuid
  confirmedBy      String?   @db.Uuid
  confirmedAt      DateTime?
  version          Int       @default(1)
  syncSeq          BigInt?
  createdAt        DateTime  @default(now())
  customer Customer         @relation(fields: [customerId], references: [id])
  lines    SalesOrderLine[]
@@index([orderDate, status])
@@index([customerId, status])
```

#### `SalesOrderLine` → جدول `sales_order_lines`

```prisma
  id            String    @id @default(uuid(7)) @db.Uuid
  orderId       String    @db.Uuid
  truckPlate    String?   @db.VarChar(24)
  driverName    String?   @db.VarChar(120)
  ticketInNo    String?   @db.VarChar(32)
  ticketOutNo   String?   @db.VarChar(32)
  grossWeightKg Decimal?  @db.Decimal(12, 1)
  tareWeightKg  Decimal?  @db.Decimal(12, 1)
  netWeightKg   Decimal?  @db.Decimal(12, 1)
  loadedAt      DateTime?
  labSampleId   String?   @db.Uuid
  so SalesOrder @relation(fields: [orderId], references: [id], onDelete: Cascade)
@@index([orderId])
@@index([ticketOutNo])
```

#### `SalesInvoice` → جدول `sales_invoices`

```prisma
  id          String   @id @default(uuid(7)) @db.Uuid
  number      String   @unique @db.VarChar(32)
  orderId     String?  @db.Uuid
  customerId  String   @db.Uuid
  invoiceDate DateTime
  amount      Decimal  @db.Decimal(18, 2)
  taxAmount   Decimal  @default(0) @db.Decimal(18, 2)
  currency    String   @default("IQD") @db.VarChar(3)
  status      String   @default("OPEN") @db.VarChar(16)
  journalId   String?  @db.Uuid
  customer Customer @relation(fields: [customerId], references: [id])
@@index([invoiceDate, status])
```

#### `ExchangeRate` → جدول `exchange_rates`

```prisma
  id            String   @id @default(uuid(7)) @db.Uuid
  fromCode      String   @db.VarChar(3)
  toCode        String   @db.VarChar(3)
  rate          Decimal  @db.Decimal(14, 6)
  effectiveDate DateTime @db.Date
  source        String   @db.VarChar(32)
@@unique([fromCode, toCode, effectiveDate])
```

#### `Account` → جدول `accounts`

```prisma
  id             String      @id @default(uuid(7)) @db.Uuid
  code           String      @unique @db.VarChar(24)
  nameAr         String      @db.VarChar(200)
  accType        AccountType
  parentId       String?     @db.Uuid
  isPosting      Boolean     @default(true)
  costCenterCode String?     @db.VarChar(24)
  isActive       Boolean     @default(true)
  parent      Account?      @relation("AccountTree", fields: [parentId], references: [id])
  children    Account[]     @relation("AccountTree")
  lines       JournalLine[]
  budgetLines BudgetLine[]
@@index([accType])
```

#### `CostCenter` → جدول `cost_centers`

```prisma
  id        String  @id @default(uuid(7)) @db.Uuid
  code      String  @unique @db.VarChar(24)
  nameAr    String  @db.VarChar(160)
  subDeptId String? @db.Uuid
  kind      String  @db.VarChar(24)
  budgetLines BudgetLine[]

```

#### `BudgetLine` → جدول `budget_lines`

```prisma
  id           String  @id @default(uuid(7)) @db.Uuid
  fiscalYear   Int
  costCenterId String  @db.Uuid
  accountId    String  @db.Uuid
  lineType     String  @db.VarChar(16)
  monthlyJson  Json
  totalAmount  Decimal @db.Decimal(18, 2)
  actualAmount Decimal @default(0) @db.Decimal(18, 2)
  approvedById String? @db.Uuid
  status       String  @default("DRAFT") @db.VarChar(16)
  costCenter CostCenter @relation(fields: [costCenterId], references: [id])
  account    Account    @relation(fields: [accountId], references: [id])
@@unique([fiscalYear, costCenterId, accountId, lineType])
```

#### `JournalEntry` → جدول `journal_entries`

```prisma
  id            String   @id @default(uuid(7)) @db.Uuid
  number        String?  @unique @db.VarChar(32)
  entryDate     DateTime @db.Date
  periodKey     String   @db.VarChar(7)
  descriptionAr String   @db.VarChar(500)
  sourceDocType String?  @db.VarChar(32)
  sourceDocId   String?  @db.Uuid
  currency      String   @default("IQD") @db.VarChar(3)
  fxRate        Decimal? @db.Decimal(14, 6)
  status        String   @default("POSTED") @db.VarChar(16)
  preparedById  String   @db.Uuid
  approvedById  String?  @db.Uuid
  createdAt     DateTime @default(now())
  lines JournalLine[]
@@index([entryDate, status])
@@index([sourceDocType, sourceDocId])
```

#### `JournalLine` → جدول `journal_lines`

```prisma
  id           String  @id @default(uuid(7)) @db.Uuid
  journalId    String  @db.Uuid
  accountId    String  @db.Uuid
  costCenterId String? @db.Uuid
  debit        Decimal @default(0) @db.Decimal(18, 2)
  credit       Decimal @default(0) @db.Decimal(18, 2)
  partnerAr    String? @db.VarChar(200)
  notesAr      String? @db.VarChar(400)
  journal JournalEntry @relation(fields: [journalId], references: [id], onDelete: Cascade)
  account Account      @relation(fields: [accountId], references: [id])
@@index([journalId])
@@index([accountId])
```

#### `Vendor` → جدول `vendors`

```prisma
  id                String  @id @default(uuid(7)) @db.Uuid
  code              String  @unique @db.VarChar(32)
  nameAr            String  @db.VarChar(200)
  vendorType        String  @db.VarChar(24)
  taxNo             String? @db.VarChar(32)
  phone             String? @db.VarChar(32)
  email             String? @db.VarChar(120)
  isBlacklisted     Boolean @default(false)
  qualificationJson Json?
  purchaseRequisitions PurchaseRequisition[]
  purchaseOrders       PurchaseOrder[]
  grns                 Grn[]

```

#### `PurchaseRequisition` → جدول `purchase_requisitions`

```prisma
  id             String    @id @default(uuid(7)) @db.Uuid
  number         String    @unique @db.VarChar(32)
  vendorId       String?   @db.Uuid
  costCenterCode String    @db.VarChar(24)
  subDeptCode    String?   @db.VarChar(24)
  reasonAr       String    @db.VarChar(600)
  isEmergency    Boolean   @default(false)
  linesJson      Json
  status         String    @default("OPEN") @db.VarChar(24)
  createdBy      String    @db.Uuid
  approvedBy     String?   @db.Uuid
  approvedAt     DateTime?
  createdAt      DateTime  @default(now())
  vendor Vendor?         @relation(fields: [vendorId], references: [id])
  pos    PurchaseOrder[]
@@index([status, createdAt])
```

#### `PurchaseOrder` → جدول `purchase_orders`

```prisma
  id              String   @id @default(uuid(7)) @db.Uuid
  number          String   @unique @db.VarChar(32)
  vendorId        String   @db.Uuid
  requisitionId   String?  @db.Uuid
  orderDate       DateTime @db.Date
  currency        String   @default("IQD") @db.VarChar(3)
  totalAmount     Decimal  @db.Decimal(18, 2)
  status          String   @default("DRAFT") @db.VarChar(24)
  deliveryTermsAr String?  @db.VarChar(400)
  linesJson       Json
  approvalsJson   Json?
  vendor      Vendor               @relation(fields: [vendorId], references: [id])
  requisition PurchaseRequisition? @relation(fields: [requisitionId], references: [id])
@@index([status, orderDate])
```

#### `PayrollRun` → جدول `payroll_runs`

```prisma
  id           String   @id @default(uuid(7)) @db.Uuid
  periodKey    String   @db.VarChar(7)
  startDate    DateTime @db.Date
  endDate      DateTime @db.Date
  scopeKind    String   @default("ALL") @db.VarChar(16)
  status       String   @default("DRAFT") @db.VarChar(16)
  grossTotal   Decimal  @default(0) @db.Decimal(18, 2)
  netTotal     Decimal  @default(0) @db.Decimal(18, 2)
  preparedById String   @db.Uuid
  approvedById String?  @db.Uuid
  journalId    String?  @db.Uuid
  lines PayrollLine[]
@@unique([periodKey, scopeKind])
```

#### `PayrollLine` → جدول `payroll_lines`

```prisma
  id            String   @id @default(uuid(7)) @db.Uuid
  runId         String   @db.Uuid
  employeeId    String   @db.Uuid
  baseAmount    Decimal  @db.Decimal(16, 2)
  allowanceJson Json?
  earningJson   Json?
  deductionJson Json?
  netAmount     Decimal  @db.Decimal(16, 2)
  workedDays    Decimal? @db.Decimal(6, 2)
  overtimeHours Decimal? @db.Decimal(7, 2)
  source        String   @default("ATTENDANCE") @db.VarChar(16)
  run      PayrollRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  employee Employee   @relation(fields: [employeeId], references: [id])
@@unique([runId, employeeId])
```

#### `Document` → جدول `documents`

```prisma
  id             String    @id @default(uuid(7)) @db.Uuid
  facilityId     String?   @db.Uuid
  code           String?   @db.VarChar(48)
  titleAr        String    @db.VarChar(240)
  docType        String    @db.VarChar(32)
  categoryCode   String?   @db.VarChar(32)
  objectKey      String    @db.VarChar(400)
  originalName   String    @db.VarChar(240)
  mimeType       String    @db.VarChar(80)
  sizeBytes      BigInt    @default(0)
  sha256         String?   @db.VarChar(64)
  revision       String?   @db.VarChar(12)
  status         String    @default("DRAFT") @db.VarChar(16)
  ownerSubDeptId String?   @db.Uuid
  entityType     String?   @db.VarChar(48)
  entityId       String?   @db.Uuid
  uploadedById   String    @db.Uuid
  uploadedAt     DateTime  @default(now())
  isEncrypted    Boolean   @default(false)
  version        Int       @default(1)
  syncSeq        BigInt?
  createdAt      DateTime  @default(now())
  deletedAt      DateTime?
  facility Facility? @relation(fields: [facilityId], references: [id])
@@index([entityType, entityId])
@@index([docType, status])
@@index([sha256])
```

#### `Notification` → جدول `notifications`

```prisma
  id         String    @id @default(uuid(7)) @db.Uuid
  userId     String    @db.Uuid
  type       String    @db.VarChar(40)
  level      String    @default("INFO") @db.VarChar(12)
  titleAr    String    @db.VarChar(200)
  bodyAr     String    @db.VarChar(600)
  payload    Json?
  entityType String?   @db.VarChar(48)
  entityId   String?   @db.Uuid
  sentVia    String?   @db.VarChar(40)
  isRead     Boolean   @default(false)
  readAt     DateTime?
  createdAt  DateTime  @default(now())
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
@@index([userId, isRead, createdAt])
```

#### `AuditTrail` → جدول `audit_trails`

```prisma
  id         BigInt   @id @default(autoincrement())
  facilityId String?  @db.Uuid
  at         DateTime @default(now())
  actorId    String?  @db.Uuid
  actorName  String?  @db.VarChar(160)
  action     String   @db.VarChar(32)
  entityType String   @db.VarChar(48)
  entityId   String?  @db.Uuid
  changes    Json?
  meta       Json?
  ip         String?  @db.VarChar(45)
  userAgent  String?  @db.VarChar(250)
  actor    User?     @relation(fields: [actorId], references: [id])
  facility Facility? @relation(fields: [facilityId], references: [id])
@@index([entityType, entityId, at])
@@index([actorId, at])
@@index([action, at])
```

#### `SyncChangeLog` → جدول `sync_change_log`

```prisma
  seq        BigInt   @id @default(autoincrement())
  facilityId String?  @db.Uuid
  entity     String   @db.VarChar(48)
  recordId   String   @db.Uuid
  op         SyncOp
  version    Int
  payload    Json
  actorId    String?  @db.Uuid
  deviceId   String?  @db.VarChar(64)
  subDeptId  String?  @db.Uuid
  at         DateTime @default(now())
  facility Facility? @relation(fields: [facilityId], references: [id])
@@index([entity, seq])
@@index([facilityId, seq])
@@index([at])
```

#### `SyncIdempotency` → جدول `sync_idempotency`

```prisma
  opId       String   @id @db.VarChar(64)
  deviceId   String   @db.VarChar(64)
  entity     String   @db.VarChar(48)
  recordId   String   @db.Uuid
  resultJson Json
  appliedAt  DateTime @default(now())
@@index([deviceId, appliedAt])
```

#### `SyncConflict` → جدول `sync_conflicts`

```prisma
  id         String    @id @default(uuid(7)) @db.Uuid
  entity     String    @db.VarChar(48)
  recordId   String    @db.Uuid
  deviceId   String    @db.VarChar(64)
  userId     String    @db.Uuid
  strategy   String    @db.VarChar(16)
  clientJson Json?
  serverJson Json?
  keptFields Json?
  resolvedBy String?   @db.Uuid
  resolvedAt DateTime?
  createdAt  DateTime  @default(now())
@@index([entity, createdAt])
@@index([userId, resolvedAt])
```

#### `AppSetting` → جدول `app_settings`

```prisma
  id        String    @id @default(uuid(7)) @db.Uuid
  key       String    @unique @db.VarChar(80)
  valueJson Json
  scopeKind ScopeKind @default(ALL)
  scopeId   String?   @db.Uuid
  updatedBy String?   @db.Uuid
  updatedAt DateTime  @updatedAt

```

#### `IntegrationConfig` → جدول `integration_configs`

```prisma
  id            String    @id @default(uuid(7)) @db.Uuid
  systemName    String    @unique @db.VarChar(40) // SAP | ZK_BIOMETRIC | HISTORIAN | SMS | MINIO
  mode          String    @default("PULL") @db.VarChar(16)
  endpoint      String?   @db.VarChar(400)
  credentialRef String?   @db.VarChar(120)
  scheduleCron  String?   @db.VarChar(40)
  mapJson       Json?
  isEnabled     Boolean   @default(false)
  lastRunAt     DateTime?
  lastError     String?   @db.VarChar(1000)

```

