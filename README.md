# Newport MS — نظام إدارة معمل الأسمدة الجنوبية / الخط الأول

نظام متكامل (سطح مكتب + هاتف + خادم) لتشغيل وصيانة **معمل الأسمدة الجنوبية – الخط الأول** في البصرة
لشركة **Newport LP. LTD**، بواجهة عربية أولًا ومزامنة تعمل دون اتصال.

الهيكل التنظيمي مُنفَّذ حرفيًا كما هو مطلوب: **3 أقسام / 13 شعبة** —

| القسم | الشعب |
|---|---|
| قسم الإنتاج `PROD` | اليوريا `PROD-UREA`، الأمونيا `PROD-AMM`، أبراج التبريد `PROD-CT`، المختبر `PROD-LAB` |
| قسم الصيانة `MAINT` | المعدات الحرارية `MAINT-HEAT`، المعدات الدوارة `MAINT-ROT`، الكهرباء `MAINT-ELEC`، الصمامات `MAINT-VALVE`، الآلات الدقيقة `MAINT-INST`، المعدات العامة `MAINT-GEN` |
| الأقسام الإدارية `ADMIN` | البصمة `ADM-BIO`، الشعبة التجارية `ADM-COM`، الشعبة المالية `ADM-FIN` |

التوسعة لخط ثانٍ/ثالث لا تغيّر الكود: تتم عبر جدول `facilities` و`facilityId` على كل صف.

---

## التقنيات

| الطبقة | الاختيار |
|---|---|
| الخادم | NestJS 11 + Prisma 6.19 + PostgreSQL 16/18، TypeScript 5.9، Zod 4 |
| سطح المكتب (Windows) | Electron 44 + React 19 + Vite 8 + Dexie (IndexedDB) للعمل دون اتصال |
| الهاتف (Android/iOS) | React Native + Expo، SQLite على الجهاز + نفس طبقة المزامنة المشتركة |
| المزامنة | عقد v3: `push/pull/batch-plan`، cursor تسلسلي، idempotency بـ `opId`، حل تعارض `server_wins` للحقول المعتمدة |
| الأمان | JWT قصير العمر + refresh دوري بعائلات قابلة للإلغاء، RBAC + ABAC (نطاق SELF/TEAM/SUBDEPT/DEPT/ALL)، RLS في القاعدة كطبقة ثالثة |

**البديل المذكور في الوثائق فقط:** ‎.NET 8 / WPF + MAUI — لم يُنفَّذ ولا يمكن التحقق منه في بيئة التطوير هنا.

---

## مخطط المستودع

```
packages/domain/     الطبقة المشتركة: الهيكل، الصلاحيات، آلة حالة أمر الشغل، عقد المزامنة، DTO
apps/api/            NestJS: auth/security، organization، workorder، production، lab، sync، time، audit
apps/api/prisma/     schema.prisma + migrations/ + seed.ts (23 مستخدمًا + المرجع التنظيمي)
apps/desktop/        Electron + React (تسجيل دخول، أوامر شغل، دوام، شجرة الهيكل، مزامنة)
apps/mobile/         Expo/React Native (مناوبة، مهام ميدانية، طابور دون اتصال)
deploy/              docker-compose + nginx + تحضيرات النسخة المثبتة
docs/                01 التقنية · 02 مخطط القاعدة · 03 الميزات والصلاحيات · 04 النشر · 05 البنية + generated/
```

---

## التشغيل محليًا

```bash
npm ci
# قاعدة PostgreSQL (16 أو 18) متاحة على المنفذ 5432:
createdb newport && export DATABASE_URL="postgresql://newport:newport@127.0.0.1:5432/newport?schema=public"

npm run build -w @newport/domain
npm run prisma:generate -w @newport/api
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma   # الترحيل الأساسي + طبقة المزامنة/RLS
SEED_DEMO=true npm run seed -w @newport/api                        # المرجع التنظيمي + 23 مستخدمًا
npm run build -w @newport/api && npm run start -w @newport/api     # http://127.0.0.1:3000/api
```

المتغيرات الأساسية في `apps/api/.env` (انظر `deploy/.env.production.example`):
أسماء المتغيرات كما هي في `apps/api/src/config.ts` (لا أسماء تقريبية):
`DATABASE_URL`, `JWT_SECRET`, `JWT_ACCESS_TTL_SEC`, `REFRESH_TTL_DAYS`, `BCRYPT_ROUNDS`, `FACILITY_CODE=BFC-L1`,
`SITE_TZ=Asia/Baghdad`, `CORS_ORIGINS`, `PUBLIC_BASE_URL`, `SYNC_MAX_OPS`, `SYNC_MAX_ROWS`, `SYNC_RETENTION_DAYS`,
`STORAGE_DRIVER`, `MAX_LOGIN_ATTEMPTS`, `LOCKOUT_MINUTES`.

الحسابات المزروعة: كلمة المرور الافتراضية `Newport#2026` مع `mustChangePwd=true`
(الجلسة تكون **مقيّدة** حتى تغيّر كلمة المرور — يُسمح بمسارات الحساب وتغيير كلمة المرور فقط).
أمثلة: `sysadmin`، `plant.manager`، `heat.head`، `heat.tech`، `urea.head`، `lab.analyst`، `biometric`، `hse`، `planner`.

---

## ما تم التحقق منه فعليًا (على PostgreSQL حيّ + خادم يعمل)

فوق كل ما يلي مُنفَّذ في هذه البيئة، لا على الورق:

```bash
npm run test:all          # domain 51 · api 32 (منها 5 على قاعدة حيّة) · mobile 8  = 91 فحصًا
npm run typecheck:all     # domain · api · desktop (renderer+electron) · mobile — بلا أخطاء
npm run docs:all -w @newport/api   # مصفوفة الوصول + docs/03 + DDL + كتالوج المخطط (كلها مشتقة من الكود)
npm run e2e -w @newport/api   # 37/37 فحص HTTP حيّ
```

- `GET /api/health/ready` → `{"database":"ok","organization":"3 dept / 13 sub-dept (reference: 3/13)","rbac":"21/21 roles, 91/91 permissions","openConflicts":"0"}`
- `GET /v1/org/drift` → `isAligned:true` (لا زيادة ولا نقصان عن الهيكل المرفق)
- `GET /v1/org/permissions-verify` → `expectedGrants:36 = actualGrants:36`
- دورة أمر الشغل: إنشاء 201 برقم من تسلسل القاعدة (`WO-2026-0000NN`)، انتقال غير قانوني ⇒ 409،
  صلاحية التنفيذ تمنع الفني من الإنشاء ⇒ 403، وحماية الحقول المعتمدة عند `push` (الخادم يحتفظ بـ `status`).
- المزامنة: `push` idempotent (رد مؤرشف مطابق)، `pull` بمؤشر تسلسلي، `protocol` يعرض 19 كيانًا.
- التدقيق: `audit_trails` append-only بمؤجّل قاعدة، وكل صف في change-log مختوم بـ `syncSeq`.
- عقد الأخطاء: `4xx` برسالة عربية + حقول الحارس (`required`/`yourGrants`)، و`5xx` بـ `errorId` بلا تسريب تفاصيل القاعدة.
- المخالجات المكتشفة أثناء التحقق الحيّ أُصلحت ولها فحوص تمنع عودتها (`docs/05` §10).

**غير متحقق هنا:** ملفات Docker/nginx وأدوات .NET (لا توجد في بيئة التطوير) — مذكورة كنماذج إعداد جاهزة للنشر.

---

## الوثائق

| ملف | المحتوى |
|---|---|
| `docs/01-tech-stack.md` | Stack + قرار قاعدة البيانات + استراتيجية المزامنة سطح المكتب ↔ الهاتف |
| `docs/02-database-schema.md` | المخطط الكامل: الجداول والحقول والعلاقات والقيود ومؤجّلات المزامنة و RLS |
| `docs/03-features-and-permissions.md` | ميزات وصلاحيات كل قسم وشعبة (المطلوب الثالث) |
| `docs/04-deployment-desktop-mobile.md` | النشر: خادم المصنع،تعبئة Windows (MSI/portable)، نشر Android/iOS، التحديث التلقائي، النسخ الاحتياطي |
| `docs/05-architecture.md` | البنية البرمجية والوحدات وأنماط التنفيذ والاختبار — جاهزة للبدء المباشر |
| `docs/generated/` | مولَّد من المخطط: `schema.postgres.sql`، `schema.catalog.md` (85 نموذجًا/25 enum)، مصفوفة الصلاحيات |

> `docs/generated/` يُعاد توليده بعد أي تعديل على `schema.prisma` أو `packages/domain`:
> `npm run docs:all -w @newport/api`
