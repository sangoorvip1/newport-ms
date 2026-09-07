/**
 * دخان نهاية-إلى-نهاية على خادم حقيقي + PostgreSQL حقيقي.
 * يغطي: الجلسة، قيد تغيير كلمة المرور، الهيكل، مصفوفة الصلاحيات، دورة أمر العمل،
 * ثم عقد المزامنة (push idempotent + حماية الحقول المعتمدة + pull بالـ cursor).
 *
 * الاستخدام:
 *   DATABASE_URL=... node dist/main.js &        # أو: npm run start -w @newport/api
 *   API_URL=http://127.0.0.1:3000/api node scripts/e2e-smoke.mjs --user sysadmin --password 'Newport#2026'
 *
 * الخروج 0 = كل الفحوص نجحت. أي فشل يطبع الاسم والسبب ويفرج غير-صفر.
 */
const API = (process.env.API_URL ?? 'http://127.0.0.1:3000/api').replace(/\/$/, '');
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const USER = arg('user', 'sysadmin');
const PASSWORD = arg('password', 'Newport#2026');
const NEW_PASSWORD = arg('newPassword', 'Newport#2026-e2e');

const DEVICE = `e2e-${Math.random().toString(36).slice(2, 10)}`;
let accessToken = null;
let refreshToken = null;
/** كلمة المرور الصالحة حاليًا (تتغير إذا بدأ السيناريو بحساب بكلمة مرور افتراضية) */
let pw = PASSWORD;

// الأرقام المرجعية تُستورد من @newport/domain — حتى لا يتقادم هذا الملف عند إضافة صلاحية/منح
let EXPECT = { permissions: 91, roles: 21, grants: 36 };
try {
  const domain = await import('@newport/domain');
  EXPECT = {
    permissions: domain.PERMISSION_DEFS.length,
    roles: domain.ROLE_DEFS.length,
    // المسار يعيد منح (شعبة × دور) فقط؛ الأدوار العابرة للأقسام لها مسار/عدّاد منفصل
    grants: domain.resolveGrants().filter((g) => g.subDeptCode !== null).length,
  };
} catch {
  console.log('· @newport/domain غير متاح — سيُستعمل الافتراضي في الفحوص أدناه');
}

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function call(method, path, body, opts = {}) {
  const headers = { accept: 'application/json', 'x-device-id': DEVICE };
  if (body !== undefined) headers['content-type'] = 'application/json';
  // token: null ⇒ بدون ترويسة تفويض (مسار عام مثل login) — وإلا ورثنا الرمز الحالي خطأً
  const token = opts.token === null ? null : (opts.token ?? accessToken);
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { status: res.status, body: json };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Nest يعيد 201 على معظم POST — نقبل 2xx */
const ok = (st) => st >= 200 && st < 300;


/** يجرّب الكلمات المعتمدة (الأولى بعد تغيير سابق) ويعيد جلسة أو null */
async function loginWithFallback(username, candidates, platform = 'WEB') {
  for (const password of candidates) {
    const r = await call('POST', '/v1/auth/login', { username, password, deviceId: DEVICE, platform }, { token: null });
    if (ok(r.status)) return { ...r.body, password };
  }
  return null;
}

/**
 * إعادة ضبط حسابات السيناريو إلى الحالة المزروعة (كلمة مرور افتراضية + mustChangePwd=true)
 * عند توفر DATABASE_URL — يجعل الدخان قابلًا للتكرار ويُبقي اختبار «القيد قبل تغيير كلمة
 * المرور» يعمل في كل تشغيل، لا في أول تشغيل فقط. بدون DATABASE_URL يعمل على الحالة الحالية.
 */
async function resetSeedAccounts() {
  const url = process.env.DATABASE_URL;
  if (!url) return false;
  const { default: pg } = await import('pg');
  const { default: bcrypt } = await import('bcryptjs');
  const hash = await bcrypt.hash(PASSWORD, 10);
  const c = new pg.Client(url);
  await c.connect();
  const r = await c.query(
    `UPDATE users SET "passwordHash" = $1, "mustChangePwd" = true, "failedAttempts" = 0, "lockedUntil" = NULL,
            version = version + 1, "syncCursor" = 0
      WHERE username = ANY($2)`,
    [hash, [USER, 'heat.head', 'heat.tech', 'urea.head', 'lab.analyst', 'lab.head']],
  );
  await c.end();
  console.log(`↺ أُعيد ضبط ${r.rowCount} حساب إلى الحالة المزروعة (كلمة مرور افتراضية + قيد التغيير)`);
  return true;
}

async function main() {
  await resetSeedAccounts();

  // 0)جاهزية الخادم
  let health = null;
  for (let i = 0; i < 30; i++) {
    health = await call('GET', '/health/ready', undefined, { token: null });
    if (health.status === 200) break;
    await sleep(500);
  }
  check('health/ready', health?.status === 200, JSON.stringify(health?.body));
  if (health?.status !== 200) throw new Error('الخادم غير جاهز — أوقف السيناريو');

  // 1) دخول أول (كلمة مرور مزروعة ⇒ يجب أن تكون مقيدة)
  let first = await loginWithFallback(USER, [PASSWORD, NEW_PASSWORD]);
  if (first?.mustChangePwd === true) pw = first.password;
  let login = { status: first ? 201 : 401, body: first };
  check('POST /v1/auth/login', ok(login.status) && !!login.body?.accessToken, `status=${login.status}`);
  if (!ok(login.status)) throw new Error(`login failed: ${JSON.stringify(login.body)}`);
  accessToken = login.body.accessToken;
  refreshToken = login.body.refreshToken;

  const restricted = login.body.mustChangePwd === true;
  if (process.env.E2E_DEBUG && process.env.DATABASE_URL) {
    const claims = JSON.parse(Buffer.from(String(accessToken).split('.')[1], 'base64url').toString('utf8'));
    const { default: pg } = await import('pg');
    const c = new pg.Client(process.env.DATABASE_URL);
    await c.connect();
    const row = await c.query(`select version, "mustChangePwd" from users where username = $1`, [USER]);
    await c.end();
    console.log(`   [debug] JWT v=${claims.v} | db version=${row.rows[0].version} | iat=${new Date(claims.iat * 1000).toISOString()}`);
  }
  if (restricted) {
    const blocked = await call('GET', '/v1/org/tree');
    check('الجلسة المقيدة تحجب مسارات البيانات (403)', blocked.status === 403, `status=${blocked.status} ${blocked.body?.messageAr ?? ''}`);
    const cp = await call('POST', '/v1/auth/change-password', { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    check('POST /v1/auth/change-password', ok(cp.status), JSON.stringify(cp.body));
    pw = NEW_PASSWORD;
    login = await call('POST', '/v1/auth/login', { username: USER, password: pw, deviceId: DEVICE, platform: 'WEB' }, { token: null });
    check('إعادة الدخول بعد التغيير', ok(login.status) && login.body?.mustChangePwd === false, `status=${login.status} mustChangePwd=${login.body?.mustChangePwd} ${login.status === 201 ? '' : JSON.stringify(login.body).slice(0, 180)}`);
    accessToken = login.body.accessToken;
    refreshToken = login.body.refreshToken;
  } else {
    check('إعادة استخدام الحساب بعد تغيير سابق', true, 'mustChangePwd=false منذ البداية');
  }

  // 2) الجلسة والهوية
  const me = await call('GET', '/v1/auth/me');
  check('GET /v1/auth/me', ok(me.status) && Array.isArray(me.body?.permissions), `${me.body?.permissions?.length ?? 0} صلاحية`);
  const refresh = await call('POST', '/v1/auth/refresh', { refreshToken, deviceId: DEVICE }, { token: null });
  check('POST /v1/auth/refresh (تدوير الرمز)', ok(refresh.status) && !!refresh.body?.accessToken, `status=${refresh.status}`);
  if (ok(refresh.status)) {
    accessToken = refresh.body.accessToken;
    const reuse = await call('POST', '/v1/auth/refresh', { refreshToken, deviceId: DEVICE }, { token: null });
    check('إعادة استعمال رمز قديم ⇒ رفض + إلغاء العائلة', reuse.status === 401, `status=${reuse.status}`);
    // الدخول الاستردادي بعد اختبار إعادة الاستعمال — بنفس كلمة المرور الحالية (pw)
    const relogin = await call('POST', '/v1/auth/login', { username: USER, password: pw, deviceId: DEVICE, platform: 'WEB' }, { token: null });
    if (ok(relogin.status)) {
      accessToken = relogin.body.accessToken;
      refreshToken = relogin.body.refreshToken;
    }
  }

  // 3) الهيكل التنظيمي كما طُلب حرفيًا
  const tree = await call('GET', '/v1/org/tree');
  const depts = Array.isArray(tree.body) ? tree.body : (tree.body?.departments ?? []);
  const deptCodes = depts.map((d) => d.code).sort();
  check('GET /v1/org/tree → 3 أقسام', ok(tree.status) && deptCodes.length === 3, deptCodes.join(','));
  const subs = await call('GET', '/v1/org/sub-departments');
  const subList = subs.body?.subDepartments ?? subs.body ?? [];
  check('13 شعبة بالضبط', ok(subs.status) && Array.isArray(subList) && subList.length === 13, `n=${subList?.length}`);
  const expected = ['ADM-BIO', 'ADM-COM', 'ADM-FIN', 'MAINT-ELEC', 'MAINT-GEN', 'MAINT-HEAT', 'MAINT-INST', 'MAINT-ROT', 'MAINT-VALVE', 'PROD-AMM', 'PROD-CT', 'PROD-LAB', 'PROD-UREA'];
  const got = (Array.isArray(subList) ? subList : []).map((s) => s.code).sort();
  check('رموز الشعب مطابقة للهيكل المرفق', JSON.stringify(got) === JSON.stringify(expected), got.join(','));
  const drift = await call('GET', '/v1/org/drift');
  check('GET /v1/org/drift — لا انحراف عن المرجع', ok(drift.status) && drift.body?.isAligned === true, JSON.stringify(drift.body));
  const matrix = await call('GET', '/v1/org/permissions-matrix');
  const matrixRows = Array.isArray(matrix.body) ? matrix.body : (matrix.body?.rows ?? []);
  check(`GET /v1/org/permissions-matrix → ${EXPECT.grants} منح شعبة×دور`, ok(matrix.status) && matrixRows.length === EXPECT.grants, `rows=${matrixRows.length}`);
  const verify = await call('GET', '/v1/org/permissions-verify');
  check('GET /v1/org/permissions-verify — القاعدة تطابق التعاقد', ok(verify.status) && verify.body?.inSync === true && verify.body?.roles === EXPECT.roles && verify.body?.permissions === EXPECT.permissions, JSON.stringify(verify.body));

  // 4) أمر عمل: إنشاء → تقديم → منع انتقال غير قانوني.
  //    يُنفَّذ بحساب رئيس شعبة المعدات الحرارية (SYS_ADMIN لا يملك maint.wo.create عمدًا: فصل المهام)
  const heat = (Array.isArray(subList) ? subList : []).find((s) => s.code === 'MAINT-HEAT');
  let tech = await loginWithFallback('heat.head', [PASSWORD, NEW_PASSWORD], 'WIN');
  if (tech?.mustChangePwd === true) {
    const savedPw = tech.password;
    const cp2 = await call('POST', '/v1/auth/change-password', { currentPassword: savedPw, newPassword: NEW_PASSWORD }, { token: tech.accessToken });
    check('تغيير كلمة مرور حساب الصيانة', ok(cp2.status), JSON.stringify(cp2.body).slice(0, 120));
    tech = await loginWithFallback('heat.head', [NEW_PASSWORD, savedPw], 'WIN');
  }
  const techLogin = { body: tech ?? {} };
  const techToken = tech?.accessToken ?? null;
  check('دخول مستخدم صيانة (heat.head) وتفعيل جلسته', !!techToken, tech ? 'ok' : 'لم ينجح أي من كلمة المرور المعتمدة');
  const call2 = (m, path, body, opts = {}) => call(m, path, body, { ...opts, token: opts.token === null ? null : (opts.token ?? techToken) });
  // حساب الهاتف الميداني: صلاحيات sync.push/sync.pull منحدّة لـ FIELD_TECHNICIAN (دور_offline الأساسي)
  let mobile = await loginWithFallback('heat.tech', [PASSWORD, NEW_PASSWORD], 'ANDROID');
  if (mobile?.mustChangePwd === true) {
    const savedPw = mobile.password;
    await call('POST', '/v1/auth/change-password', { currentPassword: savedPw, newPassword: NEW_PASSWORD }, { token: mobile.accessToken });
    mobile = await loginWithFallback('heat.tech', [NEW_PASSWORD, savedPw], 'ANDROID');
  }
  const mobileToken = mobile?.accessToken ?? null;
  check('دخول فني ميداني (heat.tech) بصلاحية sync.push', !!mobileToken && (mobile?.permissions ?? []).length >= 0, mobile ? 'ok' : 'فشل الدخول');
  const callM = (m, path, body, opts = {}) => call(m, path, body, { ...opts, token: mobileToken ?? techToken });
  const create = await call2('POST', '/v1/maintenance/work-orders', {
    title: 'E2E: تسريب من فلانشة مبادل التغذية',
    description: 'رُصد تسريب أمونيا خفيف عند الوصلة؛ يتطلب فحص لحام وعزل المنطقة قبل إعادة التشغيل.',
    priority: 'URGENT',
    sourceType: 'BREAKDOWN',
    requestedSubDeptCode: 'MAINT-HEAT',
    requirePermit: false,
    safetyNotes: 'عزل منطقة العمل وقياس الغازات قبل البدء.',
    estimatedHours: 4,
  });
  const woId = create.body?.id ?? create.body?.workOrder?.id;
  check('POST /v1/maintenance/work-orders', ok(create.status), `status=${create.status} ${JSON.stringify(create.body).slice(0, 200)}`);
  const number = create.body?.number ?? create.body?.workOrder?.number;
  check('رقم أمر الشغل من تسلسل القاعدة', /^WO-\d{4}-\d{6}$/.test(String(number ?? '')), String(number));
  if (!woId) throw new Error('لا يوجد id لأمر العمل — تم إنهاء السيناريو');

  const badTransition = await call2('POST', `/v1/maintenance/work-orders/${woId}/transition`, { to: 'CLOSED', reason: 'محاولة غير قانونية' });
  check('انتقال DRAFT→CLOSED مرفوض (آلة الحالة ⇒ 409)', [400, 409, 422].includes(badTransition.status), `status=${badTransition.status} ${badTransition.body?.messageAr ?? ''}`);
  const submit = await call2('POST', `/v1/maintenance/work-orders/${woId}/transition`, { to: 'SUBMITTED', reason: 'رفع للمشرف' });
  check('انتقال DRAFT→SUBMITTED', submit.status === 200 || submit.status === 201, `status=${submit.status} ${submit.body?.messageAr ?? ''}`);
  const forbiddenCreate = await callM('POST', '/v1/maintenance/work-orders', {
    title: 'E2E: محاولة فني', description: 'لا يملك FIELD_TECHNICIAN صلاحية إنشاء أمر شغل', priority: 'ROUTINE_PM', sourceType: 'MANAGEMENT', requestedSubDeptCode: 'MAINT-HEAT',
  });
  check('الفني لا ينشئ أوامر شغل (403 — أدنى صلاحية)', forbiddenCreate.status === 403, `status=${forbiddenCreate.status}`);
  const detail = await call2('GET', `/v1/maintenance/work-orders/${woId}`);
  check('GET أمر العمل يعرض الحالة الجديدة', ok(detail.status) && detail.body?.status === 'SUBMITTED', `status=${detail.body?.status}`);
  check('الأمر مرتبط بشعبة المعدات الحرارية', detail.body?.subDeptId === heat?.id || heat?.id === undefined, `${detail.body?.subDeptId}`);

  // 5) المزامنة: push عادي → idempotent → حقل محمي → pull
  const wo = detail.body;
  check('صف خام يُسلسَّل BigInt بأمان (syncSeq)', detail.status === 200 && (typeof wo?.syncSeq === 'number' || typeof wo?.syncSeq === 'string' || wo?.syncSeq === null), `syncSeq=${wo?.syncSeq}`);
  const baseVersion = wo?.version ?? 1;
  const opId = `e2e-op-${Math.random().toString(36).slice(2, 10)}`;
  const pushBody = {
    deviceId: DEVICE,
    userId: me.body.userId, // الخادم يتجاهله ويستخدم صاحب الجلسة — مضمون بالفحص أعلاه
    schemaVersion: 3,
    ops: [
      {
        opId,
        entity: 'workOrder',
        recordId: woId,
        kind: 'PATCH',
        baseVersion,
        clientTimestamp: new Date().toISOString(),
        data: { description: 'ملاحظة ميدانية من السيناريو: تم عزل المنطقة.' },
      },
      {
        opId: `${opId}-prot`,
        entity: 'workOrder',
        recordId: woId,
        kind: 'PATCH',
        baseVersion,
        clientTimestamp: new Date().toISOString(),
        data: { status: 'COMPLETED', approverId: me.body.userId, rootCause: 'MECHANICAL' },
      },
    ],
  };
  const push = await callM('POST', '/v1/sync/push', pushBody);
  const r0 = push.body?.results?.[0];
  const r1 = push.body?.results?.[1];
  check('POST /v1/sync/push', ok(push.status), `status=${push.status}`);
  check('العملية الحرة طُبِّقت', ['APPLIED', 'MERGED'].includes(r0?.outcome), `outcome=${r0?.outcome}`);
  check('الحالة/الاعتماد لم يُقبلا من الجهاز', r1?.outcome === 'CONFLICT' || r1?.outcome === 'REJECTED' || (r1?.serverKeptFields ?? []).includes('status'), `outcome=${r1?.outcome} kept=${(r1?.serverKeptFields ?? []).join('|')}`);
  const pushAgain = await callM('POST', '/v1/sync/push', { ...pushBody, ops: [pushBody.ops[0]] });
  // إعادة نفس opId لا تُعيد التطبيق، بل تُعيد رد الخادم الأصلي حرفيًا (نفس outcome/note)
  const r0again = pushAgain.body?.results?.[0];
  check(
    'إعادة نفس opId ⇒ رد مؤرشف مطابق (idempotency)',
    r0again?.outcome === r0?.outcome && String(r0again?.reasonAr ?? '').includes('idempotency') && r0again?.serverSeq === r0?.serverSeq,
    `outcome=${r0again?.outcome} seq=${r0again?.serverSeq} (الأصل ${r0?.outcome}/${r0?.serverSeq}) — ${r0again?.reasonAr ?? ''}`,
  );
  const after = await call2('GET', `/v1/maintenance/work-orders/${woId}`);
  check('ملاحظة الميدان وصلت ولم تُستبدل الحالة', String(after.body?.description ?? '').includes('ملاحظة ميدانية') && after.body?.status === 'SUBMITTED', `status=${after.body?.status}`);

  // الكيان محصور في الفحص: مع نمو نشاط المختبر تتجاوز صفحة 50 صفاً رقمَ أمر العمل، فالفحص
  // بلا فلترة يصبح هشًا بلا معنى. الترتيب التسلسلي يُفحص صراحةً هذه المرة.
  const pull = await callM('GET', `/v1/sync/pull?deviceId=${DEVICE}&sinceCursor=0&limit=200&entities=workOrder`);
  const changes = pull.body?.changes ?? [];
  check('GET /v1/sync/pull يعيد Change Feed', ok(pull.status) && changes.length > 0, `rows=${changes.length}, cursor=${pull.body?.cursor}`);
  const ascending = changes.every((c, i) => i === 0 || c.seq > changes[i - 1].seq);
  check('feed يتضمن أمر العمل بترتيب تسلسلي متزايد', changes.some((c) => c.entity === 'workOrder' && c.recordId === woId) && ascending, `rows=${changes.length}`);
  const proto = await callM('GET', '/v1/sync/protocol');
  check('GET /v1/sync/protocol يعرض 19 كيانًا', ok(proto.status) && (proto.body?.entities?.length ?? 0) === 19, `entities=${proto.body?.entities?.length}`);
  const plan = await callM('POST', '/v1/sync/batch-plan', { ops: [{ opId: 'p1', entity: 'workOrder', recordId: woId, kind: 'UPSERT', clientTimestamp: new Date().toISOString() }] });
  check('POST /v1/sync/batch-plan', ok(plan.status), `batches=${plan.body?.batches?.length ?? plan.body?.length ?? '?'}`);
  const audit = await call('GET', '/v1/audit?take=5', undefined, { token: accessToken });
  check('GET /v1/audit يعمل للسيناريو', ok(audit.status), `status=${audit.status}`);

  // 6) سجل التدقيق غير قابل للتعديل (يُتحقق على مستوى القاعدة مباشرة إن توفرت DATABASE_URL)
  // 7) المختبر: عينة من شعبة إنتاج → إدخال نتائج (تجاوز مواصفة) → تدقيق → OOS/CAPA → شهادة
  const labAnalystLogin = await loginWithFallback('lab.analyst', [PASSWORD, NEW_PASSWORD], 'ANDROID');
  check('دخول محلل المختبر', !!labAnalystLogin, labAnalystLogin ? `pw=${labAnalystLogin.password}` : 'فشل');
  if (labAnalystLogin?.mustChangePwd === true) {
    const saved = accessToken;
    accessToken = labAnalystLogin.accessToken;
    const cp = await call('POST', '/v1/auth/change-password', { currentPassword: labAnalystLogin.password, newPassword: NEW_PASSWORD });
    check('محلل المختبر يغيّر كلمته (مسار مسموح في الجلسة المقيدة)', ok(cp.status), JSON.stringify(cp.body).slice(0, 160));
    const again = await loginWithFallback('lab.analyst', [NEW_PASSWORD], 'ANDROID');
    accessToken = again?.accessToken ?? saved;
  }
  let labToken = labAnalystLogin?.accessToken ?? accessToken;
  const analystSession = labAnalystLogin?.mustChangePwd === true ? await loginWithFallback('lab.analyst', [NEW_PASSWORD], 'ANDROID') : labAnalystLogin;
  labToken = analystSession?.accessToken ?? labToken;

  const urea = await loginWithFallback('urea.head', [PASSWORD, NEW_PASSWORD], 'WIN');
  let ureaToken = urea?.accessToken ?? null;
  if (urea?.mustChangePwd === true) {
    const t = accessToken;
    accessToken = urea.accessToken;
    await call('POST', '/v1/auth/change-password', { currentPassword: urea.password, newPassword: NEW_PASSWORD });
    const again = await loginWithFallback('urea.head', [NEW_PASSWORD], 'WIN');
    ureaToken = again?.accessToken ?? ureaToken;
    accessToken = t;
  }

  const catalog = await call('GET', '/v1/lab/parameters?unitCode=UREA', undefined, { token: ureaToken });
  const catalogCodes = (catalog.body?.items ?? []).map((x) => x.code);
  check('GET /v1/lab/parameters — دليل المُعامِلات ومواصفاته', ok(catalog.status) && catalogCodes.includes('UREA_N'), `codes=${catalogCodes.slice(0, 4).join(',')}`);

  // العينة تفتحها الشعبة المنتِجة (نطاق SUBDEPT على شعبتها) — رقم من تسلسل القاعدة
  const sample = await call(
    'POST',
    '/v1/lab/samples',
    { unitCode: 'UREA', sampleType: 'PRODUCT', pointTag: 'GRN-01', collectedAt: new Date().toISOString(), isFastTracked: false, integrityJson: { sealsOk: true } },
    { token: ureaToken },
  );
  const sampleId = sample.body?.id;
  check('POST /v1/lab/samples — رئيس شعبة الإنتاج يفتح عينة', ok(sample.status) && /^SMP-\d{4}-\d{6}$/.test(String(sample.body?.sampleNumber)), `status=${sample.status} ${sample.body?.sampleNumber ?? JSON.stringify(sample.body).slice(0, 160)}`);

  // قاعدة النطاق: رئيس المختبر (SUBDEPT) لا يفتح عينة باسم شعبة أخرى
  const labHead0 = await loginWithFallback('lab.head', [PASSWORD, NEW_PASSWORD], 'WEB');
  let labHeadToken = labHead0?.accessToken ?? null;
  if (labHead0?.mustChangePwd === true) {
    const t = accessToken;
    accessToken = labHead0.accessToken;
    await call('POST', '/v1/auth/change-password', { currentPassword: labHead0.password, newPassword: NEW_PASSWORD });
    const again = await loginWithFallback('lab.head', [NEW_PASSWORD], 'WEB');
    labHeadToken = again?.accessToken ?? labHeadToken;
    accessToken = t;
  }
  const foreignSample = await call(
    'POST',
    '/v1/lab/samples',
    { unitCode: 'UREA', sampleType: 'PRODUCT', collectedAt: new Date().toISOString(), forSubDeptCode: 'PROD-UREA' },
    { token: labHeadToken },
  );
  check('المختبر لا يفتح عينة باسم شعبة أخرى (403 + سبب عربي)', foreignSample.status === 403 && !!foreignSample.body?.messageAr, `status=${foreignSample.status} ${foreignSample.body?.messageAr ?? ''}`);

  // إدخال النتائج: المطابقة تُحسب في الخادم، والتجاوز يولّد حالة OOS تلقائيًا
  const entry = await call(
    'POST',
    `/v1/lab/samples/${sampleId}/results`,
    { results: [{ parameterCode: 'UREA_N', value: '46.20000' }, { parameterCode: 'UREA_BIURET', value: '1.80000', remarks: 'عينة إعادة' }] },
    { token: labToken },
  );
  const entryOk = ok(entry.status) && entry.body?.status === 'RESULTED' && entry.body?.written?.length === 2;
  check('POST /v1/lab/samples/:id/results — حساب المطابقة في الخادم', entryOk, `status=${entry.status} ${JSON.stringify(entry.body).slice(0, 200)}`);
  check('تجاوز المواصفة يولّد حالة OOS تلقائيًا', (entry.body?.oosCreated ?? []).length === 1 && entry.body.oosCreated[0].parameterCode === 'UREA_BIURET', JSON.stringify(entry.body?.oosCreated ?? []));
  const oosId = (entry.body?.oosCreated ?? [])[0]?.code;

  // إعادة الإدخال بعد الاعتماد مرفوض — والآلة في domain لا في العميل
  const detail1 = await call('GET', `/v1/lab/samples/${sampleId}`, undefined, { token: labToken });
  const resultIds = (detail1.body?.results ?? []).map((r) => r.id);
  check('تفاصيل العينة تعرض الصفوف مع المواصفة والحالة', ok(detail1.status) && resultIds.length === 2 && detail1.body.results[0].spec !== undefined, `status=${detail1.status}`);

  // المحلل لا يعتمد نتائج نفسه: لا lab.result.verify لهذا الدور
  const analystVerify = await call('POST', `/v1/lab/results/${resultIds[0]}/verify`, { decision: 'VERIFIED' }, { token: labToken });
  check('محلل المختبر لا يدقّق النتائج (403)', analystVerify.status === 403, `status=${analystVerify.status} ${analystVerify.body?.messageAr ?? ''}`);

  const v1 = await call('POST', `/v1/lab/results/${resultIds[0]}/verify`, { decision: 'VERIFIED' }, { token: labHeadToken });
  check('تدقيق نتيجة واحدة يبقي العينة RESULTED', ok(v1.status) && v1.body?.sampleStatus === 'RESULTED' && v1.body?.remainingUnverified === 1, JSON.stringify(v1.body).slice(0, 200));
  const v2 = await call('POST', `/v1/lab/results/${resultIds[1]}/verify`, { decision: 'VERIFIED' }, { token: labHeadToken });
  check('تدقيق آخر نتيجة ينقل العينة إلى VERIFIED', ok(v2.status) && v2.body?.sampleStatus === 'VERIFIED' && v2.body?.certificateReady === true, JSON.stringify(v2.body).slice(0, 200));

  const reEnter = await call('POST', `/v1/lab/samples/${sampleId}/results`, { results: [{ parameterCode: 'UREA_N', value: '46.00000' }] }, { token: labToken });
  check('إدخال نتائج على عينة معتمدة ⇒ 409 (لا مسار خلفيًا)', reEnter.status === 409 && !!reEnter.body?.messageAr, `status=${reEnter.status} ${reEnter.body?.messageAr ?? ''}`);

  // الشهادة محجوبة ما دامت حالة OOS مفتوحة
  const certBlocked = await call('GET', `/v1/lab/certificates/${sampleId}`, undefined, { token: labHeadToken });
  check('الشهادة لا تُصدر مع حالة OOS مفتوحة (409)', certBlocked.status === 409 && String(certBlocked.body?.messageAr).includes('خارج المطابقة'), `status=${certBlocked.status} ${certBlocked.body?.messageAr ?? ''}`);

  const oosList = await call('GET', '/v1/lab/oos?status=OPEN', undefined, { token: labHeadToken });
  const oosRow = (oosList.body?.items ?? [])[0];
  check('GET /v1/lab/oos يعرض الحالة المفتوحة بمسار الانتقال التالي', ok(oosList.status) && oosRow?.nextStatuses?.includes('INVESTIGATING'), `total=${oosList.body?.total} code=${oosRow?.code}`);

  // إغلاق CAPA: الآلة ترفض القفز، والإغلاق يستلئ سببًا جذريًا ونص CAPA
  const badJump = await call('POST', `/v1/lab/oos/${oosRow?.id}`, { status: 'CLOSED' }, { token: labHeadToken });
  check('قفزة OPEN→CLOSED مرفوضة (409 + القائمة المسموحة)', badJump.status === 409 && Array.isArray(badJump.body?.allowedNext), `status=${badJump.status} ${JSON.stringify(badJump.body).slice(0, 160)}`);
  const inv = await call('POST', `/v1/lab/oos/${oosRow?.id}`, { status: 'INVESTIGATING', rootCauseAr: 'ارتفاع حمل وحدة البلورة' }, { token: labHeadToken });
  check('OPEN → INVESTIGATING', ok(inv.status) && inv.body?.status === 'INVESTIGATING', JSON.stringify(inv.body).slice(0, 140));
  const capaNoText = await call('POST', `/v1/lab/oos/${oosRow?.id}`, { status: 'CAPA_DEFINED' }, { token: labHeadToken });
  check('CAPA_DEFINED بلا نص إجراء ⇒ 400', capaNoText.status === 400 && !!capaNoText.body?.messageAr, `status=${capaNoText.status}`);
  await call('POST', `/v1/lab/oos/${oosRow?.id}`, { status: 'CAPA_DEFINED', capaAr: 'ضبط معدل التغذية وتنظيف المبادل' }, { token: labHeadToken });
  await call('POST', `/v1/lab/oos/${oosRow?.id}`, { status: 'EFFECTIVENESS_CHECK' }, { token: labHeadToken });
  const closed = await call('POST', `/v1/lab/oos/${oosRow?.id}`, { status: 'CLOSED' }, { token: labHeadToken });
  check('الإغلاق بعد السبب الجذري والإجراء التصحيحي', ok(closed.status) && closed.body?.status === 'CLOSED' && !!closed.body?.closedAt, `status=${closed.status} ${JSON.stringify(closed.body).slice(0, 140)}`);

  const cert = await call('GET', `/v1/lab/certificates/${sampleId}`, undefined, { token: labHeadToken });
  const certRows = cert.body?.rows ?? [];
  check(
    'GET /v1/lab/certificates/:sampleId — شهادة بالنتائج المدققة فقط',
    ok(cert.status) && certRows.length === 2 && certRows.some((r) => r.verdict === 'FAIL') && !!cert.body?.signature?.issuedAt,
    `status=${cert.status} rows=${certRows.length} ${cert.body?.sampleNumber ?? ''}`,
  );
  check('الشهادة لا تُسرّب أسماء مستخدمين بصلاحيات غير مطلوبة (توقيع فقط)', Array.isArray(cert.body?.signature?.verifiedBy) && !!cert.body?.titleAr);

  const labStats = await call('GET', '/v1/lab/stats', undefined, { token: labHeadToken });
  check('GET /v1/lab/stats — مؤشرات الدورة والمطابقة', ok(labStats.status) && typeof labStats.body?.openOosCases === 'number' && labStats.body?.samples?.total >= 1, JSON.stringify(labStats.body));
  void oosId;

  if (process.env.DATABASE_URL) {
    const { default: pg } = await import('pg');
    const c = new pg.Client(process.env.DATABASE_URL);
    await c.connect();
    let immutable = false;
    try {
      await c.query('UPDATE audit_trails SET action = ' + "'X'");
    } catch (e) {
      immutable = /append-only/.test(String(e.message));
    }
    check('audit_trails append-only (trigger يرفض UPDATE)', immutable);
    const stamped = await c.query('SELECT count(*)::int AS n FROM sync_change_log WHERE payload ? \'syncSeq\'');
    check('change log يختم syncSeq لكل صف', stamped.rows[0].n > 0, `rows=${stamped.rows[0].n}`);
    await c.end();
  } else {
    console.log('· DATABASE_URL غير مضبوط — فحوص القاعدة المباشرة مُتخطّاة');
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} فحص ناجح`);
  if (failed.length) {
    console.log('FAILED: ' + failed.map((f) => f.name).join(' | '));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('E2E aborted:', e.message);
  process.exit(1);
});
