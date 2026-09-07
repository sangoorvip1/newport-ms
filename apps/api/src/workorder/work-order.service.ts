import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  allowedNextStates,
  canTransition,
  computeSla,
  type WorkOrderCreateDto,
  type WorkOrderTransitionDto,
  type WoState,
  type PermissionCode,
} from '@newport/domain';
import { PrismaService } from '../common/prisma.service.js';
import type { AccessContext } from '../security/access.guard.js';

/**
 * أوامر الشغل — قلب وحدة الصيانة ومصدر أوامر العمل لتسع شعب.
 * كل انتقال حالة يُتحقق منه بآلة الحالة المشتركة (domain) ثم بالصلاحيات والنطاق.
 */
@Injectable()
export class WorkOrderService {
  private readonly logger = new Logger(WorkOrderService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(input: WorkOrderCreateDto, access: AccessContext) {
    const subDept = await this.prisma.subDepartment.findFirst({ where: { code: input.requestedSubDeptCode, isActive: true }, include: { department: { select: { code: true } } } });
    if (!subDept) throw new BadRequestException({ statusCode: 400, messageAr: `الشعبة المطلوبة غير معرّفة: ${input.requestedSubDeptCode}` });
    if (subDept.department.code !== 'MAINT' && !access.profile.isFacilityWide) {
      // طلب صيانة من شعبة إنتاج — مسموح، لكن التوجيه دائمًا لشعبة صيانة
    }
    const asset = input.assetId ? await this.prisma.asset.findFirst({ where: { id: input.assetId, deletedAt: null } }) : null;
    if (input.assetId && !asset) throw new NotFoundException('asset not found');

    const permitCheck = input.requirePermit && !access.can('maint.permit.create');
    if (permitCheck) throw new ForbiddenException({ statusCode: 403, messageAr: 'طلب صيانة يتطلب تصريح عمل ولا تملك صلاحية إنشاء تصريح' });

    const runCreate = () =>
      this.prisma.withScope(this.ctx(access), async (tx) => {
      const number = await this.nextNumber(tx, 'wo_number_seq', 'WO');
      const wo = await tx.workOrder.create({
        data: {
          id: input.id ?? undefined,
          number,
          facilityId: access.profile.facilityId,
          departmentId: subDept.departmentId,
          subDeptId: subDept.id,
          assetId: asset?.id ?? null,
          title: input.title,
          description: input.description,
          priority: input.priority,
          sourceType: input.sourceType,
          sourceRef: input.sourceRef ?? null,
          status: 'DRAFT',
          createdById: access.userId,
          requirePermit: input.requirePermit,
          isSafetyCritical: input.priority === 'EMERGENCY',
          costCenterCode: asset?.costCenterCode ?? subDept.costCenterCode,
          estHours: input.estimatedHours ?? null,
          isOfflineCreated: false,
          clientOpId: null,
        },
        include: { subDept: { select: { code: true, nameAr: true, department: { select: { code: true } } } }, asset: { select: { tag: true, nameAr: true } } },
      });
      await tx.woLog.create({
        data: { woId: wo.id, byUserId: access.userId, toStatus: 'DRAFT', textAr: 'فتح أمر شغل' },
      });
      await this.prisma.audit(tx, {
        facilityId: access.profile.facilityId,
        actorId: access.userId,
        action: 'CREATE',
        entityType: 'workOrder',
        entityId: wo.id,
        changes: { number, subDept: subDept.code, priority: input.priority, assetTag: asset?.tag ?? null },
        meta: { ip: access.ip, deviceId: access.deviceId },
      });
      return wo;
      });

    // طبقة دفاع: لو كان الرقم المحجوز من تسلسل يصطدم بصف مُهاجَر/مُدخَل يدويًا، أعد المعاملة برقم جديد
    let created!: Awaited<ReturnType<typeof runCreate>>;
    for (let attempt = 0; ; attempt++) {
      try {
        created = await runCreate();
        break;
      } catch (e) {
        const err = e as { code?: string; meta?: { target?: unknown } };
        const numberClash = err.code === 'P2002' && JSON.stringify(err.meta?.target ?? '').includes('number');
        if (!numberClash || attempt >= 2) throw e;
        this.logger.warn(`WO number clash — retry ${attempt + 1} after realigning sequences`);
        await this.prisma.$executeRawUnsafe('SELECT * FROM fn_align_number_sequences()').catch(() => undefined);
      }
    }

    return { id: created.id, number: created.number, status: created.status, subDept: created.subDept, asset: created.asset };
  }

  async list(filter: {
    status?: WoState;
    subDeptCode?: string;
    priority?: string;
    q?: string;
    from?: string;
    to?: string;
    onlyMy?: boolean;
    includeClosed?: boolean;
    take?: number;
    skip?: number;
  }, access: AccessContext) {
    const take = Math.min(filter.take ?? 50, 200);
    const where: Prisma.WorkOrderWhereInput = {
      deletedAt: null,
      ...(filter.onlyMy ? { createdById: access.userId } : {}),
      ...(filter.status ? { status: filter.status } : filter.includeClosed ? {} : { status: { notIn: ['CLOSED', 'CANCELLED', 'REJECTED'] } }),
      ...(filter.priority ? { priority: filter.priority as Prisma.WorkOrderWhereInput['priority'] } : {}),
      ...(filter.subDeptCode ? { subDept: { code: filter.subDeptCode } } : {}),
      ...(filter.from || filter.to
        ? { createdAt: { ...(filter.from ? { gte: new Date(filter.from) } : {}), ...(filter.to ? { lte: new Date(filter.to) } : {}) } }
        : {}),
      ...(filter.q
        ? { OR: [{ title: { contains: filter.q } }, { description: { contains: filter.q } }, { number: { contains: filter.q } }, { asset: { tag: { contains: filter.q } } }] }
        : {}),
      ...this.scopeWhere(access, 'maint.wo.view'),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.workOrder.findMany({
        where,
        include: {
          asset: { select: { tag: true, nameAr: true, classCode: true, criticality: true } },
          subDept: { select: { code: true, nameAr: true } },
          createdBy: { select: { id: true, fullNameAr: true } },
          assignedTo: { select: { id: true, fullNameAr: true } },
          requisitions: { select: { id: true, status: true } },
          _count: { select: { logs: true, readings: true, labor: true } },
        },
        orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
        take,
        skip: filter.skip ?? 0,
      }),
      this.prisma.workOrder.count({ where }),
    ]);

    return {
      total,
      take,
      skip: filter.skip ?? 0,
      items: rows.map((r) => ({
        id: r.id,
        number: r.number,
        title: r.title,
        status: r.status,
        priority: r.priority,
        assetTag: r.asset?.tag ?? null,
        assetName: r.asset?.nameAr ?? null,
        subDept: r.subDept?.nameAr ?? null,
        createdBy: r.createdBy.fullNameAr,
        assignedTo: r.assignedTo?.fullNameAr ?? null,
        createdAt: r.createdAt.toISOString(),
        submittedAt: null,
        startedAt: r.actualStartAt?.toISOString() ?? null,
        closedAt: r.actualEndAt?.toISOString() ?? null,
        version: r.version,
        syncSeq: Number(r.syncSeq ?? 0),
        counts: r._count,
        requisitionStatuses: r.requisitions.map((q) => q.status),
        sla: computeSla({
          priority: r.priority,
          submittedAt: r.createdAt.toISOString(),
          startedAt: r.actualStartAt?.toISOString() ?? null,
          closedAt: r.actualEndAt?.toISOString() ?? null,
        }),
      })),
    };
  }

  async detail(id: string, access: AccessContext) {
    const wo = await this.prisma.workOrder.findFirst({
      where: { id, deletedAt: null, ...this.scopeWhere(access, 'maint.wo.view') },
      include: {
        asset: { include: { unit: { select: { code: true, nameAr: true } } } },
        subDept: { select: { id: true, code: true, nameAr: true } },
        createdBy: { select: { id: true, fullNameAr: true, subDept: { select: { nameAr: true } } } },
        assignedTo: { select: { id: true, fullNameAr: true } },
        logs: { orderBy: { at: 'desc' }, take: 100 },
        readings: { orderBy: { measuredAt: 'desc' }, take: 30 },
        labor: true,
        requisitions: { include: { lines: true } },
      },
    });
    if (!wo) throw new NotFoundException('work order not found or out of your scope');

    return {
      ...wo,
      nextStates: allowedNextStates(wo.status as WoState, new Set(access.profile.permissions.map((p) => p.code))),
      sla: computeSla({
        priority: wo.priority,
        submittedAt: wo.createdAt.toISOString(),
        startedAt: wo.actualStartAt?.toISOString() ?? null,
        closedAt: wo.actualEndAt?.toISOString() ?? null,
      }),
      documents: await this.prisma.document.findMany({ where: { entityType: 'workOrder', entityId: wo.id, deletedAt: null }, orderBy: { uploadedAt: 'desc' } }),
    };
  }

  /** الانتقال الوحيد المسموح: عبر آلة الحالة + صلاحية الانتقال + نطاق البيانات */
  async transition(id: string, dto: WorkOrderTransitionDto, access: AccessContext) {
    const wo = await this.prisma.workOrder.findUnique({ where: { id } });
    if (!wo) throw new NotFoundException('work order not found');

    const perms = new Set<PermissionCode>(access.profile.permissions.map((p) => p.code));
    const transition = canTransition(wo.status as WoState, dto.to, perms);
    if (!transition) {
      throw new ConflictException({
        statusCode: 409,
        messageAr: `الانتقال من ${wo.status} إلى ${dto.to} غير مسموح بهذه الصلاحية`,
        allowed: allowedNextStates(wo.status as WoState, perms),
      });
    }
    for (const req of transition.requires ?? []) {
      const missing =
        (req === 'reason' && !dto.reason) ||
        (req === 'actualTimes' && dto.to === 'IN_PROGRESS' && !dto.actualStart) ||
        (req === 'rootCause' && dto.to === 'CLOSED' && !dto.rootCause);
      if (missing) throw new BadRequestException({ statusCode: 400, messageAr: `الإغلاق/الانتقال يتطلب: ${req}`, required: transition.requires });
    }
    // قاعدة سلامة: لا يبدأ تنفيذ عمل خطِر بلا تصريح سارٍ
    if (dto.to === 'IN_PROGRESS' && (wo.requirePermit || wo.isSafetyCritical)) {
      const permit = await this.prisma.permitToWork.findFirst({
        where: { workOrderId: wo.id, status: { in: ['OPEN', 'EXTENDED', 'APPROVED_BY_HSE'] }, validTo: { gte: new Date() } },
      });
      if (!permit) throw new BadRequestException({ statusCode: 400, messageAr: 'لا يمكن بدء التنفيذ قبل إصدار تصريح عمل ساري المفعول' });
    }

    const updated = await this.prisma.withScope(this.ctx(access), async (tx) => {
      // قفل تفاؤلي: لا يُطبَّق التحديث إن تغيّر الإصدار أثناء وجودنا خارج الشبكة
      const affected = await tx.workOrder.updateMany({
        where: { id: wo.id, version: wo.version },
        data: {
          status: dto.to,
          actualStartAt: dto.to === 'IN_PROGRESS' ? (dto.actualStart ? new Date(dto.actualStart) : new Date()) : wo.actualStartAt,
          actualEndAt: dto.to === 'CLOSED' || dto.to === 'COMPLETED' ? (dto.actualEnd ? new Date(dto.actualEnd) : new Date()) : wo.actualEndAt,
          assignedToId: dto.to === 'ASSIGNED' ? (dto.assigneeIds?.[0] ?? wo.assignedToId) : wo.assignedToId,
          approverId: dto.to === 'APPROVED' ? access.userId : wo.approverId,
          rootCause: dto.rootCause ?? wo.rootCause,
          closeNotes: dto.to === 'CLOSED' ? (dto.reason ?? wo.closeNotes) : wo.closeNotes,
        },
      });
      if (affected.count === 0) {
        throw new ConflictException({ statusCode: 409, messageAr: 'تم تعديل أمر الشغل من مستخدم آخر — حدّث الشاشة وأعد المحاولة', yourVersion: wo.version });
      }
      await tx.woLog.create({
        data: {
          woId: wo.id,
          byUserId: access.userId,
          fromStatus: wo.status,
          toStatus: dto.to,
          textAr: `${wo.status} → ${dto.to}${dto.reason ? ` — ${dto.reason}` : ''}`,
        },
      });
      await this.prisma.audit(tx, {
        facilityId: access.profile.facilityId,
        actorId: access.userId,
        action: dto.to === 'CLOSED' ? 'APPROVE' : 'UPDATE',
        entityType: 'workOrder',
        entityId: wo.id,
        changes: { from: wo.status, to: dto.to, reason: dto.reason ?? null },
        meta: { deviceId: access.deviceId },
      });
      return tx.workOrder.findUniqueOrThrow({ where: { id: wo.id } });
    });

    return { id: updated.id, status: updated.status, version: updated.version };
  }

  /** تسجيل ساعات العمالة على أمر الشغل (من الهاتف أو سطح المكتب) */
  async addLabor(woId: string, entries: Array<{ employeeId: string; hours: number; workDate: string; isOvertime?: boolean; shiftCode?: string }>, access: AccessContext) {
    const wo = await this.prisma.workOrder.findUnique({ where: { id: woId } });
    if (!wo) throw new NotFoundException('work order not found');
    if (wo.status === 'CLOSED') throw new ConflictException({ statusCode: 409, messageAr: 'الأمر مغلق — لا يمكن إضافة عمالة (أعِد الفتح عبر رئيس القسم)' });

    const created = await this.prisma.$transaction(
      entries.map((e) =>
        this.prisma.woLaborEntry.create({
          data: {
            woId,
            employeeId: e.employeeId,
            hours: e.hours,
            workDate: new Date(e.workDate),
            isOvertime: !!e.isOvertime,
            shiftCode: e.shiftCode ?? null,
          },
        }),
      ),
    );
    const total = entries.reduce((n, e) => n + e.hours, 0);
    await this.prisma.workOrder.update({ where: { id: woId }, data: { laborHours: { increment: total } } });
    return { added: created.length, totalHours: total };
  }

  private ctx(access: AccessContext) {
    const scope = access.profile.permissions.find((p) => ['maint.wo.view', 'maint.wo.execute', 'maint.wo.close'].includes(p.code))?.scope ?? 'SUBDEPT';
    return {
      userId: access.profile.userId,
      facilityId: access.profile.facilityId,
      departmentId: access.profile.departmentId,
      subDeptId: access.profile.subDeptId,
      scopeKind: scope as 'SUBDEPT' | 'DEPT' | 'ALL' | 'SELF' | 'TEAM',
      deviceId: access.deviceId,
    };
  }

  private scopeWhere(access: AccessContext, code: PermissionCode): Prisma.WorkOrderWhereInput {
    const grant = access.profile.permissions.find((p) => p.code === code);
    if (!grant) throw new ForbiddenException({ statusCode: 403, messageAr: `لا تملك ${code}` });
    if (grant.scope === 'ALL') return {};
    if (grant.scope === 'DEPT') return { departmentId: access.profile.departmentId };
    if (grant.scope === 'SUBDEPT') return { OR: [{ subDeptId: access.profile.subDeptId }, { createdById: access.profile.userId }] };
    return { createdById: access.profile.userId };
  }

  /** رقم أمر الشغل من تسلسل PostgreSQL (ذَرّي، بلا تنافس بين العملاء) */
  private async nextNumber(tx: Prisma.TransactionClient, seq: 'wo_number_seq', prefix: 'WO'): Promise<string> {
    const rows = await tx.$queryRaw<Array<{ n: string }>>`SELECT next_business_number(${seq}::regclass, ${prefix}, EXTRACT(YEAR FROM now())::int, 6) AS n`;
    const n = rows[0]?.n;
    if (!n) throw new Error('number generation failed');
    return n;
  }
}
