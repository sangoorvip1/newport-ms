import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './common/prisma.service.js';
import { AuthModule } from './security/auth.module.js';
import { AccessGuard } from './security/access.guard.js';
import { OrganizationModule } from './organization/organization.module.js';
import { WorkOrderModule } from './workorder/work-order.module.js';
import { ProductionModule } from './production/production.module.js';
import { LabModule } from './lab/lab.module.js';
import { SyncModule } from './sync/sync.module.js';
import { TimeModule } from './time/attendance.module.js';
import { AuditModule } from './audit/audit.module.js';
import { HealthController } from './health/health.controller.js';
import { RateLimitGuard } from './common/rate-limit.guard.js';
import { ErrorContractFilter } from './common/error-contract.filter.js';

/**
 * وحدات الخدمة النواة (Modular Monolith).
 * كل وحدة = (controller + service + اختبارات) ويمكن فصلها لاحقًا كخدمة مستقلة
 * دون تغيير في العقد، لأن التواصل بينها الآن عبر طبقة الخدمات فقط.
 */
@Module({
  imports: [
    PrismaModule,
    AuthModule,
    OrganizationModule,
    WorkOrderModule,
    ProductionModule,
    LabModule,
    SyncModule,
    TimeModule,
    AuditModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: RateLimitGuard }, // 1) حد المعدن/منع التخمين
    { provide: APP_GUARD, useClass: AccessGuard }, // 2) المصادقة + الصلاحيات
    // 3) عقد موحّد للأخطاء: رسالة عربية + errorId للبحث في السجل، وكتمان تفاصيل 5xx عن العميل
    { provide: APP_FILTER, useClass: ErrorContractFilter },
  ],
})
export class AppModule {}
