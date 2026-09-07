/**
 * يولّد من مصفوفة الصلاحيات (مصدر الحقيقة في @newport/domain):
 *   docs/generated/permissions.matrix.json   → تُستهلك في seed قاعدة البيانات (roles / permissions / role_permissions)
 *   docs/generated/permissions.catalog.json  → كتالوج الصلاحيات والأدوار
 *   docs/generated/permissions.matrix.md      → الجزء الآلي من وثيقة "الوظائف والصلاحيات"
 * التشغيل: npm run matrix -w @newport/domain
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMatrix, buildGlobalGrants, matrixToMarkdown } from '../src/matrix.js';
import { PERMISSION_DEFS } from '../src/permissions.js';
import { ROLE_DEFS, SUBDEPT_BY_CODE } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const outDir = resolve(repoRoot, 'docs/generated');
mkdirSync(outDir, { recursive: true });

const rows = buildMatrix();
const globalGrants = buildGlobalGrants();

const matrixJson = {
  generatedAt: new Date().toISOString(),
  schemaVersion: 1,
  notesAr: 'ملف مُولَّد آليًا من @newport/domain — لا يُحرَّر يدويًا. أي تعديل على الصلاحيات يتم في packages/domain/src/roles.ts ثم يُعاد التوليد.',
  grants: [
    ...rows.map((r) => ({
      level: 'SUBDEPARTMENT' as const,
      departmentCode: r.departmentCode,
      subDepartmentCode: r.subDeptCode,
      subDepartmentNameAr: SUBDEPT_BY_CODE[r.subDeptCode]?.nameAr ?? r.subDeptNameAr,
      purposeAr: r.purposeAr,
      grants: r.grants,
    })),
    ...globalGrants.map((g) => ({
      level: 'FACILITY' as const,
      departmentCode: null,
      subDepartmentCode: null,
      grants: [g],
    })),
  ],
};

writeFileSync(resolve(outDir, 'permissions.matrix.json'), JSON.stringify(matrixJson, null, 2));
writeFileSync(resolve(outDir, 'permissions.catalog.json'), JSON.stringify({ permissions: PERMISSION_DEFS, roles: ROLE_DEFS }, null, 2));
writeFileSync(resolve(outDir, 'permissions.matrix.md'), matrixToMarkdown());

const total = rows.reduce((n, r) => n + r.grants.reduce((m, g) => m + g.permissions.length, 0), 0);
console.log(`✓ ${rows.length} شعبة | ${PERMISSION_DEFS.length} صلاحية معرّفة | ${ROLE_DEFS.length} دور | ${total} علاقة دور↔صلاحية`);
console.log(`✓ docs/generated/permissions.matrix.json`);
console.log(`✓ docs/generated/permissions.catalog.json`);
console.log(`✓ docs/generated/permissions.matrix.md`);
