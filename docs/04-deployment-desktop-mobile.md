# 04 — النشر والتشغيل: خادم المعمل، تطبيق Windows، تطبيق Android/iOS

> **حالة التحقق:** المسارات المميّزة بـ ✅ نُفِّذت فعلًا في بيئة تطوير (Node 20، PostgreSQL 18.4، Linux).
> المسارات المميّزة بـ ⚠️ جاهزة كملفات إعداد لكنها لم تُنفَّذ هنا: لا Docker ولا nginx ولا wine ولا
> Android SDK في هذه البيئة، فلا يجوز اعتبارها «مختبَرة». كل أمر مذكور هو نصّي من ملفات المستودع.

---

## 1. البنية النشرية

```
                 ┌────────────────────────────────────────────┐
   Android/iOS ◄─┤  بوابة nginx (443, TLS داخلي)              │
   (هاتف ميداني)  │   ├─ /api/*  → proxy → api:3000           │──► PostgreSQL 16+
  LAN/Wi-Fi     │   └─ /       → واجهة الويب (مراجعة)        │    (127.0.0.1:5432 فقط)
                 │  تطبيق sync/push-pull (cursor + idempotency)│    volume: pgdata
                 └────────────────────────────────────────────┘    + نسخة يومية pg_dump -Fc
   Windows desktop (Electron) ──► نفس العنوان /api ──► Dexie cache للعرض دون اتصال
   ZKTeco biometric ──► POST /v1/time/punches/import (شبكة داخلية)
```

**قراران يحدّدان الشكل:**
1. **الخادم داخل المعمل** (وليس سحابة عامة) لأن ميدان العمل بلا اتصال مستقر، ولأن بيانات الحضور
   والرواتب لا تخرج من الشبكة. إن وُجدت بوابة سحابية للمراجعة فقط، تُطبَّق نفس العقد عبر
   `PUBLIC_BASE_URL`.
2. **الهاتف لا يتصل بقاعدة البيانات أبدًا** — فقط بـ `/api` عبر عقد المزامنة (19 كيانًا).

---

## 2. خادم المعمل

### 2.1 المتطلبات

| بند | القيمة | ملاحظة |
|---|---|---|
| نظام | Ubuntu 22.04/24.04 LTS أو Windows Server 2022 | المستودع يفترض Linux + Docker |
| Node.js | 20.19+ (المستعمل في التحقق: 20.20) | NestJS 11 يتطلب ≥ 20 |
| PostgreSQL | 16+ (الصورة في compose: `postgres:16.6-alpine`؛ التحقق تم على 18.4) ✅ | يحتاج `pg_trgm`, `btree_gin`, `pgcrypto` |
| موارد | 4 نوى / 4 GB / SSD 200 GB | حدود `deploy/resources.limits` في compose |
| ساعة | **NTP إلزامي** على الخادم وأجهزة البصمة | حساب الوردية ±4 ساعات، و`Asia/Baghdad` +3 |

### 2.2 النشر بـ Docker Compose ⚠️

```bash
git clone https://github.com/sangoorvip1/newport-ms.git && cd newport-ms
cp deploy/.env.production.example .env
# عدّل في .env: POSTGRES_PASSWORD، JWT_SECRET (≥32 بايت عشوائي)، CORS_ORIGINS، PUBLIC_BASE_URL
openssl rand -base64 48 | tr -d '\n=' > /tmp/secret && sed -i "s#^JWT_SECRET=.*#JWT_SECRET=$(cat /tmp/secret)#" .env
mkdir -p deploy/nginx/certs        # newport.local.crt / newport.local.key (CA داخلي)

docker compose -f deploy/docker-compose.yml up -d postgres
docker compose -f deploy/docker-compose.yml run --rm api npx prisma migrate deploy
SEED_DEMO=false docker compose -f deploy/docker-compose.yml run --rm api npm run seed
docker compose -f deploy/docker-compose.yml up -d
```

ما يفعله `deploy/docker-compose.yml` (4 خدمات):
- **postgres** — `ports: 127.0.0.1:5432:5432` (لا تعريض للعامة)، `shared_preload_libraries=pg_stat_statements`،
  `log_min_duration_statement=500`، healthcheck بـ `pg_isready`.
- **api** — `command: sh -c "npx prisma migrate deploy && node dist/main.js"` (الترحيل عند الإقلاع)،
  `BCRYPT_ROUNDS=12`، `SITE_TZ=Asia/Baghdad`، حدود `SYNC_MAX_OPS/SYNC_MAX_ROWS=500`،
  ومخزن الوثائق `STORAGE_DRIVER=local` + `STORAGE_LOCAL_DIR=storage/documents` + `STORAGE_MAX_UPLOAD_BYTES=8388608`
  (المجلد معيَّن volume في compose؛ `minio`/`s3` مرفوضان صراحةً حتى يُضاف عميل الكائنات)،
  `SYNC_RETENTION_DAYS=45`، healthcheck على `/api/health/ready`.
- **nginx** — 80→443، TLS، `client_max_body_size 40m` للمرفقات، `limit_req_zone … rate=25r/s`،
  `root /usr/share/nginx/newport/desktop` لواجهة المكتب (نسخة الويب للمراجعة).
- **backup** — `pg_dump -Fc` كل 24 ساعة إلى volume `backups` مع `RETENTION_DAYS`.

### 2.3 النشر بلا Docker (bare metal) ✅ جزئيًا

```bash
sudo -u postgres createuser newport_app && sudo -u postgres createdb -O newport_app newport
export DATABASE_URL="postgresql://newport_app:***@127.0.0.1:5432/newport?schema=public"
npm ci
npm run build -w @newport/domain
npm run prisma:generate -w @newport/api
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
SEED_DEMO=false npm run seed -w @newport/api
npm run build -w @newport/api && node apps/api/dist/main.js
```

✅ هذه الأوامر بعينها هي ما شُغِّل في بيئة التطوير (مع فرق: القاعدة والدور المحليّان).
لا يوجد دور `newport_app` في القاعدة المطوَّرة هنا — أُنشئ عند النشر فقط.

**systemd (مُوصى به بلا Docker):**

```ini
# /etc/systemd/system/newport-api.service
[Unit]
Description=Newport API (BFC-L1)
After=network-online.target postgresql.service
Wants=network-online.target
[Service]
User=newport
WorkingDirectory=/opt/newport-ms/apps/api
EnvironmentFile=/etc/newport/api.env
ExecStart=/usr/bin/node dist/main.js
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/var/lib/newport
[Install]
WantedBy=multi-user.target
```

`/etc/newport/api.env`: `DATABASE_URL`, `JWT_SECRET`, `FACILITY_CODE=BFC-L1`, `SITE_TZ=Asia/Baghdad`,
`NODE_ENV=production`, `CORS_ORIGINS=https://ops.newport.local`, `PUBLIC_BASE_URL=https://ops.newport.local`,
`SEED_DEMO=false`. (أسماء المتغيرات مأخوذة حرفيًا من `apps/api/src/config.ts`.)

### 2.4 قواعد النشر والترحيلات

- **لا تُعدَّل جدول `_prisma_migrations` يدويًا.** إذا فشل ترحيل منتصفه فإن `migrate deploy`
  يبقى مسجَّلًا بـ P3009؛ الإجراء الآمن: استرجاع من نسخة احتياطية ثم إعادة `migrate deploy`.
  (هذا السيناريو حدث فعلًا أثناء التطوير وتم حلّه بإسقاط قاعدة التطوير وإعادة بنائها.)
- بعد **أي استيراد جماعي** (ترحيل من نظام قديم، إدخال صفوف بأرقام مستندية يدويًا):
  ```bash
  psql "$DATABASE_URL" -c 'SELECT * FROM fn_align_number_sequences();'
  ```
  الدالة تُعيد تسلسلات الأرقام (WO، عيّنات المختبر، التصاريح، الفواتير، القيود…) إلى ما بعد أعلى
  رقم موجود. بدونها يصطدم أول رقم مولَّد بصف مُهاجَر (`P2002 on work_orders.number`) — خطأ وُجد وأُصلح.
- **تنظيف سجل التغييرات** دوريًا (يُمنع حذف `audit_trails` — المؤجّل يرفض):
  ```bash
  psql "$DATABASE_URL" -c 'SELECT fn_archive_sync_log(45);'   # أيام الاحتفاظ = SYNC_RETENTION_DAYS
  ```
- **تحديث Views المادية** (4: تقارير backlog/MTBF/استهلاك/حضور) — كل 15 دقيقة في ساعات الدوام:
  ```bash
  psql "$DATABASE_URL" -c 'SELECT fn_refresh_reports();'
  ```

### 2.5 النسخ الاحتياطي والاسترجاع

```bash
pg_dump -Fc --no-owner -f /backups/newport-$(date -u +%Y%m%dT%H%M%SZ).dump newport
pg_restore --clean --if-exists -d newport /backups/newport-<ts>.dump   # استرجاع
```
- الاحتفاظ: 30 نسخة يومية + 8 أسبوعية (سياسة `BACKUP_RETENTION_DAYS`).
- نسخة واحدة شهريًا على قرص منفصل/خزنة (بيانات حضور ورواتب لا تُعوَّض).
- **اختبار استرجاع ربع سنوي إلزامي** — وثّق النتيجة في سجل الصيانة.

### 2.6 بوابات القبول بعد كل نشر ✅

```bash
curl -s https://ops.newport.local/api/health/ready
```
الناتج المرجوع في بيئة التطوير (نفس المطلوب بعد النشر):
```json
{"status":"ready","facility":"BFC-L1","checks":{"database":"ok",
 "organization":"3 dept / 13 sub-dept (reference: 3/13)",
 "rbac":"21/21 roles, 94/94 permissions","openConflicts":"0"}}
```
ثم:
- `GET /api/v1/org/drift` → `"isAligned":true` (الهيكل لا يزيد ولا ينقص عن المرجع).
- `GET /api/v1/org/permissions-verify` → `"inSync":true`, `expectedGrants=actualGrants=36`.
- `npm run e2e -w @newport/api` → **68/68** (دخان حيّ على HTTP: جلسة، قيد تغيير كلمة المرور،
  دورة أمر شغل، idempotency، حماية الحقول المعتمدة، pull، سجل تدقيق).

---

## 3. تطبيق سطح المكتب (Windows)

### 3.1 البناء

```bash
npm ci
npm run dist:win -w @newport/desktop      # = vite build + tsc electron + electron-builder --win nsis
# الناتج: apps/desktop/release/Newport BFC-L1 Setup 0.1.0.exe  (NSIS)
```
`apps/desktop/electron-builder.yml`: `appId: com.newport.desktop`، `productName: Newport BFC-L1`،
`win.target: nsis`، `nsis.oneClick: false`، `nsis.perMachine: true` (تثبيت لكل المستخدمين — مناسب
لأجهزة الصيانة المشتركة). ⚠️ البناء لنوافذ Windows يتطلب جهاز Windows أو wine + توقيع؛ لم يُنفَّذ هنا.

### 3.2 التهيئة الأولى (أي خادم يتصل به؟)

الأولوية في `apps/desktop/src/electron/main.ts`:
1. متغير البيئة `NEWPORT_API_URL`.
2. ملف `%APPDATA%\newport-desktop\config.json`:
   ```json
   { "apiBaseUrl": "https://ops.newport.local" }
   ```
3. الافتراضي `http://127.0.0.1:3000` (خادم على نفس الجهاز).

يضيف اللاحقة `/api` تلقائيًا (`apps/desktop/src/data/api.ts`). فحص الاتصال يتم بـ
`GET /api/v1/auth/health` بمهلة 1.5 ثانية قبل إظهار شاشة الدخول.

**نشر الإعداد على الأجهزة:** File Server/GPO Preferences أو Intune configuration file، لأن
`config.json` بسيط ونصّي؛ ولا يُخزَّن فيه أي رمز — الرموز في `safeStorage` (DPAPI).

### 3.3 التثبيت الصامت والتوزيع

```powershell
# GPO / Intune / PsExec
msiexec /i "\\filesrv\newport\Newport-BFC-L1-0.1.0.msi" /qn /norestart
```
- التوقيع: `electron-builder` يلتقط `CSC_LINK`/`CSC_KEY_PASSWORD` من البيئة (لا يُطبعان في السجل).
  بدون توقيع، SmartScreen سيحجب التثبيت أول مرة — اجعل سياسة الشراء: شهادة OV داخلية أو EV.
- التحديث التلقائي: أضف إلى `electron-builder.yml`
  ```yaml
  publish:
    provider: generic
    url: https://ops.newport.local/releases/desktop
  ```
  ثم انسخ ناتج `release/` (`latest.yml` + `Setup.exe` + `blockmap`) إلى ذلك المسار على خادم
  المعمل، وفعّل `electron-updater` في `main.ts` مع نافذة صيانة ليلية (23:30–05:00) لتجنّب
  إعادة تشغيل أثناء الوردية.

### 3.4 العمل دون اتصال في المكتب

- طبقة العرض تخزّن في **IndexedDB/Dexie**: أوامر شغل مرئية، قراءات حالة، آخر الهيكل التنظيمي.
- القراءة من الكاش مسموحة دائمًا؛ الكتابة من المكتب تُرسل مباشرة، وإن فشلت تُطابَر وتُعاد.
- حدود التشغيل تُعرض مع تنبيه «آخر مزامنة: <relative>» في شريط الحالة (SyncScreen).

---

## 4. تطبيق الهاتف (Android / iOS)

### 4.1 البناء للتوزيع الداخلي

```bash
npm ci
cd apps/mobile
npx expo install --check            # توافق إصدارات Expo/RN
eas build --platform android --profile preview     # APK للتوزيع الداخلي
eas build --platform android --profile production  # AAB لـ Play (إن رغبت)
eas build --platform ios --profile production      # يتطلب Apple Developer + fastlane
```
⚠️ لا EAS project ولا حساب Apple/Google مرتبط في هذه البيئة؛ الأوامر من `apps/mobile/package.json`
(`build:android`, `build:ios`) ومن `app.json`.

**معرّفات الحزمة** (من `apps/mobile/app.json`):
- Android: `com.newport.field` — أذونات: `CAMERA`, `ACCESS_FINE_LOCATION`, `INTERNET`, `READ_MEDIA_IMAGES`.
- iOS: `com.newport.field` — رسائل الاستخدام بالعربية للكاميرا والموقع.

### 4.2 الإعداد والتوزيع الفعلي داخل المعمل

1. **عنوان الخادم** يُضبط من شاشة الإعدادات داخل التطبيق (يُحفظ في secure storage بالمفتاح
   `apiBaseUrl`؛ الافتراضي `http://192.168.10.20:3000` — **عدّله** إلى بوابة المعمل).
2. `deviceId` يُولَّد مرة ويُخزَّن — هو محور `sync/push` و`sync/pull` و`devices.lastPullCursor`.
3. التوزيع: **مخطط Android الداخلي** (APK على File Server أو MDM مثل Hexnode/Intune) — لا حاجة
   لـ Play Store لعمالة المعمل. iOS عبر TestFlight (100 مستخدم خارجي/25 ألف داخلي) أو Enterprise.
4. MDM: عطّل Camera للمهام غير التشغيلية، وأبقِ «Work Profile» لفصل بيانات التطبيق، واضبط
   auto-update على الواي فاي فقط.

### 4.3 OTA (تحديث جافاسكريبت بلا متجر)

`app.json` مضبوط على `updates.url = https://updates.newport.local/mobile`. قبل الإنتاج:
```bash
eas update --channel production --platform all      # أو شغّل خادم updates داخليًا
```
وللعودة الآمنة اضبط `fallbackToCacheTimeout: 0` (مضبوط فعلًا) — إن فشل جلب التحديث يعمل التطبيق
من الحزمة الأصلية بدل أن يعلَق على شاشة سوداء. **تحذير:** تحديث JS لا يُغيّر `SCHEMA_VERSION`؛ إذا
تغيّر عقد المزامنة فأجب رفع `schemaVersion` في `packages/domain/src/sync.ts` وأصل النشر إلى إصدار
جديد، لأن الخادم يعيد 409 + `fullResyncRequired` عند عدم التطابق (سلوك موثّق في `sync.controller.ts`).

### 4.4 المزامنة في الميدان: سلوك متوقع

| حالة | ما يراه الفني |
|---|---|
| لا شبكة | الكتابة تُطابَر في SQLite؛ الواجهة تعمل من الجهاز بالكامل |
| عودة الشبكة | `POST /v1/sync/push` بدفعات ≤ `SYNC_MAX_OPS=500`؛ لكل عملية `opId` → إعادة الإرسال لا تكرّر التطبيق |
| حقل معتمد (status/approvedById/…) | الخادم لا يقبله: `outcome=MERGED` + `serverKeptFields` — يبقى الاعتماد للمكتب |
| تعارض إصدار (`baseVersion` مختلف) | `server_wins` للحقول المعتمدة، ويُفتح سجل في `sync_conflicts` يراه المخطط |
| فجوة cursor أو إصدار مخطط مختلف | 409 + `fullResyncRequired:true` → إعادة تحميل كاملة من `pull` |
| رمز الوصول منتهٍ (900 ثانية) | تجديد تلقائي عبر `/refresh`؛ لو استُعمل رمز قديم تُلغى عائلته كلها (كشف سرقة) |

**الفواصل:** 45 ثانية الوضع الافتراضي (`extra.syncIntervalSec` في `app.json`)، وفوري عند إنهاء أمر
شغل أو إرسال سجلوبة. لا خدمة خلفية دائمة على iOS: المزامنة عند فتح التطبيق أو وصول إشعار.

---

## 5. الأمان في الطبقة النشرية

- **لا منفذ قاعدة بيانات للعامة** (`127.0.0.1:5432` فقط في compose). الاتصال من الشبكة الداخلية
  عبر SSH/VPN إداري فقط.
- **حدّ معدل مزدوج:** `RateLimitGuard` في الخادم (`/v1/auth/login` 5 طلبات/دلو، `/refresh` 20،
  `/sync/push` 30، `/sync/pull` 60) + `limit_req_zone` في nginx (25r/s لكل IP).
  العداد في الذاكرة: لو شُغِّلت أكثر من نسخة API استبدله بـ Redis (ملف `rate-limit.guard.ts` موثّق).
- **قفل الحساب:** 5 محاولات فاشلة ⇒ 15 دقيقة (من `config.ts`: `MAX_LOGIN_ATTEMPTS`, `LOCKOUT_MINUTES`).
- **JWT_SECRET:** تغييره يُبطل كل الجلسات فورًا (الرموز موقعة به) — نفّذه في نافذة صيانة وأعلِم الورديات؛
  ولإبطال مستخدم واحد ارفع `users.version` (الحارس يطابق `v` مع `users.version`).
- **RLS + النطاق:** لا تعتمد على الفلترة في الواجهة؛ الطبقتان الأخريان في القاعدة والحارس.
- **sجلات الحضور/الرواتب:** لا تُصدَّر عبر nginx للعامة؛ إن لزم، منفذ إداري معزول + IP allowlist.
- **TLS داخلي:** CA خاص بالمعمل؛ الشهادات على `deploy/nginx/certs` (لا تُرفَع إلى Git — `*.crt/*.key`
  خارج التتبع). تطبيقات الهاتف: ثبّت شهادة الجذر على الأجهزة عبر MDM بدل `rejectUnauthorized:false`.
- **التدقيق غير قابل للتعديل:** `audit_trails` append-only بمؤجّل قاعدة (مُثبت: محاولة UPDATE تُرفض).
- **الحسابات المزروعة:** `mustChangePwd=true` + `Newport#2026`؛ الجلسة مقيّدة حتى التغيير (403 برسالة
  عربية) — لا تُعطَّل هذه القاعدة في الإنتاج، ولا تُزرع كلمات مرور جاهزة إلا لبيئة تجريبية (`SEED_DEMO=true`).

---

## 6. بيئة التطوير (ما شُغِّل فعلًا هنا) ✅

```bash
npm ci
node apps/api/scripts/dev-db.mjs                      # أو أي PostgreSQL محلي على 5432
export DATABASE_URL="postgresql://newport:newport@127.0.0.1:5432/newport?schema=public"
npm run build -w @newport/domain
npm run prisma:generate -w @newport/api
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
SEED_DEMO=true npm run seed -w @newport/api
npm run build -w @newport/api && (cd apps/api && node dist/main.js &)
API_URL=http://127.0.0.1:3000/api npm run e2e -w @newport/api   # 68/68
npm run test:all && npm run typecheck:all                        # 88 فحصًا + typecheck نظيف
```

**تنبيهات عملية ظهرت أثناء التطوير:**
- `DROP DATABASE newport WITH (FORCE)` وحده ينجح إذا أوقفت الـ API أولًا (الاتصالات الحيّة تمنع الإسقاط).
- لا تكتب أسماء جداول/أعمدة من الذاكرة: `prisma migrate diff` أو `information_schema` (الأعمدة camelCase
  مقبَّسة لأن `@@map` يغيّر أسماء الجداول فقط).
- `scripts/dev-db.mjs` مرفق لتسهيل التشغيل المحلي؛ إن كانت عندك قاعدة قائمة فالأفضل استعمالها مباشرة.
- بعد أي تعديل على `schema.prisma` أو `packages/domain`: `npm run docs:all -w @newport/api` ثم `npm run seed`.

---

## 7. قائمة تحقق نهائية قبل التسليم

| # | البند | كيف تتحقق |
|---|---|---|
| 1 | الهيكل التنظيمي مطابق (3/13) دون زيادة أو نقصان | `GET /api/v1/org/drift` → `isAligned:true` ✅ |
| 2 | RBAC مطابق للمصفوفة المولّدة | `GET /api/v1/org/permissions-verify` → `inSync:true` ✅ |
| 3 | الترحيلات مطبَّقة على قاعدة فارغة من الصفر | `prisma migrate deploy` بلا أخطاء ✅ |
| 4 | المزامنة تعمل من جهاز حقيقي/محاكي | `npm run e2e -w @newport/api` → 68/68 ✅ |
| 5 | لا تسريب لأسرار في المستودع | `git ls-files \| xargs grep -l "JWT_SECRET=***` → فارغ |
| 6 | النسخ الاحتياطي مُختبَر بالاسترجاع | `pg_restore` على خادم اختبار (ربع سنوي) |
| 7 | ساعة الخادم وأجهزة البصمة مضبوطة | `timedatectl` + `TZ=Asia/Baghdad` في كل الخدمات |
| 8 | تثبيت Windows موقّع ويشتغل على جهاز نظيف | تشغيل يدوي على جهاز مختبَر + SmartScreen لا يحجب |
| 9 | APK/AAB يعمل دون شبكة بعد التهيئة | وضع الطيران: إدخال سجلوبة + أمر شغل، ثم مزامنة بعد العودة |
| 10 | دليل المستخدم العربي مُسلَّم | على قائمة الانتظار — `docs/06-user-guide.md` |
