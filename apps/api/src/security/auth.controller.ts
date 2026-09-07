import { All, Body, Controller, Get, HttpException, HttpStatus, Post, Query, Req } from '@nestjs/common';
import { AllowAnonymous, CurrentAccess, RequirePermission, type AccessContext } from '../security/access.guard.js';
import { AuthService } from '../security/auth.service.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { loginDto } from '@newport/domain';
import type { Request } from 'express';
import { CONFIG } from '../config.js';

const reqMeta = (req: Request) => ({
  ip: (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.socket?.remoteAddress ?? undefined,
  userAgent: req.headers['user-agent'] ?? undefined,
});

@Controller('v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @AllowAnonymous()
  @Get('health')
  health(@Req() _req: Request) {
    return {
      status: 'ok',
      service: 'newport-api',
      facility: CONFIG.facilityCode,
      timezone: CONFIG.timezone,
      syncSchemaVersion: 3,
      serverTime: new Date().toISOString(),
    };
  }

  /** نقطة دخول موحّدة لسطح المكتب والهاتف (نفس العقد، نفس الصلاحيات) */
  @AllowAnonymous()
  @Post('login')
  login(@Req() req: Request, @Body(new ZodPipe(loginDto)) body: typeof loginDto._output) {
    const meta = reqMeta(req);
    return this.auth.login({ ...body, ip: meta.ip, userAgent: meta.userAgent });
  }

  @AllowAnonymous()
  @Post('refresh')
  refresh(@Req() req: Request, @Body() body: { refreshToken: string; deviceId: string }) {
    const meta = reqMeta(req);
    if (!body?.refreshToken || !body?.deviceId) throw new HttpException('refreshToken & deviceId required', HttpStatus.BAD_REQUEST);
    return this.auth.refresh(body.refreshToken, body.deviceId, meta.ip, meta.userAgent);
  }

  @Post('logout')
  logout(@Req() req: Request, @Body() body: { refreshToken: string }) {
    return this.auth.logout(body?.refreshToken ?? '', reqMeta(req).ip);
  }

  /** ما هي صلاحياتي الآن؟ — تستخدمها الواجهات لبناء القوائم (ويعيد الخادم نفس القائمة المصدَّقة) */
  @Get('me')
  me(@CurrentAccess() access: AccessContext) {
    return {
      userId: access.profile.userId,
      roles: access.profile.roles,
      departmentId: access.profile.departmentId,
      subDepartmentId: access.profile.subDeptId,
      facilityWide: access.profile.isFacilityWide,
      permissions: access.profile.permissions.map((p) => ({ code: p.code, scope: p.scope })),
      offlineEnabledPermissions: access.profile.permissions.filter((p) => ['SUBDEPT', 'DEPT'].includes(p.scope)).map((p) => p.code),
      // تُستعمل في الطرفين لفتح شاشة تغيير كلمة المرور الإلزامي بدل مفاجأة 403 لاحقًا
      mustChangePwd: access.profile.mustChangePwd,
    };
  }

  @Post('change-password')
  changePassword(
    @CurrentAccess() access: AccessContext,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    return this.auth.changePassword(access.userId, body.currentPassword, body.newPassword, access.deviceId);
  }

  @RequirePermission(['org.dept.view'])
  @Get('permission-catalog')
  catalog() {
    return this.auth.catalog();
  }
}
