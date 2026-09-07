/**
 * Seed المرجع التنظيمي +RBAC + بيانات تجربة.
 *  - idempotent: يمكن تشغيله مرارًا (upsert) وهو آمن على بيئة تشغيل قائمة.
 *  - يقرأ الهيكل والصلاحيات من @newport/domain (مصدر الحقيقة) فلا ينحرف عن الكود.
 *  - بيانات التجربة تُزرع فقط عند SEED_DEMO=true.
 */
import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { ORG_STRUCTURE, PERMISSION_DEFS, ROLE_DEFS, ACCESS_MATRIX, GLOBAL_GRANTS, SYNC_META, resolveGrants, FACILITY } from '@newport/domain';
import type { RoleCode } from '@newport/domain';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const DEMO = process.env.SEED_DEMO === 'true';
const ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 10);

const scopeRank = { NONE: 0, SELF: 1, TEAM: 2, SUBDEPT: 3, DEPT: 4, ALL: 5 } as const;

async function main() {
  const company = await prisma.company.upsert({
    where: { id: '00000000-0000-0000-0000-0000000000c1' },
    update: { nameAr: 'نيوبورت للخدمات الصناعية', nameEn: 'Newport LP. LTD' },
    create: {
      id: '00000000-0000-0000-0000-0000000000c1',
      nameAr: 'نيوبورت للخدمات الصناعية',
      nameEn: 'Newport LP. LTD',
      registrationNo: 'IQ-BASRA-2019-114502',
      taxNo: '5120447',
      country: 'IQ',
    },
  });

  const facility = await prisma.facility.upsert({
    where: { code: FACILITY.code },
    update: { nameAr: FACILITY.nameAr, capacityTpd: 1725 },
    create: {
      companyId: company.id,
      code: FACILITY.code,
      nameAr: FACILITY.nameAr,
      nameEn: FACILITY.nameEn,
      cityAr: 'البصرة – أم القصر / ميناء البصرة',
      timezone: 'Asia/Baghdad',
      capacityTpd: 1725, // 1,000 طن يوم (تصميمي) — مثال مرجعي
      startDate: new Date('2024-01-01T00:00:00Z'),
    },
  });

  // ── 1) الأقسام والشعب (13 شعبة) ───────────────────────────────────────────
  const subDeptIdByCode = new Map<string, string>();
  for (const [dIdx, dept] of ORG_STRUCTURE.entries()) {
    const department = await prisma.department.upsert({
      where: { facilityId_code: { facilityId: facility.id, code: dept.code } },
      update: { nameAr: dept.nameAr, nameEn: dept.nameEn, kind: dept.kind, sortOrder: dIdx },
      create: {
        facilityId: facility.id,
        code: dept.code,
        nameAr: dept.nameAr,
        nameEn: dept.nameEn,
        kind: dept.kind,
        costCenterCode: `CC-${dept.code}`,
        sortOrder: dIdx,
      },
    });
    for (const [sIdx, sd] of dept.subDepartments.entries()) {
      const sub = await prisma.subDepartment.upsert({
        where: { departmentId_code: { departmentId: department.id, code: sd.code } },
        update: { nameAr: sd.nameAr, nameEn: sd.nameEn, kind: sd.kind as never, isFieldWork: sd.fieldWork, sortOrder: sIdx },
        create: {
          departmentId: department.id,
          code: sd.code,
          nameAr: sd.nameAr,
          nameEn: sd.nameEn,
          kind: sd.kind as never,
          isFieldWork: sd.fieldWork,
          costCenterCode: `CC-${sd.code}`,
          sortOrder: sIdx,
        },
      });
      subDeptIdByCode.set(sd.code, sub.id);
      await prisma.costCenter.upsert({
        where: { code: `CC-${sd.code}` },
        update: { nameAr: `${sd.nameAr} – مركز تكلفة` },
        create: {
          code: `CC-${sd.code}`,
          nameAr: `${sd.nameAr} – مركز تكلفة`,
          subDeptId: sub.id,
          kind: dept.kind === 'TECHNICAL' ? 'MAINTENANCE' : 'ADMIN',
        },
      });
    }
  }

  // ── 2) الصلاحيات والأدوار (من سجل @newport/domain) ─────────────────────────
  for (const p of PERMISSION_DEFS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { nameAr: p.nameAr, nameEn: p.nameEn, module: p.module, action: p.action, maxScope: p.maxScope as never, isOfflineCapable: !!p.offlineCapable },
      create: { code: p.code, nameAr: p.nameAr, nameEn: p.nameEn, module: p.module, action: p.action, maxScope: p.maxScope as never, isOfflineCapable: !!p.offlineCapable },
    });
  }
  const permIdByCode = new Map((await prisma.permission.findMany({ select: { id: true, code: true } })).map((r) => [r.code, r.id] as const));

  for (const r of ROLE_DEFS) {
    await prisma.role.upsert({
      where: { code: r.code },
      update: { nameAr: r.nameAr, nameEn: r.nameEn, defaultScope: r.defaultScope as never, descriptionAr: r.descriptionAr, isSystem: true },
      create: { code: r.code, nameAr: r.nameAr, nameEn: r.nameEn, defaultScope: r.defaultScope as never, descriptionAr: r.descriptionAr, isSystem: true },
    });
  }
  const roleIdByCode = new Map((await prisma.role.findMany({ select: { id: true, code: true } })).map((r) => [r.code, r.id] as const));

  // ربط الدور بصلاحياته (يُعاد بناؤه بالكامل في كل seed لتفادي بقايا منح قديمة)
  await prisma.rolePermission.deleteMany({});
  const rolePermRows: Array<{ roleId: string; permissionId: string }> = [];
  const seen = new Set<string>();
  for (const g of resolveGrants()) {
    const roleId = roleIdByCode.get(g.role);
    if (!roleId) continue;
    for (const code of g.permissions) {
      const permissionId = permIdByCode.get(code);
      if (!permissionId) throw new Error(`permission missing in DB: ${code}`);
      const key = `${roleId}|${permissionId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rolePermRows.push({ roleId, permissionId });
    }
  }
  await prisma.rolePermission.createMany({ data: rolePermRows, skipDuplicates: true });

  // مصفوفة (شعبة × دور) — تشمل extra/deny للمرونة مستقبلاً
  await prisma.roleSubDeptGrant.deleteMany({});
  for (const row of ACCESS_MATRIX) {
    const subDeptId = subDeptIdByCode.get(row.subDeptCode);
    if (!subDeptId) throw new Error(`sub-dept missing: ${row.subDeptCode}`);
    for (const grant of row.grants) {
      const roleId = roleIdByCode.get(grant.role);
      if (!roleId) continue;
      await prisma.roleSubDeptGrant.upsert({
        where: { subDeptId_roleId: { subDeptId, roleId } },
        update: { scopeKind: (grant.scope ?? 'SUBDEPT') as never, isDefault: true },
        create: {
          subDeptId,
          roleId,
          scopeKind: (grant.scope ?? 'SUBDEPT') as never,
          isDefault: true,
          // أعمدة jsonb في Prisma تقبل أي قيمة JSON؛ نحافظ على المصفوفة كما هي (قابلة للعرض في UI الصلاحيات)
          denyJson: grant.deny ? (grant.deny as unknown as object) : undefined,
          extraJson: grant.extra ? (grant.extra as unknown as object) : undefined,
        },
      });
    }
  }

  // ── 3) الورديات ────────────────────────────────────────────────────────────
  const shifts = [
    { code: 'A', nameAr: 'الوردية الصباحية 08:00–20:00', startLocal: '08:00', endLocal: '20:00', isOvernight: false },
    { code: 'B', nameAr: 'الوردية الليلية 20:00–08:00', startLocal: '20:00', endLocal: '08:00', isOvernight: true, nightDiffPct: 15 },
    { code: 'C', nameAr: 'دعم نهاري 08:00–16:00', startLocal: '08:00', endLocal: '16:00', isOvernight: false },
    { code: 'D', nameAr: 'دوام إداري 09:00–17:00', startLocal: '09:00', endLocal: '17:00', isOvernight: false },
  ];
  const shiftIdByCode = new Map<string, string>();
  for (const s of shifts) {
    const row = await prisma.shiftPattern.upsert({
      where: { code: s.code },
      update: { nameAr: s.nameAr, startLocal: s.startLocal, endLocal: s.endLocal, isOvernight: s.isOvernight },
      create: s as never,
    });
    shiftIdByCode.set(s.code, row.id);
  }

  // ── 4) وحدات الإنتاج ──────────────────────────────────────────────────────
  const units = [
    { code: 'AMMONIA', nameAr: 'وحدة الأمونيا', sub: 'PROD-AMM' },
    { code: 'UREA', nameAr: 'وحدة اليوريا', sub: 'PROD-UREA' },
    { code: 'COOLING_TOWER', nameAr: 'أبراج التبريد', sub: 'PROD-CT' },
    { code: 'UTILITY', nameAr: 'المرافق العامة', sub: 'PROD-CT' },
    { code: 'LAB', nameAr: 'المختبر', sub: 'PROD-LAB' },
  ];
  for (const u of units) {
    await prisma.productionUnit.upsert({
      where: { code: u.code },
      update: { nameAr: u.nameAr },
      create: { code: u.code, nameAr: u.nameAr, subDeptId: subDeptIdByCode.get(u.sub) },
    });
  }

  // ── 5) مستخدمو النظام (واحد لكل شعبة + أدوار عليا) ────────────────────────
  const pw = await bcrypt.hash(process.env.SEED_DEFAULT_PASSWORD ?? 'Newport#2026', ROUNDS);
  const usersToCreate: Array<{ username: string; nameAr: string; sub: string; role: RoleCode; shift?: string }> = [
    { username: 'sysadmin', nameAr: 'مدير النظام', sub: 'ADM-BIO', role: 'SYS_ADMIN', shift: 'D' },
    { username: 'plant.manager', nameAr: 'مدير المعمل', sub: 'PROD-UREA', role: 'PLANT_MANAGER', shift: 'D' },
    { username: 'prod.manager', nameAr: 'رئيس قسم الإنتاج', sub: 'PROD-UREA', role: 'DEPT_MANAGER', shift: 'D' },
    { username: 'maint.manager', nameAr: 'رئيس قسم الصيانة', sub: 'MAINT-HEAT', role: 'DEPT_MANAGER', shift: 'D' },
    { username: 'urea.head', nameAr: 'رئيس شعبة اليوريا', sub: 'PROD-UREA', role: 'SECTION_HEAD', shift: 'A' },
    { username: 'ammonia.head', nameAr: 'رئيس شعبة الأمونيا', sub: 'PROD-AMM', role: 'SECTION_HEAD', shift: 'A' },
    { username: 'coolingtower.head', nameAr: 'رئيس شعبة أبراج التبريد', sub: 'PROD-CT', role: 'SECTION_HEAD', shift: 'A' },
    { username: 'lab.head', nameAr: 'رئيس المختبر', sub: 'PROD-LAB', role: 'SECTION_HEAD', shift: 'A' },
    { username: 'lab.analyst', nameAr: 'محلل مختبر', sub: 'PROD-LAB', role: 'LAB_ANALYST', shift: 'B' },
    { username: 'heat.head', nameAr: 'رئيس شعبة المعدات الحرارية', sub: 'MAINT-HEAT', role: 'SECTION_HEAD', shift: 'D' },
    { username: 'heat.tech', nameAr: 'فني معدات حرارية', sub: 'MAINT-HEAT', role: 'FIELD_TECHNICIAN', shift: 'A' },
    { username: 'rot.head', nameAr: 'رئيس شعبة المعدات الدوارة', sub: 'MAINT-ROT', role: 'SECTION_HEAD', shift: 'D' },
    { username: 'rot.tech', nameAr: 'فني معدات دوارة', sub: 'MAINT-ROT', role: 'FIELD_TECHNICIAN', shift: 'B' },
    { username: 'elec.head', nameAr: 'رئيس شعبة الكهرباء', sub: 'MAINT-ELEC', role: 'SECTION_HEAD', shift: 'D' },
    { username: 'valve.head', nameAr: 'رئيس شعبة الصمامات', sub: 'MAINT-VALVE', role: 'SECTION_HEAD', shift: 'D' },
    { username: 'inst.head', nameAr: 'رئيس شعبة الآلات الدقيقة', sub: 'MAINT-INST', role: 'SECTION_HEAD', shift: 'D' },
    { username: 'gen.head', nameAr: 'رئيس شعبة المعدات العامة', sub: 'MAINT-GEN', role: 'SECTION_HEAD', shift: 'D' },
    { username: 'planner', nameAr: 'مخطط الصيانة', sub: 'MAINT-HEAT', role: 'PLANNER', shift: 'D' },
    { username: 'biometric', nameAr: 'موظف البصمة', sub: 'ADM-BIO', role: 'HR_OFFICER', shift: 'D' },
    { username: 'commercial.head', nameAr: 'رئيس الشعبة التجارية', sub: 'ADM-COM', role: 'SECTION_HEAD', shift: 'D' },
    { username: 'finance.head', nameAr: 'المدير المالي', sub: 'ADM-FIN', role: 'FINANCE_MANAGER', shift: 'D' },
    { username: 'store.keeper', nameAr: 'أمين المخزن', sub: 'MAINT-GEN', role: 'STORE_KEEPER', shift: 'D' },
    { username: 'hse', nameAr: 'مسؤول السلامة', sub: 'MAINT-HEAT', role: 'HSE_OFFICER', shift: 'D' },
  ];

  for (const [i, u] of usersToCreate.entries()) {
    const subId = subDeptIdByCode.get(u.sub);
    if (!subId) throw new Error(`unknown sub-dept ${u.sub}`);
    const sub = await prisma.subDepartment.findUniqueOrThrow({ where: { id: subId }, include: { department: true } });
    const employee = await prisma.employee.upsert({
      where: { employeeNumber: `EMP-${String(i + 1).padStart(4, '0')}` },
      update: { subDeptId: subId, punchId: `P${1000 + i}` },
      create: {
        employeeNumber: `EMP-${String(i + 1).padStart(4, '0')}`,
        civilId: `251${String(100000 + i)}`,
        nationality: 'عراقي',
        hireDate: new Date('2024-02-01T00:00:00Z'),
        jobTitleAr: u.nameAr,
        contractType: 'CONTRACT',
        subDeptId: subId,
        punchId: `P${1000 + i}`,
        badgeNo: `B${2000 + i}`,
        isBiometricEnrolled: true,
        baseSalary: 900000 + i * 25000,
      },
    });

    const user = await prisma.user.upsert({
      where: { username: u.username },
      update: { passwordHash: pw, subDeptId: subId, departmentId: sub.departmentId, employeeId: employee.id, shiftId: u.shift ? shiftIdByCode.get(u.shift) : null },
      create: {
        facilityId: facility.id,
        username: u.username,
        passwordHash: pw,
        fullNameAr: u.nameAr,
        email: `${u.username}@newport-iraq.com`,
        phone: `+96477${String(1000000 + i * 7)}`,
        employeeId: employee.id,
        departmentId: sub.departmentId,
        subDeptId: subId,
        shiftId: u.shift ? shiftIdByCode.get(u.shift) : null,
        badgeNo: `B${2000 + i}`,
        punchId: `P${1000 + i}`,
        language: 'ar',
        mustChangePwd: true,
      },
    });

    const roleId = roleIdByCode.get(u.role);
    if (roleId) {
      const roleDef = ROLE_DEFS.find((r) => r.code === u.role)!;
      const scopeKind = roleDef.defaultScope === 'ALL' ? 'ALL' : roleDef.defaultScope === 'DEPT' ? 'DEPT' : 'SUBDEPT';
      const existing = await prisma.userRole.findFirst({ where: { userId: user.id, roleId } });
      if (!existing) {
        await prisma.userRole.create({
          data: {
            userId: user.id,
            roleId,
            scopeKind,
            scopeSubDeptId: scopeKind === 'SUBDEPT' ? subId : null,
            scopeDepartmentId: scopeKind !== 'ALL' ? sub.departmentId : null,
          },
        });
      }
    }
  }

  // ── 5ب) دليل المختبر: المُعامِلات ومواصفاتها السارية ─────────────────────────
  // بيانات مرجعية (لا تُعلَّم DEMO): بدونها لا يمكن حساب isOutOfSpec ولا إصدار شهادة.
  // القاعدة المطبَّقة في LabService: productCode = رمز وحدة الإنتاج، وgrade = TECHNICAL،
  // وأحدث effectiveFrom ≤ وقت جمع العينة هو النافذ (حتى لا تتغير شهادة سابقة بتعديل المواصفة).
  const labParameters: Array<{ code: string; nameAr: string; unit: string; method: string; appliesTo: string; min: number | null; max: number | null }> = [
    { code: 'UREA_N', nameAr: 'نسبة النيتروجين', unit: '%', method: 'Kjeldahl', appliesTo: 'UREA', min: 46.0, max: 46.4 },
    { code: 'UREA_BIURET', nameAr: 'البيوريت', unit: '%', method: 'Spectrophotometry', appliesTo: 'UREA', min: null, max: 1.0 },
    { code: 'UREA_MOISTURE', nameAr: 'الرطوبة', unit: '%', method: 'Karl Fischer', appliesTo: 'UREA', min: null, max: 0.5 },
    { code: 'UREA_SIZE', nameAr: 'متوسط حجم الحبيبات', unit: 'mm', method: 'Sieve', appliesTo: 'UREA', min: 2.0, max: 4.0 },
    { code: 'AMM_PURITY', nameAr: 'نقاء الأمونيا', unit: '%', method: 'Titration', appliesTo: 'AMMONIA', min: 99.5, max: null },
    { code: 'AMM_OIL', nameAr: 'محتوى الزيت', unit: 'mg/kg', method: 'Gravimetric', appliesTo: 'AMMONIA', min: null, max: 5 },
    { code: 'BFW_PH', nameAr: 'درجة حموضة ماء المرجل', unit: 'pH', method: 'Electrode', appliesTo: 'UTILITY', min: 8.8, max: 9.3 },
    { code: 'BFW_CONDUCTIVITY', nameAr: 'موصلية ماء المرجل', unit: 'µS/cm', method: 'Cell', appliesTo: 'UTILITY', min: null, max: 1.5 },
    { code: 'CW_CONDUCTIVITY', nameAr: 'موصلية ماء التبريد', unit: 'µS/cm', method: 'Cell', appliesTo: 'COOLING_TOWER', min: null, max: 2500 },
    { code: 'CW_TURBIDITY', nameAr: 'عكارة ماء التبريد', unit: 'NTU', method: 'Nephelometric', appliesTo: 'COOLING_TOWER', min: null, max: 15 },
  ];
  for (const lp of labParameters) {
    await prisma.labParameter.upsert({
      where: { code: lp.code },
      update: { nameAr: lp.nameAr, unit: lp.unit, method: lp.method, appliesTo: lp.appliesTo, specMin: lp.min, specMax: lp.max },
      create: { code: lp.code, nameAr: lp.nameAr, unit: lp.unit, method: lp.method, appliesTo: lp.appliesTo, specMin: lp.min, specMax: lp.max },
    });
    const param = await prisma.labParameter.findUnique({ where: { code: lp.code }, select: { id: true } });
    if (!param) continue;
    await prisma.labSpec.upsert({
      where: {
        parameterId_productCode_grade_effectiveFrom: {
          parameterId: param.id,
          productCode: lp.appliesTo,
          grade: 'TECHNICAL',
          effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        },
      },
      update: { minVal: lp.min, maxVal: lp.max },
      create: {
        parameterId: param.id,
        productCode: lp.appliesTo,
        grade: 'TECHNICAL',
        minVal: lp.min,
        maxVal: lp.max,
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
  }

  // ── 6) سجل sync_entity_registry (يطابق SYNC_META في الدومين) ────────────────
  const tableToEntity = new Map<string, { entity: string; merge: string; priority: number }>();
  for (const meta of Object.values(SYNC_META)) {
    tableToEntity.set(meta.table, { entity: meta.entity, merge: meta.merge, priority: meta.pushPriority });
  }
  for (const [table, info] of tableToEntity) {
    await prisma.$executeRaw`INSERT INTO sync_entity_registry (entity, table_name, merge, push_priority)
      VALUES (${info.entity}, ${table}, ${info.merge}, ${info.priority})
      ON CONFLICT (entity) DO UPDATE SET table_name = EXCLUDED.table_name, merge = EXCLUDED.merge, push_priority = EXCLUDED.push_priority`;
  }

  if (DEMO) {
    // أصول نموذجية لكل شعبة صيانة + معدات حرارية/دوارة حقيقية الاسم
    const unitByCode = new Map((await prisma.productionUnit.findMany({ select: { id: true, code: true } })).map((u) => [u.code, u.id] as const));
    const demoAssets = [
      { tag: '101-C-01', name: 'ضاغط الهواء للهواء العام', classCode: 'COMPRESSOR', unit: 'UTILITY', sub: 'MAINT-ROT', criticality: 'CRITICAL' },
      { tag: '101-R-01', name: 'مفاعل الأمونيا (Converter)', classCode: 'RST', unit: 'AMMONIA', sub: 'MAINT-HEAT', criticality: 'CRITICAL' },
      { tag: '102-S-01', name: 'المفكك (Urea Stripper)', classCode: 'COLUMN', unit: 'UREA', sub: 'MAINT-HEAT', criticality: 'CRITICAL' },
      { tag: '103-E-12', name: 'مبادل تغذية اليوريا', classCode: 'HX', unit: 'UREA', sub: 'MAINT-HEAT', criticality: 'HIGH' },
      { tag: '201-CT-01', name: 'برج التبريد رقم 1 – الخلية أ', classCode: 'CT', unit: 'COOLING_TOWER', sub: 'PROD-CT', criticality: 'HIGH' },
      { tag: '201-F-03', name: 'مروحة برج التبريد 3', classCode: 'COMPRESSOR', unit: 'COOLING_TOWER', sub: 'MAINT-ROT', criticality: 'NORMAL' },
      { tag: '301-PV-05', name: 'صمام أمان وعاء الفاصل عالي الضغط', classCode: 'PSV', unit: 'AMMONIA', sub: 'MAINT-VALVE', criticality: 'CRITICAL' },
      { tag: '401-TI-201', name: 'مرسل حرارة مخرج المبادل', classCode: 'ANALYZER', unit: 'UREA', sub: 'MAINT-INST', criticality: 'NORMAL' },
      { tag: '501-MV-07', name: 'لوحة توزيع 6.6 ك.ف', classCode: 'MV', unit: 'UTILITY', sub: 'MAINT-ELEC', criticality: 'HIGH' },
      { tag: '601-BS-02', name: 'ناقل منتجات اليوريا (Bulk)', classCode: 'CIVIL', unit: 'UREA', sub: 'MAINT-GEN', criticality: 'NORMAL' },
    ];
    const assetIdByTag = new Map<string, string>();
    for (const a of demoAssets) {
      const subId = subDeptIdByCode.get(a.sub);
      const asset = await prisma.asset.upsert({
        where: { tag: a.tag },
        update: { nameAr: a.name, criticality: a.criticality as never, subDeptId: subId, unitId: unitByCode.get(a.unit) },
        create: {
          facilityId: facility.id,
          tag: a.tag,
          nameAr: a.name,
          classCode: a.classCode,
          unitId: unitByCode.get(a.unit),
          subDeptId: subId,
          criticality: a.criticality as never,
          locationPath: `معمل الأسمدة الجنوبية / الخط الأول`,
          costCenterCode: `CC-${a.sub}`,
          installDate: new Date('2019-05-01T00:00:00Z'),
        },
      });
      assetIdByTag.set(a.tag, asset.id);
    }

    // مخزن + أصناف حرجة
    const wh = await prisma.warehouse.upsert({
      where: { code: 'WH-MAIN' },
      update: { nameAr: 'المخزن الرئيسي – المعمل' },
      create: { code: 'WH-MAIN', nameAr: 'المخزن الرئيسي – المعمل', whType: 'MAIN', locationAr: 'مبنى المخازن/الخط الأول' },
    });
    const demoItems = [
      { partNumber: 'SP-PSV-RESEAT', name: 'طقم إعادة ضبط صمام أمان DN50', uom: 'SET', cost: 450000, critical: true },
      { partNumber: 'SP-BRG-6316', name: 'رولمان بلي 6316 C3', uom: 'EA', cost: 185000, critical: true },
      { partNumber: 'SP-GSKT-SPR', name: 'جوانة سبرال ويف للمفكك', uom: 'EA', cost: 320000, critical: true },
      { partNumber: 'CH-DEM-32', name: 'منزوع رغوة (Defoamer) 20L', uom: 'EA', cost: 95000, critical: false },
      { partNumber: 'EL-MCC-CT1', name: 'كونتاكتور 160A لمروحة البرج', uom: 'EA', cost: 620000, critical: true },
    ];
    for (const it of demoItems) {
      const item = await prisma.stockItem.upsert({
        where: { partNumber: it.partNumber },
        update: { nameAr: it.name, isCriticalSpare: it.critical },
        create: { partNumber: it.partNumber, nameAr: it.name, uom: it.uom, category: 'SPARE_PART', isCriticalSpare: it.critical, stdUnitCost: it.cost, currency: 'IQD' },
      });
      await prisma.stockBalance.upsert({
        where: { itemId_warehouseId: { itemId: item.id, warehouseId: wh.id } },
        update: { onHandQty: 6 },
        create: { itemId: item.id, warehouseId: wh.id, onHandQty: 6, reservedQty: 0, minLevel: 2, maxLevel: 20, reorderPoint: 3 },
      });
    }

    // أوامر شغل تغطي مسار العمل كاملاً (للتدريب ولوحة المؤشرات)
    const heads = await prisma.user.findMany({ where: { username: { in: ['heat.head', 'rot.head', 'maint.manager', 'urea.head', 'heat.tech', 'hse'] } }, select: { id: true, username: true } });
    const byName = new Map(heads.map((h) => [h.username, h.id] as const));
    const now = Date.now();
    const demoWo = [
      { tag: '301-PV-05', title: 'تسريب من صمام الأمان عالي الضغط', sub: 'MAINT-VALVE', priority: 'EMERGENCY', status: 'IN_PROGRESS', src: 'SHIFT_LOG' },
      { tag: '101-C-01', title: 'اهتزاز مرتفع على المضجع الأمامي لضاغط الهواء', sub: 'MAINT-ROT', priority: 'URGENT', status: 'ASSIGNED', src: 'INSPECTION' },
      { tag: '201-CT-01', title: 'انسداد في حشوة برج التبريد (خلية أ)', sub: 'MAINT-GEN', priority: 'HIGH', status: 'SUBMITTED', src: 'SHIFT_LOG' },
      { tag: '103-E-12', title: 'فحص سمك جدران المبادل (UT)', sub: 'MAINT-HEAT', priority: 'MEDIUM', status: 'DRAFT', src: 'PM' },
      { tag: '501-MV-07', title: 'صيانة وقائية نصف سنوية للوحة 6.6 ك.ف', sub: 'MAINT-ELEC', priority: 'ROUTINE_PM', status: 'APPROVED', src: 'PM' },
      { tag: '102-S-01', title: 'تغيير جوانة المفكك أثناء الإيقاف المبرمج', sub: 'MAINT-HEAT', priority: 'HIGH', status: 'CLOSED', src: 'SHIFT_LOG' },
    ];
    for (const [i, w] of demoWo.entries()) {
      const subId = subDeptIdByCode.get(w.sub)!;
      const sub = await prisma.subDepartment.findUniqueOrThrow({ where: { id: subId } });
      const number = `WO-2026-${String(i + 1).padStart(6, '0')}`;
      const existing = await prisma.workOrder.findUnique({ where: { number } });
      if (existing) continue;
      await prisma.workOrder.create({
        data: {
          number,
          facilityId: facility.id,
          departmentId: sub.departmentId,
          subDeptId: subId,
          assetId: assetIdByTag.get(w.tag),
          title: w.title,
          description: `${w.title} — رصدته وردية الإنتاج ويحتاج معالجة وفق إجراءات الخط الأول.`,
          status: w.status as never,
          priority: w.priority as never,
          sourceType: w.src as never,
          createdById: byName.get('urea.head') ?? byName.get('maint.manager')!,
          assignedToId: byName.get('heat.tech'),
          approverId: w.status === 'CLOSED' || w.status === 'APPROVED' ? byName.get('maint.manager') : null,
          requirePermit: w.priority === 'EMERGENCY' || w.priority === 'HIGH',
          isSafetyCritical: w.priority === 'EMERGENCY',
          costCenterCode: `CC-${w.sub}`,
          planStartAt: new Date(now - 86_400_000),
          targetEndAt: new Date(now + 3 * 86_400_000),
          actualStartAt: ['IN_PROGRESS', 'CLOSED'].includes(w.status) ? new Date(now - 3600_000) : null,
          actualEndAt: w.status === 'CLOSED' ? new Date(now + 2 * 3600_000) : null,
          estHours: 4 + i,
          laborHours: w.status === 'CLOSED' ? 6.5 : null,
          partsCost: w.status === 'CLOSED' ? 320000 : null,
          laborCost: w.status === 'CLOSED' ? 45000 : null,
          rootCause: w.status === 'CLOSED' ? 'MECHANICAL' : null,
          closeNotes: w.status === 'CLOSED' ? 'تم تغيير الجوانة وإجراء اختبار تسرب هيدروستاتيكي 4.2 MPa/30 دقيقة، النتيجة: ناجح.' : null,
        },
      });
    }

    // سجلوبة وردية + تصاريح
    const ureaUnit = unitByCode.get('UREA');
    if (ureaUnit) {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      await prisma.productionShiftLog.upsert({
        where: { unitId_shiftDate_shiftCode: { unitId: ureaUnit, shiftDate: today, shiftCode: 'A' } },
        update: {},
        create: {
          facilityId: facility.id,
          unitId: ureaUnit,
          shiftDate: today,
          shiftCode: 'A',
          preparedById: byName.get('urea.head')!,
          status: 'SUBMITTED',
          productionTons: 1021.4,
          designRateTph: 71.9,
          availabilityPct: 98.6,
          downtimeHours: 0.25,
          lopiCount: 0,
          notes: 'الوحدة مستقرة، لم تُسجَّل انحرافات جوهرية.',
        },
      });
    }
  }

  // إبقاء تسلسلات الأرقام فوق أعلى رقم موجود (وإلا تصادم أول أمر شغل حقيقي مع صف تجريبي)
  const aligned = await prisma.$queryRaw<Array<{ seq: string; next_value: bigint }>>`SELECT * FROM fn_align_number_sequences()`;
  if (aligned.length) console.log(`✓ مواءمة ${aligned.length} تسلسل أرقام: ${aligned.map((a) => `${a.seq}→${a.next_value}`).join(', ')}`);

  const summary = await prisma.$queryRaw<Array<{ depts: bigint; subs: bigint; roles: bigint; perms: bigint; grants: bigint; users: bigint; rp: bigint }>>`
    SELECT (SELECT count(*) FROM departments)::bigint AS depts,
           (SELECT count(*) FROM sub_departments)::bigint AS subs,
           (SELECT count(*) FROM roles)::bigint AS roles,
           (SELECT count(*) FROM permissions)::bigint AS perms,
           (SELECT count(*) FROM role_subdept_grants)::bigint AS grants,
           (SELECT count(*) FROM users WHERE "deletedAt" IS NULL)::bigint AS users,
           (SELECT count(*) FROM role_permissions)::bigint AS rp`;
  const s = summary[0]!;
  console.log(
    `✓ seed: ${s.depts} قسم، ${s.subs} شعبة، ${s.roles}/${ROLE_DEFS.length} دور، ${s.perms}/${PERMISSION_DEFS.length} صلاحية، ` +
      `${s.grants} منح شعبة×دور، ${s.rp} ربط دور×صلاحية، ${s.users} مستخدم`,
  );
  console.log(`✓ كلمة المرور الافتراضية للمستخدمين: ${process.env.SEED_DEFAULT_PASSWORD ?? 'Newport#2026'} (mustChangePwd=true)`);
}

main()
  .catch((e) => {
    console.error('seed failed', e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
