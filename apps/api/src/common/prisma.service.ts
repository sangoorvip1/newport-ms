import { Global, Injectable, Logger, Module, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

/** سياق أمني يُمرَّر إلى PostgreSQL لتفعيل سياسات RLS + فلترة النطاق */
export interface SecurityContext {
  userId: string;
  facilityId: string;
  departmentId: string;
  subDeptId: string;
  scopeKind: 'NONE' | 'SELF' | 'TEAM' | 'SUBDEPT' | 'DEPT' | 'ALL';
  deviceId?: string;
  privileged?: { biometric?: boolean; finance?: boolean };
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'stdout', level: process.env.PRISMA_LOG === 'query' ? 'query' : 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * تنفيذ داخل معاملة مع ضبط متغيرات التطبيق (app.*) التي تقرأها سياسات RLS.
   * SET LOCAL يضمن زوال القيم عند نهاية المعاملة — لا تسرّب بين الطلبات.
   * القيم تُمرَّر كمعاملات مربوطة (Prepared) لتفادي أي حقن SQL.
   */
  async withScope<T>(ctx: SecurityContext, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT set_config('app.user_id', ${ctx.userId}, true),
                          set_config('app.facility_id', ${ctx.facilityId}, true),
                          set_config('app.dept_id', ${ctx.departmentId}, true),
                          set_config('app.subdept_id', ${ctx.subDeptId}, true),
                          set_config('app.scope_kind', ${ctx.scopeKind}, true),
                          set_config('app.device_id', ${ctx.deviceId ?? ''}, true),
                          set_config('app.biometric_privileged', ${ctx.privileged?.biometric ? 'true' : 'false'}, true),
                          set_config('app.fin_access', ${ctx.privileged?.finance ? 'true' : 'false'}, true)`,
      );
      return fn(tx);
    });
  }

  /** تسجيل تدقيقي موحّد (append-only) */
  async audit(tx: Prisma.TransactionClient | PrismaService, entry: AuditEntry): Promise<void> {
    const client = tx as unknown as Prisma.TransactionClient;
    await client.auditTrail.create({
      data: {
        facilityId: entry.facilityId ?? null,
        actorId: entry.actorId ?? null,
        actorName: entry.actorName ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        changes: entry.changes ? (entry.changes as Prisma.InputJsonValue) : Prisma.DbNull,
        meta: entry.meta ? (entry.meta as Prisma.InputJsonValue) : Prisma.DbNull,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ? entry.userAgent.slice(0, 250) : null,
      },
    });
  }
}

const quote = (v: string | undefined): string => `'${(v ?? '').replace(/'/g, "''").replace(/[^A-Za-z0-9_.:@\- ]/g, '')}'`;

export interface AuditEntry {
  facilityId?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'REJECT' | 'LOGIN' | 'LOGOUT' | 'SYNC_PUSH' | 'SYNC_CONFLICT' | 'EXPORT' | 'DENIED';
  entityType: string;
  entityId?: string | null;
  changes?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}

export { Prisma };
export type { PrismaClient };
export const raw = Prisma.raw;
export { Logger };
