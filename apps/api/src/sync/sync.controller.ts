import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentAccess, RequirePermission, type AccessContext } from '../security/access.guard.js';
import { SyncEngineService } from './sync-engine.service.js';
import { ZodPipe } from '../common/zod.pipe.js';
import {
  SCHEMA_VERSION,
  SYNC_ENTITIES,
  SYNC_META,
  planPushBatches,
  pushRequestDto,
  pullRequestDto,
  type PushRequest,
  type PushRequestDto,
  type PullRequestDto,
} from '@newport/domain';
import { CONFIG } from '../config.js';

/**
 * نقطة المزامنة الوحيدة للتطبيقين (سطح المكتب + الهاتف).
 *  - push: يرفع العميل طابور outbox المحلي — idempotent وقابل لإعادة الإرسال بعد انقطاع.
 *  - pull: يسحب التغييرات منذ آخر cursor مع فلترة النطاق (شعبة/قسم/منشأة) على الخادم.
 *  - batch-plan: يساعد العميل على تقسيم الطابور حسب الأولوية (لا منطق أعمال في العميل).
 */
@Controller('v1/sync')
export class SyncController {
  constructor(private readonly sync: SyncEngineService) {}

  @RequirePermission(['sync.push'])
  @Post('push')
  push(@Body(new ZodPipe(pushRequestDto)) body: PushRequestDto, @CurrentAccess() access: AccessContext) {
    if (body.ops.length > CONFIG.sync.maxOpsPerPush) {
      throw new BadRequestException({
        statusCode: 413,
        messageAr: `الدفعة أكبر من الحد المسموح (${CONFIG.sync.maxOpsPerPush} عملية) — قسّم الطابور عبر planPushBatches`,
      });
    }
    return this.sync.push({ ...body, userId: access.userId } as PushRequest, access);
  }

  @RequirePermission(['sync.pull'])
  @Get('pull')
  pull(@Query() raw: Record<string, string | undefined>, @CurrentAccess() access: AccessContext) {
    const parsed = pullRequestDto.safeParse({
      deviceId: raw.deviceId,
      sinceCursor: raw.sinceCursor ? Number(raw.sinceCursor) : 0,
      entities: raw.entities ? String(raw.entities).split(',').filter(Boolean) : undefined,
      limit: raw.limit ? Number(raw.limit) : undefined,
    });
    if (!parsed.success) {
      throw new BadRequestException({ statusCode: 400, messageAr: 'بارامترات السحب غير صالحة', issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
    }
    const q = parsed.data as Required<PullRequestDto>;
    return this.sync.pull(
      { deviceId: q.deviceId, sinceCursor: q.sinceCursor, entities: q.entities as never, limit: q.limit ?? CONFIG.sync.maxRowsPerPull },
      access,
    );
  }

  /** يُرجع خطة تقسيم الطابور — يستعملها العميل عند عودة الشبكة (أولوية عالية أولًا) */
  @RequirePermission(['sync.push'])
  @Post('batch-plan')
  batchPlan(@Body() body: { ops: Parameters<typeof planPushBatches>[0]; maxBatch?: number }) {
    return { batches: planPushBatches(body.ops ?? [], body.maxBatch ?? 200).map((b) => b.map((o) => o.opId)) };
  }

  /** عقد المزامنة — يفحصه التطبيق عند التشغيل ليقرر: تحديث التطبيق؟ إعادة مزامنة كاملة؟ */
  @RequirePermission(['sync.pull'])
  @Get('protocol')
  protocol() {
    return {
      schemaVersion: SCHEMA_VERSION,
      maxOpsPerPush: CONFIG.sync.maxOpsPerPush,
      maxRowsPerPull: CONFIG.sync.maxRowsPerPull,
      changeLogRetentionDays: CONFIG.sync.changeLogRetentionDays,
      serverTime: new Date().toISOString(),
      timezone: CONFIG.timezone,
      entities: SYNC_ENTITIES.map((e) => ({ entity: e, table: SYNC_META[e].table, merge: SYNC_META[e].merge, pushPriority: SYNC_META[e].pushPriority })),
    };
  }
}
