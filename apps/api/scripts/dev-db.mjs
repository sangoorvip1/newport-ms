/**
 * يرفع PostgreSQL محليًا (embedded-postgres) لتنفيذ الترحيلات والتحقق منها على محرك حقيقي.
 * الاستخدام: node scripts/dev-db.mjs
 *  - databaseDir = apps/api/.pgdata (غير متتبَّع) — المنفذ 54329 على 127.0.0.1 فقط
 *  - ينشئ المستخدم/القاعدة `newport` إن لم يكونا موجودين
 * ملاحظة: أداة تطوير/تحقق فقط؛ الإنتاج = postgres:16-alpine في deploy/docker-compose.yml
 */
import Postgres from 'embedded-postgres';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const apiRoot = join(here, '..');
const dataDir = join(apiRoot, '.pgdata');
mkdirSync(dataDir, { recursive: true });

const PORT = 54329;
const pg = new Postgres(dataDir, {
  user: 'postgres',
  password: 'postgres',
  database: 'newport',
  port: PORT,
  initdbFlags: ['--encoding=UTF8', '--no-sync'],
  postgresFlags: [
    '-c', 'fsync=off',
    '-c', 'synchronous_commit=off',
    '-c', 'full_page_writes=off',
    '-c', 'listen_addresses=127.0.0.1',
    '-c', 'max_connections=80',
    '-c', 'shared_buffers=256MB',
  ],
  onLog: (line) => process.stdout.write(`[pg] ${String(line).trim()}\n`),
  onError: (line) => process.stderr.write(`[pg!] ${String(line).trim()}\n`),
});

console.log(`→ embedded postgres (data: ${dataDir})`);
await pg.initialise();
await pg.start();

const admin = await pg.getPgClient();
await admin
  .query(`CREATE ROLE newport LOGIN SUPERUSER PASSWORD 'newport'`)
  .catch((e) => console.log('· role newport:', e.message.split('\n')[0]));
await admin
  .query(`CREATE DATABASE newport OWNER newport`)
  .catch((e) => console.log('· db newport:', e.message.split('\n')[0]));
await admin.end().catch(() => {});

console.log(`READY DATABASE_URL=postgresql://newport:newport@127.0.0.1:${PORT}/newport?schema=public`);
console.log('Ctrl-C للإيقاف');

process.on('SIGINT', async () => {
  await pg.stop().catch(() => {});
  process.exit(0);
});
await new Promise(() => {});
