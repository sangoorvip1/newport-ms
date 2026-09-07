import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  allowedOosNext,
  buildCertificateRows,
  canIssueCertificate,
  canOosTransition,
  evaluateSpec,
  severityForVerdict,
  statusAfterResultEntry,
  type LabOosUpdateDto,
  type LabResultEntryDto,
  type LabSampleCreateDto,
  type LabVerifyDto,
  type PermissionCode,
} from '@newport/domain';
import { PrismaService } from '../common/prisma.service.js';
import type { AccessContext } from '../security/access.guard.js';

/**
 * وحدة المختبر: العينة (تُفتح من شعبة الإنتاج أو من المختبر) → النتائج → التدقيق → شهادة التحليل،
 * وحالات «خارج المطابقة» (OOS/CAPA) تُولّد تلقائيًا من نتيجة مخالفة للمواصفة.
 *
 * قرارات مقصودة (لا تُقرأ كاجتهاد محلي):
 *  1) العينة **مملوكة للشعبة المنتِجة** (`subDeptId`) لا للمختبر — لأن محرك المزامنة يفحص نطاق
 *     الجهاز قبل القبول، والفني في اليوريا يسحب العينة ويرفعها من الهاتف. لذلك شعبة المختبر ترى
 *     عينات **قسمها** كله: قراءتها تُفسَّر بنطاق DEPT حتى لو كان منحها SUBDEPT (انظر `sampleScope`).
 *  2) `isOutOfSpec` وحالة العينة ورقم العينة وكود OOS وتواريخ الاعتماد **يختمها الخادم وحده**؛
 *     العميل لا يرسلها (ولو أرسلها تُسقطها `sanitize`/`DENIED_COLUMNS` في المزامنة).
 *  3) المواصفة تُقرأ من `lab_specs` حسب رمز الوحدة ودرجة المنتج، بآخر تاريخ سريان ≤ وقت جمع العينة.
 *     لا مواصفة ⇒ لا حكم (لا إنذار كاذب)، ويظهر في الاستجابة كـ `specApplied:false` ليعرف المُدخِل.
 *  4) شهادة التحليل لا تُصدر قبل الاعتماد، ولا مع حالة OOS مفتوحة على نفس العينة.
 */
@Injectable()
export class LabService {
  private readonly logger = new Logger(LabService.name);

  constructor(private readonly prisma: PrismaService) {}

  /* ═══════════════════════ القراءة ═══════════════════════ */

  async listSamples(
    filter: { status?: string; subDeptCode?: string; unitCode?: string; q?: string; from?: string; to?: string; onlyMine?: boolean; take?: number; skip?: number },
    access: AccessContext,
  ) {
    const take = Math.min(filter.take ?? 50, 200);
    const where: Prisma.LabSampleWhereInput = {
      deletedAt: null,
      ...(await this.sampleScope(access, 'lab.sample.view')),
      ...(filter.status ? { status: filter.status as Prisma.LabSampleWhereInput['status'] } : {}),
      ...(filter.unitCode ? { unitCode: filter.unitCode } : {}),
      ...(filter.subDeptCode ? { subDept: { code: filter.subDeptCode } } : {}),
      ...(filter.onlyMine ? { collectedById: access.profile.userId } : {}),
      ...(filter.from || filter.to
        ? { collectedAt: { ...(filter.from ? { gte: new Date(filter.from) } : {}), ...(filter.to ? { lte: new Date(filter.to) } : {}) } }
        : {}),
      ...(filter.q ? { OR: [{ sampleNumber: { contains: filter.q } }, { pointTag: { contains: filter.q } }, { sampleType: { contains: filter.q } }] } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.labSample.findMany({
        where,
        include: {
          subDept: { select: { code: true, nameAr: true } },
          _count: { select: { results: true } },
        },
        orderBy: { collectedAt: 'desc' },
        take,
        skip: filter.skip ?? 0,
      }),
      this.prisma.labSample.count({ where }),
    ]);

    const names = await this.namesFor(rows.map((r) => r.collectedById));
    const oosCounts = await this.openOosCounts(rows.map((r) => r.id));

    return {
      total,
      take,
      skip: filter.skip ?? 0,
      items: rows.map((r) => ({
        id: r.id,
        sampleNumber: r.sampleNumber,
        unitCode: r.unitCode,
        sampleType: r.sampleType,
        pointTag: r.pointTag,
        subDept: r.subDept.nameAr,
        subDeptCode: r.subDept.code,
        status: r.status,
        collectedAt: r.collectedAt.toISOString(),
        collectedBy: names.get(r.collectedById) ?? null,
        resultsCount: r._count.results,
        openOosCount: oosCounts.get(r.id) ?? 0,
        isFastTracked: r.isFastTracked,
        workOrderId: r.workOrderId,
        version: r.version,
        syncSeq: Number(r.syncSeq ?? 0),
      })),
    };
  }

  async sampleDetail(id: string, access: AccessContext) {
    const sample = await this.prisma.labSample.findFirst({
      where: { id, deletedAt: null, ...(await this.sampleScope(access, 'lab.sample.view')) },
      include: {
        subDept: { select: { code: true, nameAr: true } },
        results: {
          include: { parameter: { select: { id: true, code: true, nameAr: true, unit: true, method: true } } },
          orderBy: { parameter: { nameAr: 'asc' } },
        },
      },
    });
    if (!sample) throw new NotFoundException({ statusCode: 404, messageAr: 'العينة غير موجودة أو خارج نطاق صلاحياتك' });

    const oos = await this.prisma.labOosCase.findMany({ where: { sampleId: sample.id }, orderBy: { createdAt: 'desc' } });
    const names = await this.namesFor([sample.collectedById, ...sample.results.map((r) => r.enteredById), ...sample.results.map((r) => r.verifiedById).filter(Boolean) as string[]]);
    const specs = await this.specsFor(sample);

    return {
      ...sample,
      collectedAt: sample.collectedAt.toISOString(),
      collectedBy: names.get(sample.collectedById) ?? null,
      integrityJson: sample.integrityJson ?? null,
      version: sample.version,
      syncSeq: Number(sample.syncSeq ?? 0),
      results: sample.results.map((r) => ({
        id: r.id,
        parameterCode: r.parameter.code,
        parameterNameAr: r.parameter.nameAr,
        value: r.value.toString(),
        valueNum: Number(r.value),
        unit: r.unit ?? r.parameter.unit,
        method: r.method ?? r.parameter.method,
        isOutOfSpec: r.isOutOfSpec,
        remarks: r.remarks,
        enteredBy: names.get(r.enteredById) ?? null,
        enteredAt: r.enteredAt.toISOString(),
        verifiedBy: r.verifiedById ? names.get(r.verifiedById) ?? null : null,
        verifiedAt: r.verifiedAt?.toISOString() ?? null,
        spec: specs.get(r.parameter.id) ?? null,
        version: r.version,
      })),
      oosCases: oos.map((c) => ({
        id: c.id,
        code: c.code,
        severity: c.severity,
        status: c.status,
        rootCauseAr: c.rootCauseAr,
        capaAr: c.capaAr,
        resultId: c.resultId,
        closedAt: c.closedAt?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
        nextStatuses: allowedOosNext(c.status),
      })),
      nextStatuses: this.nextSampleStatuses(sample.status),
    };
  }

  /** مراجع المختبر لملء النماذج: المُعامِلات + مواصفاتها السارية (قراءة فقط) */
  async parameters(filter: { unitCode?: string; q?: string }, access: AccessContext) {
    this.assertCan(access, 'lab.result.view');
    const rows = await this.prisma.labParameter.findMany({
      where: {
        ...(filter.unitCode ? { OR: [{ appliesTo: filter.unitCode }, { appliesTo: 'ALL' }] } : {}),
        ...(filter.q ? { OR: [{ code: { contains: filter.q } }, { nameAr: { contains: filter.q } }] } : {}),
      },
      include: { specs: { orderBy: { effectiveFrom: 'desc' } } },
      orderBy: { nameAr: 'asc' },
    });
    return {
      total: rows.length,
      items: rows.map((p) => ({
        code: p.code,
        nameAr: p.nameAr,
        unit: p.unit,
        method: p.method,
        appliesTo: p.appliesTo,
        specMin: p.specMin === null ? null : Number(p.specMin),
        specMax: p.specMax === null ? null : Number(p.specMax),
        specs: p.specs.map((s) => ({
          productCode: s.productCode,
          grade: s.grade,
          minVal: s.minVal === null ? null : Number(s.minVal),
          maxVal: s.maxVal === null ? null : Number(s.maxVal),
          effectiveFrom: s.effectiveFrom.toISOString().slice(0, 10),
        })),
      })),
    };
  }

  /** مؤشرات لوحة المختبر: زمن الدورة، معدل المطابقة، OOS المفتوحة */
  async stats(access: AccessContext) {
    this.assertCan(access, 'lab.result.view');
    const scope = await this.sampleScope(access, 'lab.result.view');
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [total, verified, results, outOfSpec, openOos] = await this.prisma.$transaction([
      this.prisma.labSample.count({ where: { ...scope, collectedAt: { gte: since }, deletedAt: null } }),
      this.prisma.labSample.count({ where: { ...scope, collectedAt: { gte: since }, deletedAt: null, status: 'VERIFIED' } }),
      this.prisma.labResult.count({ where: { sample: { ...scope, collectedAt: { gte: since }, deletedAt: null } } }),
      this.prisma.labResult.count({ where: { sample: { ...scope, collectedAt: { gte: since }, deletedAt: null }, isOutOfSpec: true } }),
      this.prisma.labOosCase.count({ where: { status: { notIn: ['CLOSED', 'REJECTED'] }, createdAt: { gte: since }, sample: { ...scope } } }),
    ]);
    return {
      windowDays: 30,
      samples: { total, verified, verifiedPct: total ? Math.round((verified / total) * 1000) / 10 : null },
      results: { total: results, outOfSpec, conformityPct: results ? Math.round(((results - outOfSpec) / results) * 1000) / 10 : null },
      openOosCases: openOos,
    };
  }

  /* ═══════════════════════ الكتابة ═══════════════════════ */

  async createSample(input: LabSampleCreateDto, access: AccessContext) {
    // الشعبة المالكة للعينة: من الطلب إن كان المستخدم يملك نطاق الأقسام، وإلا من ملفه —
    // لا يُترك للعميل أن يختار شعبة خارج نطاقه (نفس مبدأ serverStamp في المزامنة).
    const requestedCode = input.forSubDeptCode ?? null;
    const ownerSubDeptId = await this.resolveOwnerSubDept(requestedCode, access, 'lab.sample.create');

    const workOrder = input.workOrderId ? await this.prisma.workOrder.findFirst({ where: { id: input.workOrderId, deletedAt: null } }) : null;
    if (input.workOrderId && !workOrder) throw new NotFoundException({ statusCode: 404, messageAr: 'أمر الشغل المرتبط غير موجود' });
    if (workOrder && !workOrder.subDeptId) throw new BadRequestException({ statusCode: 400, messageAr: 'أمر الشغل بلا شعبة — اربطه بشعبة أولًا' });

    const created = await this.prisma.withScope(this.ctx(access), async (tx) => {
      const sampleNumber = await this.nextNumber(tx, 'lab_sample_number_seq', 'SMP');
      const sample = await tx.labSample.create({
        data: {
          id: input.id ?? undefined,
          sampleNumber,
          subDeptId: workOrder?.subDeptId ?? ownerSubDeptId,
          unitCode: input.unitCode,
          sampleType: input.sampleType,
          pointTag: input.pointTag ?? null,
          collectedById: access.profile.userId,
          collectedAt: new Date(input.collectedAt),
          status: 'COLLECTED',
          logId: input.logId ?? null,
          workOrderId: workOrder?.id ?? null,
          isFastTracked: input.isFastTracked,
          integrityJson: (input.integrityJson as Prisma.InputJsonValue) ?? Prisma.DbNull,
        },
        include: { subDept: { select: { code: true, nameAr: true } } },
      });
      await this.prisma.audit(tx, {
        facilityId: access.profile.facilityId,
        actorId: access.userId,
        action: 'CREATE',
        entityType: 'labSample',
        entityId: sample.id,
        changes: { sampleNumber, unitCode: input.unitCode, sampleType: input.sampleType, subDept: sample.subDept.code, fastTracked: input.isFastTracked },
        meta: { ip: access.ip, deviceId: access.deviceId },
      });
      return sample;
    });

    return { id: created.id, sampleNumber: created.sampleNumber, status: created.status, subDept: created.subDept.code, collectedAt: created.collectedAt.toISOString() };
  }

  /**
   * إدخال/استبدال نتائج التحليل. تُحسب المطابقة هنا (لا من العميل) وتُنشأ حالة OOS تلقائيًا.
   * يُسمح بالاستبدال قبل الاعتماد فقط — بعدها المسار هو `verify` أو إعادة تحليل بشعبة المختبر.
   */
  async enterResults(sampleId: string, input: LabResultEntryDto, access: AccessContext) {
    const sample = await this.prisma.labSample.findFirst({
      where: { id: sampleId, deletedAt: null, ...(await this.sampleScope(access, 'lab.result.enter')) },
    });
    if (!sample) throw new NotFoundException({ statusCode: 404, messageAr: 'العينة غير موجودة أو خارج نطاقك' });

    const nextStatus = statusAfterResultEntry(sample.status);
    if (!nextStatus) {
      throw new ConflictException({
        statusCode: 409,
        messageAr: `العينة بحالة ${sample.status} — النتائج تُدخل قبل الاعتماد فقط. لاستبدال نتيجة معتمدة استخدم إعادة التحليل`,
      });
    }

    const specs = await this.specsFor(sample);

    return this.prisma.withScope(this.ctx(access), async (tx) => {
      const written: Array<{ parameterCode: string; value: string; isOutOfSpec: boolean; verdict: string; specApplied: boolean; oosCode?: string }> = [];
      const oosCreated: Array<{ code: string; parameterCode: string; severity: string }> = [];

      for (const item of input.results) {
        const parameter = await tx.labParameter.findUnique({ where: { code: item.parameterCode } });
        if (!parameter) {
          throw new BadRequestException({ statusCode: 400, messageAr: `مُعامل غير معرّف في دليل المختبر: ${item.parameterCode}`, hintAr: 'GET /v1/lab/parameters يعرض الدليل' });
        }
        const value = String(item.value);
        const bounds = specs.get(parameter.id);
        const verdict = evaluateSpec(Number(value), bounds ? { minVal: bounds.minVal, maxVal: bounds.maxVal } : null);
        const isOutOfSpec = !verdict.inSpec;

        await tx.labResult.upsert({
          where: { sampleId_parameterId: { sampleId: sample.id, parameterId: parameter.id } },
          update: {
            value,
            unit: item.unit ?? parameter.unit,
            method: item.method ?? parameter.method,
            remarks: item.remarks ?? null,
            isOutOfSpec,
            enteredById: access.profile.userId,
            enteredAt: new Date(),
            // إسقاط الاعتماد عند الاستبدال: لا تصح المصادقة على رقم لم يره المدقّق
            verifiedById: null,
            verifiedAt: null,
          },
          create: {
            sampleId: sample.id,
            parameterId: parameter.id,
            value,
            unit: item.unit ?? parameter.unit,
            method: item.method ?? parameter.method,
            remarks: item.remarks ?? null,
            isOutOfSpec,
            enteredById: access.profile.userId,
          },
        });

        written.push({ parameterCode: parameter.code, value, isOutOfSpec, verdict: verdict.inSpec ? 'PASS' : verdict.breach ?? 'FAIL', specApplied: !!bounds });

        if (isOutOfSpec) {
          const linked = await tx.labResult.findUnique({ where: { sampleId_parameterId: { sampleId: sample.id, parameterId: parameter.id } }, select: { id: true } });
          // حالة واحدة مفتوحة لكل (عينة، مُعامل): إعادة إدخال نفس النتيجة المخالفة تُحدِّث الشدة ولا تُكرّر الحالة
          const openCase = await tx.labOosCase.findFirst({ where: { sampleId: sample.id, resultId: linked?.id ?? null, status: { notIn: ['CLOSED', 'REJECTED'] } }, select: { id: true, code: true, severity: true } });
          const severity = severityForVerdict(verdict);
          if (openCase) {
            if (openCase.severity !== severity) await tx.labOosCase.update({ where: { id: openCase.id }, data: { severity } });
            written[written.length - 1]!.oosCode = openCase.code;
          } else {
            const code = await this.nextNumber(tx, 'oos_number_seq', 'OOS');
            await tx.labOosCase.create({
              data: { code, sampleId: sample.id, resultId: linked?.id ?? null, severity, status: 'OPEN', openedById: access.profile.userId },
            });
            oosCreated.push({ code, parameterCode: parameter.code, severity });
            written[written.length - 1]!.oosCode = code;
          }
        }
      }

      await tx.labSample.update({ where: { id: sample.id }, data: { status: nextStatus } });
      if (input.noteAr) {
        await tx.labSample.update({ where: { id: sample.id }, data: { integrityJson: { ...(asObject(sample.integrityJson)), lastEntryNoteAr: input.noteAr } as Prisma.InputJsonValue } });
      }

      await this.prisma.audit(tx, {
        facilityId: access.profile.facilityId,
        actorId: access.userId,
        action: 'UPDATE',
        entityType: 'labSample',
        entityId: sample.id,
        changes: { sampleNumber: sample.sampleNumber, results: written.length, oos: oosCreated.map((o) => o.code), status: nextStatus },
        meta: { deviceId: access.deviceId, ip: access.ip },
      });

      return { sampleId: sample.id, sampleNumber: sample.sampleNumber, status: nextStatus, written, oosCreated, specCount: specs.size };
    });
  }

  /** تدقيق/إسقاط نتيجة واحدة (المسار المعتاد بعد إدخال المحلل) */
  async verifyResult(resultId: string, input: LabVerifyDto, access: AccessContext) {
    const result = await this.prisma.labResult.findFirst({
      where: { id: resultId, ...(await this.resultScope(access, 'lab.result.verify')) },
      include: { sample: { select: { id: true, status: true, sampleNumber: true } } },
    });
    if (!result) throw new NotFoundException({ statusCode: 404, messageAr: 'النتيجة غير موجودة أو خارج نطاقك' });
    if (result.verifiedById && input.decision === 'VERIFIED') {
      throw new ConflictException({ statusCode: 409, messageAr: 'النتيجة معتمدة مسبقًا — أعد الإدخال لإلغائها ثم اعتمدها من جديد' });
    }

    return this.prisma.withScope(this.ctx(access), async (tx) => {
      await tx.labResult.update({
        where: { id: result.id },
        data: {
          verifiedById: access.profile.userId,
          verifiedAt: new Date(),
          remarks: input.remarks ? appendNote(result.remarks, `${input.decision === 'VERIFIED' ? 'اعتماد' : 'رفض'}: ${input.remarks}`) : result.remarks,
          ...(input.decision === 'REJECTED' ? { isOutOfSpec: result.isOutOfSpec } : {}),
        },
      });

      // حالة العينة: VERIFIED حين لا تبقى نتيجة غير معتمدة، و REJECTED عند رفض أي نتيجة.
      // العدّ بعد التحديث عمدًا: لا خصم إضافي لاحقًا على remainingUnverified.
      const remaining = await tx.labResult.count({ where: { sampleId: result.sampleId, verifiedById: null } });
      const rejected = input.decision === 'REJECTED';
      const newStatus = rejected ? 'REJECTED' : remaining === 0 ? 'VERIFIED' : 'RESULTED';
      if (newStatus !== result.sample.status) {
        if (newStatus === 'REJECTED' || newStatus === 'VERIFIED' || newStatus === 'RESULTED') {
          await tx.labSample.update({ where: { id: result.sampleId }, data: { status: newStatus as never } });
        }
      }

      await this.prisma.audit(tx, {
        facilityId: access.profile.facilityId,
        actorId: access.userId,
        action: rejected ? 'REJECT' : 'APPROVE',
        entityType: 'labResult',
        entityId: result.id,
        changes: { decision: input.decision, sampleNumber: result.sample.sampleNumber, sampleStatus: newStatus, remarks: input.remarks ?? null },
        meta: { deviceId: access.deviceId, ip: access.ip },
      });

      // remaining محسوب بعد التحديث بالفعل ⇒ لا يُطرح منه 1 مرة أخرى (كان يُظهر 0 بدل 1)
      const remainingUnverified = remaining;
      return {
        resultId: result.id,
        decision: input.decision,
        sampleStatus: newStatus,
        remainingUnverified,
        certificateReady: newStatus === 'VERIFIED' ? true : false,
        messageAr: newStatus === 'VERIFIED' ? 'اكتمل تدقيق العينة — شهادة التحليل جاهزة للإصدار' : `بقيت ${remainingUnverified} نتيجة بلا تدقيق`,
      };
    });
  }

  /* ═══════════════════════ خارج المطابقة (OOS/CAPA) ═══════════════════════ */

  async listOos(filter: { status?: string; severity?: string; take?: number; skip?: number }, access: AccessContext) {
    const take = Math.min(filter.take ?? 50, 200);
    const sampleScope = await this.sampleScope(access, 'lab.oos.view');
    const where: Prisma.LabOosCaseWhereInput = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.severity ? { severity: filter.severity } : {}),
      ...(Object.keys(sampleScope).length ? { sample: sampleScope } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.labOosCase.findMany({
        where,
        include: { sample: { select: { sampleNumber: true, unitCode: true, collectedAt: true, subDept: { select: { nameAr: true, code: true } } } } },
        orderBy: [{ status: 'asc' }, { severity: 'desc' }, { createdAt: 'desc' }],
        take,
        skip: filter.skip ?? 0,
      }),
      this.prisma.labOosCase.count({ where }),
    ]);
    return {
      total,
      take,
      skip: filter.skip ?? 0,
      items: rows.map((r) => ({
        id: r.id,
        code: r.code,
        severity: r.severity,
        status: r.status,
        sampleNumber: r.sample.sampleNumber,
        unitCode: r.sample.unitCode,
        subDept: r.sample.subDept.nameAr,
        subDeptCode: r.sample.subDept.code,
        collectedAt: r.sample.collectedAt.toISOString(),
        rootCauseAr: r.rootCauseAr,
        capaAr: r.capaAr,
        openedAt: r.createdAt.toISOString(),
        closedAt: r.closedAt?.toISOString() ?? null,
        nextStatuses: allowedOosNext(r.status),
      })),
    };
  }

  /**
   * تحديث حالة OOS. القواعد مفروضة هنا لأن العمود VarChar(24) لا قيد عليه في القاعدة
   * (أُُبقي بلا CHECK ليُدار من الآلة المشتركة في `domain/lab.ts` — انظر docs/05 §11).
   */
  async updateOos(id: string, input: LabOosUpdateDto, access: AccessContext) {
    const row = await this.prisma.labOosCase.findFirst({
      where: { id },
      include: { sample: { select: { id: true, subDeptId: true, sampleNumber: true } } },
    });
    if (!row) throw new NotFoundException({ statusCode: 404, messageAr: 'حالة خارج المطابقة غير موجودة أو خارج نطاقك' });
    // النطاق الفعلي على العينة المالكة (الجدول نفسه لا يحمل subDeptId)
    const scope = await this.sampleScope(access, 'lab.oos.manage');
    if (Object.keys(scope).length) {
      const inside = await this.prisma.labSample.count({ where: { id: row.sample.id, ...scope } });
      if (!inside) throw new ForbiddenException({ statusCode: 403, messageAr: 'حالة OOS تخص عينة خارج نطاق عملك' });
    }

    const to = input.status ?? row.status;
    if (to !== row.status && !canOosTransition(row.status, to)) {
      throw new ConflictException({
        statusCode: 409,
        messageAr: `الانتقال من ${row.status} إلى ${to} غير مسموح`,
        allowedNext: allowedOosNext(row.status),
      });
    }
    if ((to === 'CAPA_DEFINED' || to === 'CLOSED') && !(input.capaAr ?? row.capaAr)) {
      throw new BadRequestException({ statusCode: 400, messageAr: 'لا يُحدَّد إجراء تصحيحي بلا نص CAPA مكتوب' });
    }
    if (to === 'CLOSED' && !(input.rootCauseAr ?? row.rootCauseAr)) {
      throw new BadRequestException({ statusCode: 400, messageAr: 'الإغلاق يتطلب سبب جذريًا موثقًا (root cause)' });
    }
    if (to === 'REJECTED' && !input.noteAr) {
      throw new BadRequestException({ statusCode: 400, messageAr: 'رفض الحالة يتطلب سببًا قصيرًا في noteAr' });
    }

    await this.prisma.withScope(this.ctx(access), async (tx) => {
      await tx.labOosCase.update({
        where: { id: row.id },
        data: {
          status: to,
          severity: input.severity ?? row.severity,
          rootCauseAr: input.rootCauseAr ?? row.rootCauseAr,
          capaAr: input.capaAr ?? row.capaAr,
          closedAt: to === 'CLOSED' ? new Date() : row.closedAt,
        },
      });
      await this.prisma.audit(tx, {
        facilityId: access.profile.facilityId,
        actorId: access.userId,
        action: to === 'CLOSED' ? 'APPROVE' : 'UPDATE',
        entityType: 'labOosCase',
        entityId: row.id,
        changes: { code: row.code, from: row.status, to, severity: input.severity ?? row.severity, sampleNumber: row.sample.sampleNumber },
        meta: { deviceId: access.deviceId, ip: access.ip, noteAr: input.noteAr ?? null },
      });
    });

    return { id: row.id, code: row.code, status: to, nextStatuses: allowedOosNext(to), closedAt: to === 'CLOSED' ? new Date().toISOString() : null };
  }

  /* ═══════════════════════ شهادة التحليل ═══════════════════════ */

  async certificate(sampleId: string, access: AccessContext) {
    this.assertCan(access, 'lab.report.export');
    const scope = await this.sampleScope(access, 'lab.report.export');
    const sample = await this.prisma.labSample.findFirst({
      where: { id: sampleId, deletedAt: null, ...scope },
      include: {
        subDept: { select: { code: true, nameAr: true } },
        // كل النتائج تُجلب، وbuildCertificateRows يستبعد غير المعتمدة (قاعدة واحدة في الدومين)
        results: { include: { parameter: { select: { id: true, code: true, nameAr: true, unit: true, method: true } } } },
      },
    });
    if (!sample) throw new NotFoundException({ statusCode: 404, messageAr: 'العينة غير موجودة أو خارج نطاقك' });

    const verifiedCount = sample.results.filter((r) => r.verifiedAt).length;
    const openOos = await this.prisma.labOosCase.count({ where: { sampleId, status: { notIn: ['CLOSED', 'REJECTED'] } } });
    const gate = canIssueCertificate({ sampleStatus: sample.status, verifiedCount, openOosCount: openOos });
    if (!gate.ok) throw new ConflictException({ statusCode: 409, messageAr: gate.reasonAr ?? 'لا يمكن إصدار الشهادة', sampleStatus: sample.status, openOosCount: openOos });

    const specs = await this.specsFor(sample);
    const rows = buildCertificateRows(
      sample.results.map((r) => ({
        value: r.value.toString(),
        parameterId: r.parameterId,
        unit: r.unit ?? r.parameter.unit,
        isOutOfSpec: r.isOutOfSpec,
        method: r.method ?? r.parameter.method,
        verifiedAt: r.verifiedAt,
        parameter: { code: r.parameter.code, nameAr: r.parameter.nameAr, unit: r.parameter.unit },
      })),
      Array.from(specs.entries()).map(([parameterId, s]) => ({ parameterId, minVal: s.minVal, maxVal: s.maxVal })),
    );

    const signers = await this.namesFor([
      ...sample.results.map((r) => r.verifiedById).filter(Boolean) as string[],
      ...sample.results.map((r) => r.enteredById),
    ]);
    const labHead = await this.prisma.subDepartment.findFirst({
      where: { code: 'PROD-LAB' },
      select: { headUserId: true, nameAr: true },
    });
    const headName = labHead?.headUserId ? signers.get(labHead.headUserId) ?? null : null;

    await this.prisma.withScope(this.ctx(access), (tx) =>
      this.prisma.audit(tx, {
        facilityId: access.profile.facilityId,
        actorId: access.userId,
        action: 'EXPORT',
        entityType: 'labSample',
        entityId: sample.id,
        changes: { sampleNumber: sample.sampleNumber, rows: rows.length, kind: 'CERTIFICATE_OF_ANALYSIS' },
        meta: { deviceId: access.deviceId, ip: access.ip },
      }),
    );

    return {
      titleAr: 'شهادة تحليل — معمل الأسمدة الجنوبية / الخط الأول',
      sampleNumber: sample.sampleNumber,
      sampleType: sample.sampleType,
      unitCode: sample.unitCode,
      pointTag: sample.pointTag,
      collectedAt: sample.collectedAt.toISOString(),
      collectedBy: signers.get(sample.collectedById) ?? null,
      requestedBySubDept: sample.subDept.nameAr,
      laboratory: labHead?.nameAr ?? 'المختبر',
      rows,
      signature: {
        enteredBy: uniqueNames(sample.results.map((r) => signers.get(r.enteredById) ?? null)),
        verifiedBy: uniqueNames(sample.results.map((r) => (r.verifiedById ? signers.get(r.verifiedById) ?? null : null))),
        laboratoryHead: headName,
        issuedAt: new Date().toISOString(),
        noteAr: 'الشهادة تُطابق النتائج المدققة فقط، وتُبطل تلقائيًا عند إعادة تحليل العينة أو فتح حالة خارج المطابقة.',
      },
      integrity: sample.integrityJson ?? null,
    };
  }

  /* ═══════════════════════ أدوات داخلية ═══════════════════════ */

  /**
   * نطاق القراءة/الكتابة على `lab_samples`. الاختلاف عن `work_orders`: لا عمود facilityId/departmentId
   * هنا، فالنطاق يُشتق عبر علاقة subDept، ويُوسَّع إلى القسم لشعبة kind=LAB لأن العينة مملوكة للشعبة
   * المنتجة (وإلا لم يستطع المحلل رؤية ما يُحلّله).
   */
  private async sampleScope(access: AccessContext, code: PermissionCode): Promise<Prisma.LabSampleWhereInput> {
    const grant = access.profile.permissions.find((p) => p.code === code);
    if (!grant) throw new ForbiddenException({ statusCode: 403, messageAr: `لا تملك ${code} — راجع شعبة النظام`, required: code, yourGrants: access.profile.permissions.map((p) => p.code) });
    if (grant.scope === 'ALL' || access.profile.isFacilityWide) return {};
    const deptId = access.profile.departmentId;
    if (grant.scope === 'DEPT') return deptId ? { subDept: { departmentId: deptId } } : {};
    if (grant.scope === 'TEAM') return access.profile.subDeptId ? { subDeptId: access.profile.subDeptId } : {};
    // التوسيع للاستثناء الوحيد المقصود: شعبة المختبر بمنحها SUBDEPT ترى عينات قسمها (الملكية للشعب المنتجة).
    // لا يُطبَّق على SELF إطلاقًا — وإلا تحوّل «صفوفي فقط» إلى «كل القسم»، وهو تسريب.
    if (grant.scope === 'SUBDEPT' && (await this.servesWholeDepartment(access))) {
      return deptId ? { subDept: { departmentId: deptId } } : {};
    }
    if (grant.scope === 'SUBDEPT') return { OR: [{ subDeptId: access.profile.subDeptId }, { collectedById: access.profile.userId }] };
    return { collectedById: access.profile.userId };
  }

  /** النطاق على `lab_results` (يمر بعينتَه) */
  private async resultScope(access: AccessContext, code: PermissionCode): Promise<Prisma.LabResultWhereInput> {
    const scope = await this.sampleScope(access, code);
    return Object.keys(scope).length ? { sample: scope } : {};
  }

  private async servesWholeDepartment(access: AccessContext): Promise<boolean> {
    if (!access.profile.subDeptId) return true;
    const row = await this.prisma.subDepartment.findUnique({ where: { id: access.profile.subDeptId }, select: { kind: true } });
    return row?.kind === 'LAB';
  }

  /** مواصفات سارية لمعاملات عينة: { parameterId → {min,max} } — الأحدث سريانًا ≤ وقت الجمع */
  private async specsFor(sample: { unitCode: string; collectedAt: Date }): Promise<Map<string, { minVal: number | null; maxVal: number | null }>> {
    const rows = await this.prisma.labSpec.findMany({
      where: { productCode: { in: [sample.unitCode, 'COMMON'] }, effectiveFrom: { lte: sample.collectedAt } },
      orderBy: { effectiveFrom: 'desc' },
      select: { parameterId: true, minVal: true, maxVal: true, productCode: true },
    });
    const out = new Map<string, { minVal: number | null; maxVal: number | null }>();
    for (const r of rows) {
      if (out.has(r.parameterId)) continue; // الأحدث أولًا ⇒ الأولى هي السارية
      out.set(r.parameterId, { minVal: r.minVal === null ? null : Number(r.minVal), maxVal: r.maxVal === null ? null : Number(r.maxVal) });
    }
    return out;
  }

  private async openOosCounts(sampleIds: string[]): Promise<Map<string, number>> {
    if (!sampleIds.length) return new Map();
    const rows = await this.prisma.labOosCase.groupBy({
      by: ['sampleId'],
      where: { sampleId: { in: sampleIds }, status: { notIn: ['CLOSED', 'REJECTED'] } },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.sampleId, r._count._all]));
  }

  private async namesFor(ids: string[]): Promise<Map<string, string>> {
    const uniq = Array.from(new Set(ids.filter(Boolean)));
    if (!uniq.length) return new Map();
    const rows = await this.prisma.user.findMany({ where: { id: { in: uniq } }, select: { id: true, fullNameAr: true } });
    return new Map(rows.map((r) => [r.id, r.fullNameAr]));
  }

  /** شعبة ملكية العينة: من الرمز المرسل فقط لو سمح نطاق المستخدم، وإلا من ملفه */
  private async resolveOwnerSubDept(code: string | null, access: AccessContext, writeCode: PermissionCode): Promise<string> {
    const grant = access.profile.permissions.find((p) => p.code === writeCode);
    if (!code) {
      if (!access.profile.subDeptId) {
        throw new BadRequestException({ statusCode: 400, messageAr: 'حسابك غير مرتبط بشعبة — أرسل forSubDeptCode أو راجع شعبة النظام' });
      }
      return access.profile.subDeptId;
    }
    const sub = await this.prisma.subDepartment.findFirst({ where: { code, isActive: true }, select: { id: true, departmentId: true } });
    if (!sub) throw new BadRequestException({ statusCode: 400, messageAr: `شعبة غير معرّفة: ${code}` });
    const allowed =
      grant?.scope === 'ALL' || access.profile.isFacilityWide || sub.id === access.profile.subDeptId || (grant?.scope === 'DEPT' && sub.departmentId === access.profile.departmentId);
    if (!allowed) {
      throw new ForbiddenException({ statusCode: 403, messageAr: `لا يمكنك فتح عينة باسم ${code} — نطاقك ${grant?.scope ?? 'غير ممنوح'}`, required: writeCode });
    }
    return sub.id;
  }

  private nextSampleStatuses(status: string): string[] {
    const map: Record<string, string[]> = {
      COLLECTED: ['IN_QUEUE', 'ANALYZING', 'VOIDED'],
      IN_QUEUE: ['ANALYZING', 'VOIDED'],
      ANALYZING: ['RESULTED', 'IN_QUEUE', 'VOIDED'],
      RESULTED: ['VERIFIED', 'REJECTED'],
      VERIFIED: ['REJECTED'],
      REJECTED: ['ANALYZING'],
      VOIDED: [],
    };
    return map[status] ?? [];
  }

  private assertCan(access: AccessContext, code: PermissionCode): void {
    if (!access.can(code)) {
      throw new ForbiddenException({ statusCode: 403, messageAr: `لا تملك ${code}`, required: code, yourGrants: access.profile.permissions.map((p) => p.code) });
    }
  }

  private ctx(access: AccessContext) {
    const scope =
      access.profile.permissions.find((p) => ['lab.sample.view', 'lab.result.view', 'lab.result.enter', 'lab.result.verify'].includes(p.code))?.scope ?? 'SUBDEPT';
    return {
      userId: access.profile.userId,
      facilityId: access.profile.facilityId,
      departmentId: access.profile.departmentId,
      subDeptId: access.profile.subDeptId,
      scopeKind: scope as 'SELF' | 'TEAM' | 'SUBDEPT' | 'DEPT' | 'ALL',
      deviceId: access.deviceId,
    };
  }

  private async nextNumber(tx: Prisma.TransactionClient, seq: string, prefix: string): Promise<string> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const rows = await tx.$queryRaw<Array<{ n: string }>>`SELECT next_business_number(${seq}::regclass, ${prefix}, EXTRACT(YEAR FROM now())::int, 6) AS n`;
      const n = rows[0]?.n;
      if (!n) throw new Error(`number generation failed for ${seq}`);
      if (prefix === 'SMP') {
        const clash = await tx.labSample.count({ where: { sampleNumber: n } });
        if (!clash) return n;
      } else {
        const clash = await tx.labOosCase.count({ where: { code: n } });
        if (!clash) return n;
      }
    }
    throw new ConflictException({ statusCode: 409, messageAr: `تكرار في رقم ${prefix} — شغّل SELECT * FROM fn_align_number_sequences() ثم أعد المحاولة` });
  }
}

const asObject = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

const appendNote = (current: string | null, addition: string): string => {
  const next = current ? `${current}\n${addition}` : addition;
  return next.length > 600 ? next.slice(next.length - 600) : next;
};

const uniqueNames = (names: Array<string | null>): string[] => Array.from(new Set(names.filter((n): n is string => !!n)));
