import { Controller, Get } from '@nestjs/common';
import { AllowAnonymous } from '../security/access.guard.js';
import { PrismaService } from '../common/prisma.service.js';
import { CONFIG } from '../config.js';
import { SCHEMA_VERSION, PERMISSION_DEFS, ROLE_DEFS, ORG_STRUCTURE } from '@newport/domain';

/** فحوص جاهزية للاستعمال من docker-compose / k8s / شاشة المراقبة في تطبيق سطح المكتب */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @AllowAnonymous()
  @Get()
  liveness() {
    return { status: 'ok', service: 'newport-api', schemaVersion: SCHEMA_VERSION, serverTime: new Date().toISOString() };
  }

  @AllowAnonymous()
  @Get('ready')
  async readiness() {
    const checks: Record<string, string> = {};
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch (e) {
      checks.database = `fail: ${(e as Error).message.slice(0, 80)}`;
    }
    try {
      const depts = await this.prisma.department.count();
      const subs = await this.prisma.subDepartment.count();
      checks.organization = `${depts} dept / ${subs} sub-dept (reference: ${ORG_STRUCTURE.length}/${ORG_STRUCTURE.reduce((n, d) => n + d.subDepartments.length, 0)})`;
    } catch (e) {
      checks.organization = `fail: ${(e as Error).message.slice(0, 80)}`;
    }
    try {
      const [roles, perms, pending] = await Promise.all([
        this.prisma.role.count(),
        this.prisma.permission.count(),
        this.prisma.$queryRaw<Array<{ n: bigint }>>`SELECT count(*)::bigint AS n FROM sync_conflicts WHERE "resolvedAt" IS NULL`,
      ]);
      checks.rbac = `${roles}/${ROLE_DEFS.length} roles, ${perms}/${PERMISSION_DEFS.length} permissions`;
      checks.openConflicts = Number(pending[0]?.n ?? 0).toString();
    } catch (e) {
      checks.rbac = `fail: ${(e as Error).message.slice(0, 80)}`;
    }
    const healthy = Object.values(checks).every((v) => !v.startsWith('fail'));
    return { status: healthy ? 'ready' : 'degraded', facility: CONFIG.facilityCode, checks };
  }
}
