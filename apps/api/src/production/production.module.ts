import { BadRequestException, Body, ConflictException, Controller, Get, Injectable, Module, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { shiftLogDto, type ShiftLogDto } from '@newport/domain';
import { PrismaService } from '../common/prisma.service.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { CurrentAccess, RequirePermission, type AccessContext } from '../security/access.guard.js';

/**
 * الإنتاج: سجلوبة الوردية (يوريا/أمونيا/أبراج التبريد) + القراءات التشغيلية + الاتجاهات.
 * قاعدة أعمال: السجلوبة المعتمدة (APPROVED) لا تُعدَّل إلا عبر إلغاء الاعتماد — حمايةً لتطابق الأرقام مع تقرير الشركة المالكة.
 */
@Injectable()
export class ProductionService {
  constructor(private readonly prisma: PrismaService) {}

  /** upsert على مفتاح (الوحدة، تاريخ الوردية، رمز الوردية) — يسمح بالتعديل أثناء الوردية نفسها */
  async upsertShiftLog(dto: ShiftLogDto, access: AccessContext) {
    const unit = await this.prisma.productionUnit.findFirst({ where: { code: dto.unitCode } });
    if (!unit) throw new NotFoundException(`unit ${dto.unitCode} not found`);

    return this.prisma.withScope(
      {
        userId: access.profile.userId,
        facilityId: access.profile.facilityId,
        departmentId: access.profile.departmentId,
        subDeptId: access.profile.subDeptId,
        scopeKind: 'DEPT',
        deviceId: access.deviceId,
      },
      async (tx) => {
        const existing = await tx.productionShiftLog.findUnique({ where: { unitId_shiftDate_shiftCode: { unitId: unit.id, shiftDate: new Date(dto.shiftDate), shiftCode: dto.shiftCode } } });
        if (existing && existing.status !== 'DRAFT' && existing.preparedById !== access.userId) {
          throw new ConflictException({ statusCode: 409, messageAr: `سجلوبة الوردية ${existing.status} — التعديل يتطلب إلغاء الاعتماد من رئيس القسم/الوردية` });
        }
        const data = {
          facilityId: access.profile.facilityId,
          unitId: unit.id,
          shiftDate: new Date(dto.shiftDate),
          shiftCode: dto.shiftCode,
          preparedById: existing?.preparedById ?? access.userId,
          status: 'DRAFT' as const,
          productionTons: dto.productionTons ?? null,
          designRateTph: dto.designRateTph ?? null,
          availabilityPct: dto.availabilityPct ?? null,
          eventsJson: (dto.events ?? []) as unknown as Prisma.InputJsonValue,
          notes: dto.notes ?? null,
        };
        const log = existing
          ? await tx.productionShiftLog.update({ where: { id: existing.id }, data })
          : await tx.productionShiftLog.create({ data });

        if (dto.params?.length) {
          await tx.processParameter.createMany({
            data: dto.params.map((p) => ({
              logId: log.id,
              paramCode: p.paramCode,
              value: p.value,
              unit: p.unit,
              at: new Date(),
              source: 'MANUAL',
            })),
          });
        }
        await this.prisma.audit(tx, {
          facilityId: access.profile.facilityId,
          actorId: access.userId,
          action: existing ? 'UPDATE' : 'CREATE',
          entityType: 'shiftLog',
          entityId: log.id,
          changes: { unit: dto.unitCode, shift: dto.shiftCode, tons: dto.productionTons ?? null },
        });
        return { id: log.id, status: log.status, paramsRecorded: dto.params?.length ?? 0, events: dto.events?.length ?? 0 };
      },
    );
  }

  async approveShiftLog(id: string, access: AccessContext, action: 'APPROVE' | 'LOCK' | 'REOPEN' = 'APPROVE') {
    const log = await this.prisma.productionShiftLog.findUnique({ where: { id } });
    if (!log) throw new NotFoundException('shift log not found');
    const status = action === 'APPROVE' ? 'APPROVED' : action === 'LOCK' ? 'LOCKED' : 'DRAFT';
    const updated = await this.prisma.productionShiftLog.update({
      where: { id },
      data: { status, approvedById: action === 'REOPEN' ? null : access.userId, approvedAt: action === 'REOPEN' ? null : new Date() },
    });
    await this.prisma
      .audit(this.prisma, { facilityId: access.profile.facilityId, actorId: access.userId, action: action === 'REOPEN' ? 'UPDATE' : 'APPROVE', entityType: 'shiftLog', entityId: id, changes: { status } })
      .catch(() => undefined);
    return { id: updated.id, status: updated.status, approvedAt: updated.approvedAt };
  }

  async recentShiftLogs(filter: { unitCode?: string; days?: number; shiftCode?: string }, access: AccessContext) {
    const since = new Date(Date.now() - (filter.days ?? 7) * 86_400_000);
    const rows = await this.prisma.productionShiftLog.findMany({
      where: {
        deletedAt: null,
        shiftDate: { gte: since },
        ...(filter.unitCode ? { unit: { code: filter.unitCode } } : {}),
        ...(filter.shiftCode ? { shiftCode: filter.shiftCode } : {}),
        ...(access.profile.isFacilityWide ? {} : { facility: { departments: { some: { subDepartments: { some: { id: access.profile.subDeptId } } } } } }),
      },
      include: { unit: { select: { code: true, nameAr: true } }, parameters: { take: 20, orderBy: { at: 'desc' } } },
      orderBy: [{ shiftDate: 'desc' }, { shiftCode: 'asc' }],
      take: 120,
    });
    return rows.map((r) => ({
      id: r.id,
      unit: r.unit.nameAr,
      unitCode: r.unit.code,
      shiftDate: r.shiftDate.toISOString().slice(0, 10),
      shiftCode: r.shiftCode,
      status: r.status,
      tons: r.productionTons === null ? null : Number(r.productionTons),
      availabilityPct: r.availabilityPct === null ? null : Number(r.availabilityPct),
      events: Array.isArray(r.eventsJson) ? r.eventsJson : [],
      params: r.parameters.map((p) => ({ code: p.paramCode, value: Number(p.value), unit: p.unit, at: p.at.toISOString() })),
    }));
  }

  /** منحنى اتجاه بسيط لقراءة تشغيلية (يُستخدم في لوحة الإنتاج وشاشة "المؤشرات") */
  async paramTrend(paramCode: string, days = 30, unit?: string) {
    const rows = await this.prisma.$queryRaw<Array<{ bucket: Date; avg: number | null; min: number | null; max: number | null; n: number }>>`
      SELECT date_trunc('day', p."at") AS bucket,
             avg(p."value")::float AS avg, min(p."value")::float AS min, max(p."value")::float AS max, count(*)::int AS n
        FROM process_parameters p
        LEFT JOIN production_shift_logs l ON l.id = p."logId"
        LEFT JOIN production_units u ON u.id = l."unitId"
       WHERE p."paramCode" = ${paramCode} AND p."at" >= now() - make_interval(days => ${days})
         AND (${unit ?? ''} = '' OR u.code = ${unit ?? ''})
       GROUP BY 1 ORDER BY 1`;
    return rows.map((r) => ({ day: r.bucket.toISOString().slice(0, 10), avg: r.avg, min: r.min, max: r.max, samples: r.n }));
  }
}

@Controller('v1/production')
export class ProductionController {
  constructor(private readonly prod: ProductionService) {}

  @RequirePermission(['prod.log.create', 'prod.log.update'], { anyOf: true })
  @Post('shift-logs')
  upsert(@Body(new ZodPipe(shiftLogDto)) body: ShiftLogDto, @CurrentAccess() access: AccessContext) {
    return this.prod.upsertShiftLog(body, access);
  }

  @RequirePermission(['prod.log.approve'])
  @Post('shift-logs/:id/approve')
  approve(
    @Param('id') id: string,
    @Body() body: { action?: 'APPROVE' | 'LOCK' | 'REOPEN' },
    @CurrentAccess() access: AccessContext,
  ) {
    return this.prod.approveShiftLog(id, access, body?.action ?? 'APPROVE');
  }

  @RequirePermission(['prod.log.view'])
  @Get('shift-logs')
  list(@Query('unitCode') unitCode?: string, @Query('days') days?: string, @Query('shiftCode') shiftCode?: string, @CurrentAccess() access?: AccessContext) {
    return this.prod.recentShiftLogs({ unitCode, shiftCode, days: days ? Number(days) : undefined }, access!);
  }

  @RequirePermission(['prod.param.view'])
  @Get('params/trend')
  trend(@Query('paramCode') paramCode: string, @Query('days') days?: string, @Query('unit') unit?: string) {
    if (!paramCode) throw new BadRequestException({ statusCode: 400, messageAr: 'paramCode مطلوب' });
    return this.prod.paramTrend(paramCode, days ? Number(days) : 30, unit);
  }
}

@Module({ controllers: [ProductionController], providers: [ProductionService], exports: [ProductionService] })
export class ProductionModule {}
