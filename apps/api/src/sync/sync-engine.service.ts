import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  SCHEMA_VERSION,
  SYNC_META,
  mergePolicyOf,
  resolveConflict,
  validatePush,
  type ChangeOp,
  type PullChange,
  type PullResponse,
  type PushOutcome,
  type PushRequest,
  type PushResponse,
  type PushResult,
  type SyncEntity,
} from '@newport/domain';
import { PrismaService } from '../common/prisma.service.js';
import type { AccessContext } from '../security/access.guard.js';

/**
 * صيغة uuid (v4 وv7 معًا) — تُستعمل للرفض قبل أي استعلام خام، لا بديلًا عن فحص الـDTO:
 * `recordId` مسموح في العقد بين 8 و64 حرفًا (قيود عملاء قدامى)، لكن أعمدة المفاتيح كلها uuid،
 * فغير الصالح منها كان يسقط الدفعة كلها بـ500 بدل أن يُرفض سجله وحده بسببً مفهومًا.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** كيان المزامنة ↔ جدول PostgreSQL ↔ أعمدة يُسمح للخادم بختامها */
interface EntityMap {
  table: string;
  /** حقل الشعبة المستخدم في فلترة النطاق على السجل نفسه */
  subDeptColumn?: string;
  departmentColumn?: string;
  creatorColumn?: string;
  /** حقول يختمها الخادم دائمًا ولا تُقبل من العميل */
  stamp: Record<string, string>;
}

/**
 * سجلات تحمل رقم عمل (business number). بلا هذا يختمه مسار REST وحده، فيُنشأ سجل بلا رقم من جهاز
 * بلا اتصال — و`lab_samples.sampleNumber` NOT NULL فيُرفض الإدراج أصلًا. القياس: أمر شغل أُنشئ
 * من الهاتف و`number` فيه null. التوليد من نفس دالة القاعدة `next_business_number` حتى لا يختلف
 * الرقم باختلاف القناة (نفس التسلسل ⇒ لا تكرار، ونفس البادئة/العقد).
 */
const NUMBER_STAMP: Partial<Record<SyncEntity, { col: string; seq: string; prefix: string }>> = {
  workOrder: { col: 'number', seq: 'wo_number_seq', prefix: 'WO' },
  labSample: { col: 'sampleNumber', seq: 'lab_sample_number_seq', prefix: 'SMP' },
};

const ENTITY_MAP: Record<SyncEntity, EntityMap> = {
  workOrder: { table: 'work_orders', subDeptColumn: '"subDeptId"', departmentColumn: '"departmentId"', creatorColumn: '"createdById"', stamp: {} },
  workOrderLog: { table: 'wo_logs', creatorColumn: '"byUserId"', stamp: { woId: 'workOrderId' } },
  laborEntry: { table: 'wo_labor_entries', creatorColumn: 'null', stamp: {} },
  partIssue: { table: 'part_requisitions', creatorColumn: '"requestedById"', stamp: {} },
  shiftLog: { table: 'production_shift_logs', creatorColumn: '"preparedById"', stamp: {} },
  processParam: { table: 'process_parameters', stamp: {} },
  downtime: { table: 'equipment_downtimes', creatorColumn: '"loggedById"', stamp: {} },
  alarmAck: { table: 'production_alarms', stamp: {} },
  labSample: { table: 'lab_samples', subDeptColumn: '"subDeptId"', creatorColumn: '"collectedById"', stamp: {} },
  labResult: { table: 'lab_results', creatorColumn: '"enteredById"', stamp: {} },
  permit: { table: 'permits_to_work', creatorColumn: '"requestedById"', stamp: {} },
  asset: { table: 'assets', subDeptColumn: '"subDeptId"', stamp: {} },
  assetReading: { table: 'asset_readings', creatorColumn: '"byUserId"', stamp: {} },
  pmPlanInstance: { table: 'pm_plan_instances', stamp: {} },
  attendancePunch: { table: 'attendance_punches', stamp: {} },
  leaveRequest: { table: 'leave_requests', stamp: {} },
  mobileFormRecord: { table: 'mobile_form_records', creatorColumn: 'null', stamp: {} },
  document: { table: 'documents', creatorColumn: '"uploadedById"', stamp: {} },
  notificationAck: { table: 'notifications', stamp: {} },
};

/** الأعمدة الفعلية لكل جدول — تُقرأ مرة واحدة من information_schema ثم تُخزَّن في الذاكرة */
/** `udt` = اسم النوع الحقيقي من الـcatalog: وحده ما يصلح لصيغة التحويل، لأن enums تظهر في information_schema باسم USER-DEFINED */
type ColumnMeta = { column: string; type: string; udt: string; notNull: boolean; hasDefault: boolean };

@Injectable()
export class SyncEngineService {
  private readonly logger = new Logger(SyncEngineService.name);
  private readonly columnsCache = new Map<string, ColumnMeta[]>();
  /** أنواع الأعمدة لكل جدول (لأغراض الصرائر في SQL الخام) — أوسع من columnsCache ولا تُرشَّح فيها شيء */
  private readonly typesCache = new Map<string, Map<string, string>>();
  private readonly auditCache = new Map<string, string[]>();

  constructor(private readonly prisma: PrismaService) {}

  /* ══════════════════════════ PUSH (العميل → الخادم) ══════════════════════════ */

  async push(req: PushRequest, access: AccessContext): Promise<PushResponse> {
    const errors = validatePush(req as never);
    if (errors.length) throw new BadRequestException({ statusCode: 400, messageAr: 'دفعة المزامنة مرفوضة', errors });
    if (SCHEMA_VERSION !== req.schemaVersion) {
      throw new BadRequestException({
        statusCode: 409,
        messageAr: `إصدار قاعدة البيانات على الجهاز (${req.schemaVersion}) غير مطابق للخادم (${SCHEMA_VERSION}) — يجب تحديث التطبيق`,
      });
    }

    const results: PushResult[] = [];
    for (const op of req.ops) {
      results.push(await this.applyOp(op, req, access));
    }

    const lastSeq = await this.currentSeq();
    // تحديث موضع الجهاز/المستخدم (للمراقبة ولملء "آخر مزامنة" في الواجهة)
    await this.prisma.$executeRaw`UPDATE devices SET "lastSyncAt" = now(), "pendingOps" = GREATEST(0, "pendingOps" - ${req.ops.length}), "appVersion" = COALESCE("appVersion", 'n/a') WHERE "externalId" = ${req.deviceId}`
      .catch(() => undefined);

    return { serverTime: new Date().toISOString(), nextCursor: Number(lastSeq), results };
  }

  private async applyOp(op: ChangeOp, req: PushRequest, access: AccessContext): Promise<PushResult> {
    const base = { opId: op.opId, recordId: op.recordId };
    const meta = SYNC_META[op.entity];
    const map = ENTITY_MAP[op.entity];
    if (!meta || !map) return { ...base, outcome: 'REJECTED', reasonAr: 'كيان غير معروف' };

    // كل مفاتيح جداول المزامنة uuid: لو تُرِك recordId كما هو لوصل إلى استعلام خام يفشل
    // بـ22P02 فتعود الدفعة كلها 500. الرفض هنا لكل عملية وحدها، فيُصلح العميل سجله ويعيد إرساله.
    if (!UUID_RE.test(op.recordId)) {
      return { ...base, outcome: 'REJECTED', reasonAr: 'recordId يجب أن يكون uuid صالحًا (يولّد العميل uuid v7) — العملية مرفوضة ولم تُطبَّق' };
    }

    // 1) Idempotency: إعادة إرسال نفس العملية بعد انقطاع الشبكة لا تُنتج تكرارًا
    const dup = await this.prisma.$queryRaw<Array<{ "opId": string }>>`SELECT "opId" FROM sync_idempotency WHERE "opId" = ${op.opId} LIMIT 1`;
    if (dup.length) {
      const cached = await this.prisma.$queryRaw<Array<{ "resultJson": unknown }>>`SELECT "resultJson" FROM sync_idempotency WHERE "opId" = ${op.opId}`;
      const parsed = (cached[0]?.resultJson ?? {}) as { outcome?: PushOutcome; serverSeq?: number; keptFields?: string[] };
      return {
        ...base,
        outcome: parsed.outcome ?? 'DEDUPLICATED',
        serverSeq: parsed.serverSeq,
        serverKeptFields: parsed.keptFields?.length ? parsed.keptFields : undefined,
        reasonAr: 'العملية مطبقة مسبقًا (idempotency) — هذا رد الخادم الأصلي نفسه',
      };
    }

    // 2) صلاحية الكيان (الدفاع الثاني بعد الواجهة)
    if (!access.can('sync.push' as never)) return { ...base, outcome: 'REJECTED', reasonAr: 'لا تملك صلاحية المزامنة' };
    const gate = this.permissionGate(op, meta, access);
    if (gate) return { ...base, outcome: 'REJECTED', reasonAr: gate };

    // 2أ) المرفقات: objectKey/sha256/sizeBytes تُختم من الملفات الفعلية في الخادم، فلا يُقبل إنشاؤها
    // عبر المزامنة (عميل قديم كان يرسل objectKey بصيغة offline/... يشير إلى بايتات غير موجودة).
    if (meta.restOnly) {
      return { ...base, outcome: 'REJECTED', reasonAr: `${meta.descriptionAr} — الرفع عبر POST /v1/documents/upload أو presign ثم PUT، والحذف عبر POST /v1/documents/:id/delete` };
    }

    // 2ب) السجلات الحدثية لا تُحذف إطلاقًا — نفحصها قبل أي استعلام نطاق
    if (op.kind === 'DELETE' && meta.merge === 'append_only') {
      return { ...base, outcome: 'REJECTED', reasonAr: 'سجل حدثي لا يُحذف (append-only)' };
    }

    try {
      // 3) النطاق: لا يُقبل تعديل سجلات خارج شعبة المستخدم/قسمه (ما لم يكن facility-wide)
      // داخل try لأن فحص النطاق استعلام خام — أي مفاجئة منه تُرد على العملية وحدها لا على الدفعة.
      if (op.kind !== 'UPSERT' || !map.stamp.workOrderId) {
        const inside = await this.recordInScope(op.entity, op.recordId, access, op.kind === 'UPSERT');
        if (inside === false) return { ...base, outcome: 'REJECTED', reasonAr: 'السجل خارج نطاق صلاحياتك' };
      }
      if (op.kind === 'DELETE') return await this.applyDelete(op, access, base);
      return await this.applyWrite(op, req, access, base);
    } catch (e) {
      this.logger.error(`sync push failed ${op.entity}/${op.recordId}: ${(e as Error).message}`);
      return { ...base, outcome: 'REJECTED', reasonAr: `تعذّر تطبيق العملية: ${(e as Error).message.slice(0, 160)}` };
    }
  }

  /** البوابة: هل للكيان صلاحية كتابة مطلوبة صراحةً؟ (المالية/البصمة لا تُقبل من الهاتف إلا بمصادقة) */
  private permissionGate(op: ChangeOp, meta: (typeof SYNC_META)[SyncEntity], access: AccessContext): string | null {
    if (op.kind === 'DELETE' && meta.merge !== 'append_only') {
      const canDelete = access.can('maint.wo.cancel' as never) || access.profile.isFacilityWide;
      if (!canDelete && ['workOrder', 'shiftLog', 'labSample', 'labResult', 'permit'].includes(op.entity)) {
        return 'الحذف محصور بصلاحيات الاعتماد/الإلغاء';
      }
    }
    if (op.entity === 'partIssue' && !access.can('wh.req.create' as never)) return 'requires wh.req.create';
    if (op.entity === 'permit' && !access.can('maint.permit.create' as never)) return 'requires maint.permit.create';
    if (op.entity === 'shiftLog' && !access.can('prod.log.create' as never)) return 'requires prod.log.create';
    if (op.entity === 'labResult' && !access.can('lab.result.enter' as never)) return 'requires lab.result.enter';
    if (op.entity === 'attendancePunch' && !access.can('hr.att.correct' as never) && !access.can('hr.att.import' as never))
      return 'requires hr.att.correct or hr.att.import';
    if (op.entity === 'mobileFormRecord' && !access.can('hr.form.create' as never)) return 'requires hr.form.create';
    if (op.entity === 'assetReading' && !access.can('maint.condition.record' as never)) return 'requires maint.condition.record';
    if (op.entity === 'laborEntry' && !access.can('maint.wo.execute' as never)) return 'requires maint.wo.execute';
    if (op.entity === 'pmPlanInstance' || op.entity === 'asset') return 'كيان يملكه الخادم فقط';
    return null;
  }

  private async recordInScope(entity: SyncEntity, recordId: string, access: AccessContext, allowMissing: boolean): Promise<boolean | null> {
    if (access.profile.isFacilityWide) return true;
    const map = ENTITY_MAP[entity];
    const subCol = map.subDeptColumn;
    const deptCol = map.departmentColumn;
    const creatorCol = map.creatorColumn;
    if (!subCol && !deptCol && (!creatorCol || creatorCol === 'null')) return null; // لا يوجد عمود نطاق → نثق ببوابة الصلاحية
    // قيم المعرّفات تُمرَّر معاملات (parameters) لا نصوصًا مفرغة: أرقام UUID بلا اقتباس
    // كانت تكسر SQL («trailing junk after numeric literal») وتفتح حقنًا لو جاءت من مصدر أضعف.
    const parts: Prisma.Sql[] = [];
    if (subCol && subCol !== 'null') {
      parts.push(Prisma.sql`${Prisma.raw(subCol)} IN (SELECT id FROM sub_departments WHERE "departmentId" = ${access.profile.departmentId}::uuid)`);
    }
    if (deptCol && deptCol !== 'null') {
      parts.push(Prisma.sql`${Prisma.raw(deptCol)} = ${access.profile.departmentId}::uuid`);
    }
    if (creatorCol && creatorCol !== 'null') {
      parts.push(Prisma.sql`${Prisma.raw(creatorCol)} = ${access.userId}::uuid`);
    }
    if (parts.length === 0) return null;
    const sql = Prisma.sql`SELECT 1 FROM ${Prisma.raw(map.table)} WHERE id = ${recordId}::uuid AND (${Prisma.join(parts, ' OR ')}) LIMIT 1`;
    const rows = await this.prisma.$queryRaw<unknown[]>(sql);
    if (rows.length) return true;
    return allowMissing ? null : false;
  }

  private async applyWrite(op: ChangeOp, req: PushRequest, access: AccessContext, base: { opId: string; recordId: string }): Promise<PushResult> {
    const map = ENTITY_MAP[op.entity];
    const cols = await this.safeColumns(map.table);
    const incoming = sanitize(op.data ?? {}, cols);
    const existing = await this.readRow(map.table, op.recordId, cols);

    // إنشاء جديد
    if (!existing) {
      if (op.kind === 'PATCH') return { ...base, outcome: 'REJECTED', reasonAr: 'السجل غير موجود على الخادم' };
      // حقول الهوية والنطاق يختمها الخادم دائمًا؛ أي محاولة من العميل لفرض قيمة مختلفة تُسجَّل
      // (المقارنة على بيانات العميل الخام، لأن sanitize تُسقط هذه الأعمدة قبل الدمج)
      const stamp = serverStamp(op.entity, access);
      const rawIncoming = op.data ?? {};
      const attemptedOverrides = Object.keys(stamp).filter((k) => k in rawIncoming && rawIncoming[k] !== stamp[k]);
      if (attemptedOverrides.length) {
        await this.recordConflict(op, {}, Object.fromEntries(attemptedOverrides.map((k) => [k, rawIncoming[k]])), 'SERVER_STAMPED', access, attemptedOverrides);
      }
      const data = { ...incoming, ...stamp };
      if (Object.keys(data).length === 0) return { ...base, outcome: 'REJECTED', reasonAr: 'لا توجد حقول صالحة' };
      // رقم العمل يُختم من الخادم دائمًا: نسخة العميل المحليّة (قد تكون «WO-1» على الجهاز) تُستبدل،
      // وإلا تصادم الرقم مع سجل من قناة أخرى أو تكرّر داخل الجهاز نفسه بعد إعادة التسمية.
      const numSpec = NUMBER_STAMP[op.entity];
      if (numSpec) {
        const gen = await this.prisma.$queryRawUnsafe<Array<{ n: string }>>(
          `SELECT next_business_number($1::regclass, $2, EXTRACT(YEAR FROM now())::int, 6) AS n`,
          numSpec.seq,
          numSpec.prefix,
        );
        if (!gen[0]?.n) return { ...base, outcome: 'REJECTED', reasonAr: 'تعذّر توليد رقم السجل من التسلسل — أعد المزامنة' };
        data[numSpec.col] = gen[0].n;
      }
      // الأعمدة الفعلية للجدول فقط: ليست كل الجداول تحمل version/clientOpId/isOfflineCreated
      const hasCol = (n: string) => cols.some((c) => c.column === n);
      const values: unknown[] = [op.recordId];
      const colNames: string[] = ['id'];
      const castCols: string[] = ['id'];
      for (const c of Object.keys(data)) {
        colNames.push(`"${c}"`);
        castCols.push(c);
        values.push(encode(data[c]));
      }
      if (hasCol('version')) {
        colNames.push('"version"');
        castCols.push('version');
        values.push(1);
      }
      if (hasCol('clientOpId')) {
        colNames.push('"clientOpId"');
        castCols.push('clientOpId');
        values.push(op.opId);
      }
      if (hasCol('isOfflineCreated')) {
        colNames.push('"isOfflineCreated"');
        castCols.push('isOfflineCreated');
        values.push(true);
      }
      // برزما يملأ @createdAt/@updatedAt من تلقاء نفسه عند create()، أما SQL الخام فيتخطّاهما؛ وtouch هنا
      // على UPDATE فقط (قيس بـ pg_get_triggerdef: trg_touch :: BEFORE UPDATE) ⇒ كل إنشاء بلا اتصال كان
      // يسقط بقيد NOT NULL على updatedAt. تُختم هنا بالوقت الحالي بدل أن تُرسَل قيم من العميل.
      const auditCols = (await this.timeStampsToFill(map.table)).filter((n) => !(n in data));
      const types = await this.columnTypes(map.table);
      const placeholders = values.map((_, i) => `$${i + 1}${this.castFor(types, castCols[i]!)}`);
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO ${map.table} (${[...colNames, ...auditCols.map((n) => `"${n}"`)].join(', ')}) VALUES (${[...placeholders, ...auditCols.map(() => 'now()')].join(', ')})`,
        ...values,
      );
      return await this.success(base, op, 'APPLIED', undefined, access);
    }

    // تحديث: يُطبَّق قرار التعارض من @newport/domain (نفس المنطق على العميل والخادم)
    const serverApproved = isApproved(existing, op.entity);
    const decision = resolveConflict({
      entity: op.entity,
      server: existing,
      client: incoming,
      serverApproved,
    });

    if (decision.action === 'REJECT') {
      await this.recordConflict(op, existing, incoming, 'REJECTED', access, Object.keys(colsMap(incoming)));
      return { ...base, outcome: 'REJECTED', reasonAr: decision.reasonAr ?? 'تعارض', serverRecord: existing };
    }
    if (decision.action === 'KEEP_SERVER') {
      await this.recordConflict(op, existing, incoming, 'SERVER_WINS', access, Object.keys(incoming));
      return { ...base, outcome: 'CONFLICT', reasonAr: decision.reasonAr, serverRecord: existing, serverKeptFields: Object.keys(incoming) };
    }

    const payload = decision.action === 'MERGE' && decision.decision ? decision.decision.merged : incoming;
    // الحقول التي احتفظ الخادم بنسختها (محمية/معتمدة) — تُبلَّغ للعميل حتى يعرف أن تعديله لم يُطبَّق
    const keptFromServer = decision.action === 'MERGE' && decision.decision ? decision.decision.keptFromServer : [];
    const changed = Object.fromEntries(Object.entries(sanitize(payload, cols)).filter(([k, v]) => !sameValue(existing[k], v)));
    if (Object.keys(changed).length === 0) {
      if (keptFromServer.length) {
        await this.recordConflict(op, existing, incoming, 'SERVER_WINS', access, keptFromServer);
        return { ...base, outcome: 'CONFLICT', reasonAr: 'كل الحقول المُرسلة محمية على الخادم — لم يُطبَّق شيء', serverRecord: existing, serverKeptFields: keptFromServer };
      }
      return await this.success(base, op, 'APPLIED', undefined, access);
    }
    const keys = Object.keys(changed);
    const updTypes = await this.columnTypes(map.table); // أنواع الأعمدة كاملة — لا تُرشَّح عبر DENIED_COLUMNS
    await this.prisma.$executeRawUnsafe(
      `UPDATE ${map.table} SET ${keys.map((k) => `"${k}" = $${keys.indexOf(k) + 2}${this.castFor(updTypes, k)}`).join(', ')} WHERE id = $1::uuid`,
      op.recordId,
      ...keys.map((k) => encode(changed[k])),
    );
    return await this.success(base, op, decision.action === 'MERGE' ? 'MERGED' : 'APPLIED', keptFromServer.length ? keptFromServer : undefined, access, {
      conflict: decision.action === 'MERGE' && Boolean(decision.decision?.conflict),
    });
  }

  private async applyDelete(op: ChangeOp, access: AccessContext, base: { opId: string; recordId: string }): Promise<PushResult> {
    const meta = SYNC_META[op.entity];
    if (meta.merge === 'append_only') return { ...base, outcome: 'REJECTED', reasonAr: 'سجل حدثي لا يُحذف (append-only)' };
    const map = ENTITY_MAP[op.entity];
    const cols = await this.safeColumns(map.table);
    if (!cols.some((c) => c.column === 'deletedAt')) return { ...base, outcome: 'REJECTED', reasonAr: 'الكيان لا يدعم الحذف المنطقي' };
    const existing = await this.readRow(map.table, op.recordId, cols);
    if (!existing) return { ...base, outcome: 'APPLIED', reasonAr: 'لا يوجد سجل (حذف idempotent)' };
    if (isApproved(existing, op.entity) && !access.profile.isFacilityWide)
      return { ...base, outcome: 'REJECTED', reasonAr: 'السجل معتمد — الحذف يتطلب صلاحية اعتماد' };
    await this.prisma.$executeRawUnsafe(`UPDATE ${map.table} SET "deletedAt" = now() WHERE id = $1::uuid`, op.recordId);
    return this.success(base, op, 'APPLIED', undefined, access);
  }

  /** يختم النتيجة في جدول idempotency (نفس مفتاح العملية = نفس الرد) */
  private async success(
    base: { opId: string; recordId: string },
    op: ChangeOp,
    outcome: PushOutcome,
    kept?: string[],
    access?: AccessContext,
    extra?: { conflict?: boolean },
  ): Promise<PushResult> {
    const seq = await this.currentSeq();
    await this.prisma
      .$executeRawUnsafe(
        `INSERT INTO sync_idempotency ("opId", "deviceId", entity, "recordId", "resultJson", "appliedAt")
         VALUES ($1, $2, $3, $4::uuid, $5::jsonb, now()) ON CONFLICT ("opId") DO NOTHING`,
        base.opId,
        access?.deviceId ?? 'unknown-device',
        op.entity,
        op.recordId,
        JSON.stringify({ outcome, serverSeq: Number(seq), keptFields: kept ?? [] }),
      )
      .catch(() => undefined);
    if (kept?.length && access) {
      await this.recordConflict(op, {}, Object.fromEntries(kept.map((k) => [k, undefined])), 'SERVER_WINS', access, kept);
    }
    return { ...base, outcome: extra?.conflict && outcome === 'MERGED' ? 'MERGED' : outcome, serverSeq: Number(seq), serverKeptFields: kept };
  }

  private async recordConflict(op: ChangeOp, server: Record<string, unknown>, client: Record<string, unknown>, strategy: string, access: AccessContext, kept?: string[]) {
    await this.prisma.$executeRaw`INSERT INTO sync_conflicts (id, entity, "recordId", "deviceId", "userId", strategy, "clientJson", "serverJson", "keptFields")
      VALUES (gen_random_uuid(), ${op.entity}, ${op.recordId}::uuid, ${access.deviceId ?? 'unknown-device'}, ${access.userId}::uuid, ${strategy},
              ${JSON.stringify(client)}::jsonb, ${JSON.stringify(server)}::jsonb, ${JSON.stringify({ keptFields: kept ?? [] })}::jsonb)`
      .catch((e: unknown) => this.logger.warn(`conflict log skipped: ${(e as Error).message}`));
  }

  /* ══════════════════════════ PULL (الخادم → العميل) ══════════════════════════ */

  async pull(input: { deviceId: string; sinceCursor: number; entities?: SyncEntity[]; limit: number }, access: AccessContext): Promise<PullResponse> {
    const cursor = BigInt(Math.max(0, Math.trunc(input.sinceCursor)));
    const limit = Math.min(Math.max(1, input.limit), 2000);
    const scopeFilter = this.pullScope(access);
    const entityFilter = input.entities?.length ? Prisma.sql`AND cl.entity IN (${Prisma.join(input.entities)})` : Prisma.empty;

    const rows = await this.prisma.$queryRaw<
      Array<{ seq: bigint; entity: string; recordId: string; version: number; deleted: boolean; payload: Record<string, unknown> }>
    >(Prisma.sql`
      SELECT cl.seq, cl.entity, cl."recordId"::text AS "recordId", cl.version,
             (cl.op = 'DELETE' OR cl."payload"->>'deletedAt' IS NOT NULL) AS deleted,
             cl."payload" AS "payload"
        FROM sync_change_log cl
       WHERE cl.seq > ${cursor}
         ${entityFilter}
         ${scopeFilter}
       ORDER BY cl.seq ASC
       LIMIT ${limit + 1}
    `);

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const changes: PullChange[] = page.map((r) => ({
      seq: Number(r.seq),
      entity: r.entity as SyncEntity,
      recordId: String(r.recordId),
      version: r.version,
      deleted: r.deleted,
      data: stripSecrets(r.payload ?? {}),
    }));

    if (changes.length) {
      await this.prisma.$executeRaw`UPDATE devices SET "lastPullCursor" = ${BigInt(changes[changes.length - 1]!.seq)}, "lastSyncAt" = now() WHERE "externalId" = ${input.deviceId}`
        .catch(() => undefined);
    }

    const serverSeq = await this.currentSeq();
    const gap = Number(serverSeq) - (changes.length ? changes[changes.length - 1]!.seq : Number(cursor));
    // لو تجاوز الفارق مدة الاحتفاظ بالسجل ⇒ فقد العميل تغييرات قديمة → إعادة مزامنة كاملة
    if (gap > 500_000) {
      return {
        serverTime: new Date().toISOString(),
        cursor: Number(cursor),
        hasMore: false,
        changes: [],
        fullResyncRequired: true,
        resyncReasonAr: 'سجل التغييرات تجاوز مدة الاحتفاظ — مطلوب إعادة مزامنة كاملة من قاعدة البيانات',
      };
    }

    return { serverTime: new Date().toISOString(), cursor: changes.length ? changes[changes.length - 1]!.seq : Number(cursor), hasMore, changes };
  }

  private pullScope(access: AccessContext): Prisma.Sql {
    if (access.profile.isFacilityWide) return Prisma.sql`AND 1=1`;
    return Prisma.sql`AND (cl."subDeptId" IN (SELECT sd.id FROM sub_departments sd WHERE sd."departmentId" = ${access.profile.departmentId}::uuid)
                        OR cl."actorId" = ${access.profile.userId}::uuid
                        OR cl."recordId" IN (SELECT id FROM users WHERE id = cl."recordId"))`;
  }

  /* ══════════════════════════ أدوات ══════════════════════════ */

  async currentSeq(): Promise<bigint> {
    const rows = await this.prisma.$queryRaw<Array<{ seq: bigint | null }>>`SELECT last_value AS seq FROM sync_change_log_seq_seq`.catch(() => [{ seq: null }]);
    const v = rows?.[0]?.seq;
    if (typeof v === 'bigint') return v;
    const rows2 = await this.prisma.$queryRaw<Array<{ max: bigint | null }>>`SELECT COALESCE(MAX(seq), 0) AS max FROM sync_change_log`;
    return rows2[0]?.max ?? 0n;
  }

  /** قراءة السجل الحالي (نسخة نيئة مفكوك الترميز) أو null إن لم يوجد */
  private async readRow(table: string, id: string, cols: ColumnMeta[]): Promise<Record<string, unknown> | null> {
    if (!cols.length) return null;
    const names = cols.map((c) => `"${c.column}"`).join(', ');
    const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT ${names} FROM ${table} WHERE id = $1::uuid LIMIT 1`, id);
    const row = rows[0];
    if (!row) return null;
    return decodeRow(row);
  }

  /**
   * تحويل صريح لكل معامل إلى نوع عموده: `encode()` يُرجع نصًا دائمًا (يوحّد JSON/التواريخ)،
   * وPostgreSQL لا يُسند `text` إلى uuid/numeric/timestamptz/enum — فيفشل الإدراج بـ42804
   * ويُسقَط الطلب 500. القياس على الحالة الحيّة: كل إنشاء من جهاز بلا اتصال كان يُرفض بهذا
   * الخطأ على `work_orders."facilityId"`، والحالة الوحيدة التي نجحت هي تحديثات الحقول النصية.
   * النوع يؤخذ من `udt_name` لا `data_type`، لأن الأعمدة المعدّدة (status/priority) تظهر باسم
   * USER-DEFINED في information_schema بينما اسمها الحقيقي `"WoStatus"` — وهو ما تحتاجه الصريحة.
   */
  /**
   * أعمدة الوقت الإلزامية التي لا default لها — تُقرأ من الـcatalog مباشرة، لا من `safeColumns`:
   * تلك القائمة تُرشِّح DENIED_COLUMNS (createdAt/updatedAt ممنوعان على العميل) فاختفتا من cols
   * ولم تُختمَا، وبقي الإدراج الخام يسقط بقيد NOT NULL. القياس: `"createdAt", "updatedAt"` غابتا
   * عن INSERT رغم الصرائر، والخطأ بقي `null value in column "updatedAt"`.
   */
  private async timeStampsToFill(table: string): Promise<string[]> {
    const hit = this.auditCache.get(table);
    if (hit) return hit;
    const rows = await this.prisma.$queryRawUnsafe<Array<{ column: string }>>(
      `SELECT column_name AS "column" FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
          AND is_nullable = 'NO' AND column_default IS NULL
          AND column_name IN ('createdAt', 'updatedAt')`,
      table,
    );
    const cols = rows.map((r) => r.column);
    this.auditCache.set(table, cols);
    return cols;
  }

  private async columnTypes(table: string): Promise<Map<string, string>> {
    const hit = this.typesCache.get(table);
    if (hit) return hit;
    const rows = await this.prisma.$queryRawUnsafe<Array<{ column: string; udt: string }>>(
      `SELECT column_name AS "column", udt_name AS "udt"
         FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
      table,
    );
    const map = new Map(rows.map((r) => [r.column, r.udt]));
    this.typesCache.set(table, map);
    return map;
  }

  /**
   * تُقرأ الأنواع من جدول كامل الأعمدة، لا من `safeColumns`: قائمة DENIED_columns تحرم العميل من
   * facilityId/departmentId فتُسقطهما من cols، بينما يختمهما الخادم (serverStamp) ثم يُدرجهما —
   * فلو استُخدمت cols للبحث عن النوع لبقي المعامل بلا صريحة وعاد الخطأ الذي جئنا نصلحه (42804).
   */
  private castFor(types: Map<string, string>, name: string): string {
    const udt = types.get(name);
    // الأسماء كلها من الـcatalog لا من مُدخَل العميل، لذا الاقتباس الدائم آمن ويحمي الأسماء مختلطة الحروف مثل "WoStatus"
    return udt ? `::"${udt}"` : '';
  }

  private async safeColumns(table: string): Promise<ColumnMeta[]> {
    const hit = this.columnsCache.get(table);
    if (hit) return hit;
    // SQL خام مع ربط المعامل بالمواضع $1/$2 (المحرك يستعلم عن جداول باسم حرفي من جدول الربط)
    const rows = await this.prisma.$queryRawUnsafe<Array<{ column: string; type: string; udt: string; notNull: boolean; hasDefault: boolean }>>(
      `SELECT column_name AS "column", data_type AS "type", udt_name AS "udt", (is_nullable = 'NO') AS "notNull", (column_default IS NOT NULL) AS "hasDefault"
         FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
      table,
    );
    const cols = rows.filter((r) => !DENIED_COLUMNS.includes(r.column));
    this.columnsCache.set(table, cols);
    return cols;
  }
}

/** أعمدة لا يقبلها المحرك من العميل إطلاقًا (صلاحيات/تدقيق/اعتمادات) */
const DENIED_COLUMNS = [
  'passwordHash', 'syncSeq', 'version', 'createdAt', 'updatedAt', 'approvedById', 'approvedAt', 'closedById',
  'approverId', 'verifiedById', 'verifiedAt', 'costCenterCode', 'facilityId', 'departmentId', 'syncCursor',
  'isLocked', 'reconciliationHash', 'valuation', 'creditUsed', 'keeperUserId', 'approvedBy',
];

function sanitize(data: Record<string, unknown>, cols: ColumnMeta[]): Record<string, unknown> {
  const allowed = new Set(cols.map((c) => c.column));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (!allowed.has(k) || DENIED_COLUMNS.includes(k)) continue;
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

function serverStamp(entity: SyncEntity, access: AccessContext): Record<string, unknown> {
  const stamps: Record<string, Record<string, unknown>> = {
    workOrder: { facilityId: access.profile.facilityId, departmentId: access.profile.departmentId, subDeptId: access.profile.subDeptId, createdById: access.userId },
    shiftLog: { facilityId: access.profile.facilityId, preparedById: access.userId },
    labSample: { subDeptId: access.profile.subDeptId, collectedById: access.userId },
    permit: { requestedById: access.userId },
    document: { uploadedById: access.userId }, // يشمل المرفقات الميدانية (entityType/entityId من العميل)
    assetReading: { byUserId: access.userId },
    workOrderLog: { byUserId: access.userId },
    notificationAck: { userId: access.userId },
    attendancePunch: {},
    mobileFormRecord: {},
  };
  return stamps[entity] ?? {};
}

function isApproved(row: Record<string, unknown>, entity: SyncEntity): boolean {
  if (entity === 'shiftLog') return row.status === 'APPROVED' || row.status === 'LOCKED';
  if (entity === 'workOrder') return ['CLOSED', 'APPROVED', 'ASSIGNED'].includes(String(row.status)) && !!row.approverId;
  if (entity === 'labResult' || entity === 'labSample') return !!row.verifiedById || row.status === 'VERIFIED';
  if (entity === 'permit') return ['APPROVED_BY_AREA', 'APPROVED_BY_HSE', 'OPEN', 'EXTENDED'].includes(String(row.status));
  return false;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof Date && typeof b === 'string') return a.toISOString() === new Date(b).toISOString();
  if (typeof a === 'object' && typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
  if (typeof a === 'number' && typeof b === 'string') return String(a) === b;
  return false;
}

function decodeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v instanceof Date) out[k] = v.toISOString();
    else if (typeof v === 'bigint') out[k] = Number(v);
    else if (Buffer.isBuffer(v)) {
      try {
        out[k] = JSON.parse(v.toString('utf8'));
      } catch {
        out[k] = v.toString('utf8');
      }
    } else out[k] = v;
  }
  return out;
}

function encode(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') return JSON.stringify(v);
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

/** لا تُسرَّب البيانات الحساسة في سجل التغييرات إلى الأجهزة */
function stripSecrets(payload: Record<string, unknown>): Record<string, unknown> {
  const out = { ...payload };
  for (const k of ['passwordHash', 'clientOpId', 'syncCursor', 'failedAttempts', 'lockedUntil']) delete out[k];
  return out;
}

function colsMap(o: Record<string, unknown>) {
  return o;
}

export { ENTITY_MAP, DENIED_COLUMNS, mergePolicyOf };
