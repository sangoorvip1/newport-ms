import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG } from '../config.js';

/**
 * بطاقة تعريف الخدمة على الجذر `/` (و`/api`).
 *
 * لماذا؟ المشغّل في المعمل يفتح عنوان الخادم في المتصفح فيرى 404 خام («Cannot GET /») ولا يعرف إن
 * كانت الخدمة ميتة أو أنه وصل لمجرّد مسار غير معرَّف — وهذا الفرق يهم قبل أن يوقظ أحدًا. البطاقة
 * تُجيب بسطر واحد: الواجهة ليست في المتصفح (تطبيق مكتب/هاتف)، وهذا هو المسار الأساسي والجسور الصحية.
 *
 * لا أرقام مُختلَقة هنا: كل حقل مشتق من `CONFIG` أو من `package.json`، وقائمة المسارات مفحوصة حيًّا
 * في `scripts/e2e-smoke.mjs` (كل مسار مذكور يجب ألا يرد 404).
 */

/**
 * الإصدار من `package.json` لمجلد التشغيل — نفس اصطلاح `CONFIG.storage.localDir` (مسار نسبي إلى cwd)،
 * لأن Dockerfile والشرارة المحلية يشغّلان العملية من `apps/api`. بلا هذا السطر نضطر لرقم ثابت في الكود
 * يتقادم بصمت مع كل إصدار.
 */
function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { name?: string; version?: string };
    if (pkg?.version && pkg.name === '@newport/api') return pkg.version;
  } catch {
    /* لا package.json (تشغيل من مجلد غريب) ⇒ نص «dev» لا رقم خاطئ */
  }
  return 'dev';
}

/** الهروب وحده يمنع حقن وسوم لو جاء FACILITY_CODE من متغيّر بيئة يحمل أقواسًا */
function esc(v: string): string {
  return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

// كلها مسارات GET حقيقية (فحصها الحيّ في e2e يرفض أي إعلان لمسار ميت): auth/login مستبعد لأنه POST،
// وروابط القائمة تُنقر من المتصفح فلو كانت POST لرأى المشغّل 404 «مسار غير موجود» لا خطأ واضحًا.
export const ROOT_ENDPOINTS = [
  '/api/health',
  '/api/health/ready',
  '/api/v1/auth/health',
  '/api/v1/sync/protocol',
  '/api/v1/documents',
  '/api/v1/lab/parameters',
] as const;

export function buildRootIndex(now: () => Date = () => new Date()) {
  return {
    service: 'newport-api',
    orgAr: 'نيوبورت المحدودة — معمل الأسمدة الجنوبية، الخط الأول',
    facilityCode: CONFIG.facilityCode,
    timezone: CONFIG.timezone,
    version: readVersion(),
    apiPrefix: '/api',
    serverTime: now().toISOString(),
    endpoints: [...ROOT_ENDPOINTS],
    clients: {
      desktop: 'apps/desktop — Electron + Windows installer',
      mobile: 'apps/mobile — Expo (Android/iOS)، يعمل بلا اتصال ويدفع عند العودة',
    },
    noteAr: 'لا واجهة بشرية على هذا المنفذ: الافتح من تطبيق سطح المكتب أو الهاتف. المتصفح يستعمل هذه الصفحة لفحص الحياة فقط.',
  };
}

export type RootIndex = ReturnType<typeof buildRootIndex>;

export function renderRootHtml(card: RootIndex): string {
  const rows = card.endpoints.map((e) => `<li><a href="${esc(e)}"><code>${esc(e)}</code></a></li>`).join('');
  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(card.service)}</title>
<style>
 body{margin:0;padding:32px;background:#0f1720;color:#e8eef5;font:15px/1.7 system-ui,"Segoe UI",Tahoma,sans-serif}
 .card{max-width:760px;margin:0 auto;background:#16212e;border:1px solid #24384c;border-radius:14px;padding:22px 26px}
 h1{font-size:19px;margin:0 0 4px} .sub{color:#9fb3c8;margin:0 0 18px;font-size:13px}
 dl{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:0 0 18px}
 dt{color:#9fb3c8} dd{margin:0;font-family:ui-monospace,Menlo,Consolas,monospace}
 ul{list-style:none;padding:0;margin:0} li{padding:3px 0}
 a{color:#7fd1a8;text-decoration:none} a:hover{text-decoration:underline}
 code{background:#0b131c;padding:2px 6px;border-radius:6px;font-size:13px}
 .note{margin-top:18px;padding:12px 14px;background:#122330;border-right:3px solid #2f855a;border-radius:8px;color:#c9dbe9;font-size:13.5px}
</style></head>
<body><main class="card">
 <h1>${esc(card.orgAr)}</h1>
 <p class="sub">واجهة برمجية (API) — الخدمة حيّة · الإصدار ${esc(card.version)} · مرفق ${esc(card.facilityCode)}</p>
 <dl>
  <dt>المنطقة الزمنية</dt><dd>${esc(card.timezone)}</dd>
  <dt>بادئة المسارات</dt><dd>${esc(card.apiPrefix)}</dd>
  <dt>وقت الخادم</dt><dd>${esc(card.serverTime)}</dd>
 </dl>
 <ul>${rows}</ul>
 <p class="note">${esc(card.noteAr)}</p>
</main></body></html>`;
}

/**
 * وسيط الجذر: يعالج `/` و`/api` فقط. المسارات الأخرى تمر كما هي (404 بعقد الأخطاء الموحد).
 * يقبل HTML عند طلب المتصفح ويعيد JSON لبقية العملاء — نفس البيانات، صيغتان.
 */
export function rootIndexMiddleware(req: { method?: string; url?: string; headers?: Record<string, string | string[] | undefined> }, res: { statusCode: number; setHeader(k: string, v: string): void; removeHeader?(k: string): void; end(body: string): void }, next: () => void): void {
  const path = String(req.url ?? '/').split('?')[0].replace(/\/+$/, '') || '/';
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (path !== '/' && path !== '/api') return next();

  const card = buildRootIndex();
  const accept = String(req.headers?.accept ?? '');
  const wantsHtml = /text\/html|\*\/\*/.test(accept) && !/application\/json/.test(accept);
  res.statusCode = 200;
  res.setHeader('cache-control', 'no-store');
  if (wantsHtml) {
    // لوحة الحالة/المعاينة تُؤطّر الصفحة في iframe؛ بطاقة ثابتة بلا جلسة ولا نماذج فلا ضرر من ذلك،
    // بينما بقية المسارات تبقي DENY (واجهات الإدارة لا تُؤطَّر).
    res.removeHeader?.('X-Frame-Options');
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(renderRootHtml(card));
    return;
  }
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(card));
}
