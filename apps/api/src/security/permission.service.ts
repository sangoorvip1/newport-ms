import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service.js';
import type { PermissionCode } from '@newport/domain';

export interface EffectivePermission {
  code: PermissionCode;
  /** أوسع نطاق ممنوح لهذه الصلاحية تحديدًا */
  scope: 'NONE' | 'SELF' | 'TEAM' | 'SUBDEPT' | 'DEPT' | 'ALL';
  departmentId?: string;
  subDeptId?: string;
}

export interface AccessProfile {
  userId: string;
  facilityId: string;
  departmentId: string;
  subDeptId: string;
  version: number;
  roles: string[];
  permissions: EffectivePermission[];
  /** يملك صلاحية ALL على مستوى المنشأة (مدير نظام/مدير معمل/مالي/موارد بشرية) */
  isFacilityWide: boolean;
  /** كلمة المرور الافتراضية لم تُغيَّر بعد — تُقيّد الجلسة على مسارات الحساب فقط */
  mustChangePwd: boolean;
}

const SCOPE_RANK: Record<EffectivePermission['scope'], number> = { NONE: 0, SELF: 0, TEAM: 0, SUBDEPT: 1, DEPT: 2, ALL: 3 };

/**
 * يحسب الصلاحيات الفعلية للمستخدم: (منح دور على مستوى شعبة) ∪ (منح عام على مستوى المنشأة/القسم).
 * مصدر الصلاحيات في قاعدة البيانات (roles/permissions/role_subdept_grants) وهي مُزروعة من
 * @newport/domain، لذا يمكن للواجهة الإدارية تعديلها دون نشر نسخة جديدة من الكود.
 */
@Injectable()
export class PermissionService {
  private readonly logger = new Logger(PermissionService.name);
  private readonly cache = new Map<string, { at: number; profile: AccessProfile }>();
  private static readonly TTL_MS = 30_000;

  constructor(private readonly prisma: PrismaService) {}

  invalidate(userId?: string) {
    if (userId) this.cache.delete(userId);
    else this.cache.clear();
  }

  /**
   * force=true: القراءة من القاعدة وتحديث الكاش. تُستعمل عند إصدار رمز (login/refresh):
   * الرمز يُوقَّع بـ users.version المقروء الآن، فلو تُرك الكاش قديمًا (TTL 30ث) رفض
   * AccessGuard أول طلب بعدها بـ «permission set changed — re-authenticate».
   */
  async load(userId: string, opts?: { force?: boolean }): Promise<AccessProfile | null> {
    const hit = opts?.force ? undefined : this.cache.get(userId);
    if (hit && Date.now() - hit.at < PermissionService.TTL_MS) return hit.profile;

    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: { include: { permission: true } },
                subDeptGrants: { include: { role: true } },
              },
            },
          },
        },
      },
    });
    if (!user) return null;

    const byCode = new Map<string, EffectivePermission>();
    const roles: string[] = [];

    for (const grant of user.roles) {
      if (grant.expiresAt && grant.expiresAt < new Date()) continue;
      roles.push(grant.role.code);
      for (const rp of grant.role.permissions) {
        const code = rp.permission.code as PermissionCode;
        const scope = grant.scopeKind as EffectivePermission['scope'];
        this.upsert(byCode, code, scope, grant.scopeDepartmentId ?? undefined, grant.scopeSubDeptId ?? undefined, user);
      }
      // منح الشعبة: نفس الدور لكن بصلاحيات الشعبة (extra/deny)
      for (const sdg of grant.role.subDeptGrants) {
        if (sdg.subDeptId !== user.subDeptId) continue;
        const deny = new Set<string>(asArray(sdg.denyJson));
        const extra = new Set<string>(asArray(sdg.extraJson));
        for (const code of extra) this.upsert(byCode, code as PermissionCode, sdg.scopeKind as EffectivePermission['scope'], user.departmentId, sdg.subDeptId, user);
        for (const rp of grant.role.permissions) {
          if (deny.has(rp.permission.code)) byCode.delete(rp.permission.code);
        }
      }
    }

    // منح افتراضي من مصفوفة الشعب (إن لم يكن للمستخدم دور صريح عليها) — role_subdept_grants
    if (byCode.size === 0) {
      const rows = await this.prisma.roleSubDeptGrant.findMany({
        where: { subDeptId: user.subDeptId, isDefault: true, role: { users: { some: { userId: user.id } } } },
        include: { role: { include: { permissions: { include: { permission: true } } } } },
      });
      for (const r of rows)
        for (const rp of r.role.permissions)
          this.upsert(byCode, rp.permission.code as PermissionCode, r.scopeKind as EffectivePermission['scope'], user.departmentId, r.subDeptId, user);
    }

    // صلاحيات الموظفين الذاتيين (SELF) لكل مستخدم مُصادَق عليه
    const self = await this.prisma.permission.findMany({ where: { code: { in: SELF_SERVICE } } });
    for (const p of self) this.upsert(byCode, p.code as PermissionCode, 'SELF', user.departmentId, user.subDeptId, user);

    const permissions = [...byCode.values()];
    const profile: AccessProfile = {
      userId: user.id,
      facilityId: user.facilityId,
      departmentId: user.departmentId,
      subDeptId: user.subDeptId,
      version: user.version,
      roles,
      permissions,
      isFacilityWide: permissions.some((p) => p.scope === 'ALL'),
      mustChangePwd: Boolean(user.mustChangePwd),
    };
    this.cache.set(userId, { at: Date.now(), profile });
    return profile;
  }

  private upsert(
    map: Map<string, EffectivePermission>,
    code: PermissionCode,
    scope: EffectivePermission['scope'],
    departmentId: string | undefined,
    subDeptId: string | undefined,
    user: { departmentId: string; subDeptId: string },
  ) {
    const cur = map.get(code);
    if (!cur || SCOPE_RANK[scope] > SCOPE_RANK[cur.scope]) {
      map.set(code, { code, scope, departmentId: departmentId ?? user.departmentId, subDeptId: subDeptId ?? user.subDeptId });
    }
  }

  /** شرط WHERE ينفّذ نطاق الصلاحية على مستوى قاعدة البيانات */
  buildScopeFilter(profile: AccessProfile, permission: EffectivePermission | undefined, opts: { deptField?: string; subDeptField?: string; creatorField?: string } = {}): Prisma.Sql {
    const dept = opts.deptField ?? 'departmentId';
    const sub = opts.subDeptField ?? 'subDeptId';
    const creator = opts.creatorField ?? 'createdById';
    if (!permission || permission.scope === 'ALL') return Prisma.sql`true`;
    switch (permission.scope) {
      case 'DEPT':
        return Prisma.sql`${Prisma.raw(dept)} = ${profile.departmentId}::uuid`;
      case 'SUBDEPT':
        return Prisma.sql`${Prisma.raw(sub)} = ${profile.subDeptId}::uuid OR ${Prisma.raw(creator)} = ${profile.userId}::uuid`;
      case 'TEAM':
      case 'SELF':
        return Prisma.sql`${Prisma.raw(creator)} = ${profile.userId}::uuid`;
      default:
        return Prisma.sql`false`;
    }
  }

  /** فلتر Prisma (object) بدلاً من SQL خام، للاستخدام مع findMany العادي */
  buildScopeWhere(profile: AccessProfile, permission: EffectivePermission | undefined): Prisma.WorkOrderWhereInput {
    if (!permission) return { id: '00000000-0000-0000-0000-000000000000' };
    if (permission.scope === 'ALL') return {};
    if (permission.scope === 'DEPT') return { departmentId: profile.departmentId };
    if (permission.scope === 'SUBDEPT') return { OR: [{ subDeptId: profile.subDeptId }, { createdById: profile.userId }] };
    return { createdById: profile.userId };
  }

  async has(userId: string, code: PermissionCode): Promise<boolean> {
    const p = await this.load(userId);
    return !!p?.permissions.some((x) => x.code === code);
  }
}

const SELF_SERVICE = ['hr.leave.view', 'hr.leave.request', 'hr.form.create', 'hr.att.view', 'hr.shift.view', 'hr.form.view', 'doc.upload'];

function asArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }
  return [];
}
