# 05 — البنية المعمارية للمشروع (جاهزة للتنفيذ المباشر)

> كل ما هنا مأخوذ من الملفات الموجودة فعلًا في المستودع، وقد شُغِّل على خادم حقيقي + PostgreSQL حيّ.
> عند التعارض بين هذه الوثيقة والكود، فالملفات المرجعية هي: `packages/domain/src/*` (العقود)،
> `apps/api/prisma/schema.prisma` (البيانات)، `apps/api/src/security/access.guard.ts` (التفويض).

---

## 0. ثلاثون دقيقة للإلمام بالمشروع

| # | اقرأ | لماذا |
|---|---|---|
| 1 | `packages/domain/src/org.ts` | الهيكل المرجعي: 3 أقسام / 13 شعبة، و`fieldWork` يحدد وضع الميدان في الهاتف |
| 2 | `packages/domain/src/permissions.ts` · `roles.ts` | 94 صلاحية، 21 دورًا، مصفوفة منح شعبة×دور، والدالة `resolveGrants()` |
| 3 | `packages/domain/src/sync.ts` | عقد المزامنة: `SCHEMA_VERSION=3`، 19 كيانًا، `SYNC_META` (جدول/دمج/حقول محمية) |
| 4 | `apps/api/src/security/access.guard.ts` | كيف يُقيَّم الطلب: JWT ← كاش الصلاحيات ← الإصدار ← القيد ← الصلاحية ← النطاق |
| 5 | `apps/api/src/sync/sync-engine.service.ts` | `push` (idempotency + بوابة + دمج حقلي) و`pull` (cursor) |
| 6 | `apps/api/prisma/migrations/20260907000001_*/migration.sql` | طبقة القاعدة: تسلسلات، مؤجّلات، RLS، views، دوال صيانة |
| 7 | `packages/domain/src/client.ts` | منطق العميل المشترك (طابور، دفعات، إعادة محاولة، full resync) |

---

## 1. القرارات المعمارية الكبرى

| القرار | البديل المرفوض | السبب |
|---|---|---|
| **Monorepo بحزمة نطاق مشتركة** (`packages/domain`) بدل نسخ العقود | عقد مكرر في كل عميل | نفس آلة الحالة/الصلاحيات/المزامنة تعمل في الخادم والواجهة والموبايل والاختبارات؛ لا انحراف سلوكي |
| **Modular monolith** في `apps/api` | Microservices | فريق صغير، شبكة مصنع، معاملة واحدة تجمع أمر الشغل + السجل + التدقيق؛ الفصل لاحقًا ممكن لأن التواصل بين الطبقات عبر الخدمات فقط |
| **PostgreSQL وحده** (لا Mongo/SQL Server) | قاعدة لكل عميل | يحتاج: RLS، مؤجّلات AFTER لدفعة تغييرات، `gen_random_uuid`، مادية views، تسلسلات أرقام مستندية، `pg_trgm` لبحث عربي |
| **Hybrid: خادم داخل المعمل + بوابة** | سحابة عامة فقط | الحقل يفقد الشبكة؛ بيانات الحضور/الرواتب لا تخرج؛ لكن العقد نفسه يعمل خلف أي `PUBLIC_BASE_URL` |
| **Offline-first في الطرفين** (Dexie / SQLite) + pull/push دلتا | اتصال مباشر بقاعدة البيانات | 80+ فني/مهندس، مناطق ميتة الشبكة، وتحويل الوردية لا يحتمل انتظار HTTP |
| **`version` + `syncSeq` + `deletedAt` على كل جدول متزامن** | Soft-delete بجدول منفصل | يتحقق optimistic concurrency، ويُنشئ دفعة تغييرات موحّدة، ويتيح حذفًا ناعمًا قابلًا للمزامنة |
| **RBAC + ABAC بنطاق + RLS** | RBAC فقط | «رئيس الشعبة يرى شعبته» قرار بيانات لا دور؛ ثلاث طبقات لأن أي ثغرة في طبقة لا تسقط البقية |
| TypeScript 5.9 / Nest 11 / Prisma 6.19 / React 19 / Expo | أحدث الإصدارات الكبرى | تثبيتات مدققة (انظر `docs/01`)؛ تجنّب Prisma 7 / Nest 12 / TS 7 لأن سلوك الترحيل و`generate` تغيّر فيها |

**ملاحظة عن البديل ‎.NET‎:** ورد في `docs/01` كخيار مكافئ (WPF + MAUI + EF Core). لم يُنفَّذ ولا يمكن التحقق منه هنا
(لا dotnet SDK في بيئة التطوير)، فهو وثيقة قرار لا أساس تنفيذي.

---

## 2. حدود الاعتمادية (Dependency rules)

```
                    ┌──────────────── packages/domain ───────────────┐
                    │  org · permissions · roles · matrix · perm      │  لا استيرادات داخلية من apps/*
                    │  workorder (FSM) · sync · dto · attendance      │  ولا اعتماد على Nest/Prisma
                    │  client (منطق العميل المشترك)                    │
                    └───────▲───────────────────▲─────────────────────┘
                            │                   │
        apps/api/src/** ────┘                   └──── apps/desktop/src/** , apps/mobile/src/**
        (يستخدم العقود + Zod DTOs)                    (نفس العقود + نفس عميل المزامنة)

        داخل apps/api:  controller → service → PrismaService → DB
                        لا controller يستورد controller، ولا service يستورد controller.
```

قواعد مطبَّقة فعليًا ويكشفها `typecheck:all`:
- `packages/domain` **صفر** اعتماد على Nest/Prisma/Express (يعمل في المتصفح وفي RN كما في Node).
- كل DTO مشترك يصدَّر بنمطين: `zod schema` (تحقق في الحدّ) + `type` مستنتج (`z.infer`) ليُستهلك في الواجهات.
- الواجهات لا تعرف أسماء جداول: تكتب `entity: 'workOrder'` وتترك `SYNC_META` يحدد الجدول.

---

## 3. `packages/domain` — طبقة العقود

| ملف | مسؤولية | مستهلكون |
|---|---|---|
| `org.ts` | `ORG_STRUCTURE` المرجعي + `DeptKind`/`SubDeptKind` + `fieldWork` | seed، organization service، شاشة الهيكل، فحوص الانحراف |
| `permissions.ts` | `PERMISSION_DEFS` (91) بصيغة `<module>.<entity>.<action>` + `maxScope` + `offlineCapable` | `permission()`/`isPermissionCode()`، الكاش، مولّد الوثائق |
| `roles.ts` | `ROLE_DEFS` (21)، `ACCESS_MATRIX` (منح شعبة×دور)، `GLOBAL_GRANTS`، `EVERY_USER_GRANT`، **`resolveGrants()`**، `withinCeiling()`، `READ_ONLY_ROLES` | seed، `PermissionService`، `/org/permissions-verify`، `scripts/gen-features-doc.ts` |
| `matrix.ts` | `buildMatrix()` / `buildGlobalGrants()` / `matrixToMarkdown()` — كلها **مشتقة** من `resolveGrants()` | `npm run matrix` ← `docs/generated/permissions.*` |
| `perm.ts` | أدوات النطاق: مقارنة الرتب، دمج منح متعددة لنفس المستخدم | `PermissionService`، `buildScopeWhere` |
| `lab.ts` | `evaluateSpec` (حكم المطابقة)، `severityForVerdict`، `OOS_TRANSITIONS`، `SAMPLE_TRANSITIONS`، `statusAfterResultEntry`، `buildCertificateRows`، `canIssueCertificate` — تُستعمل في الخادم وفي الواجهتين فلا يختلف الحكم بينهما |
| `workorder.ts` | آلة الحالة `WO_TRANSITIONS`، `canTransition()`، `allowedNextStates()`، `computeSla()`، SLA لكل أولوية | WorkOrder service/clients (يمنع انتقالات غير شرعية قبل إرسالها) |
| `sync.ts` | `SCHEMA_VERSION`، `SYNC_ENTITIES` (19)، `SYNC_META` (جدول/استراتيجية دمج/حقول معتمدة/كيان أب)، قاعدة **جدول واحد = كيان واحد** | محرك المزامنة، `client.ts`، فحوص العقد، مولّد registry |
| `dto.ts` | Zod لكل طلب/استجابة (login/AuthSession/change-password/WorkOrder/sync/attendance…) | ZodPipe في الخادم + نماذج الإدخال في العملاء |
| `attendance.ts` | نافذة البصمة ±4 ساعات، ليل +15%، جمعة ×2، `reconciliationHash` | `AttendanceService`، شاشة البصمة |
| `client.ts` | طابور محلي، تجميع دفعات، `opId`، backoff، قرار `fullResyncRequired`، تطبيق `pull` محليًا | DexieStore (desktop) و syncStore (mobile) |

`resolveGrants()` هو **مصدر الحقيقة الوحيد** للصلاحيات:
1. لكل سطر في `ACCESS_MATRIX`: `permissions` (أو مجموعة جاهزة) ∪ `extra` − `deny`، **ثم** يُضاف
   **الحد الأدنى الميداني** (`S.base`) محترمًا لسقف كل صلاحية عبر `withinCeiling(scope, code)`.
2. ثم `GLOBAL_GRANTS` (أدوار عابرة للأقسام) و`EVERY_USER_GRANT` (نفس الخدمة: إجازة/طلبات/نماذج بنطاق SELF).
3. `seed.ts` يزرع الناتج، و`PermissionService` يقرأه من القاعدة (لا من الكود) ليتمكن المدير من التعديل.

---

## 4. `apps/api` — الوحدات ودورة حياة الطلب

### 4.1 الوحدات

| وحدة | ملفات | مسارات | ملاحظات |
|---|---|---|---|
| `security/` | `auth.controller/service`، `access.guard`، `permission.service`، `auth.module` (`@Global`) | `POST login/refresh/logout/change-password`, `GET me/permission-catalog` | كل شيء أمني هنا؛ `AuthModule` عالمي لأن `AccessGuard` و`PermissionService` مطلوبان في كل الوحدات |
| `organization/` | controller + service | `GET tree/sub-departments/drift/users/permissions-matrix/permissions-verify`, `POST users/assign-role` | `/drift` و`/permissions-verify` = بوابتا قبول بعد النشر |
| `workorder/` | controller + service | `GET/POST work-orders`, `GET :id`, `POST :id/transition`, `POST :id/labor` | FSM من `domain` + SLA + أرقام من `next_business_number` |
| `lab/` | `lab.controller.ts` + `lab.service.ts` + `lab.module.ts` | `GET parameters/stats/samples/samples/:id/oos/certificates/:sampleId`, `POST samples`, `POST samples/:id/results`, `POST results/:id/verify`, `POST oos/:id` | العينة مملوكة للشعبة المنتِجة؛ المختبر (kind=LAB) يقرأ قسمه كله؛ الأرقام وحالات OOS والتدقيق من ختم الخادم |
| `production/` | `production.module.ts` (controller + service في ملف واحد) | `GET params/trend`, `GET/POST shift-logs`, `POST shift-logs/:id/approve` | الاعتماد يختم `approvedById/approvedAt` server-side |
| `time/` | `attendance.module.ts` (controller + service) | `POST punches/import/recalculate/corrections/corrections/:id/decide`, `GET daily/payroll-export` | تكامل ZKTeco (ملف/JSON) + إعادة حساب + تصحيحات معتمدة |
| `sync/` | `sync.controller.ts` + `sync-engine.service.ts` | `POST push`, `GET pull`, `POST batch-plan`, `GET protocol` | المفصّل في §6 |
| `audit/` | `audit.module.ts` (controller + service) | `GET /`, `GET stats` | قراءة فقط؛ الجدول append-only بقاعدة بيانات |
| `health/` | `health.controller.ts` | `GET /api/health`, `GET /api/health/ready` | يفحص القاعدة + تطابق الهيكل + RBAC + التعارضات المفتوحة |
| `common/` | `prisma.service.ts` (`@Global`)، `zod.pipe.ts`، `rate-limit.guard.ts`، `error-contract.filter.ts`، `json-bigint.ts` | — | البنية التحتية العابرة |

> الوحدات الصغيرة (production/time/audit) مكتوبة حاليًا كملف وحدة واحد يضم controller+service.
> القسمة إلى `*.controller.ts` / `*.service.ts` مطلوبة عند نمو المسارات (المرحلة 1ب) — العقد لن يتغير.
> وحدة `lab` قائمة (REST كامل للعينات/النتائج/التدقيق/OOS/الشهادات) **بالإضافة** إلى مسار المزامنة
> (`labSample`, `labResult`) — المساران يكتبان الجدول نفسه، لذا الأرقام وختم الاعتمادات في الخادم فقط.

### 4.2 دورة حياة الطلب

```
Client ──HTTPS──► nginx ──► Nest (global prefix /api)
 1. RateLimitGuard (APP_GUARD #1)      token bucket لكل مسار حساس (login 5، refresh 20، push 30، pull 60)
 2. AccessGuard (APP_GUARD #2)
    a. @Public؟ لا يوجد bearer ⇒ مرور فقط للمسارات العامة
    b. jwt.verifyAsync (HS256, secret من config) ⇒ { sub, v, dev }
    c. PermissionService.load(sub)  ← كاش 30 ثانية لكل مستخدم (يُجبَّر قسرًا عند login/refresh)
    d. payload.v !== profile.version ⇒ 401 «permission set changed — re-authenticate»
    e. profile.mustChangePwd ⇒ يُسمح بمسارات PASSWORD_BOOTSTRAP_PATHS فقط، وإلا 403 برسالة عربية
    f. @RequirePermission({codes, scopes, anyOf}) ⇒ مطابقة + سقف النطاق؛ الفشل:
       تسجيل DENIED في audit_trails ثم 403 مع { required[], yourGrants[] }
    g. يركّب AccessContext { userId, profile, can(), scope, deviceId, ip }
 3. ZodPipe(schema)                    400 ببيانات الحقول الفاشلة (لا أخطاء Prisma الخام)
 4. Controller (POST ⇒ 201)            لا منطق أعمال هنا
 5. Service في معاملة:
      prisma.withScope(ctx, tx => …)   → $transaction BEGIN
                                        set_config('app.facility_id'…/department_id/sub_dept_id/user_id)
                                        … القراءات/الكتابة عبر tx …
                                        (مؤجّلات: trg_sync → sync_change_log، trg_bump_version، trg_touch)
                                        COMMIT
 6. الاستجابة                          BigInt مُسلسل عالميًا؛ الحقول المحمية كما هي في القاعدة
 7. أي استثناء غير متوقع ⇒ ErrorContractFilter: 5xx = { statusCode, errorId, messageAr } (بلا تسريب)
```

**لماذا الترتيب مهم:** `RateLimitGuard` قبل `AccessGuard` يمنع تخمين كلمات المرور حتى قبل فحص التوقيع؛
وفحص `v` قبل الصلاحيات يجعل إبطال الجلسات فوريًا دون مسح كاش شامل؛ وتسجيل `DENIED` **قبل** رمي
`403` يعني أن محاولة وصول فاشلة تُوثَّق حتى لو فشل الإدخال.

### 4.3 طبقة النطاق (ABAC)

```ts
// PermissionService: لكل مستخدم يُجمَّع أعلى نطاق لكل صلاحية من كل أدوار ومنح شعبه
type EffectivePermission = { code: PermissionCode; scope: 'SELF'|'TEAM'|'SUBDEPT'|'DEPT'|'ALL'; departmentId?; subDeptId? };
// AccessGuard.can(code) → وجود الرمز؛  canAtLeast(code, minScope) → الرتبة
// PrismaService.buildScopeWhere(access, code) → شرط Prisma:
ALL      : { facilityId }
DEPT     : { facilityId, departmentId }
SUBDEPT  : { facilityId, subDeptId }            // أو departmentId حسب جدول الكيان
TEAM     : { facilityId, shiftId, … }           // فريق الوردية الحالية
SELF     : { createdById / byUserId / userId }  // صفّه هو فقط
```
ثم **RLS** كطبقة دفاع ثانية في نفس المعاملة: أي استعلام خام ينسى الشرط يُصفَّر بنتيجة لا بخرق.
السياسات الأربع على `work_orders` و`production_shift_logs` و`attendance_punches` و`journal_entries`
  (\`p_wo_scope\`, \`p_slog_scope\`, \`p_punch_scope\`, \`p_je_finance\`) — والأخيرة تحصر القراءة بالأدوار المالية
مع `FORCE ROW LEVEL SECURITY` (حتى المالك لا يفلت منها).

---

## 5. طبقة البيانات (Prisma ↔ PostgreSQL)

- **85 نموذجًا · 25 enum · 93 مفتاحًا أجنبيًا · 87 جدولًا أساسيًا · 97 فهرسًا إضافيًا** (قياس على القاعدة الحيّة؛ الكتالوج المولّد: `docs/generated/schema.catalog.md`) (يُعيد توليدها `npm run docs:schema` في `docs/generated/schema.catalog.md`).
- **قاعدة التسمية:** Prisma `@@map` يغيّر اسم الجدول إلى snake_case، **أما الأعمدة فتبقى camelCase**؛
  لذا كل SQL خام يسمّي عمودًا يجب أن يقبّسه: `"subDeptId"`, `"createdAt"`, `"isOfflineCreated"`.
  هذه القاعدة موثقة في رأس `schema.prisma` ومفحوصة بـ `test/schema-contract.spec.ts`.
- **أعمدة المتزامنة الستة** على كل جدول متزامن: `version int`, `syncSeq bigint?`, `deletedAt timestamptz?`,
  `clientOpId text?`, `isOfflineCreated bool`, `createdAt/updatedAt` (الأخيرة بقاعدة `trg_touch`).
- **تسلسلات الأرقام المستندية:** 13 تسلسلًا للأعمال (`wo_number_seq`, `lab_sample_number_seq`, `permit_number_seq`,
  `je_number_seq`, `grn/mi/req/pr/po/so/si/oos/incident`) + دالة `next_business_number(seq, prefix)`
  التي تولّد `WO-2026-000042`. بعد أي استيراد جماعي تُنفَّذ `fn_align_number_sequences()`.
- **26 قيد CHECK** (`ck_*` منها 3 في ترحيل المختبر) تمنع حالة لا تصلح حتى لو وصلتها واجهة مكسورة
  (مثل: `actualEndAt >= actualStartAt`، `qty > 0`، `shiftStart < shiftEnd` لنفس اليوم…).
- **دوال/مؤجّلات مزامنة** (الجزء 4–5 من الترحيل):
  - `sync_entity_registry(entity, table_name, merge, push_priority)` مُنشَأ **ومعبّأ (19 صفًا) داخل الترحيل**،
    ثم `seed.ts` يعمل له upsert — فالترحيل قائم بذاته ولا يعتمد على ترتيب التشغيل.
  - `trg_sync` (19): AFTER INSERT/UPDATE على جداول السجل فقط، يكتب `sync_change_log` (op, payload, actor, device)،
    ويختم `syncSeq` من `nextval('sync_change_log_seq_seq')` عبر `trg_stamp_entity_seq`.
  - `trg_bump_version` (14 جدولًا من السجل فقط) — **مقيّد بالسجل عمدًا**: لمّا كان يُعلَّق على أي جدول
    فيه `version`+`syncSeq` دخل `users` في القائمة، فكان تحديث الدخول (`lastLoginAt`) يرفع `users.version`
    ويبطل JWT في اللحظة نفسها (cascade من 401).
  - `trg_touch` (10): `updatedAt = now()` دون لمس `version` (حتى لا تُبطل الجلسات).
  - `trg_audit_immutable`: يرفض UPDATE/DELETE على `audit_trails`.
  - حارس إعادة الدخول: `app.internal_sync` GUC يمنع أن تُغذي كتابةُ السجل نفسها دفعةَ تغييرات لا نهائية.
- **4 Views مادية** + `fn_refresh_reports()` (CONCURRENTLY، تحتاج فهرسًا فريدًا `ux_mv_*`)،
  ودوال تقارير `fn_wo_backlog_age()`, `fn_mtbf_mttr()`, `fn_archive_sync_log(days)`.
- **المرفقات:** الصور/الملفات لا تُخزَّن كحقول على صفوف العمل بل في `documents`
  (`entityType`+`entityId`)، والعمود `objectKey` جاهز لقناة رفع موقّعة (MinIO في `config.storage`)؛
  دفع الصورة من الهاتف = عملية `document` في المزامنة، والبايتات لاحقًا.

---

## 6. محرك المزامنة

### 6.1 عقد البروتوكول (v3) — مطابق لـ `sync.controller.ts` + `sync-engine.service.ts`

```
POST /api/v1/sync/push    { deviceId, userId, schemaVersion, ops[] ≤500 }
                          → { serverTime, nextCursor, results[] }
GET  /api/v1/sync/pull?deviceId&sinceCursor&entities&limit
                          → { serverTime, cursor, hasMore, changes[{seq,entity,recordId,version,deleted,data}] }
                          → أو { changes: [], fullResyncRequired: true, resyncReasonAr } (فجوة > 500k)
POST /api/v1/sync/batch-plan { ops, maxBatch?=200 } → { batches: opId[][] }   (مرتبة بـ pushPriority)
GET  /api/v1/sync/protocol  → { schemaVersion, maxOpsPerPush, maxRowsPerPull, changeLogRetentionDays,
                                serverTime, timezone, entities[{entity, table, merge, pushPriority}] }
```
- كل عملية: `{ opId, entity, recordId, kind: UPSERT|PATCH|DELETE, data?, baseVersion?, clientTimestamp, localWarnings? }`
  (`pushRequestDto` في `packages/domain/src/dto.ts`)؛ و`userId` **يُستبدل** بمعرّف الجلسة في المتحكم.
- دفعة أكبر من `SYNC_MAX_OPS` ⇒ `413` برسالة عربية توجّه العميل إلى `planPushBatches` (لا صامتة).
- `opId` فريد لكل عملية ومخزَّن في `sync_idempotency(opId, deviceId, entity, recordId, resultJson jsonb)`؛
  إعادة الإرسال تُعيد `resultJson` الأصلي حرفيًا (outcome + `serverSeq` + `keptFields`) مع `reasonAr` يوضح السبب.
- **`serverStamp`**: `createdById/byUserId/preparedById/uploadedById/…` تُؤخذ من `AccessContext` دائمًا.
- **`DENIED_COLUMNS`** لكل كيان تُطابق `SYNC_META[*].protectedFields` (المرجع: `status`, `approverId`,
  `partsCost/laborCost/contractorCost`, `assetId`, `targetEndAt` في أوامر العمل؛ `approvedById/approvedAt`
  في سجل الوردية؛ `verifiedById/verifiedAt` في التحاليل والتوقفات).
- عند `schemaVersion` مختلف ⇒ `fullResyncRequired` في `pull`؛ والفجوة الكبيرة (≥500k) تُنهي السحب بصفحة فارغة
  وسبب عربي — لا صمت.

### 6.2 `push` لكل عملية (`applyOp`)

```
1) idempotency: ضربة على sync_idempotency(opId) ⇒ إعادة نفس resultJson (outcome/serverSeq/keptFields)
2) بوابة الكيان: sync.push مطلوب، ثم permissionGate (per-entity: wh.req.create, maint.permit.create,
   prod.log.create, lab.result.enter …) + منع الحذف لغير المعتمِد، ومنع DELETE على append_only
3) recordInScope: هل الصف داخل نطاق المستخدم؟ (subDept/department/creator عبر SQL معاملات لا نصوص مفرَّغة)
4) قراءة الصف + مقارنة baseVersion:
   - UPSERT جديد ⇒ INSERT بحقول آمنة (safeColumns من information_schema) + clientOpId + isOfflineCreated=false
   - PATCH: يُستبعد DENIED_COLUMNS؛ إن بقي شيء ⇒ دمج حقلي (field_merge)؛ وإن مُنع كل شيء ⇒ outcome=CONFLICT
   - append_only (wo_logs, part_requisitions, lab_results, attendance_punches…): INSERT فقط، لا تحديث/حذف
   - حذف ⇒ soft delete (deletedAt) لا DELETE فعلي
5) success(): ختم syncSeq، سجل صراع إن حُفظت حقول الخادم، رد { outcome: APPLIED|MERGED|CONFLICT|REJECTED|DEDUPLICATED,
   serverSeq, version, serverKeptFields[], reasonAr }
```

### 6.3 `pull`
`WHERE seq > sinceCursor AND (صلاحية القراءة أو السجل داخل نطاق الجهاز)` مرتّب بـ `sync_change_log.seq`،
مع فلترة نطاق لكل كيان (`pullScope`) وتطبيق RLS نفسه، وتحديث `devices.lastPullCursor` — فيردّ العميل
مؤشرًا واحدًا فقط (`cursor`) لا قائمة معرفات. `hasMore:true` تعني «أرسل طلبًا آخرًا فوريًا».

### 6.4 العميل (`packages/domain/src/client.ts`)
- طابور محلي بحد أقصى قبل الرفض، `opId = uuid` وقت الإدخال (لا وقت الإرسال) ليكون idempotency حقيقيًا.
- جدولة: فوري عند الحدث الحرج، دوري 45 ثانية، backoff أُسّي (2s→60s) مع jitter، وإيقاف مؤقت إن الشبكة offline.
- `applyRemoteChange()` تكتب محليًا باستراتيجية الكيان نفسها (field_merge/append_only) وتحفظ `serverSeq`.
- `fullResyncRequired` ⇒ امسح الجداول المتزامنة (عدا المحلي غير المُرسل!) ثم ابدأ `pull` من 0.

---

## 7. العملاء

### 7.1 سطح المكتب (Electron + React)
```
src/electron/main.ts     نافذة، IPC (api-base، token get/set، ping)، safeStorage، config.json/NEWPORT_API_URL
src/electron/preload.ts  جسر مكشوف فقط: { getApiBase, getToken, setToken, health } — لا nodeIntegration في الـrenderer
src/data/bridge.ts       غلاف الـ IPC للـ renderer (يسقط إلى localStorage في وضع المتصفح عبر nginx)
src/data/api.ts          fetch + Base64 tokens، تجديد تلقائي على 401، إعادة محاولة للشبكة، ApiError(status,message,body)
src/data/dexieStore.ts   IndexedDB/Dexie: workOrders, woLogs, shiftLogs, labResults, assets, queue, meta
src/data/repo.ts         قراءة «الكاش أولًا ثم الشبكة» (stale-while-revalidate) وكتابة الطلبات
src/data/syncStore.ts    دورة push/pull على نفس عقد domain/client
src/state/auth.tsx       جلسة + mustChangePwd (يفرض شاشة تغيير كلمة المرور قبل أي شاشة بيانات)
src/state/sync.tsx       حالة المزامنة، آخر cursor، conflicts، أزرار «أعد المحاولة الآن»
src/screens/*            Login, WorkOrders, NewWorkOrder, Attendance, OrgTree, Sync
src/ui/Shell.tsx         تنقل RTL، مؤشر مزامنة، تنبيه الجلسة المقيّدة
src/hooks/query.ts       React Query: قائمة موحّدة (staleTime=20s، retry=1، enabled حسب حالة الشبكة)
```
قواعد UI: لا حقل محرر لقيمة يختمها الخادم (`status`…) — تعرضها للقراءة مع مصدرها؛ وأزرار الاعتماد تظهر
فقط لو `me.permissions` تحمل رمز الاعتماد، لأن الخادم سيرفض 403 في كل الأحوال.

### 7.2 الهاتف (Expo + React Native)
```
src/net/api.ts       عنوان الخادم من secure storage (apiBaseUrl)، JWT، تجديد الجلسة، لا أخطاء بيانات عند انقطاع
src/net/secure.ts    expo-secure-store للرموز و deviceId (لا Async Storage للمصادقة)
src/db/sqliteStore.ts expo-sqlite: جداول مطابقة لـ SYNC_META + جدول outbox (opId, entity, recordId, kind, payload, baseVersion, at)
src/data/fieldRepo.ts  القراءة من الجهاز دائمًا (Field-first) وكتابة في outbox في المعاملة نفسها
src/state/app.ts     جلسة، مهمة اليوم، الورديات، حدود الوصول في الواجهة (تجربة فقط — القرار للخادم)
src/state/sync.ts    آلة: idle → pushing(n) → pulling → done | conflict | fullResync؛ تعمل في المقدمة
src/screens/*        Login, Tasks, Shift, Sync (شاشة واحدة لكل مهمة ميدانية — لا تصفّح عميق أثناء العمل)
src/ui/kit.tsx       RTL، أزرار كبيرة، قوائم اختيار بدل الكتابة، عمل بلا شبكة، أحجام قياسية للهاتف
```
الاختبارات (`apps/mobile/tests/offline-queue.spec.ts`) تغطي الطابور والإرسال والدمج ومحاكاة نقل.

---

## 8. الأمان والجلسات (تفاصيل نافذة التنفيذ)

| بند | التنفيذ |
|---|---|
| كلمات المرور | bcrypt؛ rounds=12 في الإنتاج و8 في التطوير (`config.ts`)؛ سياسة ≥10 أحرف + حرف+رقم مفروضة في العميلين والخادم |
| الحساب المزروع | `users.mustChangePwd=true` ⇒ **الجلسة تُصدَر** لكن `AccessGuard` يقيّدها بمسارات الحساب؛ `change-password` يطفي القيد ويرفع `version` |
| القفل | 5 محاولات ⇒ 15 دقيقة (423 برسالة عربية + وقت الفتح) |
| JWT | `HS256`، 900 ثانية، مطالب `{ sub, v, dev }`؛ `v` = `users.version` (إبطال فوري عند تغيّر الصلاحيات/كلمة المرور) |
| Refresh | قيمة عشوائية 48 بايت، تُخزَّن `sha256`، عمر 30 يومًا، **عائلات**: إعادة استعمال رمز صدر سابقًا ⇒ `family revoked` + 401 |
| الأجهزة | `devices(externalId…)` تُنشأ/تُحدَّث عند login؛ `lastPullCursor` لكل جهاز |
| كاش الصلاحيات | 30 ثانية لكل مستخدم؛ `login`/`refresh` يقرأان بـ `force:true` (وإلا رفض AccessGuard أول طلب بعد تغيير كلمة المرور)؛ أي رفع `version` من الكود يستدعي `invalidate(userId)`؛ **لا ترفع `users.version` من SQL خارج التطبيق** |
| حقول محمية | `DENIED_COLUMNS` في `sync-engine` + نفس القائمة موثّقة في `SYNC_META` ليُبنى عليها الـUI |
| BigInt | `installBigIntJson()` في `main.ts` — بدونها أي endpoint يعرض صفا خامًا ينهار 500 (`syncSeq`/`syncCursor`) |
| الأخطاء | `ErrorContractFilter`: 4xx بنصوص الحارس العربية مع حقولها، 5xx ⇒ `errorId` + رسالة عامة (لا تسريب لأسماء جداول) |
| التدقيق | `audit_trails` + `trg_audit_immutable`؛ محاولات DENIED تُسجَّل بالرموز المطلوبة ومنح المستخدم |
| الشبكة | `CORS_ORIGINS` صريحة + قبول أصول `capacitor://` و`newportapp://`؛ هيدر `X-Frame-Options: DENY`, `nosniff`, `no-referrer` |

---

## 9. الاختبارات وبوابات الجودة

| مجموعة | عدد | ماذا تغطي |
|---|---|---|
| `packages/domain` | 71 | سلامة السجل (91/21/13)، عدم وجود منح أوسع من `maxScope`، الحد الأدنى الميداني ممنوح ولا يُمنح للقراءة فقط، `buildMatrix` = `resolveGrants`، آلة الحالة، SLA، دوال البصمة، عميل المزامنة (طابور/backoff/دمج/full-resync) |
| `apps/api/test/lab-scope.spec.ts` | 11 | نطاق المختبر: توسيع شعبة kind=LAB إلى القسم، **ولا يُوسَّع SELF**، حارس ملكية العينة عند الإنشاء، و403 مفسَّر |
| `apps/api/test/access-sync.spec.ts` | 16 | الحارس: منح/نطاق/`DENIED_COLUMNS`/append_only/idempotency/رفض DELETE على سجلات حدثية/`buildScopeWhere` |
| `apps/api/test/schema-contract.spec.ts` | 5 | كل اسم جدول/عمود مستعمل في `SYNC_META`/`ENTITY_MAP` موجود في `schema.prisma`؛ لا snake_case ولا `#` في SQL الترحيل |
| `apps/api/test/sync-triggers.spec.ts` | 5 | **على قاعدة حيّة**: registry=19، `trg_sync` مرة لكل جدول، `trg_bump_version` لا يمس `users`، `fn_align_number_sequences()`، لا سطر `#` |
| `apps/api/test/serialization.spec.ts` | 3 | BigInt → JSON (صغير رقم، كبير نص، تثبيت مزدوج آمن) |
| `apps/api/test/error-contract.spec.ts` | 3 | عقد الأخطاء (4xx يحافظ على الحقول، ترجمة، 5xx بكتمان + errorId) |
| `apps/mobile/tests` | 8 | الطابور، التجميع، الإرسال، الدمج، قطع الشبكة |
| `scripts/e2e-smoke.mjs` | 37 | HTTP حيّ: جاهزية، جلسة، قيد تغيير كلمة المرور، تدوير refresh + كشف إعادة الاستعمال، تطابق الهيكل/الصلاحيات، دورة أمر شغل، رفض انتقال 409، مزامنة push/pull/idempotency/الحماية، سجل تدقيق، ختم `syncSeq` |

```bash
npm run test:all && npm run typecheck:all            # 122 فحصًا + typecheck نظيف (4 حِزَم)
API_URL=… npm run e2e -w @newport/api                # 37/37
npm run docs:all -w @newport/api                     # مصفوفة + 03 + DDL + كتالوج (وتفحص أن كل رمز مذكور حقيقي)
```

---

## 10. انتكاسات كشفها التشغيل الحيّ (وثوابت تصميم الآن)

كل بند أدناه له فحص يمنع عودته:

1. **`trg_bump_version` على `users`** ⇒ تسجيل الدخول يُبطل JWT (cascade 401). الثابت: رفع الإصدار
   يُشتق من `sync_entity_registry` حصرًا. فحص: `sync-triggers.spec.ts`.
2. **`documents` كان موصولًا بمؤجّلين** (كيان `woAttachment` الوهمي) ⇒ تضاعف دفعة التغييرات.
   الثابت: **جدول واحد = كيان مزامنة واحد**. فحص: `schema-contract.spec.ts` + registry.
3. **`PmPlanInstance` بلا `version/syncSeq`** ⇒ `server_wins` على السحب بلا ترتيب. الثابت: أي جدول
   يُسحب إلى الجهاز يحتاج ختم syncSeq. فحص: `schema-contract.spec.ts`.
4. **`mustChangePwd` كان يمنع إصدار الجلسة** ⇒ الحساب المزروع لا يستطيع تغيير كلمته. الثابت: قيد على
   **المسارات**، لا على الإصدار. فحص: `e2e-smoke.mjs`.
5. **BigInt في JSON** ⇒ 500 على كل endpoint يعرض صفا خامًا. فحص: `serialization.spec.ts`.
6. **تسلسلات الأرقام خلف صفوف الـseed** ⇒ `P2002 on work_orders.number` عند أول أمر شغل حقيقي.
   الثابت: `fn_align_number_sequences()` في seed + retry دفاعي في الخدمة.
7. **كاش الصلاحيات بعد تغيير كلمة المرور** ⇒ رفض أول طلب. الثابت: `force:true` في login/refresh +
   `invalidate` عند كل رفع إصدار.
8. **`recordInScope` كان يُفرِج UUID داخل نص SQL** ⇒ انهيار + باب حقن. الثابت: معاملات `Prisma.sql`
   لكل قيمة، والـ`Prisma.raw` لأسماء الجداول/الأعمدة فقط (من جدول ثابت).
9. **تعليق `#` في SQL الترحيل** ⇒ PostgreSQL يرفضه. الثابت: `--` فقط. فحص: `#` assertion.

---

## 11. الوصفات (كيف تضيف…؟)

**كيان مزامنة جديدًا (7 خطوات، كلها مُلزَمة بفحوص):**
1. `schema.prisma`: نموذج + `@@map` + أعمدة `version/syncSeq/deletedAt/clientOpId/isOfflineCreated`.
2. `packages/domain/src/sync.ts`: ضعه في `SYNC_ENTITIES` وعَرِّف `SYNC_META` (جدول، دمج، حقول محمية).
3. `apps/api/src/sync/sync-engine.service.ts`: مدخل `ENTITY_MAP` (ستون ختم + قائمة `DENIED_COLUMNS`).
4. الترحيل: صف جديد في `sync_entity_registry` — `trg_sync`/`trg_bump_version`/`trg_touch` ستُبنى منه.
5. `seed.ts`: upsert للـregistry (كي يبقى الترحيل قائمًا بذاته).
6. `prisma migrate dev --name add_x` ثم `npm run docs:all -w @newport/api`.
7. `packages/domain/tests` + `sync-triggers` (عدد الكيانات سيتغير: حدِّث 19 في الفحوص/الوثائق).

**شعبة جديدة:** لا تُمسّ. تضاف في `sub_departments` ببيانات، ثم سطر في `ACCESS_MATRIX` + `ORG_STRUCTURE`
لتبقى فحوص `drift` خضراء (المرجع = الكود + القاعدة معًا).

**دور جديد:** `ROLES` + `ROLE_DEFS` + منح في `ACCESS_MATRIX`/`GLOBAL_GRANTS` + `seed` + `docs:all`؛
وتأكد أن كل صلاحية جديدة ممنوحة لدور واحد على الأقل (فحص «لا صلاحية ميتة»).

**رفع صور حقيقي:** `config.storage.driver=minio` + `STORAGE_*`، ثم `POST /v1/documents/presign`
يُعيد `objectKey` ويكتب العميل العملية محليًا بالـkey، وخدمة خلفية تُثبِّت الرفع (البنية جاهزة في `documents`).

**تقرير جديد:** view مادية + `ux_mv_*` فريد + تحديث داخل `fn_refresh_reports()`، ثم مسار `GET /v1/reports/…`
بصلاحية `report.view` (وليس `ALL` ثابتًا — التزم بالنطاق).

**فصل خدمة (مثلاً `lab`) لخدمة مستقلة:** انقل الوحدة كما هي (لها عقدها في `domain`)، وأضف `FACILITY_CODE`
و`DATABASE_URL` الخاص بها؛ لا حاجة لتغيير العملاء لأن العقد عبر `push/pull` + REST.

---

## 12. الفجوات المعروفة (بصدق) وخطة المرحلة 1ب

| فجوة | أين | خطوة الإصلاح |
|---|---|---|
| الشهادة تُرجَّع JSON لا ملف PDF/Excel | `GET /v1/lab/certificates/:sampleId` | طباعة من الواجهة عبر قالب موقّع + `documents` (البيانات جاهزة ومُحكَمة) |
| المرفقات: metadata فقط، بلا بايتات | `documents` + `config.storage` | presigned PUT/GET عبر MinIO + `POST /v1/documents/presign` |
| حدّ المعدن والكاش في الذاكرة | `rate-limit.guard.ts`, `permission.service.ts` | Redis عند أكثر من نسخة API (الملف يوضح البديل) |
| لا دفع إشعارات (FCM/APNs) | `config.push` معطّل | `notif.view` + سحب الإشعارات عند `pull`؛ ثم expo-notifications |
| لا مزامنة خلفية على iOS | `mobile/src/state/sync.ts` | مزامنة عند الفتح + `fetchContentAvailable`/BGTask قصير ≤ 30s |
| لا واجهة تعارضات للمخطط | desktop (لا شاشة) | `SyncConflictsScreen` تقرأ `sync_conflicts` عبر `pull` |
| ترحيل بيانات العقود/البصمة الخارجية | `hr.emp.manage` مؤجلة | خطة ترحيل + أمان `hr.emp.manage` في المرحلة 2 (`DEFERRED_PHASE2_PERMISSIONS`) |
| التوثيق العربي للمستخدم النهائي | — | `docs/06-user-guide.md` لكل شعبة (من `docs/03` حرفيًا) |
| لا OpenAPI spec | `apps/api` | `@nestjs/swagger` + تصدير `openapi.json` في `docs:all` لتوليد عميل REST آليًا |

**ترتيب التنفيذ المقترح (1ب):** تعارضات + presigned uploads + طباعة الشهادة → swagger/client مولّد →
دفع إشعارات → بوابة الموظف الذاتية (`SELF_SERVICE_PERMISSIONS` جاهزة) → تكامل SAP/Oracle للمالية.
