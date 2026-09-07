import { describe, expect, it } from 'vitest';
import {
  DEFERRED_PHASE2_PERMISSIONS,
  PERMISSION_DEFS,
  PERMISSION_CODES,
  isPermissionCode,
  ORG_STRUCTURE,
  ROLE_DEFS,
  ACCESS_MATRIX,
  READ_ONLY_ROLES,
  resolveGrants,
  unknownPermissions,
  unusedPermissions,
  buildMatrix,
} from '../src/index.js';

describe('registry integrity', () => {
  it('permission codes are unique and well-formed', () => {
    expect(new Set(PERMISSION_CODES).size).toBe(PERMISSION_CODES.length);
    for (const code of PERMISSION_CODES) {
      const parts = code.split('.');
      expect(parts.length, code).toBeGreaterThanOrEqual(2);
      expect(isPermissionCode(code)).toBe(true);
    }
  });

  it('org structure matches the required organisation exactly', () => {
    expect(ORG_STRUCTURE.map((d) => d.code)).toEqual(['PROD', 'MAINT', 'ADMIN']);
    expect(ORG_STRUCTURE.flatMap((d) => d.subDepartments.map((s) => s.code))).toEqual([
      'PROD-UREA', 'PROD-AMM', 'PROD-CT', 'PROD-LAB',
      'MAINT-HEAT', 'MAINT-ROT', 'MAINT-ELEC', 'MAINT-VALVE', 'MAINT-INST', 'MAINT-GEN',
      'ADM-BIO', 'ADM-COM', 'ADM-FIN',
    ]);
    expect(ORG_STRUCTURE.flatMap((d) => d.subDepartments).length).toBe(13);
  });

  it('every sub-department in the org has an access row, and vice versa', () => {
    const orgSubdepts = new Set(ORG_STRUCTURE.flatMap((d) => d.subDepartments.map((s) => s.code)));
    const matrixSubdepts = new Set(ACCESS_MATRIX.map((a) => a.subDeptCode));
    expect([...orgSubdepts].filter((c) => !matrixSubdepts.has(c))).toEqual([]);
    expect([...matrixSubdepts].filter((c) => !orgSubdepts.has(c))).toEqual([]);
  });

  it('roles referenced by the matrix all exist', () => {
    const roles = new Set(ROLE_DEFS.map((r) => r.code));
    for (const g of resolveGrants()) expect(roles.has(g.role), g.role).toBe(true);
  });
});

describe('permission matrix consistency', () => {
  it('no unknown permission codes are granted', () => {
    expect(unknownPermissions()).toEqual([]);
  });

  it('maxScope ceiling is respected by every grant (منح أوسع من سقف الصلاحية = خطأ أمني)', () => {
    const rank: Record<string, number> = { NONE: 0, SELF: 0, TEAM: 0, SUBDEPT: 1, DEPT: 2, ALL: 3 };
    const violations: string[] = [];
    const byCode = new Map(PERMISSION_DEFS.map((p) => [p.code, p]));
    for (const g of resolveGrants()) {
      for (const p of g.permissions) {
        const def = byCode.get(p);
        if (!def) continue;
        if (g.scope === 'SELF' || def.maxScope === 'ALL') continue;
        if ((rank[g.scope] ?? 0) > (rank[def.maxScope] ?? 0)) {
          violations.push(`${g.role}@${g.subDeptCode ?? '-'}: scope ${g.scope} يتجاوز سقف ${def.maxScope} للصلاحية ${p}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('scopes are valid enum values and every grant carries at least one permission', () => {
    const valid = new Set(['SELF', 'TEAM', 'SUBDEPT', 'DEPT', 'ALL', 'NONE']);
    for (const g of resolveGrants()) {
      expect(valid.has(g.scope), `${g.role}:${g.scope}`).toBe(true);
      expect(g.permissions.length, `${g.role}:${g.subDeptCode}`).toBeGreaterThan(0);
    }
  });

  it('no dead permissions: كل صلاحية إما ممنوحة أو مؤجَّلة صراحةً للمرحلة الثانية', () => {
    const deferred = new Set(DEFERRED_PHASE2_PERMISSIONS);
    const unused = new Set(unusedPermissions());
    expect([...unused].sort()).toEqual([...deferred].sort());
  });

  it('الحد الأدنى الميداني ممنوح لكل دور يعمل من شعبة (وإلا ينهار وضع دون اتصال)', () => {
    const required: string[] = ['auth.login', 'sync.pull', 'sync.push', 'notif.view'];
    const missing: string[] = [];
    for (const g of resolveGrants()) {
      if (!g.subDeptCode || READ_ONLY_ROLES.has(g.role)) continue;
      for (const p of required) if (!g.permissions.includes(p as never)) missing.push(`${g.role}@${g.subDeptCode}: ${p}`);
    }
    expect(missing).toEqual([]);
  });

  it('أدوار القراءة فقط لا ترفع مزامنة ولا تكتب وثائق ولا تطلب إجازات', () => {
    const forbidden = ['sync.push', 'doc.upload', 'hr.leave.request', 'maint.wo.create'];
    for (const g of resolveGrants()) {
      if (!READ_ONLY_ROLES.has(g.role)) continue;
      for (const p of forbidden) expect(g.permissions, `${g.role}@${g.subDeptCode ?? '-'}`).not.toContain(p as never);
    }
  });

  it('الوثيقة المولَّدة تُشتق من نفس حساب resolveGrants (لا مصدر ثانٍ للحقيقة)', () => {
    const eff = resolveGrants();
    for (const row of buildMatrix()) {
      for (const g of row.grants) {
        const e = eff.find((x) => x.subDeptCode === row.subDeptCode && x.role === g.role);
        expect(e, `${row.subDeptCode}/${g.role}`).toBeDefined();
        expect([...g.permissions].sort(), `${row.subDeptCode}/${g.role}`).toEqual([...(e?.permissions ?? [])].sort());
      }
    }
  });

  it('matrix rows expose at least one grant each', () => {
    for (const row of buildMatrix()) expect(row.grants.length, row.subDeptCode).toBeGreaterThan(0);
  });
});
