import {
  CanActivate, Logger,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { DataScope, PermissionCode } from '@newport/domain';
import { PermissionService, type AccessProfile, type EffectivePermission } from './permission.service.js';
import { PrismaService } from '../common/prisma.service.js';
import { CONFIG } from '../config.js';

export const PERMISSION_KEY = 'newport:permission';

/**
 * مسارات مسموح بها أثناء الجلسة المقيدة (mustChangePwd = true).
 * بدون هذا الاستثناء لا يستطيع مستخدم مزروع أن يسجّل الدخول أصلًا (dead-lock في أول تشغيل).
 */
export const PASSWORD_BOOTSTRAP_PATHS = [
  '/api/v1/auth/change-password',
  '/api/v1/auth/me',
  '/api/v1/auth/logout',
  '/api/v1/auth/health',
  '/api/health',
];
export const SCOPES_KEY = 'newport:scopes';
export const ANON_KEY = 'newport:anon';

/** يطلب صلاحية واحدة أو أكثر (أيٌّ منها يكفي) + نطاقات مقبولة */
export const RequirePermission = (codes: PermissionCode[], opts: { scopes?: DataScope[]; anyOf?: boolean } = {}) => {
  const set = SetMetadata(PERMISSION_KEY, { codes, scopes: opts.scopes ?? null, anyOf: opts.anyOf ?? true });
  return (target: object, key?: string | symbol, descriptor?: PropertyDescriptor) => {
    if (key && descriptor) return set(target, key, descriptor) as void;
    return set(target as never);
  };
};
export const AllowAnonymous = () => SetMetadata(ANON_KEY, true);

export interface AccessContext {
  userId: string;
  deviceId?: string;
  ip?: string;
  userAgent?: string;
  profile: AccessProfile;
  /** الصلاحيات المطلوبة ومطابقتها (يستعملها الـ service للفلترة) */
  grants: Map<PermissionCode, EffectivePermission | undefined>;
  can(code: PermissionCode): boolean;
}

export function CurrentAccess(): ParameterDecorator {
  return createParamDecorator((_data: unknown, ctx: ExecutionContext): AccessContext => {
    const req = ctx.switchToHttp().getRequest<Request & { access?: AccessContext }>();
    if (!req.access) throw new UnauthorizedException('no access context');
    return req.access;
  })();
}

export function CurrentUser(): ParameterDecorator {
  return createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<Request & { access?: AccessContext }>();
    if (!req.access) throw new UnauthorizedException('no access context');
    return req.access.userId;
  })();
}

@Injectable()
export class AccessGuard implements CanActivate {
  private readonly logger = new Logger(AccessGuard.name);
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly permissions: PermissionService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { access?: AccessContext }>();
    const anon = this.reflector.getAllAndOverride<boolean>(ANON_KEY, [context.getHandler(), context.getClass()]);

    const authHeader = req.headers.authorization ?? '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    if (!bearer) {
      if (anon) return true;
      throw new UnauthorizedException('missing bearer token');
    }

    let payload: { sub?: string; dev?: string; v?: number };
    try {
      payload = await this.jwt.verifyAsync<{ sub: string; dev?: string; v?: number }>(bearer, { secret: CONFIG.jwtSecret });
    } catch {
      throw new UnauthorizedException('invalid or expired token');
    }
    if (!payload.sub) throw new UnauthorizedException('malformed token');

    const profile = await this.permissions.load(payload.sub);
    if (!profile) throw new UnauthorizedException('user no longer active');

    // إبطال فوري عند تغيّر منح الصلاحيات (نفس فكرة token version)
    if (typeof payload.v === 'number' && payload.v !== profile.version) {
      this.logger.warn(`رمز قديم مقابل إصدار صلاحيات ${profile.version}: الجلسة تحتاج إعادة دخول (user=${payload.sub}, token v=${payload.v})`);
      throw new UnauthorizedException('permission set changed — re-authenticate');
    }

    // مقيدة: كلمة المرور الافتراضية لم تُغيَّر — نسمح بتغييرها وقراءة الهوية فقط
    if (profile.mustChangePwd) {
      const path = (req.originalUrl ?? req.url).split('?')[0];
      if (!PASSWORD_BOOTSTRAP_PATHS.some((allow) => path.startsWith(allow))) {
        throw new ForbiddenException({
          statusCode: 403,
          messageAr: 'غيّر كلمة المرور الافتراضية أولًا — النظام يقبل مسارات الحساب فقط حتى يتم ذلك',
          changePasswordRequired: true,
        });
      }
    }

    const required = this.reflector.getAllAndOverride<{ codes: PermissionCode[]; scopes: DataScope[] | null; anyOf: boolean }>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    const grants = new Map<PermissionCode, EffectivePermission | undefined>();
    const byCode = new Map(profile.permissions.map((p) => [p.code, p] as const));
    if (required?.codes?.length) {
      for (const code of required.codes) grants.set(code, byCode.get(code));
      const matched = required.anyOf
        ? required.codes.some((c) => byCode.has(c) && (!required.scopes || required.scopes.includes(byCode.get(c)!.scope as DataScope)))
        : required.codes.every((c) => byCode.has(c));
      if (!matched) {
        await this.prisma
          .audit(this.prisma, {
            facilityId: profile.facilityId,
            actorId: profile.userId,
            actorName: null,
            action: 'DENIED',
            entityType: 'access',
            meta: { codes: required.codes, path: req.url, method: req.method },
            ip: (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? null,
            userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
          })
          .catch(() => undefined); // لا نُفشل الطلب بسبب تعذّر التسجيل (قد يكون المخطط غير مهاجر بعد)
        throw new ForbiddenException({
          statusCode: 403,
          messageAr: 'لا تملك صلاحية لهذا الإجراء ضمن نطاق عملك',
          required: required.codes,
          yourGrants: profile.permissions.map((p) => `${p.code}:${p.scope}`),
        });
      }
    }

    req.access = {
      userId: profile.userId,
      deviceId: payload.dev,
      ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.socket?.remoteAddress ?? undefined,
      userAgent: req.headers['user-agent'] ?? undefined,
      profile,
      grants,
      can: (code: PermissionCode) => byCode.has(code),
    };
    return true;
  }
}
