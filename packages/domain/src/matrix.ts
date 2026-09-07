/**
 * حساب منح الصلاحيات النهائية لكل (شعبة × دور) وتوليد:
 *  - docs/permissions.matrix.json  (تُستهلك من seed قاعدة البيانات)
 *  - docs/03-features-permissions.md الجزء الآلي من مصفوفة الصلاحيات
 *
 * التشغيل: npm run matrix -w @newport/domain
 */
import { PERMISSION_DEFS, type PermissionCode } from './permissions.js';
import { ACCESS_MATRIX, GLOBAL_GRANTS, ROLE_DEFS, resolveGrants, type Grant, type RoleCode } from './roles.js';
import { ORG_STRUCTURE } from './org.js';

export interface MatrixRow {
  departmentCode: string;
  departmentNameAr: string;
  subDeptCode: string;
  subDeptNameAr: string;
  purposeAr: string;
  grants: Array<{ role: RoleCode; roleAr: string; scope: string; permissions: PermissionCode[] }>;
}

const roleAr = new Map(ROLE_DEFS.map((r) => [r.code, r.nameAr]));

export function buildMatrix(): MatrixRow[] {
  // المصدر الوحيد للحقيقة: resolveGrants() — نفس ما يزرع القاعدة وما يتحقق منه AccessGuard.
  // أي حساب منفصل هنا يجعل الوثائق تنفصل عن قاعدة البيانات (حدث هذا فعلًا مع الحد الأدنى الميداني).
  const effective = resolveGrants();
  const rows: MatrixRow[] = [];
  for (const dept of ORG_STRUCTURE) {
    for (const sub of dept.subDepartments) {
      const acc = ACCESS_MATRIX.find((a) => a.subDeptCode === sub.code);
      if (!acc) continue;
      rows.push({
        departmentCode: dept.code,
        departmentNameAr: dept.nameAr,
        subDeptCode: sub.code,
        subDeptNameAr: sub.nameAr,
        purposeAr: acc.purposeAr,
        grants: acc.grants.map((g: Grant) => {
          const eff = effective.find((e) => e.subDeptCode === sub.code && e.role === g.role);
          if (!eff) throw new Error(`missing resolved grant for ${sub.code}/${g.role}`);
          return { role: g.role, roleAr: roleAr.get(g.role) ?? g.role, scope: eff.scope, permissions: eff.permissions };
        }),
      });
    }
  }
  return rows;
}

export function buildGlobalGrants(): Array<{ role: RoleCode; roleAr: string; scope: string; permissions: PermissionCode[] }> {
  const effective = resolveGrants().filter((g) => g.subDeptCode === null);
  return Object.entries(GLOBAL_GRANTS).map(([role, g]) => {
    const eff = effective.find((e) => e.role === role);
    if (!eff) throw new Error(`missing resolved global grant for ${role}`);
    return { role: role as RoleCode, roleAr: roleAr.get(role as RoleCode) ?? role, scope: eff.scope, permissions: eff.permissions };
  });
}

export function matrixToMarkdown(): string {
  const rows = buildMatrix();
  const allCodes = new Set<PermissionCode>();
  rows.forEach((r) => r.grants.forEach((g) => g.permissions.forEach((p) => allCodes.add(p))));
  const byModule = new Map<string, PermissionCode[]>();
  for (const c of Array.from(allCodes).sort()) {
    const m = c.split('.')[0]!;
    byModule.set(m, [...(byModule.get(m) ?? []), c]);
  }
  let md = '';
  for (const dept of ORG_STRUCTURE) {
    md += `\n### ${dept.nameAr} (${dept.nameEn})\n\n`;
    for (const sub of dept.subDepartments) {
      const row = rows.find((r) => r.subDeptCode === sub.code);
      if (!row) continue;
      md += `#### ${sub.nameAr} — \`${sub.code}\`\n\n${row.purposeAr}\n\n`;
      md += `| الدور | النطاق | الصلاحيات |\n|---|---|---|\n`;
      for (const g of row.grants) {
        const permList = [...new Set(g.permissions)]
          .sort()
          .map((p) => `\`${p}\``)
          .join(' · ');
        md += `| ${g.roleAr} (${g.role}) | ${g.scope} | ${permList} |\n`;
      }
      md += '\n';
    }
  }
  md += `\n### منح أفقية على مستوى المنشأة\n\n| الدور | النطاق | الصلاحيات |\n|---|---|---|\n`;
  for (const g of buildGlobalGrants()) {
    md += `| ${g.roleAr} (${g.role}) | ${g.scope} | ${[...new Set(g.permissions)].sort().map((p) => `\`${p}\``).join(' · ')} |\n`;
  }
  md += `\n### الصلاحيات المعرّفة غير الممنوحة (مراجعة)\n\n`;
  const granted = new Set<PermissionCode>();
  rows.forEach((r) => r.grants.forEach((g) => g.permissions.forEach((p) => granted.add(p))));
  buildGlobalGrants().forEach((g) => g.permissions.forEach((p) => granted.add(p)));
  const unused = PERMISSION_DEFS.filter((p) => !granted.has(p.code));
  md += unused.length === 0 ? 'لا توجد — كل صلاحية معرّفة ممنوحة في مكان ما.\n' : unused.map((p) => `- \`${p.code}\` — ${p.nameAr}`).join('\n');
  md += `\n\n### دليل رموز الوحدات (${byModule.size})\n\n` + Array.from(byModule.entries())
    .map(([m, codes]) => `- **${m}**: ${codes.length} صلاحية`)
    .join('\n');
  return md;
}
