-- CreateEnum
CREATE TYPE "DeptKind" AS ENUM ('TECHNICAL', 'ADMIN');

-- CreateEnum
CREATE TYPE "SubDeptKind" AS ENUM ('UREA', 'AMMONIA', 'COOLING_TOWER', 'LAB', 'HEAT_EQUIPMENT', 'ROTATING_EQUIPMENT', 'ELECTRICAL', 'VALVE', 'INSTRUMENTATION', 'GENERAL_MAINTENANCE', 'BIOMETRIC', 'COMMERCIAL', 'FINANCE');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'TERMINATED', 'CONTRACTOR', 'VISITOR');

-- CreateEnum
CREATE TYPE "ScopeKind" AS ENUM ('NONE', 'SELF', 'TEAM', 'SUBDEPT', 'DEPT', 'ALL');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('WIN', 'ANDROID', 'IOS', 'WEB');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Criticality" AS ENUM ('CRITICAL', 'HIGH', 'NORMAL', 'LOW');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('OPERATIONAL', 'STANDBY', 'UNDER_MAINTENANCE', 'DEFECTIVE', 'ISOLATED', 'DECOMMISSIONED');

-- CreateEnum
CREATE TYPE "LogStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'LOCKED');

-- CreateEnum
CREATE TYPE "DowntimeKind" AS ENUM ('PLANNED_SHUTDOWN', 'PLANNED_MAINTENANCE', 'UNPLANNED_MAINTENANCE', 'OPERATIONAL', 'UTILITY_GAS', 'ELECTRICAL_TRIP', 'ENVIRONMENTAL', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "SampleStatus" AS ENUM ('COLLECTED', 'IN_QUEUE', 'ANALYZING', 'RESULTED', 'VERIFIED', 'REJECTED', 'VOIDED');

-- CreateEnum
CREATE TYPE "WoStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'AWAITING_PARTS', 'AWAITING_PERMIT', 'COMPLETED', 'CLOSED', 'CANCELLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "WoPriority" AS ENUM ('EMERGENCY', 'URGENT', 'HIGH', 'MEDIUM', 'LOW', 'ROUTINE_PM');

-- CreateEnum
CREATE TYPE "WoSource" AS ENUM ('SHIFT_LOG', 'LAB', 'INSPECTION', 'PM', 'BREAKDOWN', 'MANAGEMENT');

-- CreateEnum
CREATE TYPE "PmStrategy" AS ENUM ('TIME_BASED', 'METER_BASED', 'CONDITION_BASED', 'FAILURE_FINDER');

-- CreateEnum
CREATE TYPE "IntervalUom" AS ENUM ('DAY', 'WEEK', 'MONTH', 'RUN_HOUR', 'START');

-- CreateEnum
CREATE TYPE "PermitType" AS ENUM ('HOT_WORK', 'COLD_WORK', 'CONFINED_SPACE', 'WORKING_AT_HEIGHT', 'EXCAVATION', 'ELECTRICAL_ISO', 'NDE', 'LIFTING');

-- CreateEnum
CREATE TYPE "PermitStatus" AS ENUM ('REQUESTED', 'AWAITING_ISOLATION', 'APPROVED_BY_AREA', 'APPROVED_BY_HSE', 'OPEN', 'EXTENDED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MovementKind" AS ENUM ('GRN', 'ISSUE', 'RETURN', 'TRANSFER_IN', 'TRANSFER_OUT', 'SCRAP', 'COUNT_ADJUST', 'RESERVE', 'UNRESERVE');

-- CreateEnum
CREATE TYPE "PunchType" AS ENUM ('IN', 'OUT', 'BREAK_OUT', 'BREAK_IN');

-- CreateEnum
CREATE TYPE "PunchSource" AS ENUM ('DEVICE', 'MOBILE', 'MANUAL', 'IMPORT');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('ANNUAL', 'SICK', 'HAJJ', 'MATERNITY', 'UNPAID', 'MISSION', 'EMERGENCY', 'DAY_OFF_SWAP');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "SyncOp" AS ENUM ('UPSERT', 'DELETE');

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "nameAr" VARCHAR(160) NOT NULL,
    "nameEn" VARCHAR(160) NOT NULL,
    "registrationNo" VARCHAR(64),
    "taxNo" VARCHAR(32),
    "country" VARCHAR(2) NOT NULL DEFAULT 'IQ',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facilities" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "code" VARCHAR(24) NOT NULL,
    "nameAr" VARCHAR(200) NOT NULL,
    "nameEn" VARCHAR(200) NOT NULL,
    "cityAr" VARCHAR(80),
    "timezone" VARCHAR(40) NOT NULL DEFAULT 'Asia/Baghdad',
    "capacityTpd" DECIMAL(12,2),
    "startDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "facilityId" UUID NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "nameAr" VARCHAR(120) NOT NULL,
    "nameEn" VARCHAR(120) NOT NULL,
    "kind" "DeptKind" NOT NULL DEFAULT 'TECHNICAL',
    "costCenterCode" VARCHAR(24),
    "headUserId" UUID,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_departments" (
    "id" UUID NOT NULL,
    "departmentId" UUID NOT NULL,
    "code" VARCHAR(24) NOT NULL,
    "nameAr" VARCHAR(120) NOT NULL,
    "nameEn" VARCHAR(120) NOT NULL,
    "kind" "SubDeptKind" NOT NULL,
    "isFieldWork" BOOLEAN NOT NULL DEFAULT false,
    "costCenterCode" VARCHAR(24),
    "headUserId" UUID,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sub_departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" UUID NOT NULL,
    "facilityId" UUID NOT NULL,
    "subDeptId" UUID NOT NULL,
    "parentPositionId" UUID,
    "code" VARCHAR(32) NOT NULL,
    "nameAr" VARCHAR(120) NOT NULL,
    "nameEn" VARCHAR(120) NOT NULL,
    "isSupervisory" BOOLEAN NOT NULL DEFAULT false,
    "isShiftCritical" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "facilityId" UUID NOT NULL,
    "username" VARCHAR(64) NOT NULL,
    "passwordHash" VARCHAR(120) NOT NULL,
    "fullNameAr" VARCHAR(160) NOT NULL,
    "fullNameEn" VARCHAR(160),
    "email" VARCHAR(160),
    "phone" VARCHAR(32),
    "employeeId" UUID,
    "positionId" UUID,
    "departmentId" UUID NOT NULL,
    "subDeptId" UUID NOT NULL,
    "shiftId" UUID,
    "badgeNo" VARCHAR(32),
    "punchId" VARCHAR(32),
    "language" VARCHAR(8) NOT NULL DEFAULT 'ar',
    "theme" VARCHAR(8) NOT NULL DEFAULT 'dark',
    "jobStatus" "JobStatus" NOT NULL DEFAULT 'ACTIVE',
    "isMfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "syncCursor" BIGINT NOT NULL DEFAULT 0,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "mustChangePwd" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncSeq" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "nameAr" VARCHAR(120) NOT NULL,
    "nameEn" VARCHAR(120) NOT NULL,
    "defaultScope" "ScopeKind" NOT NULL DEFAULT 'SUBDEPT',
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "descriptionAr" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "module" VARCHAR(24) NOT NULL,
    "action" VARCHAR(24) NOT NULL,
    "nameAr" VARCHAR(200) NOT NULL,
    "nameEn" VARCHAR(200) NOT NULL,
    "maxScope" "ScopeKind" NOT NULL DEFAULT 'SUBDEPT',
    "isOfflineCapable" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "scopeKind" "ScopeKind" NOT NULL DEFAULT 'SUBDEPT',
    "scopeDepartmentId" UUID,
    "scopeSubDeptId" UUID,
    "grantedById" UUID,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_subdept_grants" (
    "id" UUID NOT NULL,
    "subDeptId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "scopeKind" "ScopeKind" NOT NULL DEFAULT 'SUBDEPT',
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "denyJson" JSONB,
    "extraJson" JSONB,

    CONSTRAINT "role_subdept_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" VARCHAR(128) NOT NULL,
    "familyId" UUID NOT NULL,
    "deviceId" VARCHAR(64),
    "ip" VARCHAR(45),
    "userAgent" VARCHAR(250),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "externalId" VARCHAR(64) NOT NULL,
    "userId" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "appVersion" VARCHAR(24),
    "deviceName" VARCHAR(120),
    "pushToken" VARCHAR(255),
    "pushProvider" VARCHAR(16),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncAt" TIMESTAMP(3),
    "lastPullCursor" BIGINT NOT NULL DEFAULT 0,
    "pendingOps" INTEGER NOT NULL DEFAULT 0,
    "isTrusted" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delegations" (
    "id" UUID NOT NULL,
    "fromUserId" UUID NOT NULL,
    "toUserId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "subDeptId" UUID,
    "permissions" JSONB,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "reasonAr" VARCHAR(400) NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "delegations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approvals" (
    "id" UUID NOT NULL,
    "entityType" VARCHAR(48) NOT NULL,
    "entityId" UUID NOT NULL,
    "policyCode" VARCHAR(48) NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_steps" (
    "id" UUID NOT NULL,
    "approvalId" UUID NOT NULL,
    "orderNo" INTEGER NOT NULL,
    "approverUserId" UUID,
    "approverRoleCode" VARCHAR(40),
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "commentAr" VARCHAR(500),
    "actedAt" TIMESTAMP(3),
    "isDelegated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "approval_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_patterns" (
    "id" UUID NOT NULL,
    "code" VARCHAR(8) NOT NULL,
    "nameAr" VARCHAR(80) NOT NULL,
    "startLocal" VARCHAR(5) NOT NULL,
    "endLocal" VARCHAR(5) NOT NULL,
    "isOvernight" BOOLEAN NOT NULL DEFAULT false,
    "graceMinutes" INTEGER NOT NULL DEFAULT 15,
    "lateThresholdMinutes" INTEGER NOT NULL DEFAULT 30,
    "otMinMinutes" INTEGER NOT NULL DEFAULT 60,
    "nightDiffPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "shift_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_assignments" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "shiftId" UUID NOT NULL,
    "workDate" DATE NOT NULL,
    "unitCode" VARCHAR(24),
    "noteAr" VARCHAR(200),

    CONSTRAINT "shift_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_units" (
    "id" UUID NOT NULL,
    "code" VARCHAR(24) NOT NULL,
    "nameAr" VARCHAR(120) NOT NULL,
    "subDeptId" UUID,

    CONSTRAINT "production_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "facilityId" UUID NOT NULL,
    "parentId" UUID,
    "unitId" UUID,
    "tag" VARCHAR(64) NOT NULL,
    "nameAr" VARCHAR(200) NOT NULL,
    "nameEn" VARCHAR(200),
    "classCode" VARCHAR(16) NOT NULL,
    "subDeptId" UUID,
    "locationPath" VARCHAR(200),
    "qrCode" VARCHAR(64),
    "manufacturer" VARCHAR(120),
    "modelNo" VARCHAR(120),
    "serialNo" VARCHAR(64),
    "criticality" "Criticality" NOT NULL DEFAULT 'NORMAL',
    "status" "AssetStatus" NOT NULL DEFAULT 'OPERATIONAL',
    "installDate" TIMESTAMP(3),
    "designData" JSONB,
    "costCenterCode" VARCHAR(24),
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncSeq" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "psv_test_records" (
    "id" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "testDate" TIMESTAMP(3) NOT NULL,
    "benchNo" VARCHAR(32),
    "setPressureBar" DECIMAL(8,3) NOT NULL,
    "popPressureBar" DECIMAL(8,3),
    "reseatedBar" DECIMAL(8,3),
    "result" VARCHAR(24) NOT NULL,
    "nextTestDue" TIMESTAMP(3),
    "technicianUserId" UUID,
    "workOrderId" UUID,
    "remarksAr" VARCHAR(500),

    CONSTRAINT "psv_test_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_inspections" (
    "id" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "type" VARCHAR(32) NOT NULL,
    "inspectedAt" TIMESTAMP(3) NOT NULL,
    "resultJson" JSONB NOT NULL,
    "findingsAr" VARCHAR(1000),
    "inspectorUserId" UUID NOT NULL,

    CONSTRAINT "asset_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calibration_records" (
    "id" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "loopTag" VARCHAR(48),
    "calibratedAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3),
    "asFound" JSONB,
    "asLeft" JSONB,
    "isPass" BOOLEAN NOT NULL DEFAULT true,
    "technicianUserId" UUID NOT NULL,

    CONSTRAINT "calibration_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_shift_logs" (
    "id" UUID NOT NULL,
    "facilityId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "shiftDate" DATE NOT NULL,
    "shiftCode" VARCHAR(8) NOT NULL,
    "preparedById" UUID NOT NULL,
    "status" "LogStatus" NOT NULL DEFAULT 'DRAFT',
    "productionTons" DECIMAL(12,3),
    "designRateTph" DECIMAL(10,3),
    "availabilityPct" DECIMAL(5,2),
    "downtimeHours" DECIMAL(7,2),
    "lopiCount" INTEGER NOT NULL DEFAULT 0,
    "gasSupplyIssueMin" DECIMAL(8,2),
    "eventsJson" JSONB,
    "notes" TEXT,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "isOfflineCreated" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncSeq" BIGINT,
    "clientOpId" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "production_shift_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "process_parameters" (
    "id" UUID NOT NULL,
    "logId" UUID,
    "assetId" UUID,
    "paramCode" VARCHAR(40) NOT NULL,
    "value" DECIMAL(14,4) NOT NULL,
    "unit" VARCHAR(16),
    "at" TIMESTAMP(3) NOT NULL,
    "isAlarm" BOOLEAN NOT NULL DEFAULT false,
    "source" VARCHAR(16) NOT NULL DEFAULT 'MANUAL',

    CONSTRAINT "process_parameters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_alarms" (
    "id" UUID NOT NULL,
    "assetId" UUID,
    "tag" VARCHAR(64) NOT NULL,
    "message" VARCHAR(400) NOT NULL,
    "severity" VARCHAR(16) NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL,
    "ackAt" TIMESTAMP(3),
    "ackById" UUID,
    "actionAr" VARCHAR(600),
    "workOrderId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncSeq" BIGINT,

    CONSTRAINT "production_alarms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_downtimes" (
    "id" UUID NOT NULL,
    "assetId" UUID,
    "unitCode" VARCHAR(24) NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "hours" DECIMAL(8,2),
    "kind" "DowntimeKind" NOT NULL,
    "causeCode" VARCHAR(32),
    "causeNotes" TEXT,
    "lostTons" DECIMAL(10,3),
    "workOrderId" UUID,
    "loggedById" UUID NOT NULL,
    "verifiedById" UUID,
    "verifiedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncSeq" BIGINT,

    CONSTRAINT "equipment_downtimes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_parameters" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "nameAr" VARCHAR(160) NOT NULL,
    "unit" VARCHAR(16),
    "method" VARCHAR(80),
    "specMin" DECIMAL(14,5),
    "specMax" DECIMAL(14,5),
    "appliesTo" VARCHAR(32) NOT NULL,

    CONSTRAINT "lab_parameters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_specs" (
    "id" UUID NOT NULL,
    "parameterId" UUID NOT NULL,
    "productCode" VARCHAR(32) NOT NULL,
    "grade" VARCHAR(32) NOT NULL DEFAULT 'TECHNICAL',
    "minVal" DECIMAL(14,5),
    "maxVal" DECIMAL(14,5),
    "effectiveFrom" DATE NOT NULL,

    CONSTRAINT "lab_specs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_samples" (
    "id" UUID NOT NULL,
    "sampleNumber" VARCHAR(32) NOT NULL,
    "subDeptId" UUID NOT NULL,
    "unitCode" VARCHAR(24) NOT NULL,
    "sampleType" VARCHAR(40) NOT NULL,
    "pointTag" VARCHAR(48),
    "collectedById" UUID NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL,
    "status" "SampleStatus" NOT NULL DEFAULT 'COLLECTED',
    "logId" UUID,
    "isFastTracked" BOOLEAN NOT NULL DEFAULT false,
    "integrityJson" JSONB,
    "workOrderId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncSeq" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "lab_samples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_results" (
    "id" UUID NOT NULL,
    "sampleId" UUID NOT NULL,
    "parameterId" UUID NOT NULL,
    "value" DECIMAL(14,5) NOT NULL,
    "unit" VARCHAR(16),
    "isOutOfSpec" BOOLEAN NOT NULL DEFAULT false,
    "method" VARCHAR(80),
    "remarks" VARCHAR(600),
    "enteredById" UUID NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedById" UUID,
    "verifiedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncSeq" BIGINT,

    CONSTRAINT "lab_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_oos_cases" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "sampleId" UUID NOT NULL,
    "resultId" UUID,
    "severity" VARCHAR(16) NOT NULL,
    "rootCauseAr" TEXT,
    "capaAr" TEXT,
    "status" VARCHAR(24) NOT NULL DEFAULT 'OPEN',
    "openedById" UUID NOT NULL,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_oos_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_orders" (
    "id" UUID NOT NULL,
    "number" VARCHAR(32),
    "facilityId" UUID NOT NULL,
    "assetId" UUID,
    "subDeptId" UUID,
    "departmentId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "status" "WoStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" "WoPriority" NOT NULL DEFAULT 'MEDIUM',
    "sourceType" "WoSource" NOT NULL DEFAULT 'MANAGEMENT',
    "sourceRef" VARCHAR(64),
    "logId" UUID,
    "permitId" UUID,
    "createdById" UUID NOT NULL,
    "assignedToId" UUID,
    "approverId" UUID,
    "isSafetyCritical" BOOLEAN NOT NULL DEFAULT false,
    "requirePermit" BOOLEAN NOT NULL DEFAULT false,
    "planStartAt" TIMESTAMP(3),
    "planEndAt" TIMESTAMP(3),
    "targetEndAt" TIMESTAMP(3),
    "actualStartAt" TIMESTAMP(3),
    "actualEndAt" TIMESTAMP(3),
    "estHours" DECIMAL(8,2),
    "laborHours" DECIMAL(8,2),
    "partsCost" DECIMAL(16,2),
    "laborCost" DECIMAL(16,2),
    "contractorCost" DECIMAL(16,2),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'IQD',
    "costCenterCode" VARCHAR(24),
    "rootCause" VARCHAR(32),
    "closeNotes" TEXT,
    "reworkCount" INTEGER NOT NULL DEFAULT 0,
    "isOfflineCreated" BOOLEAN NOT NULL DEFAULT false,
    "clientOpId" VARCHAR(64),
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncSeq" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wo_logs" (
    "id" UUID NOT NULL,
    "woId" UUID NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "byUserId" UUID NOT NULL,
    "fromStatus" VARCHAR(24),
    "toStatus" VARCHAR(24),
    "textAr" VARCHAR(1200) NOT NULL,
    "isFromOffline" BOOLEAN NOT NULL DEFAULT false,
    "photos" JSONB,

    CONSTRAINT "wo_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wo_labor_entries" (
    "id" UUID NOT NULL,
    "woId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "workDate" DATE NOT NULL,
    "shiftCode" VARCHAR(8),
    "hours" DECIMAL(6,2) NOT NULL,
    "isOvertime" BOOLEAN NOT NULL DEFAULT false,
    "rate" DECIMAL(12,2),

    CONSTRAINT "wo_labor_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "part_requisitions" (
    "id" UUID NOT NULL,
    "number" VARCHAR(32),
    "woId" UUID,
    "costCenterCode" VARCHAR(24),
    "purpose" VARCHAR(400),
    "status" VARCHAR(24) NOT NULL DEFAULT 'SUBMITTED',
    "requestedById" UUID NOT NULL,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncSeq" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "part_requisitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "part_requisition_lines" (
    "id" UUID NOT NULL,
    "requisitionId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "qtyRequested" DECIMAL(12,3) NOT NULL,
    "qtyIssued" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "uom" VARCHAR(12) NOT NULL,
    "isSubstituted" BOOLEAN NOT NULL DEFAULT false,
    "substituteNote" VARCHAR(300),

    CONSTRAINT "part_requisition_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pm_plans" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "assetId" UUID NOT NULL,
    "titleAr" VARCHAR(200) NOT NULL,
    "instructionAr" TEXT,
    "strategy" "PmStrategy" NOT NULL DEFAULT 'TIME_BASED',
    "intervalValue" INTEGER NOT NULL,
    "intervalUom" "IntervalUom" NOT NULL DEFAULT 'DAY',
    "meterTag" VARCHAR(48),
    "estHours" DECIMAL(6,2),
    "requiredTrades" JSONB,
    "billOfMaterials" JSONB,
    "safetyNotesAr" TEXT,
    "nextDueAt" TIMESTAMP(3),
    "lastDoneAt" TIMESTAMP(3),
    "isSapSynced" BOOLEAN NOT NULL DEFAULT false,
    "sapPlanId" VARCHAR(32),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "pm_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pm_plan_instances" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'DUE',
    "workOrderId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncSeq" BIGINT,

    CONSTRAINT "pm_plan_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_readings" (
    "id" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "woId" UUID,
    "kind" VARCHAR(24) NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL,
    "byUserId" UUID NOT NULL,
    "location" VARCHAR(48),
    "valuesJson" JSONB NOT NULL,
    "unit" VARCHAR(16) NOT NULL,
    "isAlarm" BOOLEAN NOT NULL DEFAULT false,
    "photos" JSONB,
    "gps" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncSeq" BIGINT,

    CONSTRAINT "asset_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permits_to_work" (
    "id" UUID NOT NULL,
    "permitNumber" VARCHAR(32) NOT NULL,
    "workOrderId" UUID,
    "type" "PermitType" NOT NULL,
    "areaDescription" VARCHAR(600) NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "status" "PermitStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedById" UUID NOT NULL,
    "areaApproverId" UUID,
    "hseApproverId" UUID,
    "isolationJson" JSONB,
    "gasTestsJson" JSONB,
    "precautionsJson" JSONB,
    "crewJson" JSONB NOT NULL,
    "closedAt" TIMESTAMP(3),
    "closureNotes" VARCHAR(800),
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncSeq" BIGINT,

    CONSTRAINT "permits_to_work_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_incidents" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "severity" VARCHAR(24) NOT NULL,
    "category" VARCHAR(32) NOT NULL,
    "descriptionAr" TEXT NOT NULL,
    "immediateActionAr" TEXT,
    "rootCauseAr" TEXT,
    "correctiveActions" JSONB,
    "areaAssetId" UUID,
    "reportedById" UUID NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'OPEN',
    "workOrderId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "safety_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" UUID NOT NULL,
    "code" VARCHAR(24) NOT NULL,
    "nameAr" VARCHAR(160) NOT NULL,
    "whType" VARCHAR(24) NOT NULL,
    "locationAr" VARCHAR(200),
    "keeperUserId" UUID,
    "accessSubDepts" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bins" (
    "id" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "label" VARCHAR(80),
    "isBulk" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "bins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_items" (
    "id" UUID NOT NULL,
    "partNumber" VARCHAR(64) NOT NULL,
    "nameAr" VARCHAR(240) NOT NULL,
    "nameEn" VARCHAR(240),
    "uom" VARCHAR(12) NOT NULL,
    "materialGrade" VARCHAR(64),
    "category" VARCHAR(48) NOT NULL,
    "isCriticalSpare" BOOLEAN NOT NULL DEFAULT false,
    "isCustodyControlled" BOOLEAN NOT NULL DEFAULT false,
    "shelfLifeDays" INTEGER,
    "stdUnitCost" DECIMAL(16,2),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'IQD',
    "sapMaterialNo" VARCHAR(24),
    "specs" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_balances" (
    "itemId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "onHandQty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "reservedQty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "minLevel" DECIMAL(14,3),
    "maxLevel" DECIMAL(14,3),
    "reorderPoint" DECIMAL(14,3),
    "valuation" DECIMAL(16,2),
    "lastCountAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_balances_pkey" PRIMARY KEY ("itemId","warehouseId")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "binId" UUID,
    "kind" "MovementKind" NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(16,4),
    "currency" VARCHAR(3),
    "refType" VARCHAR(32),
    "refId" UUID,
    "docNo" VARCHAR(32),
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "byUserId" UUID NOT NULL,
    "noteAr" VARCHAR(300),

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grns" (
    "id" UUID NOT NULL,
    "number" VARCHAR(32) NOT NULL,
    "poLineRef" VARCHAR(48),
    "vendorId" UUID,
    "warehouseId" UUID NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "qualitySignById" UUID,
    "storeSignById" UUID,
    "status" VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
    "vehicleNo" VARCHAR(32),
    "notesAr" VARCHAR(600),

    CONSTRAINT "grns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grn_lines" (
    "id" UUID NOT NULL,
    "grnId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "uom" VARCHAR(12) NOT NULL,
    "unitCost" DECIMAL(16,4),
    "serialJson" JSONB,

    CONSTRAINT "grn_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_issues" (
    "id" UUID NOT NULL,
    "number" VARCHAR(32) NOT NULL,
    "requisitionId" UUID,
    "workOrderId" UUID,
    "issuedToUserId" UUID NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'DRAFT',

    CONSTRAINT "material_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_issue_lines" (
    "id" UUID NOT NULL,
    "issueId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "qtyRequested" DECIMAL(14,3) NOT NULL,
    "qtyIssued" DECIMAL(14,3) NOT NULL,
    "qtyReturned" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "binId" UUID,

    CONSTRAINT "material_issue_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_counts" (
    "id" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "countedAt" TIMESTAMP(3) NOT NULL,
    "scopeJson" JSONB,
    "linesJson" JSONB NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'OPEN',
    "postedByUserId" UUID NOT NULL,
    "approvedByUserId" UUID,

    CONSTRAINT "stock_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "employeeNumber" VARCHAR(24) NOT NULL,
    "civilId" VARCHAR(24),
    "nationality" VARCHAR(48),
    "birthDate" TIMESTAMP(3),
    "gender" VARCHAR(8),
    "hireDate" TIMESTAMP(3) NOT NULL,
    "terminationDate" TIMESTAMP(3),
    "jobTitleAr" VARCHAR(120),
    "jobLevel" VARCHAR(24),
    "contractType" VARCHAR(24),
    "subDeptId" UUID NOT NULL,
    "punchId" VARCHAR(32),
    "badgeNo" VARCHAR(32),
    "isBiometricEnrolled" BOOLEAN NOT NULL DEFAULT false,
    "baseSalary" DECIMAL(14,2),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'IQD',
    "allowancesJson" JSONB,
    "bankAccount" VARCHAR(40),
    "emergencyJson" JSONB,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "biometric_devices" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "nameAr" VARCHAR(160) NOT NULL,
    "model" VARCHAR(64),
    "ip" VARCHAR(45),
    "port" INTEGER,
    "locationAr" VARCHAR(200),
    "pullIntervalSec" INTEGER NOT NULL DEFAULT 300,
    "lastPullAt" TIMESTAMP(3),
    "status" VARCHAR(16) NOT NULL DEFAULT 'ONLINE',

    CONSTRAINT "biometric_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_punches" (
    "id" UUID NOT NULL,
    "deviceId" UUID,
    "employeeId" UUID NOT NULL,
    "punchedAt" TIMESTAMP(3) NOT NULL,
    "punchType" "PunchType" NOT NULL,
    "verifyMode" VARCHAR(16),
    "rawRecordId" VARCHAR(64),
    "source" "PunchSource" NOT NULL DEFAULT 'DEVICE',
    "matchStatus" VARCHAR(16) NOT NULL DEFAULT 'OK',
    "syncSeq" BIGINT,

    CONSTRAINT "attendance_punches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_daily_summaries" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "workDate" DATE NOT NULL,
    "shiftCode" VARCHAR(8),
    "firstInAt" TIMESTAMP(3),
    "lastOutAt" TIMESTAMP(3),
    "workedMinutes" INTEGER NOT NULL DEFAULT 0,
    "scheduledMinutes" INTEGER NOT NULL DEFAULT 0,
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "earlyOutMinutes" INTEGER NOT NULL DEFAULT 0,
    "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "nightDiffPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "fridayMultiplier" DECIMAL(3,1) NOT NULL DEFAULT 1,
    "status" VARCHAR(24) NOT NULL,
    "exceptionsJson" JSONB,
    "punchCount" INTEGER NOT NULL DEFAULT 0,
    "reconciliationHash" VARCHAR(16),
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_daily_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_corrections" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "workDate" DATE NOT NULL,
    "type" VARCHAR(24) NOT NULL,
    "reasonAr" VARCHAR(600) NOT NULL,
    "inTimeOverride" TIMESTAMP(3),
    "outTimeOverride" TIMESTAMP(3),
    "otMinutesApproved" INTEGER,
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "requestedById" UUID NOT NULL,
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "attendance_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "type" "LeaveType" NOT NULL,
    "fromAt" TIMESTAMP(3) NOT NULL,
    "toAt" TIMESTAMP(3) NOT NULL,
    "daysCount" DECIMAL(6,2),
    "isPartial" BOOLEAN NOT NULL DEFAULT false,
    "reasonAr" VARCHAR(600),
    "attachmentDocId" UUID,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "approverUserId" UUID,
    "decidedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncSeq" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobile_forms" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "nameAr" VARCHAR(200) NOT NULL,
    "jsonSchema" JSONB NOT NULL,
    "uiSchema" JSONB,
    "targetSubDeptCodes" JSONB,
    "publishStatus" VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    "isOfflineAllowed" BOOLEAN NOT NULL DEFAULT true,
    "requiresGps" BOOLEAN NOT NULL DEFAULT false,
    "requiresSignature" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "mobile_forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobile_form_deployments" (
    "id" UUID NOT NULL,
    "formId" UUID NOT NULL,
    "subDeptId" UUID NOT NULL,
    "isMandatory" BOOLEAN NOT NULL DEFAULT false,
    "frequencyCron" VARCHAR(40),

    CONSTRAINT "mobile_form_deployments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobile_form_records" (
    "id" UUID NOT NULL,
    "formId" UUID NOT NULL,
    "formCode" VARCHAR(64) NOT NULL,
    "formVersion" INTEGER NOT NULL,
    "employeeId" UUID,
    "assetId" UUID,
    "workOrderId" UUID,
    "readings" JSONB NOT NULL,
    "photos" JSONB,
    "gps" JSONB,
    "signatureDocId" UUID,
    "offlineCapturedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceId" VARCHAR(64),
    "clientOpId" VARCHAR(64),
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncSeq" BIGINT,

    CONSTRAINT "mobile_form_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "nameAr" VARCHAR(200) NOT NULL,
    "nameEn" VARCHAR(200),
    "customerType" VARCHAR(24) NOT NULL,
    "taxNo" VARCHAR(32),
    "addressAr" VARCHAR(400),
    "contactPerson" VARCHAR(120),
    "phone" VARCHAR(32),
    "email" VARCHAR(120),
    "creditLimit" DECIMAL(18,2),
    "creditUsed" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'IQD',
    "sapCustomerNo" VARCHAR(16),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" UUID NOT NULL,
    "number" VARCHAR(48) NOT NULL,
    "customerId" UUID NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "productCode" VARCHAR(32) NOT NULL,
    "quantityTons" DECIMAL(14,3) NOT NULL,
    "pricePerTon" DECIMAL(16,2),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "termsAr" TEXT,
    "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_orders" (
    "id" UUID NOT NULL,
    "number" VARCHAR(32),
    "customerId" UUID NOT NULL,
    "contractId" UUID,
    "orderDate" DATE NOT NULL,
    "productCode" VARCHAR(32) NOT NULL,
    "qtyOrderedTons" DECIMAL(14,3) NOT NULL,
    "qtyDeliveredTons" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "pricePerTon" DECIMAL(16,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'IQD',
    "fxRate" DECIMAL(12,4),
    "truckCount" INTEGER NOT NULL DEFAULT 0,
    "gatePassNo" VARCHAR(48),
    "depotAr" VARCHAR(120),
    "status" VARCHAR(24) NOT NULL DEFAULT 'OPEN',
    "createdBy" UUID NOT NULL,
    "confirmedBy" UUID,
    "confirmedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncSeq" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_order_lines" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "truckPlate" VARCHAR(24),
    "driverName" VARCHAR(120),
    "ticketInNo" VARCHAR(32),
    "ticketOutNo" VARCHAR(32),
    "grossWeightKg" DECIMAL(12,1),
    "tareWeightKg" DECIMAL(12,1),
    "netWeightKg" DECIMAL(12,1),
    "loadedAt" TIMESTAMP(3),
    "labSampleId" UUID,

    CONSTRAINT "sales_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_invoices" (
    "id" UUID NOT NULL,
    "number" VARCHAR(32) NOT NULL,
    "orderId" UUID,
    "customerId" UUID NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'IQD',
    "status" VARCHAR(16) NOT NULL DEFAULT 'OPEN',
    "journalId" UUID,

    CONSTRAINT "sales_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" UUID NOT NULL,
    "fromCode" VARCHAR(3) NOT NULL,
    "toCode" VARCHAR(3) NOT NULL,
    "rate" DECIMAL(14,6) NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "source" VARCHAR(32) NOT NULL,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "code" VARCHAR(24) NOT NULL,
    "nameAr" VARCHAR(200) NOT NULL,
    "accType" "AccountType" NOT NULL,
    "parentId" UUID,
    "isPosting" BOOLEAN NOT NULL DEFAULT true,
    "costCenterCode" VARCHAR(24),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_centers" (
    "id" UUID NOT NULL,
    "code" VARCHAR(24) NOT NULL,
    "nameAr" VARCHAR(160) NOT NULL,
    "subDeptId" UUID,
    "kind" VARCHAR(24) NOT NULL,

    CONSTRAINT "cost_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_lines" (
    "id" UUID NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "costCenterId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "lineType" VARCHAR(16) NOT NULL,
    "monthlyJson" JSONB NOT NULL,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "actualAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "approvedById" UUID,
    "status" VARCHAR(16) NOT NULL DEFAULT 'DRAFT',

    CONSTRAINT "budget_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" UUID NOT NULL,
    "number" VARCHAR(32),
    "entryDate" DATE NOT NULL,
    "periodKey" VARCHAR(7) NOT NULL,
    "descriptionAr" VARCHAR(500) NOT NULL,
    "sourceDocType" VARCHAR(32),
    "sourceDocId" UUID,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'IQD',
    "fxRate" DECIMAL(14,6),
    "status" VARCHAR(16) NOT NULL DEFAULT 'POSTED',
    "preparedById" UUID NOT NULL,
    "approvedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" UUID NOT NULL,
    "journalId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "costCenterId" UUID,
    "debit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "partnerAr" VARCHAR(200),
    "notesAr" VARCHAR(400),

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "nameAr" VARCHAR(200) NOT NULL,
    "vendorType" VARCHAR(24) NOT NULL,
    "taxNo" VARCHAR(32),
    "phone" VARCHAR(32),
    "email" VARCHAR(120),
    "isBlacklisted" BOOLEAN NOT NULL DEFAULT false,
    "qualificationJson" JSONB,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_requisitions" (
    "id" UUID NOT NULL,
    "number" VARCHAR(32) NOT NULL,
    "vendorId" UUID,
    "costCenterCode" VARCHAR(24) NOT NULL,
    "subDeptCode" VARCHAR(24),
    "reasonAr" VARCHAR(600) NOT NULL,
    "isEmergency" BOOLEAN NOT NULL DEFAULT false,
    "linesJson" JSONB NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'OPEN',
    "createdBy" UUID NOT NULL,
    "approvedBy" UUID,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_requisitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL,
    "number" VARCHAR(32) NOT NULL,
    "vendorId" UUID NOT NULL,
    "requisitionId" UUID,
    "orderDate" DATE NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'IQD',
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
    "deliveryTermsAr" VARCHAR(400),
    "linesJson" JSONB NOT NULL,
    "approvalsJson" JSONB,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" UUID NOT NULL,
    "periodKey" VARCHAR(7) NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "scopeKind" VARCHAR(16) NOT NULL DEFAULT 'ALL',
    "status" VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    "grossTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "netTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "preparedById" UUID NOT NULL,
    "approvedById" UUID,
    "journalId" UUID,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_lines" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "baseAmount" DECIMAL(16,2) NOT NULL,
    "allowanceJson" JSONB,
    "earningJson" JSONB,
    "deductionJson" JSONB,
    "netAmount" DECIMAL(16,2) NOT NULL,
    "workedDays" DECIMAL(6,2),
    "overtimeHours" DECIMAL(7,2),
    "source" VARCHAR(16) NOT NULL DEFAULT 'ATTENDANCE',

    CONSTRAINT "payroll_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "facilityId" UUID,
    "code" VARCHAR(48),
    "titleAr" VARCHAR(240) NOT NULL,
    "docType" VARCHAR(32) NOT NULL,
    "categoryCode" VARCHAR(32),
    "objectKey" VARCHAR(400) NOT NULL,
    "originalName" VARCHAR(240) NOT NULL,
    "mimeType" VARCHAR(80) NOT NULL,
    "sizeBytes" BIGINT NOT NULL DEFAULT 0,
    "sha256" VARCHAR(64),
    "revision" VARCHAR(12),
    "status" VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    "ownerSubDeptId" UUID,
    "entityType" VARCHAR(48),
    "entityId" UUID,
    "uploadedById" UUID NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isEncrypted" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncSeq" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "level" VARCHAR(12) NOT NULL DEFAULT 'INFO',
    "titleAr" VARCHAR(200) NOT NULL,
    "bodyAr" VARCHAR(600) NOT NULL,
    "payload" JSONB,
    "entityType" VARCHAR(48),
    "entityId" UUID,
    "sentVia" VARCHAR(40),
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_trails" (
    "id" BIGSERIAL NOT NULL,
    "facilityId" UUID,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" UUID,
    "actorName" VARCHAR(160),
    "action" VARCHAR(32) NOT NULL,
    "entityType" VARCHAR(48) NOT NULL,
    "entityId" UUID,
    "changes" JSONB,
    "meta" JSONB,
    "ip" VARCHAR(45),
    "userAgent" VARCHAR(250),

    CONSTRAINT "audit_trails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_change_log" (
    "seq" BIGSERIAL NOT NULL,
    "facilityId" UUID,
    "entity" VARCHAR(48) NOT NULL,
    "recordId" UUID NOT NULL,
    "op" "SyncOp" NOT NULL,
    "version" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "actorId" UUID,
    "deviceId" VARCHAR(64),
    "subDeptId" UUID,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_change_log_pkey" PRIMARY KEY ("seq")
);

-- CreateTable
CREATE TABLE "sync_idempotency" (
    "opId" VARCHAR(64) NOT NULL,
    "deviceId" VARCHAR(64) NOT NULL,
    "entity" VARCHAR(48) NOT NULL,
    "recordId" UUID NOT NULL,
    "resultJson" JSONB NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_idempotency_pkey" PRIMARY KEY ("opId")
);

-- CreateTable
CREATE TABLE "sync_conflicts" (
    "id" UUID NOT NULL,
    "entity" VARCHAR(48) NOT NULL,
    "recordId" UUID NOT NULL,
    "deviceId" VARCHAR(64) NOT NULL,
    "userId" UUID NOT NULL,
    "strategy" VARCHAR(16) NOT NULL,
    "clientJson" JSONB,
    "serverJson" JSONB,
    "keptFields" JSONB,
    "resolvedBy" UUID,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_conflicts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" UUID NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "valueJson" JSONB NOT NULL,
    "scopeKind" "ScopeKind" NOT NULL DEFAULT 'ALL',
    "scopeId" UUID,
    "updatedBy" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_configs" (
    "id" UUID NOT NULL,
    "systemName" VARCHAR(40) NOT NULL,
    "mode" VARCHAR(16) NOT NULL DEFAULT 'PULL',
    "endpoint" VARCHAR(400),
    "credentialRef" VARCHAR(120),
    "scheduleCron" VARCHAR(40),
    "mapJson" JSONB,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastRunAt" TIMESTAMP(3),
    "lastError" VARCHAR(1000),

    CONSTRAINT "integration_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "facilities_code_key" ON "facilities"("code");

-- CreateIndex
CREATE INDEX "facilities_companyId_isActive_idx" ON "facilities"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "departments_facilityId_isActive_idx" ON "departments"("facilityId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "departments_facilityId_code_key" ON "departments"("facilityId", "code");

-- CreateIndex
CREATE INDEX "sub_departments_isActive_kind_idx" ON "sub_departments"("isActive", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "sub_departments_departmentId_code_key" ON "sub_departments"("departmentId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "positions_subDeptId_code_key" ON "positions"("subDeptId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_employeeId_key" ON "users"("employeeId");

-- CreateIndex
CREATE INDEX "users_subDeptId_jobStatus_idx" ON "users"("subDeptId", "jobStatus");

-- CreateIndex
CREATE INDEX "users_departmentId_idx" ON "users"("departmentId");

-- CreateIndex
CREATE INDEX "users_punchId_idx" ON "users"("punchId");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "permissions_module_action_idx" ON "permissions"("module", "action");

-- CreateIndex
CREATE INDEX "user_roles_roleId_idx" ON "user_roles"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_userId_roleId_scopeKind_scopeSubDeptId_scopeDepa_key" ON "user_roles"("userId", "roleId", "scopeKind", "scopeSubDeptId", "scopeDepartmentId");

-- CreateIndex
CREATE UNIQUE INDEX "role_subdept_grants_subDeptId_roleId_key" ON "role_subdept_grants"("subDeptId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_expiresAt_idx" ON "refresh_tokens"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "devices_externalId_key" ON "devices"("externalId");

-- CreateIndex
CREATE INDEX "devices_userId_platform_idx" ON "devices"("userId", "platform");

-- CreateIndex
CREATE INDEX "delegations_fromUserId_startAt_endAt_idx" ON "delegations"("fromUserId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "approvals_status_idx" ON "approvals"("status");

-- CreateIndex
CREATE UNIQUE INDEX "approvals_entityType_entityId_policyCode_key" ON "approvals"("entityType", "entityId", "policyCode");

-- CreateIndex
CREATE UNIQUE INDEX "approval_steps_approvalId_orderNo_key" ON "approval_steps"("approvalId", "orderNo");

-- CreateIndex
CREATE UNIQUE INDEX "shift_patterns_code_key" ON "shift_patterns"("code");

-- CreateIndex
CREATE INDEX "shift_assignments_workDate_shiftId_idx" ON "shift_assignments"("workDate", "shiftId");

-- CreateIndex
CREATE UNIQUE INDEX "shift_assignments_employeeId_workDate_key" ON "shift_assignments"("employeeId", "workDate");

-- CreateIndex
CREATE UNIQUE INDEX "production_units_code_key" ON "production_units"("code");

-- CreateIndex
CREATE UNIQUE INDEX "assets_tag_key" ON "assets"("tag");

-- CreateIndex
CREATE INDEX "assets_subDeptId_status_idx" ON "assets"("subDeptId", "status");

-- CreateIndex
CREATE INDEX "assets_classCode_idx" ON "assets"("classCode");

-- CreateIndex
CREATE INDEX "psv_test_records_assetId_testDate_idx" ON "psv_test_records"("assetId", "testDate");

-- CreateIndex
CREATE INDEX "asset_inspections_assetId_inspectedAt_idx" ON "asset_inspections"("assetId", "inspectedAt");

-- CreateIndex
CREATE INDEX "calibration_records_assetId_dueAt_idx" ON "calibration_records"("assetId", "dueAt");

-- CreateIndex
CREATE INDEX "production_shift_logs_facilityId_shiftDate_idx" ON "production_shift_logs"("facilityId", "shiftDate");

-- CreateIndex
CREATE UNIQUE INDEX "production_shift_logs_unitId_shiftDate_shiftCode_key" ON "production_shift_logs"("unitId", "shiftDate", "shiftCode");

-- CreateIndex
CREATE INDEX "process_parameters_paramCode_at_idx" ON "process_parameters"("paramCode", "at");

-- CreateIndex
CREATE INDEX "process_parameters_assetId_at_idx" ON "process_parameters"("assetId", "at");

-- CreateIndex
CREATE INDEX "production_alarms_triggeredAt_severity_idx" ON "production_alarms"("triggeredAt", "severity");

-- CreateIndex
CREATE INDEX "equipment_downtimes_unitCode_startAt_idx" ON "equipment_downtimes"("unitCode", "startAt");

-- CreateIndex
CREATE INDEX "equipment_downtimes_assetId_startAt_idx" ON "equipment_downtimes"("assetId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "lab_parameters_code_key" ON "lab_parameters"("code");

-- CreateIndex
CREATE UNIQUE INDEX "lab_specs_parameterId_productCode_grade_effectiveFrom_key" ON "lab_specs"("parameterId", "productCode", "grade", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "lab_samples_sampleNumber_key" ON "lab_samples"("sampleNumber");

-- CreateIndex
CREATE INDEX "lab_samples_subDeptId_status_collectedAt_idx" ON "lab_samples"("subDeptId", "status", "collectedAt");

-- CreateIndex
CREATE INDEX "lab_results_isOutOfSpec_idx" ON "lab_results"("isOutOfSpec");

-- CreateIndex
CREATE UNIQUE INDEX "lab_results_sampleId_parameterId_key" ON "lab_results"("sampleId", "parameterId");

-- CreateIndex
CREATE UNIQUE INDEX "lab_oos_cases_code_key" ON "lab_oos_cases"("code");

-- CreateIndex
CREATE INDEX "lab_oos_cases_status_severity_idx" ON "lab_oos_cases"("status", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "work_orders_number_key" ON "work_orders"("number");

-- CreateIndex
CREATE INDEX "work_orders_subDeptId_status_priority_idx" ON "work_orders"("subDeptId", "status", "priority");

-- CreateIndex
CREATE INDEX "work_orders_assetId_status_idx" ON "work_orders"("assetId", "status");

-- CreateIndex
CREATE INDEX "work_orders_status_targetEndAt_idx" ON "work_orders"("status", "targetEndAt");

-- CreateIndex
CREATE INDEX "work_orders_createdById_idx" ON "work_orders"("createdById");

-- CreateIndex
CREATE INDEX "work_orders_permitId_idx" ON "work_orders"("permitId");

-- CreateIndex
CREATE INDEX "work_orders_syncSeq_idx" ON "work_orders"("syncSeq");

-- CreateIndex
CREATE INDEX "wo_logs_woId_at_idx" ON "wo_logs"("woId", "at");

-- CreateIndex
CREATE INDEX "wo_labor_entries_woId_idx" ON "wo_labor_entries"("woId");

-- CreateIndex
CREATE INDEX "wo_labor_entries_employeeId_workDate_idx" ON "wo_labor_entries"("employeeId", "workDate");

-- CreateIndex
CREATE UNIQUE INDEX "part_requisitions_number_key" ON "part_requisitions"("number");

-- CreateIndex
CREATE INDEX "part_requisitions_status_createdAt_idx" ON "part_requisitions"("status", "createdAt");

-- CreateIndex
CREATE INDEX "part_requisition_lines_requisitionId_idx" ON "part_requisition_lines"("requisitionId");

-- CreateIndex
CREATE UNIQUE INDEX "pm_plans_code_key" ON "pm_plans"("code");

-- CreateIndex
CREATE INDEX "pm_plans_nextDueAt_isActive_idx" ON "pm_plans"("nextDueAt", "isActive");

-- CreateIndex
CREATE INDEX "pm_plan_instances_status_dueAt_idx" ON "pm_plan_instances"("status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "pm_plan_instances_planId_dueAt_key" ON "pm_plan_instances"("planId", "dueAt");

-- CreateIndex
CREATE INDEX "asset_readings_assetId_kind_measuredAt_idx" ON "asset_readings"("assetId", "kind", "measuredAt");

-- CreateIndex
CREATE UNIQUE INDEX "permits_to_work_permitNumber_key" ON "permits_to_work"("permitNumber");

-- CreateIndex
CREATE INDEX "permits_to_work_workOrderId_idx" ON "permits_to_work"("workOrderId");

-- CreateIndex
CREATE INDEX "permits_to_work_status_validTo_idx" ON "permits_to_work"("status", "validTo");

-- CreateIndex
CREATE INDEX "permits_to_work_type_validFrom_idx" ON "permits_to_work"("type", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "safety_incidents_code_key" ON "safety_incidents"("code");

-- CreateIndex
CREATE INDEX "safety_incidents_occurredAt_severity_idx" ON "safety_incidents"("occurredAt", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_code_key" ON "warehouses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "bins_warehouseId_code_key" ON "bins"("warehouseId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "stock_items_partNumber_key" ON "stock_items"("partNumber");

-- CreateIndex
CREATE INDEX "stock_items_category_isCriticalSpare_idx" ON "stock_items"("category", "isCriticalSpare");

-- CreateIndex
CREATE INDEX "stock_balances_warehouseId_idx" ON "stock_balances"("warehouseId");

-- CreateIndex
CREATE INDEX "stock_movements_itemId_at_idx" ON "stock_movements"("itemId", "at");

-- CreateIndex
CREATE INDEX "stock_movements_refType_refId_idx" ON "stock_movements"("refType", "refId");

-- CreateIndex
CREATE UNIQUE INDEX "grns_number_key" ON "grns"("number");

-- CreateIndex
CREATE INDEX "grns_receivedAt_status_idx" ON "grns"("receivedAt", "status");

-- CreateIndex
CREATE INDEX "grn_lines_grnId_idx" ON "grn_lines"("grnId");

-- CreateIndex
CREATE UNIQUE INDEX "material_issues_number_key" ON "material_issues"("number");

-- CreateIndex
CREATE INDEX "material_issues_issuedAt_idx" ON "material_issues"("issuedAt");

-- CreateIndex
CREATE INDEX "material_issue_lines_issueId_idx" ON "material_issue_lines"("issueId");

-- CreateIndex
CREATE INDEX "stock_counts_warehouseId_countedAt_idx" ON "stock_counts"("warehouseId", "countedAt");

-- CreateIndex
CREATE UNIQUE INDEX "employees_employeeNumber_key" ON "employees"("employeeNumber");

-- CreateIndex
CREATE INDEX "employees_subDeptId_idx" ON "employees"("subDeptId");

-- CreateIndex
CREATE UNIQUE INDEX "biometric_devices_code_key" ON "biometric_devices"("code");

-- CreateIndex
CREATE INDEX "attendance_punches_employeeId_punchedAt_idx" ON "attendance_punches"("employeeId", "punchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_punches_deviceId_rawRecordId_key" ON "attendance_punches"("deviceId", "rawRecordId");

-- CreateIndex
CREATE INDEX "attendance_daily_summaries_workDate_status_idx" ON "attendance_daily_summaries"("workDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_daily_summaries_employeeId_workDate_key" ON "attendance_daily_summaries"("employeeId", "workDate");

-- CreateIndex
CREATE INDEX "attendance_corrections_status_workDate_idx" ON "attendance_corrections"("status", "workDate");

-- CreateIndex
CREATE INDEX "leave_requests_employeeId_status_idx" ON "leave_requests"("employeeId", "status");

-- CreateIndex
CREATE INDEX "leave_requests_fromAt_idx" ON "leave_requests"("fromAt");

-- CreateIndex
CREATE UNIQUE INDEX "mobile_forms_code_version_key" ON "mobile_forms"("code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "mobile_form_deployments_formId_subDeptId_key" ON "mobile_form_deployments"("formId", "subDeptId");

-- CreateIndex
CREATE INDEX "mobile_form_records_formCode_submittedAt_idx" ON "mobile_form_records"("formCode", "submittedAt");

-- CreateIndex
CREATE INDEX "mobile_form_records_assetId_idx" ON "mobile_form_records"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "customers_code_key" ON "customers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_number_key" ON "contracts"("number");

-- CreateIndex
CREATE INDEX "contracts_customerId_endDate_idx" ON "contracts"("customerId", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_number_key" ON "sales_orders"("number");

-- CreateIndex
CREATE INDEX "sales_orders_orderDate_status_idx" ON "sales_orders"("orderDate", "status");

-- CreateIndex
CREATE INDEX "sales_orders_customerId_status_idx" ON "sales_orders"("customerId", "status");

-- CreateIndex
CREATE INDEX "sales_order_lines_orderId_idx" ON "sales_order_lines"("orderId");

-- CreateIndex
CREATE INDEX "sales_order_lines_ticketOutNo_idx" ON "sales_order_lines"("ticketOutNo");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoices_number_key" ON "sales_invoices"("number");

-- CreateIndex
CREATE INDEX "sales_invoices_invoiceDate_status_idx" ON "sales_invoices"("invoiceDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_fromCode_toCode_effectiveDate_key" ON "exchange_rates"("fromCode", "toCode", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_code_key" ON "accounts"("code");

-- CreateIndex
CREATE INDEX "accounts_accType_idx" ON "accounts"("accType");

-- CreateIndex
CREATE UNIQUE INDEX "cost_centers_code_key" ON "cost_centers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "budget_lines_fiscalYear_costCenterId_accountId_lineType_key" ON "budget_lines"("fiscalYear", "costCenterId", "accountId", "lineType");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_number_key" ON "journal_entries"("number");

-- CreateIndex
CREATE INDEX "journal_entries_entryDate_status_idx" ON "journal_entries"("entryDate", "status");

-- CreateIndex
CREATE INDEX "journal_entries_sourceDocType_sourceDocId_idx" ON "journal_entries"("sourceDocType", "sourceDocId");

-- CreateIndex
CREATE INDEX "journal_lines_journalId_idx" ON "journal_lines"("journalId");

-- CreateIndex
CREATE INDEX "journal_lines_accountId_idx" ON "journal_lines"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_code_key" ON "vendors"("code");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_requisitions_number_key" ON "purchase_requisitions"("number");

-- CreateIndex
CREATE INDEX "purchase_requisitions_status_createdAt_idx" ON "purchase_requisitions"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_number_key" ON "purchase_orders"("number");

-- CreateIndex
CREATE INDEX "purchase_orders_status_orderDate_idx" ON "purchase_orders"("status", "orderDate");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_periodKey_scopeKind_key" ON "payroll_runs"("periodKey", "scopeKind");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_lines_runId_employeeId_key" ON "payroll_lines"("runId", "employeeId");

-- CreateIndex
CREATE INDEX "documents_entityType_entityId_idx" ON "documents"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "documents_docType_status_idx" ON "documents"("docType", "status");

-- CreateIndex
CREATE INDEX "documents_sha256_idx" ON "documents"("sha256");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_createdAt_idx" ON "notifications"("userId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "audit_trails_entityType_entityId_at_idx" ON "audit_trails"("entityType", "entityId", "at");

-- CreateIndex
CREATE INDEX "audit_trails_actorId_at_idx" ON "audit_trails"("actorId", "at");

-- CreateIndex
CREATE INDEX "audit_trails_action_at_idx" ON "audit_trails"("action", "at");

-- CreateIndex
CREATE INDEX "sync_change_log_entity_seq_idx" ON "sync_change_log"("entity", "seq");

-- CreateIndex
CREATE INDEX "sync_change_log_facilityId_seq_idx" ON "sync_change_log"("facilityId", "seq");

-- CreateIndex
CREATE INDEX "sync_change_log_at_idx" ON "sync_change_log"("at");

-- CreateIndex
CREATE INDEX "sync_idempotency_deviceId_appliedAt_idx" ON "sync_idempotency"("deviceId", "appliedAt");

-- CreateIndex
CREATE INDEX "sync_conflicts_entity_createdAt_idx" ON "sync_conflicts"("entity", "createdAt");

-- CreateIndex
CREATE INDEX "sync_conflicts_userId_resolvedAt_idx" ON "sync_conflicts"("userId", "resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "app_settings_key_key" ON "app_settings"("key");

-- CreateIndex
CREATE UNIQUE INDEX "integration_configs_systemName_key" ON "integration_configs"("systemName");

-- AddForeignKey
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_departments" ADD CONSTRAINT "sub_departments_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_subDeptId_fkey" FOREIGN KEY ("subDeptId") REFERENCES "sub_departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_parentPositionId_fkey" FOREIGN KEY ("parentPositionId") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_subDeptId_fkey" FOREIGN KEY ("subDeptId") REFERENCES "sub_departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shift_patterns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_subdept_grants" ADD CONSTRAINT "role_subdept_grants_subDeptId_fkey" FOREIGN KEY ("subDeptId") REFERENCES "sub_departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_subdept_grants" ADD CONSTRAINT "role_subdept_grants_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegations" ADD CONSTRAINT "delegations_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegations" ADD CONSTRAINT "delegations_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "approvals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_approverUserId_fkey" FOREIGN KEY ("approverUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shift_patterns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "production_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_subDeptId_fkey" FOREIGN KEY ("subDeptId") REFERENCES "sub_departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "psv_test_records" ADD CONSTRAINT "psv_test_records_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_inspections" ADD CONSTRAINT "asset_inspections_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calibration_records" ADD CONSTRAINT "calibration_records_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_shift_logs" ADD CONSTRAINT "production_shift_logs_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_shift_logs" ADD CONSTRAINT "production_shift_logs_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "production_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "process_parameters" ADD CONSTRAINT "process_parameters_logId_fkey" FOREIGN KEY ("logId") REFERENCES "production_shift_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_downtimes" ADD CONSTRAINT "equipment_downtimes_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_specs" ADD CONSTRAINT "lab_specs_parameterId_fkey" FOREIGN KEY ("parameterId") REFERENCES "lab_parameters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_samples" ADD CONSTRAINT "lab_samples_subDeptId_fkey" FOREIGN KEY ("subDeptId") REFERENCES "sub_departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_samples" ADD CONSTRAINT "lab_samples_logId_fkey" FOREIGN KEY ("logId") REFERENCES "production_shift_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "lab_samples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_parameterId_fkey" FOREIGN KEY ("parameterId") REFERENCES "lab_parameters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_subDeptId_fkey" FOREIGN KEY ("subDeptId") REFERENCES "sub_departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_logId_fkey" FOREIGN KEY ("logId") REFERENCES "production_shift_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wo_logs" ADD CONSTRAINT "wo_logs_woId_fkey" FOREIGN KEY ("woId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wo_labor_entries" ADD CONSTRAINT "wo_labor_entries_woId_fkey" FOREIGN KEY ("woId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_requisitions" ADD CONSTRAINT "part_requisitions_woId_fkey" FOREIGN KEY ("woId") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_requisition_lines" ADD CONSTRAINT "part_requisition_lines_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "part_requisitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_requisition_lines" ADD CONSTRAINT "part_requisition_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "stock_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pm_plans" ADD CONSTRAINT "pm_plans_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pm_plan_instances" ADD CONSTRAINT "pm_plan_instances_planId_fkey" FOREIGN KEY ("planId") REFERENCES "pm_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_readings" ADD CONSTRAINT "asset_readings_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_readings" ADD CONSTRAINT "asset_readings_woId_fkey" FOREIGN KEY ("woId") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bins" ADD CONSTRAINT "bins_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "stock_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grns" ADD CONSTRAINT "grns_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_lines" ADD CONSTRAINT "grn_lines_grnId_fkey" FOREIGN KEY ("grnId") REFERENCES "grns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_lines" ADD CONSTRAINT "grn_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "stock_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_issue_lines" ADD CONSTRAINT "material_issue_lines_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "material_issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_issue_lines" ADD CONSTRAINT "material_issue_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "stock_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_subDeptId_fkey" FOREIGN KEY ("subDeptId") REFERENCES "sub_departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "biometric_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_daily_summaries" ADD CONSTRAINT "attendance_daily_summaries_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mobile_form_deployments" ADD CONSTRAINT "mobile_form_deployments_formId_fkey" FOREIGN KEY ("formId") REFERENCES "mobile_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mobile_form_deployments" ADD CONSTRAINT "mobile_form_deployments_subDeptId_fkey" FOREIGN KEY ("subDeptId") REFERENCES "sub_departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mobile_form_records" ADD CONSTRAINT "mobile_form_records_formId_fkey" FOREIGN KEY ("formId") REFERENCES "mobile_forms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requisitions" ADD CONSTRAINT "purchase_requisitions_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "purchase_requisitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_runId_fkey" FOREIGN KEY ("runId") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_trails" ADD CONSTRAINT "audit_trails_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_trails" ADD CONSTRAINT "audit_trails_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_change_log" ADD CONSTRAINT "sync_change_log_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

