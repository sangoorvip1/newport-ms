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

/* ── المختبر: العينات، النتائج، التدقيق، حالات خارج المطابقة ─────────────
 * العقود تُطابِق `packages/domain/src/lab.ts` (آلتا الحالة (العينة وOOS) مشتركتان بين الخادم والواجهات — انظر docs/05 §4).
 * لا يُقبل من العميل ما يختمه الخادم: sampleNumber، isOutOfSpec، verifiedById/At، حالة العينة.
 */
export const labSampleCreateDto = z.object({
  id: uuid.optional(),
  /** رمز الوحدة كما في org/ProductionUnit: UREA | AMMONIA | COOLING_TOWER | UTILITY | LAB */
  unitCode: z.string().min(2).max(24),
  /** نوع العينة: PRODUCT | SUB_MICRON | PROCESS | BOILER_WATER | COOLING_WATER | STEAM | RAW */
  sampleType: z.string().min(2).max(40),
  pointTag: z.string().max(48).optional(),
  collectedAt: isoDateTime,
  /** الشعبة المالكة للعينة؛ إن غابت تُؤخذ من ملف المستخدم — لا تُترك للعميل ليوسّع نطاقه */
  forSubDeptCode: z.string().regex(/^(PROD|MAINT|ADM)-[A-Z]{2,12}$/, 'رمز شعبة غير صالح').optional(),
  workOrderId: uuid.optional(),
  logId: uuid.optional(),
  isFastTracked: z.boolean().default(false),
  integrityJson: z
    .object({
      sealsOk: z.boolean().default(true),
      temperatureC: z.number().min(-30).max(80).optional(),
      holdTimeMin: z.number().int().min(0).max(2880).optional(),
      transportedBy: z.string().max(80).optional(),
      notes: z.string().max(400).optional(),
    })
    .optional(),
});
export type LabSampleCreateDto = z.infer<typeof labSampleCreateDto>;

/** رقم عشري حتى 5 منازل (Decimal(14,5)) — يُقبل نصًا حفاظًا على الدقة من الهاتف */
const decimalValue = z.union([z.number().finite(), z.string().regex(/^-?\d{1,9}(\.\d{1,5})?$/)]);

export const labResultEntryDto = z.object({
  results: z
    .array(
      z.object({
        parameterCode: z.string().min(1).max(40),
        value: decimalValue,
        unit: z.string().max(20).optional(),
        method: z.string().max(80).optional(),
        remarks: z.string().max(600).optional(),
      }),
    )
    .min(1)
    .max(60),
  noteAr: z.string().max(2000).optional(),
});
export type LabResultEntryDto = z.infer<typeof labResultEntryDto>;

export const labVerifyDto = z.object({
  decision: z.enum(['VERIFIED', 'REJECTED']),
  remarks: z.string().min(3).max(600).optional(),
});
export type LabVerifyDto = z.infer<typeof labVerifyDto>;

export const labOosUpdateDto = z
  .object({
    status: z.enum(['OPEN', 'INVESTIGATING', 'CAPA_DEFINED', 'EFFECTIVENESS_CHECK', 'CLOSED', 'REJECTED']).optional(),
    rootCauseAr: z.string().min(3).max(4000).optional(),
    capaAr: z.string().min(3).max(4000).optional(),
    severity: z.enum(['MINOR', 'MAJOR', 'CRITICAL']).optional(),
    noteAr: z.string().max(600).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'لا تحديث فارغ' });
export type LabOosUpdateDto = z.infer<typeof labOosUpdateDto>;

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

/* ── الوثائق والصور الميدانية (قناة المستودع) ────────────────────────────
 * مساران متكافئان: JSON+base64 (مناسب لسطح المكتب ولصور صغيرة) أو presign+PUT خام
 * (مناسب لكاميرا الهاتف: لا يضاعف الحجم 33% ولا يستهلك ذاكرة الجهاز).
 * الحقلان sizeBytes/sha256 **لا يقبلهما الخادم من العميل** — يُحسبان من البايتات الفعلية،
 * وإلا صار بالإمكان تضليل سجل الوثائق بحجم/بصمة وهمية.
 */
export const DOCUMENT_ENTITY_TYPES = ['workOrder', 'workOrderLog', 'labSample', 'labResult', 'shiftLog', 'downtime', 'permit', 'asset', 'assetReading', 'leaveRequest', 'partIssue'] as const;

const documentCore = {
  id: uuid.optional(),
  docType: z.string().min(2).max(32),
  titleAr: z.string().min(2).max(240),
  categoryCode: z.string().max(32).optional(),
  code: z.string().max(48).optional(),
  entityType: z.enum(DOCUMENT_ENTITY_TYPES).optional(),
  entityId: uuid.optional(),
  originalName: z.string().min(2).max(240),
  mimeType: z.string().min(4).max(80),
  isEncrypted: z.boolean().default(false),
};

export const documentUploadDto = z.object({
  ...documentCore,
  /** حتى ~8 ميغابايت بعد فك الترميز (الحد في الخادم STORAGE_MAX_UPLOAD_BYTES) */
  dataBase64: z.string().min(8).max(14_000_000),
});
export type DocumentUploadDto = z.infer<typeof documentUploadDto>;

/** طلب رابط رفع خام — يعيد الخادم توكنًا موقّعًا قصير العمر لمسار PUT */
export const documentPresignDto = z.object({
  ...documentCore,
  /** الحجم المتوقع من العميل — يُستعمل كسقف معلن فقط؛ السقف الحقيقي يُطبَّق أثناء البث */
  expectedSizeBytes: z.number().int().positive().max(64 * 1024 * 1024).optional(),
});
export type DocumentPresignDto = z.infer<typeof documentPresignDto>;

/** تحديث بيانات وصفية (شعبة الوثائق فقط) — البايتات نفسها لا تُستبدل من هنا */
export const documentMetadataDto = z
  .object({
    titleAr: z.string().min(2).max(240).optional(),
    docType: z.string().min(2).max(32).optional(),
    categoryCode: z.string().max(32).optional(),
    code: z.string().max(48).optional(),
    status: z.enum(['DRAFT', 'ISSUED', 'SUPERSEDED', 'OBSOLETE', 'APPROVED']).optional(),
    revision: z.string().max(12).optional(),
    entityType: z.enum(DOCUMENT_ENTITY_TYPES).optional(),
    entityId: uuid.optional(),
    isEncrypted: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'لا تحديث فارغ' });
export type DocumentMetadataDto = z.infer<typeof documentMetadataDto>;

export const documentListQueryDto = z.object({
  entityType: z.enum(DOCUMENT_ENTITY_TYPES).optional(),
  entityId: uuid.optional(),
  docType: z.string().max(32).optional(),
  mine: z.boolean().default(false),
  take: z.number().int().min(1).max(100).default(25),
  skip: z.number().int().min(0).default(0),
});
export type DocumentListQueryDto = z.infer<typeof documentListQueryDto>;
