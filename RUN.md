# كيف تُشغّل النظام — دليل التشغيل (RUN)

> أربع مسارات: **(1) تجربة سريعة على جهاز واحد**، **(2) تطبيق المكتب كنافذة Windows**،
> **(3) تطبيق الميدان على هاتف**، **(4) نشر المعمل للإنتاج**.
> كل أمر هنا من `package.json` الحالي (رأس `main`)، وليس وصفًا نظريًا.
> الأرقام المذكورة مقاسة على `fb6adba`: **150** فحص وحدة · **74/74** فحص دخان حيّ · typecheck نظيف.

---

## 0) ماذا تُشغّل بالضبط (٤ حِزَم)

| الحزمة | ما هي | المنفذ الافتراضي | أمر التشغيل |
|---|---|---|---|
| `@newport/api` | NestJS + Prisma + PostgreSQL — كل منطق العمل والمزامنة | `3000`، البادئة `/api` | `npm run start:dev -w @newport/api` |
| `@newport/desktop` | React 19 + Vite، يغلّفه Electron لـ Windows | `5173` للتطوير في المتصفح | `npm run dev -w @newport/desktop` |
| `@newport/mobile` | Expo / React Native (Android + iOS)، SQLite محليًا | `8081` (Metro) | `npm run start -w @newport/mobile` |
| `@newport/domain` | عقود مشتركة (DTO/أدوار/مصفوفة صلاحيات/طابور الوثائق) | — | `npm run build -w @newport/domain` |

⚠️ **رتبة البناء مهمة**: `@newport/domain` يُبنى أولًا، وإلا فشل typecheck/بناء العميلين (لا يوجد `dist` للـdomain).

---

## 1) وضع التطوير: النظام كاملًا على جهاز واحد

### 1.1 التثبيت (مرة واحدة)

```bash
git clone https://github.com/sangoorvip1/newport-ms.git && cd newport-ms
npm install                       # يثبّت حِزَم العمل الأربع من الجذر (npm workspaces)
npm run build -w @newport/domain  # ضروري قبل أي تشغيل للعملاء
```

> على جهازك استعمل `npm install` العادي (بدون `--ignore-scripts`) حتى ينزّل ثنائي Electron.
> في CI أو في حاويات تُستعمل `npm install --ignore-scripts` ثم `npx prisma generate`
> يدويًا — وهذا ما فُعل في بيئة التطوير هنا، لذا لم يكن Electron قابلًا للتشغيل فيها.

### 1.2 قاعدة البيانات

إما Postgres 16+ عندك (مستخدم + قاعدة باسم `newport`)، أو القاعدة المضمّنة التي تأتي مع المشروع:

```bash
node apps/api/scripts/dev-db.mjs      # تبقى هذه الطرفية مفتوحة (العملية لا تنتهي)
# يطبع: READY DATABASE_URL=postgresql://newport:newport@127.0.0.1:54329/newport?schema=public
```

- البيانات في `apps/api/.pgdata/` (غير متتبَّع)، والمنفذ `54329` على `127.0.0.1` فقط.
- لإعادة البدء من الصفر: `rm -rf apps/api/.pgdata` ثم أعد الأمر السابق.
- السكريبت يرّمم بنفسه روابط `libicu*.so.60` الناقصة في ثنائيات Postgres المضمّنة.

### 1.3 المخطّط ثم البذر

```bash
export DATABASE_URL="postgresql://newport:newport@127.0.0.1:54329/newport?schema=public"
npm run db:generate -w @newport/api                                   # prisma generate
(cd apps/api && npx prisma migrate deploy)                            # 87 جدولًا، 45 trigger، RLS
SEED_DEMO=true npm run db:seed -w @newport/api
```

البذر يطبع العدّادات التي يجب أن تراها (أي رقم آخر = مخطط مختلف):
`3 منشآت/13 شعبة/21 دورًا · 94 رمز صلاحية · 36 ربط شعبة×دور · 404 ربط دور×صلاحية · 23 مستخدمًا · 13 sequence`

### 1.4 تشغيل الـAPI وتحقّق أولي

```bash
npm run start:dev -w @newport/api        # أو: npm run build -w @newport/api && (cd apps/api && node dist/main.js)
```

في طرفية أخرى:

```bash
curl -s localhost:3000/api/health        # {"status":"ok",...}
curl -s localhost:3000/ | head -c 400    # بطاقة تعريف الخدمة (JSON)
xdg-open http://localhost:3000/          # نفس البطاقة كصفحة عربية RTL في المتصفح
```

`GET /` تعمد أن تكون «بطاقة خدمة» لا واجهة: **لا صفحة دخول ولا لوحة هنا** — الواجهتان تطبيقان مستقلان.

### 1.5 الواجهة المكتبية (سريعًا في المتصفح)

```bash
npm run dev -w @newport/desktop          # http://localhost:5173
```

`vite.config.mts` يمرّر `/api` إلى `http://127.0.0.1:3000` (قابل للتعديل بـ`NEWPORT_API_URL`)،
لذا لا حاجة لأي ضبط CORS في هذا الوضع. للمراجعة من جهاز آخر أضف `NEWPORT_DEV_ALLOW_ANY_HOST=1`
(يفتح `server.allowedHosts` في وضع التطوير فقط، ولا يمسّ `vite build`).

**الدخول**: أي حساب مبذور / `Newport#2026`. السلوك المقاس لأول جلسة: تسجيل الدخول ينجح `201`، ثم أول
استدعاء عمل يعيد `403` مع `changePasswordRequired: true` حتى تغيير كلمة المرور عبر
`POST /api/v1/auth/change-password`؛ `/api/v1/auth/me` ومسار التغيير مسموحان داخل الجلسة المقيدة —
الحارس هو من يفرض ذلك لا `login`، عمّدًا حتى يستطيع مستخدم مزروع تغيير كلمته. في تطبيق المكتب
هذا غير مرئي كمفاجأة: `LoginScreen.tsx` يقرأ `mustChangePwd` من `/auth/me` ويعرض `ChangePasswordScreen`
مباشرة (الحالة `restricted`).

> `apps/api/.env.example` هو قالب للإعدادات؛ الدليل أعلاه يصدّر المتغيرات صراحةً لأن هذا ما قِيس به.

---

## 2) تطبيق Windows كنافذة فعلية (Electron)

```bash
# طرفية 1
npm run dev -w @newport/desktop
# طرفية 2
VITE_DEV_SERVER_URL=http://localhost:5173 npm run start -w @newport/desktop
```

- **حزمة قابلة للتوزيع (على Windows):** `npm run dist:win -w @newport/desktop` → مثبّت NSIS من `electron-builder.yml`.
- **إلى أي خادم يتصل؟** بالترتيب: `NEWPORT_API_URL` ثم `<userData>/config.json` (`{"apiBaseUrl":"https://gate.plant.local"}`) ثم الافتراضي في `docs/04 §3.2`.
- الوضع المحفوظ (offline) يعمل عبر Dexie/IndexedDB؛ المزامنة تُدفَع في كل دورة، والمرفقات المعلّقة في طابور `pendingDocuments`.

---

## 3) تطبيق الميدان على هاتف

```bash
npm run start -w @newport/mobile         # Expo؛ امسح QR بتطبيق Expo Go
```

1. اشترط الشبكة: الهاتف والـAPI على نفس الشبكة، أو نفق: `adb reverse tcp:3000 tcp:3000` (Android عبر USB).
2. من شاشة الإعدادات داخل التطبيق: **عنوان الخادم** — يُحفظ في SecureStore تحت المفتاح `apiBaseUrl`
   (الافتراضي في الكود `http://192.168.10.20:3000` — عدّله إلى عنوان خادمك فعليًا).
3. الأدوار الميدانية تناسبها `heat.tech` أو `lab.analyst`.
4. `expo-image-picker`/`expo-file-system` غير مربوطَين بعد بواجهة الالتقاط (البايتات تُمرَّر يدويًا حاليًا)؛
   العقد جاهز: `attachPhoto` → `{ok,id,reasonAr?}` والطابور يعيد المحاولة بمعرّف uuid v7 محلي.

**بناء قابل للتوزيع:** `npm run build:android -w @newport/mobile` / `build:ios` (يتطلب EAS login وحسابًا).

---

## 4) نشر المعمل (الإنتاج)

التفصيل الكامل في `docs/04-deployment-desktop-mobile.md` (بنية §1، خادم المعمل §2 بما فيه Docker §2.1 وبلا Docker §2.3 مع `systemd`، الترحيلات §2.4، النسخ الاحتياطي §2.5، بوابات القبول §2.6، سطح المكتب §3، الهاتف §4، الأمان §5).

الحد الأدنى لأي تشغيل حيّ:

```
.env (أو systemd Environment=):
  DATABASE_URL, JWT_SECRET (≥32 بايت عشوائي), SITE_TZ=Asia/Baghdad
  STORAGE_DRIVER=local | minio | s3,  STORAGE_LOCAL_DIR=/var/lib/newport/documents
  STORAGE_MAX_UPLOAD_BYTES, CORS_ORIGINS (مصادر الواجهات فقط)
nginx: 80→443، client_max_body_size 40m (وإلا 413 من nginx لا من التطبيق)
Postgres: 16+، pg_dump يوميًا + نسخة من مجلد الوثائق (الوثائق ليست في القاعدة!)
```

بعد كل نشر: `npm run e2e -w @newport/api` مقابل الخادم الحيّ → **74/74** هو خط القبول.

---

## 5) حسابات البذر (للتجربة فقط)

| حساب | يغطي | صلاحية نموذجية |
|---|---|---|
| `plant.manager` | القسم كاملًا | اعتماد أوامر الشغل، تقارير |
| `heat.head` / `heat.tech` | شعبة المعدات الحرارية | قراءة شعبة/كتابة فريق؛ **`heat.tech` يرفع المرفقات** |
| `lab.analyst` / `lab.head` | المختبر | إدخال النتائج / تصديق على مستوى القسم |
| `urea.head` | إنتاج اليوريا | دورة اليوريا |
| `sysadmin` | التقنية | إدارة المستخدمين — **لا يرفع مرفقات** (لديه `doc.manage` فقط) |

كلمة المرور الموحّدة: `Newport#2026` (تُستبدل بـ`SEED_DEFAULT_PASSWORD=...` قبل البذر). كل حساب يبذله
النص يُخزَّن بـ`mustChangePwd=true`، وينطفئ العلم لذلك الحساب وحده بعد التغيير.
السياسة: تغيير إلزامي أول دخول، قفل 5 محاولات/15 دقيقة، JWT صلاحية 15 دقيقة مع `v` لإبطال فوري.

---

## 6) بوابة الفحص السريعة (شغّلها قبل أي تسليم)

```bash
npm run test:all        # 150 فحصًا (domain 82 · api 60 · mobile 8)
npm run typecheck:all   # 4 حِزَم، 0 أخطاء
npm run e2e -w @newport/api       # يتطلب API + قاعدة حيّين: API_URL=http://127.0.0.1:3000/api
npm run docs:all -w @newport/api  # يولّد docs/03 وschema — «بدون انحراف» شرط قبول
```

مع `DATABASE_URL` مضبوطًا تُنفَّذ فحوص الـAPI على قاعدة حقيقية (56/56)؛ بدونها تُتخطَّى 4 فحوص تحتاج قاعدة (integration).

---

## 7) إذا تعثّر التشغيل — حالات مقاسة سابقًا

| العَرَض | السبب والعلاج |
|---|---|
| `Cannot GET /` | كان نقصًا، عُولج ببطاقة الجذر (`fb6adba`). الآن `Cannot GET /api/x` تعني أن المسار غير موجود أو ضاعفت البادئة (`/api/api/...`). |
| سلوك قديم رغم تعديل الكود | عملية خلفية تخدم من `dist` قديم: أعد `npm run build -w @newport/api` ثم أعيد التشغيل (لا يشغّل `src`). |
| `P2002` على `work_orders.number` / `SMP-...` | تسلسل أرقام خلف الصفوف المبذور: `SELECT fn_align_number_sequences();` |
| `403 changePasswordRequired` | متوقع في أول جلسة على حساب مبذور؛ غيّر الكلمة عبر `POST /api/v1/auth/change-password`. الجلسة تُقبل، والمسارات غير الحسابية تُرفض حتى التغيير. |
| `409` على انتقال حالة | مصمم كذلك: أوامر الشغل تمرّ بدورة مقفلة (DRAFT→SUBMITTED→…) ولا تُقفَز حالة. |
| `413` على رفع مرفق | من `client_max_body_size` في nginx أو من `STORAGE_MAX_UPLOAD_BYTES` — الأول لا يظهر في سجل التطبيق. |
| `403` عند إرفاق وثيقة بحساب `sysadmin` | مصمم: الكتابة تتطلب `doc.upload`؛ استخدم `heat.tech`. |
| قاعدة لم تُنشأ / معلّق عند البداية | `embedded-postgres` يستقبل **كائن خيارات واحدًا** (`databaseDir`, `port`)، و`getPgClient()` لا ينشئ قاعدة مفقودة — السكريبت يستخدم `pg.Client(database:'postgres')`. |
| 500 عند إرجاع أرقام كبيرة | `installBigIntJson()` يجب أن يبقى مثبَّتًا في `main.ts`. |
