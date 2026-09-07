/**
 * DTOs مشتركة بين العميل والخادم (عقود API).
 * تُستخدم للتحقق على الجانبين: NestJS (ZodValidationPipe) وتحقق فوري داخل الحقول في React/React Native.
 */
import { z } from 'zod';
import { PERMIT_TYPES, PRIORITIES, WO_STATES } from './workorder.js';
import { SHIFT_CODES } from './org.js';

export const uuid = z.string().uuid();
export const isoDateTime = z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/));

/* ── Auth ─────────────────────────────────────────────────────────────── */
export const loginDto = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(8).max(128),
  deviceId: z.string().min(8).max(64),
  platform: z.enum(['WIN', 'ANDROID', 'IOS', 'WEB']),
});
export type LoginDto = z.infer<typeof loginDto>;

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
  user: {
    id: string;
    username: string;
    fullName: string;
    positionId: string | null;
    departmentId: string;
    departmentCode: string;
    subDepartmentId: string;
    subDepartmentCode: string;
    subDepartmentNameAr: string;
    shiftId: string | null;
    language: 'ar' | 'en' | 'ku';
  };
  roles: string[];
  permissions: Array<{ code: string; scope: string }>;
  syncCursor: number;
  /** true ⇒ الجلسة "مقيدة" حتى يغيّر المستخدم كلمة المرور (انظر AccessGuard bootstrap allowlist) */
  mustChangePwd: boolean;
}

/* ── Work Orders ──────────────────────────────────────────────────────── */
export const workOrderCreateDto = z.object({
  id: uuid.optional(),
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(4000),
  assetId: uuid.optional(),
  equipmentTag: z.string().max(64).optional(),
  priority: z.enum(PRIORITIES),
  sourceType: z.enum(['SHIFT_LOG', 'LAB', 'INSPECTION', 'PM', 'BREAKDOWN', 'MANAGEMENT']),
  sourceRef: z.string().max(64).optional(),
  requestedSubDeptCode: z.enum([
    'MAINT-HEAT', 'MAINT-ROT', 'MAINT-ELEC', 'MAINT-VALVE', 'MAINT-INST', 'MAINT-GEN',
  ]),
  safetyNotes: z.string().max(2000).optional(),
  photos: z.array(z.object({ opId: z.string(), fileName: z.string(), mimeType: z.string(), sizeBytes: z.number().int().positive().max(25 * 1024 * 1024) })).optional(),
  estimatedHours: z.number().min(0.25).max(2000).optional(),
  requirePermit: z.boolean().default(false),
});
export type WorkOrderCreateDto = z.infer<typeof workOrderCreateDto>;

export const workOrderTransitionDto = z.object({
  to: z.enum(WO_STATES),
  reason: z.string().max(1000).optional(),
  plannedStart: isoDateTime.optional(),
  plannedEnd: isoDateTime.optional(),
  actualStart: isoDateTime.optional(),
  actualEnd: isoDateTime.optional(),
  assigneeIds: z.array(uuid).max(30).optional(),
  rootCause: z.enum(['MECHANICAL', 'ELECTRICAL', 'INSTRUMENT', 'PROCESS', 'OPERATOR', 'MATERIAL', 'UTILITY', 'EXTERNAL', 'OTHER']).optional(),
});
export type WorkOrderTransitionDto = z.infer<typeof workOrderTransitionDto>;

export interface WorkOrderDto {
  id: string;
  number: string;
  title: string;
  description: string;
  status: (typeof WO_STATES)[number];
  priority: (typeof PRIORITIES)[number];
  assetId: string | null;
  assetTag: string | null;
  departmentCode: string;
  subDeptCode: string | null;
  createdById: string;
  createdAt: string;
  submittedAt: string | null;
  startedAt: string | null;
  closedAt: string | null;
  version: number;
  syncSeq: number;
  sla?: { breachedResponse: boolean; breachedResolve: boolean; responseHours?: number; resolveHours?: number };
  costAmount?: number | null;
  currency?: 'IQD' | 'USD';
}

/* ── Shift log (الإنتاج) ───────────────────────────────────────────────── */
export const shiftLogDto = z.object({
  id: uuid.optional(),
  unitCode: z.enum(['UREA', 'AMMONIA', 'COOLING_TOWER', 'UTILITY', 'LAB']),
  shiftDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shiftCode: z.enum(SHIFT_CODES),
  productionTons: z.number().min(0).max(100000).optional(),
  designRateTph: z.number().min(0).max(5000).optional(),
  availabilityPct: z.number().min(0).max(100).optional(),
  events: z.array(z.object({ at: isoDateTime, text: z.string().min(3).max(1000), tag: z.string().max(40).optional() })).default([]),
  params: z
    .array(z.object({ paramCode: z.string().min(1).max(40), value: z.number(), unit: z.string().max(20), assetTag: z.string().max(40).optional() }))
    .default([]),
  notes: z.string().max(4000).optional(),
});
export type ShiftLogDto = z.infer<typeof shiftLogDto>;

/* ── Lab ──────────────────────────────────────────────────────────────── */
export const labResultEntryDto = z.object({
  sampleId: uuid,
  parameters: z
    .array(
      z.object({
        paramCode: z.string().min(1).max(40),
        value: z.number(),
        unit: z.string().max(20).optional(),
        method: z.string().max(60).optional(),
        specMin: z.number().optional(),
        specMax: z.number().optional(),
      }),
    )
    .min(1)
    .max(60),
  remarks: z.string().max(2000).optional(),
});
export type LabResultEntryDto = z.infer<typeof labResultEntryDto>;

/* ── Permits to work ──────────────────────────────────────────────────── */
export const permitCreateDto = z.object({
  id: uuid.optional(),
  workOrderId: uuid.optional(),
  type: z.enum(PERMIT_TYPES),
  areaDescription: z.string().min(5).max(1000),
  validFrom: isoDateTime,
  validTo: isoDateTime,
  isolations: z.array(z.object({ tag: z.string().max(60), description: z.string().max(400) })).default([]),
  gasTestResults: z.array(z.object({ at: isoDateTime, gas: z.string().max(30), value: z.number(), unit: z.string().max(12), passed: z.boolean() })).default([]),
  precautions: z.array(z.string().max(300)).default([]),
  crew: z.array(z.object({ userId: uuid, name: z.string().max(120), signatureRef: z.string().max(60).optional() })).min(1),
});
export type PermitCreateDto = z.infer<typeof permitCreateDto>;

/* ── Attendance / biometric ───────────────────────────────────────────── */
export const punchImportDto = z.object({
  deviceId: uuid,
  records: z
    .array(
      z.object({
        devicePunchId: z.string().min(1).max(64),
        employeePunchId: z.string().min(1).max(64),
        punchedAt: isoDateTime,
        punchType: z.enum(['IN', 'OUT', 'BREAK_OUT', 'BREAK_IN']),
        verifyMode: z.enum(['FINGER', 'FACE', 'CARD', 'PASSWORD']).optional(),
        status: z.enum(['OK', 'UNMATCHED', 'DUPLICATE']).default('OK'),
      }),
    )
    .min(1)
    .max(5000),
});
export type PunchImportDto = z.infer<typeof punchImportDto>;

export interface AttendanceDayDto {
  employeeId: string;
  employeeName: string;
  subDeptCode: string;
  workDate: string;
  shiftCode: string | null;
  firstIn: string | null;
  lastOut: string | null;
  lateMinutes: number;
  earlyMinutes: number;
  overtimeHours: number;
  status: 'PRESENT' | 'ABSENT' | 'LEAVE' | 'MISSION' | 'DAY_OFF' | 'UNRESOLVED';
  exceptions: string[];
}

/* ── Warehouse ────────────────────────────────────────────────────────── */
export const requisitionDto = z.object({
  id: uuid.optional(),
  workOrderId: uuid.optional(),
  costCenterCode: z.string().max(32),
  purpose: z.string().min(3).max(500),
  urgent: z.boolean().default(false),
  lines: z
    .array(z.object({ itemId: uuid, qty: z.number().positive().max(100000), uom: z.string().max(12), binId: uuid.optional() }))
    .min(1)
    .max(100),
});
export type RequisitionDto = z.infer<typeof requisitionDto>;

/* ── Commercial ───────────────────────────────────────────────────────── */
export const salesOrderDto = z.object({
  id: uuid.optional(),
  customerCode: z.string().min(2).max(32),
  productCode: z.enum(['UREA_GRANULAR', 'UREA_PRILLED', 'AMMONIA_LIQUID', 'AMMONIA_AQUOUS']),
  orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pricingBasis: z.enum(['TON', 'LOT', 'M3']),
  qtyOrderedTons: z.number().positive().max(200000),
  contractNo: z.string().max(64).optional(),
  currency: z.enum(['IQD', 'USD']),
  unitPrice: z.number().min(0),
  truckCount: z.number().int().min(0).max(5000).optional(),
});
export type SalesOrderDto = z.infer<typeof salesOrderDto>;

/* ── Mobile forms (نماذج قابلة للتعريف) ────────────────────────────────── */
export const mobileFormRecordDto = z.object({
  id: uuid.optional(),
  formCode: z.string().min(2).max(64),
  formVersion: z.number().int().positive(),
  assetId: uuid.optional(),
  workOrderId: uuid.optional(),
  readings: z.record(z.string(), z.union([z.number(), z.string(), z.boolean(), z.null()])).default({}),
  photos: z.array(z.object({ opId: z.string(), fileName: z.string(), mimeType: z.string().startsWith('image/'), sha256: z.string().length(64) })).default([]),
  gps: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), accuracyM: z.number().min(0).optional() }).optional(),
  offlineCapturedAt: isoDateTime,
});
export type MobileFormRecordDto = z.infer<typeof mobileFormRecordDto>;

/* ── KPIs ─────────────────────────────────────────────────────────────── */
export interface KpiSnapshotDto {
  asOfDate: string;
  scopeCode: string;
  oeePct: number | null;
  planCompliancePct: number | null;
  reactiveSharePct: number | null;
  mtbfHours: number | null;
  mttrHours: number | null;
  backlogWo: number | null;
  overdueWo: number | null;
  permitClosureRatePct: number | null;
  attendanceRatePct: number | null;
  spareAvailabilityPct: number | null;
  deliveredTons: number | null;
  ureaCapacityUtilizationPct: number | null;
}

/* ── Sync contracts (يعاد تصديرها في index) ───────────────────────────── */
export const pushRequestDto = z.object({
  deviceId: z.string().min(4).max(64),
  userId: uuid,
  schemaVersion: z.number().int().positive(),
  ops: z
    .array(
      z.object({
        opId: z.string().min(8).max(64),
        entity: z.string().min(2).max(64),
        recordId: z.string().min(8).max(64),
        kind: z.enum(['UPSERT', 'PATCH', 'DELETE']),
        data: z.record(z.string(), z.unknown()).optional(),
        baseVersion: z.number().int().nonnegative().optional(),
        clientTimestamp: isoDateTime,
        localWarnings: z.array(z.string().max(200)).optional(),
      }),
    )
    .min(1)
    .max(500),
});
export type PushRequestDto = z.infer<typeof pushRequestDto>;

export const pullRequestDto = z.object({
  deviceId: z.string().min(4).max(64),
  sinceCursor: z.number().int().nonnegative(),
  entities: z.array(z.string().min(2).max(64)).max(40).optional(),
  limit: z.number().int().min(1).max(2000).default(500),
});
export type PullRequestDto = z.infer<typeof pullRequestDto>;
