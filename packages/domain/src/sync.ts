/**
 * بروتوكول المزامنة (Offline-first Delta Sync) — العقد المشترك بين الخادم والعملاء.
 *
 * المبادئ:
 *  1) كل سجل قابل للمزامنة يحمل: id (UUIDv7 من العميل)، version (رقم متزايد على الخادم)،
 *     updatedAt، deletedAt (tombstone)، clientOpId (idempotency).
 *  2) العميل لا يكتب في قاعدة بيانات الشركة مباشرة: يدفع (push) دفعة من ChangeOp إلى /sync/push،
 *     ويسحب (pull) التغييرات منذ lastSeq عبر /sync/pull. الترتيب يُدار بـ LSN على الخادم.
 *  3) الصلاحيات تُطبَّق على الخادم لكل عملية على حدة (نفس Guard المستخدم في REST العادي).
 *  4) التعارض يُحسم بالسياسة المعلنة لكل كيان (mergePolicy) — وليس بحذف عمل المستخدم:
 *     - server_wins   : للسجلات المعتمدة (approved/closed) أو الحقول المالية.
 *     - field_merge   : دمج على مستوى الحقل (قراءات، صور، ملاحظات، قوائم).
 *     - append_only   : الجداول الحدثية (Events) لا تعدّل ولا تحذف، تُضاف فقط.
 *     - reject        : يُعاد للعميل conflict + نسخة الخادم ليقرّر (تُفتح شاشة "مراجعة التعارض").
 */

export const SCHEMA_VERSION = 3;

/** الكيانات المشاركة في المزامنة + سياسة الدمج + مستوى الأهمية (للجدولة) */
export interface SyncEntityMeta {
  entity: SyncEntity;
  table: string;
  merge: 'server_wins' | 'field_merge' | 'append_only' | 'reject';
  /** أولوية الدفع من الهاتف (1 = ادفع فورًا) */
  pushPriority: 1 | 2 | 3;
  /** هل يُسمح للعميل بإنشاء معرف (UUIDv7) — لازم للعمل دون اتصال */
  clientGeneratedIds: boolean;
  /** حقول تُكتب فوقها دائمًا من نسخة الخادم (لا تُدمج) */
  protectedFields?: string[];
  /** حقول تُعتبر أحداثًا (append) عند التعارض: ملاحظات/صور/تواقيع */
  appendFields?: string[];
  descriptionAr: string;
}

// قاعدة: كيان متزامن واحد لكل جدول فيزيائي — المرفقات تُدفع كـ document مع entityType/entityId،
// لأن جدولاً واحدًا لا يحتمل triggerَين يكتبان Change Feed مزدوجًا لنفس الصف.
export const SYNC_ENTITIES = [
  'workOrder', 'workOrderLog', 'laborEntry', 'partIssue',
  'shiftLog', 'processParam', 'downtime', 'alarmAck',
  'labSample', 'labResult',
  'permit', 'asset', 'assetReading', 'pmPlanInstance',
  'attendancePunch', 'leaveRequest', 'mobileFormRecord',
  'document', 'notificationAck',
] as const;
export type SyncEntity = (typeof SYNC_ENTITIES)[number];

export const SYNC_META: Record<SyncEntity, SyncEntityMeta> = {
  workOrder: {
    entity: 'workOrder', table: 'work_orders', merge: 'field_merge', pushPriority: 2, clientGeneratedIds: true,
    protectedFields: ['status', 'approverId', 'partsCost', 'laborCost', 'contractorCost', 'assetId', 'targetEndAt'],
    appendFields: ['description'],
    descriptionAr: 'أمر شغل: يدمج الوصف/الملاحظات حقلًا بحقل، لكن الحالة والاعتمادات من الخادم.',
  },
  workOrderLog: { entity: 'workOrderLog', table: 'wo_logs', merge: 'append_only', pushPriority: 1, clientGeneratedIds: true, descriptionAr: 'سجل تطوّر أمر الشغل (يُضاف فقط).' },
  laborEntry: { entity: 'laborEntry', table: 'wo_labor_entries', merge: 'append_only', pushPriority: 2, clientGeneratedIds: true, descriptionAr: 'ساعات العمالة المنفذة.' },
  partIssue: { entity: 'partIssue', table: 'part_requisitions', merge: 'reject', pushPriority: 1, clientGeneratedIds: false, descriptionAr: 'صرف قطع غيار: يمسّ الرصيد → لا يُقبل إلا بعد تحقق الخادم.' },
  shiftLog: {
    entity: 'shiftLog', table: 'production_shift_logs', merge: 'field_merge', pushPriority: 1, clientGeneratedIds: true,
    protectedFields: ['status', 'approvedById', 'approvedAt'], appendFields: ['notes', 'eventsJson'],
    descriptionAr: 'سجلوبة الوردية: بعد الاعتماد تُقفل (server_wins).',
  },
  processParam: { entity: 'processParam', table: 'process_parameters', merge: 'append_only', pushPriority: 2, clientGeneratedIds: true, descriptionAr: 'قراءات تشغيلية زمنية.' },
  downtime: { entity: 'downtime', table: 'equipment_downtimes', merge: 'field_merge', pushPriority: 1, clientGeneratedIds: true, appendFields: ['causeNotes'], protectedFields: ['verifiedById', 'verifiedAt'], descriptionAr: 'ساعات التوقف وأسبابها.' },
  alarmAck: { entity: 'alarmAck', table: 'production_alarms', merge: 'append_only', pushPriority: 1, clientGeneratedIds: true, descriptionAr: 'إقرارات الإنذارات.' },
  labSample: { entity: 'labSample', table: 'lab_samples', merge: 'field_merge', pushPriority: 2, clientGeneratedIds: true, protectedFields: ['status', 'workOrderId'], descriptionAr: 'طلبات التحليل.' },
  labResult: { entity: 'labResult', table: 'lab_results', merge: 'field_merge', pushPriority: 2, clientGeneratedIds: true, protectedFields: ['verifiedById', 'verifiedAt'], appendFields: ['remarks'], descriptionAr: 'نتائج التحاليل.' },
  permit: { entity: 'permit', table: 'permits_to_work', merge: 'reject', pushPriority: 1, clientGeneratedIds: true, protectedFields: ['status', 'areaApproverId', 'hseApproverId', 'closedAt'], descriptionAr: 'تصريح عمل: التعارض يرفض لأن السلامة لا تحتمل دمجًا.' },
  asset: { entity: 'asset', table: 'assets', merge: 'server_wins', pushPriority: 3, clientGeneratedIds: false, descriptionAr: 'سجل الأصول: الخادم مصدر الحقيقة.' },
  assetReading: { entity: 'assetReading', table: 'asset_readings', merge: 'append_only', pushPriority: 2, clientGeneratedIds: true, descriptionAr: 'قراءات مراقبة الحالة.' },
  pmPlanInstance: { entity: 'pmPlanInstance', table: 'pm_plan_instances', merge: 'server_wins', pushPriority: 2, clientGeneratedIds: false, descriptionAr: 'مواعيد PM يولّدها المجدول على الخادم.' },
  attendancePunch: { entity: 'attendancePunch', table: 'attendance_punches', merge: 'append_only', pushPriority: 3, clientGeneratedIds: true, descriptionAr: 'بصمة يدوية/استكمال (يُسجَّل مصدرها).' },
  leaveRequest: { entity: 'leaveRequest', table: 'leave_requests', merge: 'field_merge', pushPriority: 3, clientGeneratedIds: true, protectedFields: ['status', 'approverUserId', 'decidedAt'], descriptionAr: 'طلب إجازة.' },
  mobileFormRecord: { entity: 'mobileFormRecord', table: 'mobile_form_records', merge: 'append_only', pushPriority: 1, clientGeneratedIds: true, descriptionAr: 'نماذج ميدانية معرّفة (JSON Schema).' },
  document: { entity: 'document', table: 'documents', merge: 'append_only', pushPriority: 3, clientGeneratedIds: true, descriptionAr: 'وثيقة/مرفق مع فهرس Meta.' },
  notificationAck: { entity: 'notificationAck', table: 'notifications', merge: 'append_only', pushPriority: 3, clientGeneratedIds: false, descriptionAr: 'قراءة/إقرار إشعار.' },
};

export const SYNC_ENTITY_SET = new Set<string>(SYNC_ENTITIES);
export type MergeStrategy = SyncEntityMeta['merge'];
export function mergePolicyOf(entity: string): MergeStrategy {
  return (SYNC_META as Record<string, SyncEntityMeta>)[entity]?.merge ?? 'reject';
}
export function tableOf(entity: string): string {
  const meta = (SYNC_META as Record<string, SyncEntityMeta>)[entity];
  if (!meta) throw new Error(`unknown sync entity: ${entity}`);
  return meta.table;
}

export type OpKind = 'UPSERT' | 'PATCH' | 'DELETE';

export interface ChangeOp {
  /** معرف العملية — يمنع التكرار عند إعادة الإرسال (idempotency key) */
  opId: string;
  seq?: number;
  entity: SyncEntity;
  /** UUIDv7 يولّده العميل عند الإنشاء دون اتصال */
  recordId: string;
  kind: OpKind;
  /** نسخة العميل من الحقول (PATCH: الحقول المتغيرة فقط) */
  data?: Record<string, unknown>;
  /** رقم إصدار السجل الذي بنى عليه العميل تعديله */
  baseVersion?: number;
  /** طابع زمن العميل (يُستخدم للتشخيص فقط، لا للحسم) */
  clientTimestamp: string;
  /** أي انحراف عن المخطط (يُسجَّل للمتابعة) */
  localWarnings?: string[];
}

export interface PushRequest {
  deviceId: string;
  userId: string;
  schemaVersion: number;
  ops: ChangeOp[];
}

export type PushOutcome = 'APPLIED' | 'MERGED' | 'CONFLICT' | 'REJECTED' | 'DEDUPLICATED';

export interface PushResult {
  opId: string;
  recordId: string;
  outcome: PushOutcome;
  serverVersion?: number;
  serverSeq?: number;
  /** نسخة الخادم عند التعارض ليعيد العميل عرضها للمستخدم */
  serverRecord?: Record<string, unknown>;
  reasonAr?: string;
  /** الحقول التي احتُفظ بنسخة الخادم منها (server_wins / protected) */
  serverKeptFields?: string[];
}

export interface PushResponse {
  serverTime: string;
  /** تسلسل الخادم الجديد — يُستخدم كـ cursor للسحب التالي */
  nextCursor: number;
  results: PushResult[];
}

export interface PullRequest {
  deviceId: string;
  /** cursor = serverSeq الذي وصل إليه العميل */
  sinceCursor: number;
  entities?: SyncEntity[];
  /** حدود البيانات (تفرضها الخادم أيضًا حسب صلاحيات المستخدم) */
  limit?: number;
}

export interface PullChange {
  seq: number;
  entity: SyncEntity;
  recordId: string;
  version: number;
  deleted: boolean;
  data: Record<string, unknown>;
}

export interface PullResponse {
  serverTime: string;
  cursor: number;
  hasMore: boolean;
  changes: PullChange[];
  /** إعادة تعيين كاملة مطلوبة (تغيّر المخطط أو فائض الحذف) */
  fullResyncRequired?: boolean;
  resyncReasonAr?: string;
}

/* ───────────────────────────── دمج الحقول ───────────────────────────── */

export interface MergeDecision {
  merged: Record<string, unknown>;
  keptFromServer: string[];
  conflict: boolean;
}

const isBlank = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

/**
 * دمج على مستوى الحقل: يأخذ من العميل ما هو مسموح (غير محمي ومُعدَّل فعلًا)،
 * ويضيف بدل الاستبدال في الحقول الحدثية (appendFields).
 */
export function mergeFieldwise(
  server: Record<string, unknown>,
  client: Record<string, unknown>,
  meta: SyncEntityMeta,
): MergeDecision {
  const merged: Record<string, unknown> = { ...server };
  const keptFromServer: string[] = [];
  const protectedSet = new Set(meta.protectedFields ?? []);
  const appendSet = new Set(meta.appendFields ?? []);
  let conflict = false;

  for (const [key, clientVal] of Object.entries(client)) {
    if (protectedSet.has(key)) {
      if (!isBlank(server[key]) && !Object.is(server[key], clientVal)) conflict = true;
      keptFromServer.push(key);
      continue;
    }
    if (isBlank(clientVal)) continue; // لا يمسح العميل حقلاً غير مُدخل
    if (appendSet.has(key)) {
      merged[key] = appendValue(server[key], clientVal);
      continue;
    }
    merged[key] = clientVal;
  }
  return { merged, keptFromServer, conflict };
}

/**
 * دمج القيم الحدثية.
 *  - نص/نص  → إلحاق السطر الجديد بأسطر الخادم مع إزالة الأسطر المكررة (يبقى النوع نصًا).
 *  - قوائم/أشياء → دمج قوائم مع إزالة التكرار بالمعرّف الداخلي أو بقيمة العنصر.
 * يضمن هذا أن حقول مثل description/notes تبقى بنوعها الأصلي في قاعدة البيانات
 * بدل أن تتحول إلى JSON array بصيغة لا تقبلها عمود TEXT.
 */
export function appendValue(serverVal: unknown, clientVal: unknown): unknown {
  if (typeof serverVal === 'string' || typeof clientVal === 'string') {
    const toLines = (v: unknown): string[] =>
      typeof v === 'string' ? v.split('\n').map((x) => x.trim()).filter(Boolean) : [];
    const a = toLines(serverVal);
    const b = toLines(clientVal);
    const seen = new Set<string>(a);
    const merged = [...a];
    for (const line of b) {
      if (seen.has(line)) continue;
      seen.add(line);
      merged.push(line);
    }
    return merged.join('\n');
  }
  const toArray = (v: unknown): unknown[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
  const a = toArray(serverVal);
  const b = toArray(clientVal);
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const item of [...a, ...b]) {
    const key =
      item && typeof item === 'object'
        ? ((item as Record<string, unknown>).id as string) ?? JSON.stringify(item)
        : String(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** القرار النهائي للتعارض حسب سياسة الكيان */
export function resolveConflict(input: {
  entity: SyncEntity;
  server: Record<string, unknown>;
  client: Record<string, unknown>;
  serverApproved: boolean;
}): { action: 'APPLY_CLIENT' | 'MERGE' | 'KEEP_SERVER' | 'REJECT'; decision?: MergeDecision; reasonAr?: string } {
  const meta = SYNC_META[input.entity];
  if (!meta) return { action: 'REJECT', reasonAr: 'كيان غير معروف للمزامنة' };
  if (input.serverApproved && meta.protectedFields && meta.protectedFields.length > 0) {
    if (meta.merge === 'field_merge') return { action: 'MERGE', decision: mergeFieldwise(input.server, input.client, meta) };
    return { action: 'KEEP_SERVER', reasonAr: 'السجل معتمد على الخادم — التعديل الميداني حُفظ كمسودة مراجعة' };
  }
  switch (meta.merge) {
    case 'append_only':
      return { action: 'APPLY_CLIENT' };
    case 'field_merge':
      return { action: 'MERGE', decision: mergeFieldwise(input.server, input.client, meta) };
    case 'server_wins':
      return { action: 'KEEP_SERVER', reasonAr: 'الخادم مصدر الحقيقة لهذا الكيان' };
    case 'reject':
      return { action: 'REJECT', reasonAr: 'تعارض في سجل حسّاس — يتطلب مراجعة يدوية' };
  }
}

/** التحقق من صحة دفعة قبل الإرسال (على العميل) — يمنع إرسال ops غير مكتملة */
export function validatePush(req: PushRequest): string[] {
  const errors: string[] = [];
  if (req.schemaVersion !== SCHEMA_VERSION) errors.push(`إصدار مخطط غير متوافق (${req.schemaVersion} != ${SCHEMA_VERSION})`);
  if (!req.deviceId) errors.push('deviceId مطلوب');
  if (!req.userId) errors.push('userId مطلوب');
  const seen = new Set<string>();
  for (const op of req.ops) {
    if (!op.opId) errors.push('كل عملية تحتاج opId');
    else if (seen.has(op.opId)) errors.push(`opId مكرر: ${op.opId}`);
    seen.add(op.opId);
    if (!SYNC_ENTITY_SET.has(op.entity)) errors.push(`كيان غير معروف: ${op.entity}`);
    if (!op.recordId) errors.push('recordId مطلوب');
    if (op.kind === 'DELETE' && !SYNC_META[op.entity]) errors.push('حذف لكيان غير مدعوم');
    if (op.kind === 'DELETE' && SYNC_META[op.entity]?.clientGeneratedIds === false)
      errors.push(`${op.entity}: الحذف يتم على الخادم فقط`);
    if (op.kind === 'PATCH' && (!op.data || Object.keys(op.data).length === 0))
      errors.push(`${op.entity}/${op.recordId}: PATCH بلا حقول`);
  }
  return errors;
}

/** تقسيم الدفعة إلى شرائح حسب الأولوية (يُستخدم في الهاتف عند عودة الشبكة) */
export function planPushBatches(ops: ChangeOp[], maxBatch = 200): ChangeOp[][] {
  const rank = (e: SyncEntity) => SYNC_META[e]?.pushPriority ?? 3;
  const sorted = [...ops].sort((a, b) => rank(a.entity) - rank(b.entity) || a.clientTimestamp.localeCompare(b.clientTimestamp));
  const batches: ChangeOp[][] = [];
  for (let i = 0; i < sorted.length; i += maxBatch) batches.push(sorted.slice(i, i + maxBatch));
  return batches;
}
