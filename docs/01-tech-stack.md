# ‎01 — المكدّس التقني واختيار قواعد البيانات (Newport LP. LTD — BFC-L1)

> وثيقة قرار معماري. كل الأرقام في هذه الوثيقة مأخوذة من المستودع نفسه (يمكن إعادة توليدها بالأوامر في نهاية الملف).

## 1. الخلاصة التنفيذية

| طبقة | الاختيار | السبب المباشر لمعمل الأسمدة الجنوبية / الخط الأول |
|---|---|---|
| الواجهة المكتبية (Windows) | **Electron 44 + React 19 + Vite 8 + TypeScript** | نفس كود React الذي سيُستخدم على الويب؛ دعم RTL/خطوط عربية أصلية؛ قدرة على قراءة/كتابة القرص المحلي وطباعة التقارير وتوصيل قارئ البصمة عبر IPC |
| واجهة الميدان (Android/iOS) | **React Native 0.87 + Expo SDK 57** | حزمة واحدة للنظامين، وصول أصلي للكاميرا/GPS/biometric، وقابلية التحديث عبر Expo Updates دون إعادة اعتماد على متجر |
| الخادم | **NestJS 11 (Node.js 22 LTS) + Prisma 6.19** | Modular monolith: فصل منطقي بحدود الوحدات (صيانة/إنتاج/مختبر/بصمة/مزامنة) مع إمكانية تفكيكه لاحقًا إلى خدمات، وPrisma يعطي أنواعًا موحّدة للعميل والخادم |
| قاعدة البيانات | **PostgreSQL 16** | `jsonb` للنماذج الميدانية/القراءات، RLS لفرض النطاق على مستوى المحرّك، `LISTEN/NOTIFY` + تسلسلات للمزامنة، فهارس GIN/trigram للبحث العربي |
| التخزين المحلي للمكتب | **IndexedDB عبر Dexie 4** | سجلات أوامر العمل والملاحظات تعمل بلا شبكة، ومزامنة بالمفاتيح نفسها المستعملة على الخادم |
| التخزين المحلي للموبايل | **SQLite عبر `expo-sqlite`** | قاعدة بيانات فعلية على الجهاز (OLTP محلي) مع WAL، وصلابة أمام إغلاق التطبيق، وقابلية فحص الملف عند الأعطال |
| التعاقد (DTOs) | **Zod 4 في حزمة داخلية `@newport/domain`** | مخطط واحد يُستعمل للتحقق في React/React Native وفي NestJS (ZodPipe)، فلا ينحرف العميل عن الخادم |
| المصادقة | **JWT وصول قصير (15 دقيقة) + Refresh دوّار (30 يوم) + عائلات إلغاء** | يتطلبه العمل في بيئة صناعية بأجهزة مشتركة وقاعات تحكم، مع قفل الحساب بعد 5 محاولات خاطئة |
| الصلاحيات | **RBAC (21 دورًا) + ABAC بالنطاق (SELF/TEAM/SUBDEPT/DEPT/ALL)** | الهيكل التنظيمي صارم (3 أقسام / 13 شعبة)، والنطاق هو الفرق بين "يرى شعبته" و"يرى قسمه" |
| النشر | **Docker Compose على خادم المعمل + nginx TLS داخلي** | المعمل لا يعتمد على الإنترنت لإدارة الإنتاج؛ بوابة سحابية اختيارية للضوء الأخضر عن بُعد |

**لماذا لم نختَر .NET (WPF/MAUI)؟** الخيار قائم تقنيًا، لكنه يفرض لغتين ومخططَي DTO وواجهتَي مزامنة مختلفتين، ويحتاج خبرة Windows-centric في فريق يخدم أيضًا iOS. في هذه المرحلة الأولوية لتطابق السلوك بين المكتب والميدان، وقد اختير **TypeScript عبر monorepo**. ملاحظة أمانة تقنية: لم يُختبَر مسار .NET في هذه البيئة على الإطلاق (لا يوجد dotnet SDK في بيئة التطوير المستعملة)، فهو قرار موثّق لا مُنفَّذ.

## 2. البنية المرجعية (ما هو موجود فعلًا في المستودع)

```
newport-ms/
├── packages/domain/          # ❤️ مصدر الحقيقة: الهيكل، 94 صلاحية، 21 دورًا، مصفوفة الوصول،
│                             #    آلة حالة أوامر العمل، عقد المزامنة v3، DTOs بـ Zod، محرّك الحضور
│   ├── src/{org,permissions,roles,workorder,sync,client,dto,attendance,perm,matrix}.ts
│   ├── tests/*.spec.ts       # 71 اختبار وحدة (كلها خضراء)
│   └── scripts/gen-matrix.ts # يولّد docs/generated/permissions.matrix.{json,md}
├── apps/api/                 # NestJS 11: الأمان، التنظيم، الصيانة، الإنتاج، المختبر، البصمة، المزامنة، التدقيق
│   ├── prisma/schema.prisma  # 85 نموذج + 25 enum → docs/generated/schema.postgres.sql
│   ├── prisma/migrations/…   # الامتدادات + التسلسلات + RLS + change-log triggers (SQL يدوي)
│   ├── prisma/seed.ts        # seed idempotent للهيكل + المصفوفة + 23 مستخدمًا
│   └── test/*.spec.ts        # 43 اختبارًا: الأمان+المزامنة، نطاق المختبر، تعاقد المخطط، المؤجّلات على قاعدة حيّة،
│                             #    تسلسل BigInt، عقد الأخطاء
├── apps/desktop/             # Electron + React 19 (Dexie/IndexedDB فوق SyncClient)
├── apps/mobile/              # Expo 57 + React Native (SQLite فوق SyncClient نفسه)
├── docs/                     # هذه الوثائق
└── deploy/                   # docker-compose.yml، nginx، نسخة احتياطية، Dockerfile
```

قاعدة صارمة متّبعة: **العميل لا يكرّر منطق المزامنة**. `SyncClient` في `@newport/domain/src/client.ts` هو المحرك الذي تستعمله الواجهتان، وما يختلف بينهما هو تنفيذ واجهة `LocalStore` فقط (Dexie مقابل SQLite).

## 3. لماذا PostgreSQL على وجه التحديد

1. **Row-Level Security**: السياسات `p_wo_scope` و`p_slog_scope` و`p_punch_scope` و`p_je_finance` (مع `FORCE ROW LEVEL SECURITY`) تقرأ `app.scope_kind / app.subdept_id / app.dept_id / app.user_id` المضبوطة عبر `PrismaService.withScope()` (`set_config(..., true)` داخل معاملة). حتى لو نسي استعلامٌ فلترة النطاق، القاعدة لا تُسرّب صفوفًا خارج النطاق.
2. **`jsonb` + GIN** للنماذج الميدانية (قراءات الجولة، `exceptionsJson`، `changes` في سجل التدقيق) دون تفكيك الجدول إلى EAV.
3. **التسلسلات + `nextval`** لرقم أمر العمل (`WO-2026-000123`) في نفس المعاملة — لا تنافس على `MAX(id)+1` ولا فجوات عند rollback.
4. **DDL المولّد قابل للتدقيق**: `docs/generated/schema.postgres.sql` (2294 سطرًا: 85 جدولًا، 94 مفتاحًا خارجيًا في Prisma + 1 مضاف في الترحيل، 146 فهرسًا — 99 منها غير مفاتيح) يراجعه مسؤولو المعمل قبل التنفيذ.
5. **التقييمات العددية للحضور** تحتاج أرقامًا دقيقة: `workedMinutes/overtimeMinutes` أعداد صحيحة بالدقائق، والرواتب تُجمَّع شهريًا من `attendance_daily_summary` لا من `attendance_punches`.

### قرارات تصميمية داخل المخطط
- **الأسماء**: `@@map` يحوّل اسم الجدول إلى snake_case، لكن الأعمدة تبقى camelCase → أي SQL خام يجب أن يكتب `"subDeptId"` بين علامتي اقتباس. (انضمّت 26 قيد CHECK باسم `ck_*` إلى ترحيل الامتدادات وسلامة المختبر لهذا السبب.)
- **كل جدول قابل للمزامنة** يحمل: `version` (int، يزيد على الخادم)، `syncSeq` (bigint، تسلسل التغيير)، `deletedAt` (حذف منطقي)، `clientOpId` (آخر عملية دفع).
- **الجداول الحدثية append-only**: `wo_logs`, `attendance_punches`, `sync_change_log`, `audit_trails` — الحذف ممنوع عليها حتى من مدير النظام (يُراجَع في `sync-engine.service` + قيد في القاعدة).

## 4. المزامنة بين المكتب والموبايل — التصميم المختار

البروتوكول **v3** (رقمه `SCHEMA_VERSION = 3`)، وهو delta sync باتجاهين مع cursor:

| الاتجاه | القناة | العقد (مطابق لـ `packages/domain/src/dto.ts`) |
|---|---|---|
| دفع (Device → Server) | `POST /api/v1/sync/push` | طلب: `{ deviceId, userId, schemaVersion, ops[] ≤500 }` وكل عملية `{ opId, entity, recordId, kind: UPSERT\|PATCH\|DELETE, data?, baseVersion?, clientTimestamp, localWarnings? }` → استجابة: `{ serverTime, nextCursor, results[] }` |
| سحب (Server → Device) | `GET /api/v1/sync/pull?deviceId&sinceCursor&entities&limit` | `{ serverTime, cursor, hasMore, changes[{seq,entity,recordId,version,deleted,data}] }` من `sync_change_log`؛ وعند فجوة > 500k تسلسل: `{ changes: [], fullResyncRequired: true, resyncReasonAr }` |
| تخطيط الدفع | `POST /api/v1/sync/batch-plan` | `{ ops, maxBatch?=200 }` → `{ batches: opId[][] }` مرتبة بـ `pushPriority` |
| فحص التعاقد | `GET /api/v1/sync/protocol` | `{ schemaVersion, maxOpsPerPush, maxRowsPerPull, changeLogRetentionDays, serverTime, timezone, entities[{entity, table, merge, pushPriority}] }` |

> `userId` مطلوب في الطلب لكنه **يُستبدل** بمعرّف جلسة الـJWT في المتحكم (`{ ...body, userId: access.userId }`)،
> فلا يستطيع جهاز أن ينتحل مستخدمًا آخر.

**الكيانات القابلة للمزامنة (19)** — قاعدة صارمة: **جدول واحد = كيان مزامنة واحد**. الصور والمرفقات
لا تُخزَّن كحقول على صفوف العمل بل تُدفع كعمليات `document` (بفهرسة `entityType`+`entityId`)؛ ولهذا حُذف
الكيان `woAttachment` الذي كان يضاعف دفعة التغييرات على جدول `documents`.

| استراتيجية الدمج | الكيانات (من `SYNC_META`) |
|---|---|
| `field_merge` (6) | `workOrder` (محمي: `status, approverId, partsCost, laborCost, contractorCost, assetId, targetEndAt`؛ مُلحَق: `description`) · `shiftLog` (محمي: `status, approvedById, approvedAt`؛ مُلحَق: `notes, eventsJson`) · `downtime` · `labSample` · `labResult` · `leaveRequest` |
| `append_only` (9) | `workOrderLog` · `laborEntry` · `processParam` · `alarmAck` · `assetReading` · `attendancePunch` · `mobileFormRecord` · `document` · `notificationAck` — تُقبل كما هي، والحذف مرفوض من العميل |
| `server_wins` (2) | `asset` · `pmPlanInstance` — الخادم مصدر الحقيقة؛ لا يُولّد الجهاز مواعيد PM |
| `reject` (2) | `partIssue` (يمسّ المخزون) · `permit` (تصريح عمل — السلامة لا تحتمل دمجًا) — يُبلَّغ التعارض للمراجعة |

**سلوكيات حاسمة موثّقة ومُختبَرة:**
- **Idempotency**: إعادة إرسال نفس `opId` (بعد انقطاع/إعادة تشغيل) تُرجع **نفس رد الخادم الأصلي حرفيًا** (outcome/`serverSeq`/`serverKeptFields`) المحفوظ في `sync_idempotency`، مع `reasonAr` يوضح أنها إعادة إرسال — لا تكرار ولا فقدان ولا «نتيجة مختلفة».
- **حقول الهوية لا تُؤخذ من العميل**: `facilityId/departmentId/subDeptId/createdById/approvedById/passwordHash/…` في `DENIED_COLUMNS`؛ أي محاولة لفرضها تُسجَّل في `sync_conflicts` بسبب `SERVER_STAMPED` (اختبار مغطّى).
- **إعادة مزامنة كاملة** عندما يتغيّر `schemaVersion` أو يتجاوز الفرق في `sync_change_log` مدة الاحتفاظ (500k تسلسل) → `fullResyncRequired: true` (HTTP 409 على الدفع).
- **بلا شبكة**: الكتابة المحلية في Dexie/SQLite ناجحة فورًا، والطابور يبقى؛ عند أول اتصال تُدفع الدفعات بالأولوية، والجهاز لا يفقد مدخلًا واحدًا (مُغطّى باختبار "survives a network outage").

## 5. الأمان والموثّقية التشغيلية

- **الجلسات**: وصول JWT (`sub`, `v` = نسخة المستخدم، `dev` = معرّف الجهاز) + Refresh مخزَّن كـ SHA-256، دوّار مع **إلغاء العائلة كاملة** عند إعادة استعمال رمز قديم.
- **تغيير كلمة المرور الأولى**: الحسابات المزروعة تولد بـ `mustChangePwd=true`؛ الجلسة **تُصدَر** (لا يُغلق النظام على المستخدم) لكن `AccessGuard` يقيّدها بمسارات الحساب (`auth/me`, `auth/change-password`, `auth/logout`) حتى يغيّرها، وإلا `403` برسالة عربية وحقل `changePasswordRequired:true`.
- **حماية من التخمين**: 5 محاولات خاطئة ⇒ قفل 15 دقيقة؛ حدّ معدل لكل IP (login 5/0.1 rps، refresh 20/1، push 30/2، pull 60/5) عبر `RateLimitGuard` داخل الذاكرة (يستبدَل بـ Redis عند تعدّد النسخ).
- **تدقيق غير قابل للتعديل**: `audit_trails` append-only (بمؤجّل `trg_audit_immutable`) + محاولات الرفض `DENIED` تُسجَّل، تكتبه كل العمليات الحساسة (دخول، اعتماد، إغلاق أمر عمل، تغيير دور، قرارات التعارض).
- **قراءة البصمة محمية**: `hr.biometric.manage` وحده يعطي صلاحية تعديل بصمات الآخرين؛ الطلبات العادية لا تصل إليها (RLS + `privileged.biometric`).

## 6. حدود الحل الحالية (بلا تجميل)

1. **محرّك تنبيهات/جدولة غير منفّذ**: `report_schedule` و`notification` لهما مخطط وعقد مزامنة، لكن لا يوجد Worker مجدول بعد (خطوة تالية: BullMQ + Redis أو pg_cron).
2. **تخزين المستندات**: قناة الرفع منفّذة على **المخزن المحلي** فقط (`STORAGE_DRIVER=local`): `POST /v1/documents/upload` (base64) و`POST /v1/documents/presign` + `PUT /v1/documents/raw/:token` للكاميرا، مع سقف حجم يُطبَّق أثناء البث وبصمة sha256 محسوبة في الخادم. محوّلا minio/s3 غير منفّذين — ويُرفض الإعداد لهما صراحةً (409) بدل كتابة صامتة إلى مكان غير مضبوط.
  العميلان موصولان بها عبر `DocumentUploadQueue` المشترك (طابور على القرص + إعادة محاولة بنفس معرّف العميل)، والمزامنة صارت للقراءة فقط على كيان `document`.
3. **تكامل SAP/ERP**: `integration_configs` مع `credentialRef` موجود، والمزامنة ثنائية الاتجاه للطلبات/الفواتير غير منفّذة.
4. **حدود المعدل داخلية الذاكرة**: صالحة لنسخة خادم واحدة؛ مع أكثر من نسخة يلزم Redis.
5. **شهادة التحليل تُبنى ككائن JSON لا كملف**: `GET /v1/lab/certificates/:sampleId` يُرجع صفوف الشهادة والتواقيع، أما طباعة PDF/Excel فواجهة مكتب (لم تُنفَّذ)؛ وربط الشهادة بأوامر البيع يتم عبر `documents`.
6. **`pg_stat_statements`** يحتاج `shared_preload_libraries` (مضبوط في docker-compose)؛ على تثبيت PostgreSQL يدوي يُضاف في `postgresql.conf` قبل إنشاء الامتداد.

## 7. أوامر التحقق (كلها تعمل في المستودع)

```bash
npm ci
npm run build -w @newport/domain
npm run test -w @newport/domain      # 71 فحصًا: صلاحيات، مصفوفة، WO FSM، منطق المختبر، تعاقد المزامنة، طبقة العميل
npm run typecheck -w @newport/api     # src + prisma/seed + test (0 أخطاء)
npm run test -w @newport/api          # 43 اختبارًا: الأمان/المزامنة + نطاق المختبر + تعاقد المخطط + المؤجّلات على قاعدة حيّة
npm run typecheck -w @newport/desktop # tsconfig.json + tsconfig.electron.json
npm run build -w @newport/desktop     # vite build (حزمة الإنتاج)
npm run test -w @newport/mobile       # 8 اختبارات: الطابور دون اتصال + مخزن SQLite
npm run test:all                      # 130 فحصًا (domain 71 + api 51 + mobile 8)
npm run typecheck:all                 # 4 حِزَم: domain + api + desktop + mobile (0 أخطاء)
npm run docs:all -w @newport/api      # مصفوفة الوصول + docs/03 + DDL + كتالوج المخطط (كل الوثائق مشتقة من الكود)
API_URL=http://127.0.0.1:3000/api DATABASE_URL=… npm run e2e -w @newport/api   # 68 فحصًا حيًّا على الخادم
npm run db:ddl && node apps/api/scripts/gen-schema-docs.mjs   # إعادة توليد المخطط والكتالوج
```

> لم تُشغَّل قاعدة بيانات حيّة ولا `docker compose` في بيئة التطوير هذه؛ الاختبارات أعلاه تعوّض ذلك ببدائل Prisma/SQLite موثوقة السلوك، وبقية الطبقات متحققة بالنوع والبناء.
