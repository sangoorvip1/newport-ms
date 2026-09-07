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

**لماذا لم نختَر .NET (WPF/MAUI)؟** الخيار قائم تقنيًا، لكنه يفرض لغتين ومخططَي DTO وواجهتَي مزامنة مختلفتين، ويحتاج خبرة Windows-centric في فريق يخدم أيضًا iOS. في هذه المرحلة الأولوية لتطابق السلوك بين المكتب والميدان، وقد اختير **TypeScript عبر المنorepo**. ملاحظة أمانة تقنية: لم يُختبَر مسار .NET في هذه البيئة على الإطلاق (لا يوجد dotnet SDK في بيئة التطوير المستعملة)، فهو قرار موثّق لا مُنفَّذ.

## 2. البنية المرجعية (ما هو موجود فعلًا في المستودع)

```
newport-ms/
├── packages/domain/          # ❤️ مصدر الحقيقة: الهيكل، 91 صلاحية، 21 دورًا، مصفوفة الوصول،
│                             #    آلة حالة أوامر العمل، عقد المزامنة v3، DTOs بـ Zod، محرّك الحضور
│   ├── src/{org,permissions,roles,workorder,sync,client,dto,attendance,perm,matrix}.ts
│   ├── tests/*.spec.ts       # 48 اختبار وحدة (كلها خضراء)
│   └── scripts/gen-matrix.ts # يولّد docs/generated/permissions.matrix.{json,md}
├── apps/api/                 # NestJS 11: الأمان، التنظيم، الصيانة، الإنتاج، المختبر، البصمة، المزامنة، التدقيق
│   ├── prisma/schema.prisma  # 85 نموذج + 25 enum → docs/generated/schema.postgres.sql
│   ├── prisma/migrations/…   # الامتدادات + التسلسلات + RLS + change-log triggers (SQL يدوي)
│   ├── prisma/seed.ts        # seed idempotent للهيكل + المصفوفة + 23 مستخدمًا
│   └── test/access-sync.spec.ts  # 16 اختبار على طبقتي الأمان والمزامنة
├── apps/desktop/             # Electron + React 19 (Dexie/IndexedDB فوق SyncClient)
├── apps/mobile/              # Expo 57 + React Native (SQLite فوق SyncClient نفسه)
├── docs/                     # هذه الوثائق
└── deploy/                   # docker-compose.yml، nginx، نسخة احتياطية، Dockerfile
```

قاعدة صارمة متّبعة: **العميل لا يكرّر منطق المزامنة**. `SyncClient` في `@newport/domain/src/client.ts` هو المحرك الذي تستعمله الواجهتان، وما يختلف بينهما هو تنفيذ واجهة `LocalStore` فقط (Dexie مقابل SQLite).

## 3. لماذا PostgreSQL على وجه التحديد

1. **Row-Level Security**: سياسة `dept_scope_policy` تقرأ `app.scope_kind / app.subdept_id / app.dept_id / app.user_id` المضبوطة عبر `PrismaService.withScope()` (`set_config(..., true)` داخل معاملة). حتى لو نسي استعلامٌ فلترة النطاق، القاعدة لا تُسرّب صفوفًا خارج النطاق.
2. **`jsonb` + GIN** للنماذج الميدانية (قراءات الجولة، `exceptionsJson`، `changes` في سجل التدقيق) دون تفكيك الجدول إلى EAV.
3. **التسلسلات + `nextval`** لرقم أمر العمل (`WO-2026-000123`) في نفس المعاملة — لا تنافس على `MAX(id)+1` ولا فجوات عند rollback.
4. **DDL المولّد قابل للتدقيق**: `docs/generated/schema.postgres.sql` (2286 سطرًا، 85 جدولًا، 93 مفتاحًا خارجيًا، 145 فهرسًا) يراجعه مسؤولو المعمل قبل التنفيذ.
5. **التقييمات العددية للحضور** تحتاج أرقامًا دقيقة: `workedMinutes/overtimeMinutes` أعداد صحيحة بالدقائق، والرواتب تُجمَّع شهريًا من `attendance_daily_summary` لا من `attendance_punches`.

### قرارات تصميمية داخل المخطط
- **الأسماء**: `@@map` يحوّل اسم الجدول إلى snake_case، لكن الأعمدة تبقى camelCase → أي SQL خام يجب أن يكتب `"subDeptId"` بين علامتي اقتباس. (انضمّت 19 قيد CHECK بترقيم camelCase إلى ترحيل الامتدادات لهذا السبب.)
- **كل جدول قابل للمزامنة** يحمل: `version` (int، يزيد على الخادم)، `syncSeq` (bigint، تسلسل التغيير)، `deletedAt` (حذف منطقي)، `clientOpId` (آخر عملية دفع).
- **الجداول الحدثية append-only**: `work_order_logs`, `attendance_punches`, `sync_change_log`, `audit_trail` — الحذف ممنوع عليها حتى من مدير النظام (يُراجَع في `sync-engine.service` + قيد في القاعدة).

## 4. المزامنة بين المكتب والموبايل — التصميم المختار

البروتوكول **v3** (رقمه `SCHEMA_VERSION = 3`)، وهو delta sync باتجاهين مع cursor:

| الاتجاه | القناة | العقد |
|---|---|---|
| دفع (Device → Server) | `POST /api/v1/sync/push` | `{ deviceId, userId, schemaVersion, ops[] }` → `{ nextCursor, results[] }`، وكل عملية لها `opId` (idempotency) و`baseVersion` (قفل تفاؤلي) |
| سحب (Server → Device) | `GET /api/v1/sync/pull?deviceId&sinceCursor&entities&limit` | `{ cursor, hasMore, changes[], fullResyncRequired? }` من `sync_change_log` |
| تخطيط الدفع | `POST /api/v1/sync/batch-plan` | تقسيم الطابور حسب `pushPriority` (200 عملية/دفعة) |
| فحص التعاقد | `GET /api/v1/sync/protocol` | يعيد إصدار المخطط وقائمة الكيانات الـ20 وسياسة الدمج لكل كيان |

**الكيانات القابلة للمزامنة (20):**
`workOrder, workOrderLog, woAttachment, laborEntry, partIssue, shiftLog, processParam, downtime, alarmAck, labSample, labResult, permit, asset, assetReading, pmPlanInstance, attendancePunch, leaveRequest, mobileFormRecord, document, notificationAck`

**سياسة الدمج لكل كيان** (`SYNC_META[*].merge`):
- `field_merge` — أوامر العمل وسجلات الوردية: حقول الخادم المحمية (`status`, `approvedById`, …) تُحسم للخادم، وحقول الميدان الحرة تُدمج، وحقول الملاحظات (`appendFields`) **تُلحق** ولا تستبدل (سطرًا سطرًا، بلا تكرار).
- `append_only` — السجلات الحدثية: تُقبل كما هي، والعميل لا يستطيع حذفها.
- `server_wins` — `asset`, `pmPlanInstance`: الخادم مصدر الحقيقة؛ لا يُقبل تعديل الجهاز (يُبلَّغ التعارض للمستخدم).
- `reject` — `attendancePunch` القادم من غير أجهزة البصمة المعتمدة: يُولَّد تعارض للمراجعة اليدوية.

**سلوكيات حاسمة موثّقة ومُختبَرة:**
- **Idempotency**: إعادة إرسال نفس `opId` (بعد انقطاع/إعادة تشغيل) تُرجع نفس رد الخادم من `sync_idempotency` وتُعلَّم `DEDUPLICATED` — لا تكرار ولا فقدان.
- **حقول الهوية لا تُؤخذ من العميل**: `facilityId/departmentId/subDeptId/createdById/approvedById/passwordHash/…` في `DENIED_COLUMNS`؛ أي محاولة لفرضها تُسجَّل في `sync_conflicts` بسبب `SERVER_STAMPED` (اختبار مغطّى).
- **إعادة مزامنة كاملة** عندما يتغيّر `schemaVersion` أو يتجاوز الفرق في `sync_change_log` مدة الاحتفاظ (500k تسلسل) → `fullResyncRequired: true` (HTTP 409 على الدفع).
- **بلا شبكة**: الكتابة المحلية في Dexie/SQLite ناجحة فورًا، والطابور يبقى؛ عند أول اتصال تُدفع الدفعات بالأولوية، والجهاز لا يفقد مدخلًا واحدًا (مُغطّى باختبار "survives a network outage").

## 5. الأمان والموثّقية التشغيلية

- **الجلسات**: وصول JWT (`sub`, `v` = نسخة المستخدم، `dev` = معرّف الجهاز) + Refresh مخزَّن كـ SHA-256، دوّار مع **إلغاء العائلة كاملة** عند إعادة استعمال رمز قديم؛ `mustChangePwd` يفرض تغيير كلمة المرور.
- **حماية من التخمين**: 5 محاولات خاطئة ⇒ قفل 15 دقيقة؛ حدّ معدل لكل IP (login 5/0.1 rps، refresh 20/1، push 30/2، pull 60/5) عبر `RateLimitGuard` داخل الذاكرة (يستبدَل بـ Redis عند تعدّد النسخ).
- **تدقيق غير قابل للتعديل**: `audit_trail` append-only، تكتبه كل العمليات الحساسة (دخول، اعتماد، إغلاق أمر عمل، تغيير دور، قرارات التعارض).
- **قراءة البصمة محمية**: `hr.biometric.manage` وحده يعطي صلاحية تعديل بصمات الآخرين؛ الطلبات العادية لا تصل إليها (RLS + `privileged.biometric`).

## 6. حدود الحل الحالية (بلا تجميل)

1. **محرّك تنبيهات/جدولة غير منفّذ**: `report_schedule` و`notification` لهما مخطط وعقد مزامنة، لكن لا يوجد Worker مجدول بعد (خطوة تالية: BullMQ + Redis أو pg_cron).
2. **تخزين المستندات**: `CONFIG.storage` يصف minio/s3/local، لكن قناة presigned upload غير منفّذة — المرفقات حاليًا تمر كـ `dataUrl` صغيرة عبر المزامنة؛ يجب إضافة رفع مباشر قبل أي استخدام بكميات كبيرة.
3. **تكامل SAP/ERP**: `integration_configs` مع `credentialRef` موجود، والمزامنة ثنائية الاتجاه للطلبات/الفواتير غير منفّذة.
4. **حدود المعدل داخلية الذاكرة**: صالحة لنسخة خادم واحدة؛ مع أكثر من نسخة يلزم Redis.
5. **`src/lab/` فارغة**: منطق المختبر منفّذ داخل `production`/`workorder` وحزمة `domain`، ولا توجد وحدة Nest مستقلة له بعد.
6. **`pg_stat_statements`** يحتاج `shared_preload_libraries` (مضبوط في docker-compose)؛ على تثبيت PostgreSQL يدوي يُضاف في `postgresql.conf` قبل إنشاء الامتداد.

## 7. أوامر التحقق (كلها تعمل في المستودع)

```bash
npm ci
npm run build -w @newport/domain
npm run test -w @newport/domain      # 48 اختبار: صلاحيات، مصفوفة، WO FSM، تعاقد المزامنة، طبقة العميل
npm run typecheck -w @newport/api     # src + prisma/seed + test (0 أخطاء)
npm run test -w @newport/api          # 16 اختبار: PermissionService + SyncEngineService على بديل Prisma
npm run typecheck -w @newport/desktop # tsconfig.json + tsconfig.electron.json
npm run build -w @newport/desktop     # vite build (حزمة الإنتاج)
npm run test -w @newport/mobile       # 8 اختبارات: الطابور دون اتصال + مخزن SQLite
npm run db:ddl && node apps/api/scripts/gen-schema-docs.mjs   # إعادة توليد المخطط والكتالوج
```

> لم تُشغَّل قاعدة بيانات حيّة ولا `docker compose` في بيئة التطوير هذه؛ الاختبارات أعلاه تعوّض ذلك ببدائل Prisma/SQLite موثوقة السلوك، وبقية الطبقات متحققة بالنوع والبناء.
