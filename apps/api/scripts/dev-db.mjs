/**
 * يرفع PostgreSQL محليًا (embedded-postgres) لتنفيذ الترحيلات والتحقق منها على محرك حقيقي.
 * الاستخدام: node scripts/dev-db.mjs
 *  - databaseDir = apps/api/.pgdata (غير متتبَّع) — المنفذ 54329 على 127.0.0.1 فقط
 *  - ملاحظة API: `embedded-postgres` يقبل كائن خيارات واحدًا (لا مجلد + خيارات)؛ التمرير الخاطئ
 *    كان يُسقط port/databaseDir صامتًا فتشتغل القاعدة على 5432 وفي ./data/db خارج gitignore
 *  - ينشئ المستخدم/القاعدة `newport` إن لم يكونا موجودين
 *  - يعمل في المقدمة (لا ينتهي): شغّله في طرفية مستقلة أو `&`
 * ملاحظة تسمية: `server` لمحرّك embedded-postgres و`pg` لمكتبة العملاء — لا يتصادمان
 * ملاحظة: أداة تطوير/تحقق فقط؛ الإنتاج = postgres:16-alpine في deploy/docker-compose.yml
 */
import Postgres from 'embedded-postgres';
import pg from 'pg';
import { existsSync, mkdirSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const apiRoot = join(here, '..');
const dataDir = join(apiRoot, '.pgdata');
mkdirSync(dataDir, { recursive: true });

const PORT = 54329;

/**
 * محرّك embedded-postgres يأتي بمكتباته الخاصة (libicuuc.so.60…) في حزمة @embedded-postgres/linux-x64.
 * على بعض الصور (Debian 13 مثلًا: ICU 76 فقط) يفشل initdb بـ "error while loading shared libraries"،
 * فيُضاف مسار الحزمة إلى LD_LIBRARY_PATH — بلا هذا السطر لا يشتغل النص على نسخة مستنسخة حديثًا.
 */
const bundledLib = join(here, '..', '..', '..', 'node_modules', '@embedded-postgres', 'linux-x64', 'native', 'lib');
if (existsSync(bundledLib)) {
  process.env.LD_LIBRARY_PATH = [process.env.LD_LIBRARY_PATH, bundledLib].filter(Boolean).join(':');
  // الحزمة تكتب libicuuc.so.60.2 بلا رابط SONAME (libicuuc.so.60) ⇒ initdb يفشل بالتحميل.
  // نصنع الروابط عند الحاجة: الأمر واحد على أي جهاز تطوير بدل تعليمات «أنشئ الروابط بيدك».
  for (const base of ['libicuuc', 'libicui18n', 'libicudata']) {
    const full = join(bundledLib, `${base}.so.60.2`);
    const soname = join(bundledLib, `${base}.so.60`);
    if (existsSync(full) && !existsSync(soname)) {
      try {
        symlinkSync(`${base}.so.60.2`, soname);
      } catch {
        /* قرص للقراءة فقط: نفشل لاحقًا برسالة initdb الواضحة بدل الصمت */
      }
    }
  }
}
const server = new Postgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  database: 'newport',
  port: PORT,
  initdbFlags: ['--encoding=UTF8', '--no-sync'],
  postgresFlags: [
    '-c', 'fsync=off',
    '-c', 'synchronous_commit=off',
    '-c', 'full_page_writes=off',
    '-c', `listen_addresses=127.0.0.1`,
    '-c', 'max_connections=80',
  ],
  onLog: (line) => console.log(String(line).trimEnd()),
});

console.log(`→ embedded postgres (data: ${dataDir})`);
// initdb يرفض مجلدًا غير فارغ: بلا هذا الشرط كان النص يموت عند كل إقلاع ثانٍ بعد أول تهيئة
// (أي بعد إعادة تشغيل الجهاز مباشرة)، بينما النص مدعوّ ليُعاد تشغيله لا ليُنشئ من جديد.
const freshCluster = !existsSync(join(dataDir, 'PG_VERSION'));
if (freshCluster) await server.initialise();
else console.log('· عنقود موجود — تُخطى التهيئة ويبدأ التشغيل مباشرة');
await server.start();

// التهيئة بموكل pg مباشر على قاعدة postgres: getPgClient() يحاول الاتصال بالقاعدة الهدف
// (newport) التي لم تُنشأ بعد، فيتوقف النص بلا رسالة — وهذا ما عطّل التحقق على نسخة جديدة.
const admin = new pg.Client({ host: '127.0.0.1', port: PORT, user: 'postgres', password: 'postgres', database: 'postgres' });
await admin.connect();
for (const sql of [`CREATE ROLE newport LOGIN SUPERUSER PASSWORD 'newport'`, `CREATE DATABASE newport OWNER newport`]) {
  await admin.query(sql).catch((e) => console.log('·', sql.slice(0, 22), '→', e.message.split('\n')[0]));
}
await admin.end().catch(() => {});

console.log(`READY DATABASE_URL=postgresql://newport:newport@127.0.0.1:${PORT}/newport?schema=public`);
console.log('Ctrl-C للإيقاف');

process.on('SIGINT', async () => {
  await server.stop().catch(() => {});
  process.exit(0);
});
await new Promise(() => {});
