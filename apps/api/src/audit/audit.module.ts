import { BadRequestException, Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service.js';
import { CurrentAccess, RequirePermission, type AccessContext } from '../security/access.guard.js';

/** سجل التدقيق: قراءة فقط (append-only على مستوى القاعدة) — للتقارير الرقابية والتفتيش */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async query(filter: { entityType?: string; entityId?: string; actorId?: string; action?: string; from?: string; to?: string; take?: number; skip?: number }) {
    const take = Math.min(filter.take ?? 100, 1000);
    const where = {
      ...(filter.entityType ? { entityType: filter.entityType } : {}),
      ...(filter.entityId ? { entityId: filter.entityId } : {}),
      ...(filter.actorId ? { actorId: filter.actorId } : {}),
      ...(filter.action ? { action: filter.action } : {}),
      ...(filter.from || filter.to
        ? { at: { ...(filter.from ? { gte: new Date(filter.from) } : {}), ...(filter.to ? { lte: new Date(filter.to) } : {}) } }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditTrail.findMany({
        where,
        include: { actor: { select: { fullNameAr: true, username: true, subDept: { select: { code: true } } } } },
        orderBy: { at: 'desc' },
        take,
        skip: filter.skip ?? 0,
      }),
      this.prisma.auditTrail.count({ where }),
    ]);
    return {
      total,
      items: items.map((i) => ({
        id: i.id.toString(),
        at: i.at.toISOString(),
        actor: i.actor ? `${i.actor.fullNameAr} (${i.actor.subDept?.code ?? '-'})` : i.actorName ?? 'system',
        action: i.action,
        entityType: i.entityType,
        entityId: i.entityId,
        ip: i.ip,
        changes: i.changes,
      })),
    };
  }

  /** إحصاءات موجزة تُعرض في لوحة مدير النظام */
  async stats() {
    const rows = await this.prisma.$queryRaw<Array<{ action: string; n: bigint }>>`
      SELECT action, count(*)::bigint AS n FROM audit_trails WHERE at >= now() - interval '30 days' GROUP BY action ORDER BY n DESC`;
    return rows.map((r) => ({ action: r.action, count: Number(r.n) }));
  }
}

@Controller('v1/audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @RequirePermission(['audit.view'])
  @Get()
  list(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('actorId') actorId?: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
    @CurrentAccess() _access?: AccessContext,
  ) {
    void _access;
    if (entityId && !/^[0-9a-f-]{36}$/i.test(entityId)) throw new BadRequestException('entityId must be a UUID');
    return this.audit.query({ entityType, entityId, actorId, action, from, to, take: take ? Number(take) : undefined, skip: skip ? Number(skip) : undefined });
  }

  @RequirePermission(['audit.view'])
  @Get('stats')
  stats() {
    return this.audit.stats();
  }
}

@Module({ controllers: [AuditController], providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
