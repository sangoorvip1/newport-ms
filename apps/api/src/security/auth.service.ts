import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { PERMISSION_DEFS, type PermissionCode, type AuthSession } from '@newport/domain';
import { PrismaService } from '../common/prisma.service.js';
import { PermissionService } from './permission.service.js';
import { CONFIG } from '../config.js';

const sha = (v: string) => createHash('sha256').update(v).digest('hex');

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly permissions: PermissionService,
  ) {}

  /**
   * تسجيل دخول لسطح المكتب والهاتف معًا.
   * يرفض بعد CONFIG.maxLoginAttempts، ويُرجع syncCursor الحالي ليعرف العميل من أين يبدأ السحب.
   */
  async login(input: { username: string; password: string; deviceId: string; platform: 'WIN' | 'ANDROID' | 'IOS' | 'WEB'; ip?: string; userAgent?: string }): Promise<AuthSession> {
    const user = await this.prisma.user.findFirst({
      where: { username: input.username.trim(), deletedAt: null },
      include: { subDept: { include: { department: true } }, position: true },
    });

    if (!user) {
      // لا نفرّق بين مستخدم غير موجود وكلمة مرور خاطئة (منع التعداد)
      await bcrypt.compare(input.password, '$2a$08$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva');
      throw new UnauthorizedException({ statusCode: 401, messageAr: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException({
        statusCode: 423,
        messageAr: `الحساب مقفل مؤقتًا حتى ${user.lockedUntil.toISOString()} — تواصل مع شعبة البصمة/النظام`,
      });
    }
    if (user.jobStatus !== 'ACTIVE' && user.jobStatus !== 'CONTRACTOR') {
      throw new UnauthorizedException({ statusCode: 403, messageAr: 'الحساب غير فعّال' });
    }
    // mustChangePwd لا يمنع إصدار الجلسة: الحارس يقيّد المسارات حتى التغيير (وإلا ما قدر مستخدم مزروع يغيّر كلمته)

    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) {
      const attempts = user.failedAttempts + 1;
      const lock = attempts >= CONFIG.maxLoginAttempts;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedAttempts: lock ? 0 : attempts,
          lockedUntil: lock ? new Date(Date.now() + CONFIG.lockoutMinutes * 60_000) : null,
        },
      });
      await this.prisma
        .audit(this.prisma, { facilityId: user.facilityId, actorId: user.id, action: 'LOGIN', entityType: 'auth', entityId: user.id, meta: { ok: false, attempts, lock } })
        .catch(() => undefined);
      throw new UnauthorizedException({
        statusCode: 401,
        messageAr: lock ? `تم قفل الحساب ${CONFIG.lockoutMinutes} دقيقة بعد ${CONFIG.maxLoginAttempts} محاولات خاطئة` : 'اسم المستخدم أو كلمة المرور غير صحيحة',
      });
    }

    // force: يجب أن يرى الكاش نفس users.version الذي سيُوقَّع في الرمز (وإلا أول طلب بعد الدخول = 401)
    const profile = await this.permissions.load(user.id, { force: true });
    if (!profile) throw new UnauthorizedException({ statusCode: 403, messageAr: 'لا توجد صلاحيات فعّالة لهذا المستخدم' });

    const familyId = randomUUID();
    const [accessToken, refreshToken] = await Promise.all([
      this.signAccess(user.id, user.version, input.deviceId),
      this.issueRefreshToken(user.id, familyId, input.deviceId, input.ip, input.userAgent),
    ]);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date(), failedAttempts: 0, lockedUntil: null },
      }),
      this.prisma.device.upsert({
        where: { externalId: input.deviceId },
        create: { externalId: input.deviceId, userId: user.id, platform: input.platform, deviceName: input.platform },
        update: { userId: user.id, platform: input.platform, lastSeenAt: new Date() },
      }),
    ]);
    await this.prisma
      .audit(this.prisma, {
        facilityId: user.facilityId,
        actorId: user.id,
        actorName: user.fullNameAr,
        action: 'LOGIN',
        entityType: 'auth',
        entityId: user.id,
        meta: { deviceId: input.deviceId, platform: input.platform, roles: profile.roles },
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      })
      .catch(() => undefined);

    return {
      accessToken,
      refreshToken,
      expiresInSec: CONFIG.jwtAccessTtlSec,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullNameAr,
        positionId: user.positionId,
        departmentId: user.departmentId,
        departmentCode: user.subDept.department.code,
        subDepartmentId: user.subDeptId,
        subDepartmentCode: user.subDept.code,
        subDepartmentNameAr: user.subDept.nameAr,
        shiftId: user.shiftId,
        language: (user.language as 'ar' | 'en' | 'ku') ?? 'ar',
      },
      roles: profile.roles,
      permissions: profile.permissions.map((p) => ({ code: p.code, scope: p.scope })),
      syncCursor: Number(user.syncCursor ?? 0n),
      mustChangePwd: Boolean(user.mustChangePwd),
    };
  }

  private async signAccess(userId: string, version: number, deviceId: string) {
    return this.jwt.signAsync(
      { sub: userId, v: version, dev: deviceId, perms: undefined },
      { secret: CONFIG.jwtSecret, expiresIn: CONFIG.jwtAccessTtlSec },
    );
  }

  private async issueRefreshToken(userId: string, familyId: string, deviceId?: string, ip?: string, userAgent?: string) {
    const token = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId,
        deviceId: deviceId ?? null,
        ip: ip ?? null,
        userAgent: userAgent?.slice(0, 250) ?? null,
        tokenHash: sha(token),
        expiresAt: new Date(Date.now() + CONFIG.refreshTtlDays * 86_400_000),
      },
    });
    return token;
  }

  /** تدوير رمز التحديث: استخدام الرمز المصدَر = سرقة محتملة → إلغاء العائلة كاملة */
  async refresh(refreshToken: string, deviceId: string, ip?: string, userAgent?: string): Promise<AuthSession> {
    const hash = sha(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hash }, include: { user: { include: { subDept: { include: { department: true } } } } } });
    if (!stored) throw new UnauthorizedException({ statusCode: 401, messageAr: 'رمز غير صالح' });
    if (stored.revokedAt || stored.expiresAt < new Date()) {
      await this.prisma.refreshToken.updateMany({ where: { familyId: stored.familyId }, data: { revokedAt: new Date() } });
      this.logger.warn(`reuse of rotated refresh token detected for user ${stored.userId} — family revoked`);
      throw new UnauthorizedException({ statusCode: 401, messageAr: 'انتهت الجلسة، سجّل الدخول من جديد' });
    }

    const user = stored.user;
    await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    const accessToken = await this.signAccess(user.id, user.version, deviceId);
    const newRefresh = await this.issueRefreshToken(user.id, stored.familyId, deviceId, ip, userAgent);
    const profile = await this.permissions.load(user.id, { force: true }); // راجع تعليق login: الكاش يجب أن يطابق إصدار الرمز

    return {
      accessToken,
      refreshToken: newRefresh,
      expiresInSec: CONFIG.jwtAccessTtlSec,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullNameAr,
        positionId: user.positionId,
        departmentId: user.departmentId,
        departmentCode: user.subDept.department.code,
        subDepartmentId: user.subDeptId,
        subDepartmentCode: user.subDept.code,
        subDepartmentNameAr: user.subDept.nameAr,
        shiftId: user.shiftId,
        language: (user.language as 'ar' | 'en' | 'ku') ?? 'ar',
      },
      roles: profile?.roles ?? [],
      permissions: profile?.permissions.map((p) => ({ code: p.code, scope: p.scope })) ?? [],
      syncCursor: Number(user.syncCursor ?? 0n),
      mustChangePwd: Boolean(user.mustChangePwd),
    };
  }

  async logout(refreshToken: string, ip?: string): Promise<{ ok: true }> {
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha(refreshToken) } });
    if (stored) {
      await this.prisma.refreshToken.updateMany({ where: { id: stored.id }, data: { revokedAt: new Date() } });
      await this.prisma
        .audit(this.prisma, { actorId: stored.userId, action: 'LOGOUT', entityType: 'auth', entityId: stored.userId, meta: { ip } })
        .catch(() => undefined);
    }
    return { ok: true };
  }

  /** تغيير كلمة المرور من داخل التطبيق (يُبطل كل الجلسات عدا الحالية) */
  async changePassword(userId: string, current: string, next: string, keepDeviceId?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('user not found');
    if (!(await bcrypt.compare(current, user.passwordHash))) throw new UnauthorizedException({ statusCode: 401, messageAr: 'كلمة المرور الحالية غير صحيحة' });
    if (next.length < 10) throw new BadRequestException({ statusCode: 400, messageAr: 'كلمة المرور الجديدة قصيرة (10 أحرف على الأقل)' });
    const hash = await bcrypt.hash(next, CONFIG.bcryptRounds);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash: hash, mustChangePwd: false, version: { increment: 1 } } }),
      this.prisma.refreshToken.updateMany({ where: { userId, ...(keepDeviceId ? { deviceId: { not: keepDeviceId } } : {}) }, data: { revokedAt: new Date() } }),
    ]);
    // يجب إسقاط الكاش فورًا: version ارتفع و mustChangePwd انطفأ، والكاش القديم سيمنع المستخدم 30 ثانية
    this.permissions.invalidate(userId);
    return { ok: true as const, mustChangePwd: false };
  }

  static hashPassword = (plain: string) => bcrypt.hash(plain, CONFIG.bcryptRounds);

  /** كتالوج الصلاحيات — تستعمله شاشة "مصفوفة الصلاحيات" في تطبيق سطح المكتب */
  catalog() {
    return {
      permissions: PERMISSION_DEFS.map((p) => ({ code: p.code, nameAr: p.nameAr, module: p.module, action: p.action, maxScope: p.maxScope, offline: !!p.offlineCapable })),
      syncBatchLimit: CONFIG.sync.maxOpsPerPush,
    };
  }
}

export type { PermissionCode };
export { Prisma };
