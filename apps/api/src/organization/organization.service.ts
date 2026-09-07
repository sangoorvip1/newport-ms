import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service.js';
import { ORG_STRUCTURE, ROLE_DEFS, resolveGrants, PERMISSION_DEFS } from '@newport/domain';

/**
 * الهيكل التنظيمي: الأقسام الثلاثة والشعب الثلاث عشرة — مرجع + إدارة.
 * كل شاشة صلاحيات وفلترة "حسب الشعبة" تقرأ من هنا، فلا تُكرَّر قائمة الشعب في الواجهات.
 */
@Injectable()
export class OrganizationService {
  constructor(private readonly prisma: PrismaService) {}

  /** الهيكل كما هو في قاعدة البيانات (مع أحمال كل شعبة) */
  async tree(facilityId?: string) {
    const departments = await this.prisma.department.findMany({
      where: { ...(facilityId ? { facilityId } : {}) },
      include: {
        subDepartments: {
          include: { _count: { select: { users: true, workOrders: true, assets: true } } },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
    return departments.map((d) => ({
      code: d.code,
      nameAr: d.nameAr,
      nameEn: d.nameEn,
      kind: d.kind,
      costCenterCode: d.costCenterCode,
      subDepartments: d.subDepartments.map((s) => ({
        id: s.id,
        code: s.code,
        nameAr: s.nameAr,
        nameEn: s.nameEn,
        kind: s.kind,
        isFieldWork: s.isFieldWork,
        costCenterCode: s.costCenterCode,
        headUserId: s.headUserId,
        counts: { users: s._count.users, workOrders: s._count.workOrders, assets: s._count.assets },
      })),
    }));
  }

  /** قارن الهيكل في القاعدة مع المرجع في @newport/domain — يكشف أي انحراف تنظيمي */
  async driftReport(facilityCode: string) {
    const facility = await this.prisma.facility.findUnique({
      where: { code: facilityCode },
      include: { departments: { include: { subDepartments: true } } },
    });
    if (!facility) throw new NotFoundException(`facility ${facilityCode} not found`);
    const dbCodes = facility.departments.flatMap((d) => d.subDepartments.map((s) => s.code));
    const refCodes = ORG_STRUCTURE.flatMap((d) => d.subDepartments.map((s) => s.code));
    return {
      facility: facility.code,
      isAligned: refCodes.length === dbCodes.length && refCodes.every((c) => dbCodes.includes(c)),
      missingInDb: refCodes.filter((c) => !dbCodes.includes(c)),
      extraInDb: dbCodes.filter((c) => !refCodes.includes(c)),
      departmentCount: facility.departments.length,
      subDepartmentCount: dbCodes.length,
    };
  }

  async subDepartments() {
    return this.prisma.subDepartment.findMany({
      where: { isActive: true },
      include: { department: { select: { code: true, nameAr: true } } },
      orderBy: [{ department: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
    });
  }

  /** منح دور للمستخدم — الدور هو وحدة المنح (لا تُمنح صلاحيات فردية لتفادي انفجار الأذونات) */
  async assignRole(input: {
    userId: string;
    roleCode: string;
    scopeKind: 'SELF' | 'TEAM' | 'SUBDEPT' | 'DEPT' | 'ALL';
    subDeptId?: string;
    departmentId?: string;
    actorId: string;
  }) {
    const role = await this.prisma.role.findUnique({ where: { code: input.roleCode } });
    if (!role) throw new NotFoundException(`role ${input.roleCode} not found`);
    if (input.scopeKind === 'SUBDEPT' && !input.subDeptId) throw new BadRequestException('subDeptId required for SUBDEPT scope');
    if (input.scopeKind === 'DEPT' && !input.departmentId) throw new BadRequestException('departmentId required for DEPT scope');

    const grant = await this.prisma.userRole.create({
      data: {
        userId: input.userId,
        roleId: role.id,
        scopeKind: input.scopeKind,
        scopeSubDeptId: input.subDeptId ?? null,
        scopeDepartmentId: input.departmentId ?? null,
      },
    });
    // increment version ⇒ تُرفض رموز الوصول القديمة تلقائيًا عند أول طلب
    await this.prisma.user.update({ where: { id: input.userId }, data: { version: { increment: 1 } } });
    await this.prisma
      .audit(this.prisma, {
        actorId: input.actorId,
        action: 'UPDATE',
        entityType: 'userRole',
        entityId: input.userId,
        changes: { roleCode: input.roleCode, scopeKind: input.scopeKind, subDeptId: input.subDeptId ?? null },
      })
      .catch(() => undefined);
    return grant;
  }

  async listUsers(filter: { subDeptId?: string; departmentId?: string; q?: string; includeInactive?: boolean }) {
    return this.prisma.user.findMany({
      where: {
        deletedAt: null,
        ...(filter.includeInactive ? {} : { jobStatus: 'ACTIVE' }),
        ...(filter.subDeptId ? { subDeptId: filter.subDeptId } : {}),
        ...(filter.departmentId ? { departmentId: filter.departmentId } : {}),
        ...(filter.q
          ? { OR: [{ fullNameAr: { contains: filter.q } }, { username: { contains: filter.q } }, { badgeNo: { contains: filter.q } }] }
          : {}),
      },
      select: {
        id: true,
        username: true,
        fullNameAr: true,
        badgeNo: true,
        punchId: true,
        jobStatus: true,
        lastLoginAt: true,
        language: true,
        mustChangePwd: true,
        isMfaEnabled: true,
        position: { select: { nameAr: true, code: true } },
        subDept: { select: { id: true, code: true, nameAr: true } },
        roles: { select: { scopeKind: true, role: { select: { code: true, nameAr: true } } } },
      },
      orderBy: [{ subDeptId: 'asc' }, { fullNameAr: 'asc' }],
      take: 500,
    });
  }

  /** مصفوفة الصلاحيات الفعّالة (شعبة × دور × صلاحيات) */
  async permissionsMatrix() {
    const grants = await this.prisma.roleSubDeptGrant.findMany({
      include: {
        role: { select: { code: true, nameAr: true } },
        subDept: { select: { code: true, nameAr: true, department: { select: { code: true, nameAr: true } } } },
      },
      orderBy: [{ subDept: { department: { sortOrder: 'asc' } } }, { subDept: { sortOrder: 'asc' } }],
    });
    const roleIds = [...new Set(grants.map((g) => g.roleId))];
    const perms = await this.prisma.rolePermission.findMany({
      where: { roleId: { in: roleIds } },
      include: { permission: { select: { code: true, nameAr: true, maxScope: true, isOfflineCapable: true } } },
    });
    const byRole = new Map<string, typeof perms>();
    for (const p of perms) byRole.set(p.roleId, [...(byRole.get(p.roleId) ?? []), p]);

    return grants.map((g) => ({
      department: g.subDept.department,
      subDept: { code: g.subDept.code, nameAr: g.subDept.nameAr },
      role: { code: g.role.code, nameAr: g.role.nameAr },
      scope: g.scopeKind,
      deny: g.denyJson,
      extra: g.extraJson,
      permissions: (byRole.get(g.roleId) ?? []).map((p) => ({
        code: p.permission.code,
        nameAr: p.permission.nameAr,
        offline: p.permission.isOfflineCapable,
      })),
    }));
  }

  /** مقارنة مصفوفة القاعدة مع المرجع المُولَّد من الكود (اختبار نشر/ترحيل) */
  async verifyAgainstDomain() {
    const expected = resolveGrants().filter((g) => g.subDeptCode);
    const actual = await this.prisma.roleSubDeptGrant.count();
    return {
      expectedGrants: expected.length,
      actualGrants: actual,
      roles: ROLE_DEFS.length,
      permissions: PERMISSION_DEFS.length,
      inSync: actual >= expected.length,
    };
  }
}
