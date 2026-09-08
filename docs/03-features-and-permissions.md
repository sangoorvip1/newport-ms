# 03 — ميزات وصلاحيات الأقسام والشعب

> **ملف مولَّد** بـ `npm run docs:features -w @newport/domain`. جداول الأدوار مشتقة من
> `resolveGrants()` — نفس الحساب الذي يزرع `role_subdept_grants` ويتحقق منه `AccessGuard`
> ونقطة `GET /v1/org/permissions-verify`. النثر (الميزات/القواعد/المؤشرات) في
> `packages/domain/scripts/gen-features-doc.ts`.

## 1. القواعد المشتركة

- **صيغة الصلاحية:** `<module>.<entity>.<action>` — مثل `maint.wo.close` أو `prod.log.approve`.
- **الحجم الفعلي:** 94 صلاحية معرّفة · 21 دورًا · 36 منح (شعبة × دور) · 19 كيان مزامنة.
- **النطاقات (ABAC):** `SELF` ← `TEAM` ← `SUBDEPT` ← `DEPT` ← `ALL`؛ لا يتجاوز منحُ دورٍ سقف `maxScope`
  الخاص بالصلاحية (يفحصه `packages/domain/tests/permissions.spec.ts`).
- **ثلاث طبقات تنفيذ**، لا تكفي واحدة:
  1. `AccessGuard`: يرفض قبل الوصول إلى المعالجة ويسجّل المحاولة في `audit_trails` (`action=DENIED`).
  2. `buildScopeWhere()`: يضيف شرط النطاق إلى كل استعلام Prisma.
  3. **RLS في PostgreSQL**: متغيرات `app.*` تضبط بـ `set_config` داخل المعاملة، فتُصفَّر نتائج أي
     استعلام خام نسي شرط النطاق.
- **الحد الأدنى الميداني:** كل دور يعمل من شعبة يحصل تلقائيًا على `auth.login` و`sync.pull` و`sync.push`
  و`notif.view` وعرض الهيكل والوثائق وإجازة الموظف. يُطبَّق داخل `resolveGrants()` ومحترمٌ لسقف كل
  صلاحية، ولا يُمنح لأدوار القراءة فقط (`AUDITOR`، `READONLY_GUEST`). بدونه يفقد الفني القدرة على رفع أعماله من الهاتف.
- **حقول لا يقبلها الخادم من الجهاز** (`DENIED_COLUMNS`) وتُرَّد `server_wins`:
  - `status`، `approvedById/approvedAt` (اعتماد أوامر الشغل والسجلوبات)
  - `verifiedById/verifiedAt` لنتائج المختبر، و`closedAt/actualEndAt/approverId` عند الإغلاق
  - `createdById/byUserId/uploadedById/preparedById` — تُختم من صاحب الجلسة لا من الجهاز
  - `reconciliationHash/payrollExportedAt` لسجل الحضور
- **جدول واحد = كيان مزامنة واحد.** `trg_sync` و`trg_bump_version` و`trg_touch` تُولَّد من
  `sync_entity_registry` (مصدر وحيد)، فلا تُعلَّق على جداول داخلية مثل `users` — لأن رفع
  `users.version` كان يبطل رمز JWT فور تسجيل الدخول.

## 2. ميزات مشتركة بين كل الأقسام

| الميزة | العميل | الواجهة | ملاحظات |
|---|---|---|---|
| دخول/خروج، رموز تحديث دوّارة، إلغاء العائلة عند إعادة الاستعمال | كلاهما | `POST /v1/auth/login` · `/refresh` · `/logout` | `deviceId` إلزامي؛ المطالب `v` يُبطل الجلسات عند تغيّر الصلاحيات |
| جلسة مقيّدة حتى تغيير كلمة المرور الافتراضية | كلاهما | `POST /v1/auth/change-password` | `PASSWORD_BOOTSTRAP_PATHS` تسمح بمسارات الحساب فقط (403 برسالة عربية) |
| الهوية والصلاحيات الفعلية | كلاهما | `GET /v1/auth/me` | يعيد `permissions[]` مع النطاق و`mustChangePwd` |
| الهيكل التنظيمي + كشف الانحراف عن المرجع | مكتب | `GET /v1/org/tree` · `/sub-departments` · `/drift` | `drift.isAligned=true` معيار قبول للنشر |
| مصفوفة الصلاحيات والتحقق من تطابق القاعدة | مكتب | `GET /v1/org/permissions-matrix` · `/permissions-verify` | يجب `inSync:true` |
| إدارة المستخدمين والأدوار والتكليف | مكتب | `GET /v1/org/users` · `POST /v1/org/users/assign-role` | يُعطِّل كاش الصلاحيات للمستخدم فورًا |
| رفع/سحب التغييرات دون اتصال + خطة الدفعة | كلاهما | `POST /v1/sync/push` · `GET /v1/sync/pull` · `POST /v1/sync/batch-plan` · `GET /v1/sync/protocol` | idempotency بـ `opId`؛ `fullResyncRequired` عند فجوة أو إصدار مخطط مختلف |
| سجل التدقيق + إحصاءاته | مكتب | `GET /v1/audit` · `GET /v1/audit/stats` | `audit_trails` append-only بمؤجّل قاعدة |
| مؤشرات الجاهزية | مراقبة | `GET /api/health` · `GET /api/health/ready` | يفحص القاعدة، تطابق الهيكل، RBAC، والتعارضات المفتوحة |
| الإشعارات داخل التطبيق | كلاهما | `notifications` + `notif.view` | تأكيد الاستلام يُزامن ككيان `notificationAck` |

---

## 3. الأقسام والشعب — المهام والميزات والصلاحيات

### قسم الإنتاج — `PROD` (Production Department)

قسم الإنتاج مسؤول عن تشغيل الخط الأول (يوريا/أمونيا/مرافق) وتثبيت نقطة التشغيل، وسجلوبات الورديات، وجودة المنتج، وإنهاء الأعطال التشغيلية عبر أوامر الشغل. نظامه داخل البرنامج: غرفة السيطرة + الميدان.

**ميزات عامة للقسم**

- سجلوبة الوردية موحّدة الشعب: نفس النموذج، والتمييز في حقول الوحدة (unit-specific fields).
- كل انحراف تشغيلي يتحول إلى أمر شغل بنقرة، مع الحفاظ على مصدر الطلب (sourceType=SHIFT_LOG).
- القراءة من الهاتف، الاعتماد من المكتب: قاعدة ثابتة في كل شعب الإنتاج.

**الشعب:** `PROD-UREA`، `PROD-AMM`، `PROD-CT`، `PROD-LAB`

#### شعبة اليوريا — `PROD-UREA`

> **الغرض:** تشغيل وحدة اليوريا (غرفة السيطرة/الحبيبات/التعبئة) وسجلوبات الوردية وجودة المنتج النهائية.
>
> **نمط العمل:** UREA · مكتبي — الواجهة الأساسية سطح المكتب

**أ) المهام التشغيلية**

- تشغيل غرفة سيطرة وحدة اليوريا: التفكيك/التبخر/التحبيب/التجفيف، وتثبيت نقطة التشغيل.
- تسجيل سجلوبة الوردية (إنتاج، استهلاك، حالات، ملاحظات السلامة) ثم اعتمادها.
- متابعة جودة المنتج النهائية: البيوريت، الرطوبة، حجم الحبيبات، مقاومة الانضغاط، اللون.
- إدارة التعبئة والتكديس وأوزان الأكياس وتسليم الدفعات إلى المستودع/الساحة.
- فتح أوامر شغل فورية للانحرافات إلى شعب الصيانة المختصة، وإغلاقها بنتيجة التشغيل.

**ب) الميزات في النظام**

| الميزة | الشاشة/الوحدة | العميل | الواجهة/المسار | ملاحظات |
|---|---|---|---|---|
| سجلوبة الوردية: إنشاء/تصحيح/اعتماد | ShiftScreen · شاشة الوردية | كلاهما | POST/GET /v1/production/shift-logs · POST /:id/approve | — |
| منحنى معاملات التشغيل مع حدود الإنذار | ParamTrend | مكتب | GET /v1/production/params/trend | — |
| الاعتراف بالإنذارات مع توثيق السبب | AlarmPanel | هاتف | push: alarmAck | ackById/ackAt يختمهما الخادم |
| تسجيل التوقفات وأسبابها | DowntimeSheet | كلاهما | push: downtime | — |
| طلب تحليل عاجل من غرفة السيطرة | LabRequest | كلاهما | push: labSample | — |
| فتح أمر شغل صيانة | NewWorkOrderScreen | مكتب | POST /v1/maintenance/work-orders | — |
| لوحة إنتاج اليوريا اليومية + تصدير | UreaDashboard | مكتب | report views · GET /v1/org/* للاطلاع | report.export للصادرات |

**ج) الأدوار ومنحها الفعلي في هذه الشعبة**

| الدور | النطاق | # صلاحيات | الصلاحيات الفعلية (مجمّعة بوحدة الصلاحية) |
|---|---|---|---|
| مراقب سيطرة `CONTROL_ROOM_OPERATOR` | `SUBDEPT` | 18 | **auth**: `auth.login`<br>**doc**: `doc.upload` · `doc.view`<br>**hr**: `hr.att.view`<br>**lab**: `lab.sample.view`<br>**maint**: `maint.wo.create`<br>**notif**: `notif.view`<br>**org**: `org.dept.view`<br>**prod**: `prod.alarm.ack` · `prod.downtime.create` · `prod.downtime.view` · `prod.log.create` · `prod.log.update` · `prod.log.view` · `prod.param.create` · `prod.param.view`<br>**sync**: `sync.pull` · `sync.push` |
| فني صيانة (ميداني) `FIELD_TECHNICIAN` | `SUBDEPT` | 22 | **auth**: `auth.login`<br>**doc**: `doc.upload` · `doc.view`<br>**hr**: `hr.att.view` · `hr.form.create`<br>**lab**: `lab.sample.view`<br>**maint**: `maint.asset.view` · `maint.condition.record` · `maint.permit.create` · `maint.permit.view` · `maint.wo.close` · `maint.wo.execute` · `maint.wo.view`<br>**notif**: `notif.view`<br>**org**: `org.dept.view`<br>**prod**: `prod.downtime.create` · `prod.log.view` · `prod.param.create`<br>**sync**: `sync.pull` · `sync.push`<br>**wh**: `wh.req.create` · `wh.return` |
| رئيس الشعبة `SECTION_HEAD` | `SUBDEPT` | 32 | **auth**: `auth.login`<br>**doc**: `doc.upload` · `doc.view`<br>**fin**: `fin.cost.view`<br>**hr**: `hr.att.view` · `hr.leave.approve` · `hr.shift.view`<br>**lab**: `lab.oos.manage` · `lab.oos.view` · `lab.report.export` · `lab.result.enter` · `lab.result.view` · `lab.sample.create` · `lab.sample.view`<br>**maint**: `maint.wo.create` · `maint.wo.view`<br>**notif**: `notif.view`<br>**org**: `org.dept.view`<br>**prod**: `prod.alarm.ack` · `prod.downtime.create` · `prod.downtime.view` · `prod.log.approve` · `prod.log.create` · `prod.log.update` · `prod.log.view` · `prod.param.create` · `prod.param.view`<br>**report**: `report.export` · `report.view`<br>**sync**: `sync.pull` · `sync.push`<br>**wh**: `wh.item.view` |
| مشرف الوردية `SHIFT_SUPERVISOR` | `SUBDEPT` | 19 | **auth**: `auth.login`<br>**doc**: `doc.upload` · `doc.view`<br>**hr**: `hr.att.view`<br>**lab**: `lab.sample.create` · `lab.sample.view`<br>**maint**: `maint.wo.create`<br>**notif**: `notif.view`<br>**org**: `org.dept.view`<br>**prod**: `prod.alarm.ack` · `prod.downtime.create` · `prod.downtime.view` · `prod.log.create` · `prod.log.update` · `prod.log.view` · `prod.param.create` · `prod.param.view`<br>**sync**: `sync.pull` · `sync.push` |
**د) قواعد العمل الإلزامية** (تُنفَّذ في الخادم، لا في الواجهة فقط)

- السجلوبة المعتمدة لا تُعدَّل؛ التصحيح بسجلوبة تصحيحية مرتبطة بالأصل تُسجَّل في audit_trails.
- اعتماد السجلوبة يتطلب prod.log.approve ولا يُقبل من الهاتف (الخادم يختم approvedById/approvedAt).
- أي انحراف خارج الحدود يفتح OOS عبر المختبر، وتكراره 3 مرات في شهر يولّد أمر شغل مقترح.
- أوزان الأكياس تُسجَّل بعينة كل وردية؛ تجاوز الانحراف المسموح يوقف التعبئة حتى موافقة رئيس الشعبة.

**هـ) مؤشرات الأداء**

- طن متي/يوم ونسبة تحقق الخطة
- توفر الوحدة Availability %
- عدد حملات Biuret > 1.0%
- استهلاك الطاقة (kWh/t)
- نسبة الأكياس المرفوضة/المعادة

#### شعبة الأمونيا — `PROD-AMM`

> **الغرض:** تشغيل وحدة الأمونيا (الإصلاح/التحويل/التخليق/الفصل) ومراقبة السمية والانحرافات.
>
> **نمط العمل:** AMMONIA · مكتبي — الواجهة الأساسية سطح المكتب

**أ) المهام التشغيلية**

- تشغيل وحدة الأمونيا: الإصلاح الأولي/الثانوي، التحويل، التخليق، الفصل، واسترجاع الحرارة.
- مراقبة الغازات السامة والقابلة للاشتعال (NH3، H2، CO) وربط الإنذار بالإخلاء الجزئي.
- إدارة المرافق: الغاز الطبيعي، البخار، هواء الآلات، النيتروجين، وتحسين كفاءة التوربين.
- متابعة المحفزات (عمر التشغيل، سقوط الضغط) وتنسيق إيقافات التجديد مع الصيانة.
- تنفيذ سيناريوهات الطوارئ: تسريب أمونيا، الإيقاف الطارئ الآمن (ESD)، وإعادة الإشعال.

**ب) الميزات في النظام**

| الميزة | الشاشة/الوحدة | العميل | الواجهة/المسار | ملاحظات |
|---|---|---|---|---|
| سجلوبة الوردية لوحدة الأمونيا | ShiftScreen | كلاهما | POST /v1/production/shift-logs | — |
| مراقبة كاشفات الغاز وربطها بالإنذارات | GasAlarmWall | كلاهما | push: alarmAck · push: processParam | — |
| إدارة المرافق وتوزيع الحمل | UtilityBoard | مكتب | push: processParam | prod.utility.manage ممنوحة لهذه الشعبة فقط |
| سجل حالة المحفزات وسقوط الضغط | CatalystLog | مكتب | push: assetReading | — |
| تصاريح العمل في المناطق الخطرة | PermitSheet | كلاهما | push: permit | يتطلب اعتماد maint.permit.approve |
| قوائم تحقق ESD وإعادة الإشعال | StartupChecklist | مكتب | — (وثيقة + سجل) | جدول قوائم تحقق مخصص في المرحلة 1ب |

**ج) الأدوار ومنحها الفعلي في هذه الشعبة**

| الدور | النطاق | # صلاحيات | الصلاحيات الفعلية (مجمّعة بوحدة الصلاحية) |
|---|---|---|---|
| مراقب سيطرة `CONTROL_ROOM_OPERATOR` | `SUBDEPT` | 19 | **auth**: `auth.login`<br>**doc**: `doc.upload` · `doc.view`<br>**hr**: `hr.att.view`<br>**lab**: `lab.sample.create` · `lab.sample.view`<br>**maint**: `maint.wo.create`<br>**notif**: `notif.view`<br>**org**: `org.dept.view`<br>**prod**: `prod.alarm.ack` · `prod.downtime.create` · `prod.downtime.view` · `prod.log.create` · `prod.log.update` · `prod.log.view` · `prod.param.create` · `prod.param.view`<br>**sync**: `sync.pull` · `sync.push` |
| رئيس الشعبة `SECTION_HEAD` | `SUBDEPT` | 28 | **auth**: `auth.login`<br>**doc**: `doc.upload` · `doc.view`<br>**fin**: `fin.cost.view`<br>**hr**: `hr.att.view` · `hr.leave.approve` · `hr.shift.view`<br>**lab**: `lab.result.view` · `lab.sample.create` · `lab.sample.view`<br>**maint**: `maint.wo.create` · `maint.wo.view`<br>**notif**: `notif.view`<br>**org**: `org.dept.view`<br>**prod**: `prod.alarm.ack` · `prod.downtime.create` · `prod.downtime.view` · `prod.log.approve` · `prod.log.create` · `prod.log.update` · `prod.log.view` · `prod.param.create` · `prod.param.view` · `prod.utility.manage`<br>**report**: `report.export` · `report.view`<br>**sync**: `sync.pull` · `sync.push` |
| مشرف الوردية `SHIFT_SUPERVISOR` | `SUBDEPT` | 19 | **auth**: `auth.login`<br>**doc**: `doc.upload` · `doc.view`<br>**hr**: `hr.att.view`<br>**lab**: `lab.sample.create` · `lab.sample.view`<br>**maint**: `maint.wo.create`<br>**notif**: `notif.view`<br>**org**: `org.dept.view`<br>**prod**: `prod.alarm.ack` · `prod.downtime.create` · `prod.downtime.view` · `prod.log.create` · `prod.log.update` · `prod.log.view` · `prod.param.create` · `prod.param.view`<br>**sync**: `sync.pull` · `sync.push` |
**د) قواعد العمل الإلزامية** (تُنفَّذ في الخادم، لا في الواجهة فقط)

- لا عمل داخل حيز أمونيا بدون تصريح ساري + قياس غازات كل 60 دقيقة يُسجَّل في التصريح.
- قراءة NH3 > 25 ppm ترفع إنذارًا فوريًا وتنقل الوحدة إلى ON_HOLD حتى زوال السبب وتوثيقه.
- إعادة الإشعال لا تُسجَّل إلا بقائمة تحقق موقَّعة من مراقبين؛ الأسماء تُؤخذ من جلسة كل مستخدم.
- تغيير نقطة ضبط حساسة (ضغط/حرارة) يمر عبر السجلوبة ويعتمد من رئيس الشعبة.

**هـ) مؤشرات الأداء**

- طن أمونيا/يوم
- استهلاك الغاز (MMBtu/t)
- عدد تسريبات NH3 المسجلة/شهر
- إيقافات ESD غير المخططة
- كفاءة توربين الغاز %

#### شعبة أبراج التبريد — `PROD-CT`

> **الغرض:** تشغيل أبراج التبريد: الخلايا والمراوح ومعالجة المياه (Cycles/BI) وتنظيف الحشوات.
>
> **نمط العمل:** COOLING_TOWER · ميداني — وضع «دون اتصال» مفعّل في تطبيق الهاتف

**أ) المهام التشغيلية**

- تشغيل أبراج التبريد: الخلايا، المراوح، المضخات، توزيع الماء، والحشوات (fill).
- معالجة المياه: دورات التركيز، معامل الترسب (BI)، الكلور/المواد البيولوجية، والصرف.
- متابعة حرارة رجوع الماء وكفاءة التبريد مقابل درجة البصيلة الرطبة.
- برامج التنظيف الكيميائي والميكانيكي وتخطيط الإيقاف الجزئي للخلايا.
- رصد التآكل والترسب في خطوط الماء الدائرة والتنسيق مع المعدات الحرارية.

**ب) الميزات في النظام**

| الميزة | الشاشة/الوحدة | العميل | الواجهة/المسار | ملاحظات |
|---|---|---|---|---|
| سجلوبة أبراج التبريد (خلايا/مضخات/كيمياء) | ShiftScreen | كلاهما | push: shiftLog · GET /v1/production/shift-logs | — |
| متابعة كيمياء الماء ودورات التركيز | WaterChemBoard | مكتب | push: processParam · push: labResult | — |
| جدول تنظيف/صيانة الخلايا | PmPlanBoard | مكتب | pull: pmPlanInstance | — |
| قياس اهتزاز وحرارة مراوح الخلايا | FanCondition | هاتف | push: assetReading | — |
| طلب صرف كيماويات من المخزن | StoreRequest | كلاهما | push: partIssue | يتطلب wh.req.create للاعتماد wh.req.approve |
| تسجيل الخلية خارج الخدمة كتوقف | DowntimeSheet | كلاهما | push: downtime | — |

**ج) الأدوار ومنحها الفعلي في هذه الشعبة**

| الدور | النطاق | # صلاحيات | الصلاحيات الفعلية (مجمّعة بوحدة الصلاحية) |
|---|---|---|---|
| فني صيانة (ميداني) `FIELD_TECHNICIAN` | `SUBDEPT` | 23 | **auth**: `auth.login`<br>**doc**: `doc.upload` · `doc.view`<br>**hr**: `hr.att.view` · `hr.form.create`<br>**lab**: `lab.sample.view`<br>**maint**: `maint.asset.view` · `maint.condition.record` · `maint.permit.create` · `maint.permit.view` · `maint.wo.close` · `maint.wo.execute` · `maint.wo.view`<br>**notif**: `notif.view`<br>**org**: `org.dept.view`<br>**prod**: `prod.downtime.create` · `prod.log.view` · `prod.param.create` · `prod.utility.manage`<br>**sync**: `sync.pull` · `sync.push`<br>**wh**: `wh.req.create` · `wh.return` |
| رئيس الشعبة `SECTION_HEAD` | `SUBDEPT` | 28 | **auth**: `auth.login`<br>**doc**: `doc.upload` · `doc.view`<br>**fin**: `fin.cost.view`<br>**hr**: `hr.att.view` · `hr.leave.approve` · `hr.shift.view`<br>**lab**: `lab.result.view` · `lab.sample.create` · `lab.sample.view`<br>**maint**: `maint.wo.create` · `maint.wo.view`<br>**notif**: `notif.view`<br>**org**: `org.dept.view`<br>**prod**: `prod.alarm.ack` · `prod.downtime.create` · `prod.downtime.view` · `prod.log.approve` · `prod.log.create` · `prod.log.update` · `prod.log.view` · `prod.param.create` · `prod.param.view` · `prod.utility.manage`<br>**report**: `report.export` · `report.view`<br>**sync**: `sync.pull` · `sync.push` |
| مشرف الوردية `SHIFT_SUPERVISOR` | `SUBDEPT` | 20 | **auth**: `auth.login`<br>**doc**: `doc.upload` · `doc.view`<br>**hr**: `hr.att.view`<br>**lab**: `lab.sample.create` · `lab.sample.view`<br>**maint**: `maint.wo.create`<br>**notif**: `notif.view`<br>**org**: `org.dept.view`<br>**prod**: `prod.alarm.ack` · `prod.downtime.create` · `prod.downtime.view` · `prod.log.create` · `prod.log.update` · `prod.log.view` · `prod.param.create` · `prod.param.view` · `prod.utility.manage`<br>**sync**: `sync.pull` · `sync.push` |
**د) قواعد العمل الإلزامية** (تُنفَّذ في الخادم، لا في الواجهة فقط)

- كل خلية خارج الخدمة تُسجَّل downtime بسبب (تآكل/مروحة/حشوة) ليدخل في حساب الكفاءة.
- نتيجة تحليل خارج الحدود (BI < 3 أو Cl < 0.3 ppm) تفتح OOS وتُلزم إجراءً تصحيحيًا موثقًا.
- تغيير جرعة الكيماوي يُقترح من الهاتف ويُعتمد من رئيس الشعبة قبل التنفيذ.

**هـ) مؤشرات الأداء**

- Approach °C لكل خلية
- دورات التركيز
- كفاءة التبريد %
- استهلاك ماء Makeup (m³/h)
- عدد الخلايا المتوقفة الآن

#### المختبر — `PROD-LAB`

> **الغرض:** تحاليل العمليات والمنتج (NH3/Urea/Sub-mic/Boiler/CW)، شهادات التحليل، ومطابقة المواصفات.
>
> **نمط العمل:** LAB · ميداني — وضع «دون اتصال» مفعّل في تطبيق الهاتف

**أ) المهام التشغيلية**

- سحب العينات من نقاط العينة المعتمدة (عمليات + منتج) وتسجيل وقت السحب والعينة.
- إدخال النتائج (يوريا/أمونيا/مياه الغلايات/مياه التبريد/الغازات) مع مطابقة الحدود تلقائيًا.
- إدارة حالات عدم المطابقة (OOS) وتحقيقات الإجراءات التصحيحية والوقائية (CAPA) وإغلاقها.
- إصدار شهادات التحليل لكل دفعة وربطها بأوامر البيع والتحميل.
- إدارة أجهزة المختبر: معايرة، صيانة، مواد مرجعية، ومحاليل.

**ب) الميزات في النظام**

| الميزة | الشاشة/الوحدة | العميل | الواجهة/المسار | ملاحظات |
|---|---|---|---|---|
| طلب عينة من الوردية/الإنتاج | SampleRequest | كلاهما | POST /v1/lab/samples · push: labSample | العينة تملكها الشعبة المنتِجة؛ المختبر لا يفتحها باسم شعبة أخرى |
| إدخال نتائج التحاليل | ResultEntry | كلاهما | POST /v1/lab/samples/:id/results · push: labResult | المدخل من الهاتف يبقى مبدئيًا حتى lab.result.verify؛ الاستبدال بعد الاعتماد 409 |
| مطابقة تلقائية مع مواصفات المنتج | SpecCheck | كلاهما | GET /v1/lab/parameters · evaluateSpec في @newport/domain | الحساب في حزمة واحدة ليراه الهاتف والخادم متطابقين |
| فتح/تحقيق/إغلاق OOS و CAPA | OosCase | مكتب | GET /v1/lab/oos · POST /v1/lab/oos/:id | تُنشأ تلقائيًا من نتيجة مخالفة؛ الإغلاق يتطلب سببًا جذريًا + نص CAPA (قيد في القاعدة أيضًا) |
| تدقيق (اعتماد) النتائج نتيجةً نتيجة | ResultVerification | مكتب | POST /v1/lab/results/:id/verify | lab.result.verify — المُدخِل لا يعتمد نتائج نفسه؛ اكتمال التدقيق ينقل العينة إلى VERIFIED |
| إصدار شهادة تحليل للدفعة | CoAPreview | مكتب | GET /v1/lab/certificates/:sampleId · documents | lab.report.export — تُحجب ما دامت حالة OOS مفتوحة على العينة |
| مؤشرات المختبر (دوران/مطابقة/OOS) | LabKpi | مكتب | GET /v1/lab/stats | نافذة 30 يومًا داخل نطاق المستخدم |
| سجل معايرة أجهزة المختبر | CalibrationLog | كلاهما | push: assetReading | — |

**ج) الأدوار ومنحها الفعلي في هذه الشعبة**

| الدور | النطاق | # صلاحيات | الصلاحيات الفعلية (مجمّعة بوحدة الصلاحية) |
|---|---|---|---|
| محلل مختبر `LAB_ANALYST` | `SUBDEPT` | 16 | **auth**: `auth.login`<br>**doc**: `doc.upload` · `doc.view`<br>**hr**: `hr.att.view`<br>**lab**: `lab.oos.manage` · `lab.oos.view` · `lab.result.enter` · `lab.result.view` · `lab.sample.create` · `lab.sample.view`<br>**notif**: `notif.view`<br>**org**: `org.dept.view`<br>**prod**: `prod.log.view` · `prod.param.view`<br>**sync**: `sync.pull` · `sync.push` |
| مسؤول المختبر `LAB_SUPERVISOR` | `SUBDEPT` | 18 | **auth**: `auth.login`<br>**doc**: `doc.upload` · `doc.view`<br>**hr**: `hr.att.view`<br>**lab**: `lab.oos.manage` · `lab.oos.view` · `lab.report.export` · `lab.result.enter` · `lab.result.verify` · `lab.result.view` · `lab.sample.create` · `lab.sample.view`<br>**notif**: `notif.view`<br>**org**: `org.dept.view`<br>**prod**: `prod.log.view` · `prod.param.view`<br>**sync**: `sync.pull` · `sync.push` |
| رئيس الشعبة `SECTION_HEAD` | `SUBDEPT` | 23 | **auth**: `auth.login`<br>**doc**: `doc.upload` · `doc.view`<br>**hr**: `hr.att.view`<br>**lab**: `lab.oos.manage` · `lab.oos.view` · `lab.report.export` · `lab.result.enter` · `lab.result.verify` · `lab.result.view` · `lab.sample.create` · `lab.sample.view`<br>**maint**: `maint.wo.create` · `maint.wo.view`<br>**notif**: `notif.view`<br>**org**: `org.dept.view`<br>**prod**: `prod.downtime.view` · `prod.log.view` · `prod.param.view`<br>**report**: `report.export` · `report.view`<br>**sync**: `sync.pull` · `sync.push` |
**د) قواعد العمل الإلزامية** (تُنفَّذ في الخادم، لا في الواجهة فقط)

- النتيجة لا تُعتمد إلا بصلاحية lab.result.verify؛ حقل VerifyById/At من ختم الخادم.
- نتيجة خارج الحد لا تُحذف: تُصحَّح بنتيجة جديدة مع سبب، ويُفتح OOS إجباريًا.
- شهادة التحليل لا تُصدَّر للعميل قبل اعتماد رئيس الشعبة أو من يفوّضه.
- lab.sample.create ممنوحة لمنتجي العينات في الإنتاج، لكن إدخال النتائج محصور بالمختبر.

**هـ) مؤشرات الأداء**

- متوسط زمن الدوران (سحب ← نتيجة معتمدة)
- نسبة العينات المعادة %
- OOS مفتوحة/مغلقة هذا الشهر
- الالتزام بخطة معايرة الأجهزة %

### قسم الصيانة — `MAINT` (Maintenance Department)

قسم الصيانة يملك تنفيذ أوامر الشغل على 6 شعب تخصصية، وخطط الصيانة الوقائية، وحالة المعدات، وقطع الغيار، والتصاريح. العمل الميداني دون اتصال هو الوضع الافتراضي لهذا القسم.

**ميزات عامة للقسم**

- كل شعبة صيانة ترى أوامرها (SUBDEPT)، ومدير القسم يرى القسم كله (DEPT).
- ساعات العمالة والقطع تُربط بأمر الشغل لتخرج تكلفة/معدن في المالية.
- الفريق الميداني يرفع الصور والملاحظات من الهاتف وتُقبَل كـ document مرتبط بالسجل.

**الشعب:** `MAINT-HEAT`، `MAINT-ROT`، `MAINT-ELEC`، `MAINT-VALVE`، `MAINT-INST`، `MAINT-GEN`

#### شعبة المعدات الحرارية — `MAINT-HEAT`

> **الغرض:** المعدات الحرارية: المبادل الحراري، المفكك (Stripper)، أوعية الضغط، الفلنجات، اختبار التسرب، مواد حرارية.
>
> **نمط العمل:** HEAT_EQUIPMENT · ميداني — وضع «دون اتصال» مفعّل في تطبيق الهاتف

**أ) المهام التشغيلية**

- صيانة المبادلات الحرارية، الأفران/المحوّلات، الغلايات، العزل الحراري، وخطوط البخار.
- فحص التسريبات الحرارية، اختبارات الضغط الهيدروستاتيكي، وتوثيق النتائج.
- تنظيف الكتل والمبادلات (كيميائي/ميكانيكي) وإدارة استبدال الأنابيب.
- دعم تصاريح العمل الساخن والعزل/القفل (LOTO) في المناطق الحرارية.
- قراءة سجلات الحرارة/الضغط وربطها بحالة المعدن (creep, carburization).

**ب) الميزات في النظام**

| الميزة | الشاشة/الوحدة | العميل | الواجهة/المسار | ملاحظات |
|---|---|---|---|---|
| تنفيذ أوامر الشغل: استلام/بدء/إنهاء | TasksScreen · WorkOrdersScreen | كلاهما | GET/POST /v1/maintenance/work-orders · POST /:id/transition | — |
| تسجيل ساعات العمالة والمعدات | LaborEntry | كلاهما | POST /v1/maintenance/work-orders/:id/labor · push: laborEntry | — |
| قياسات الحالة: حرارة سطح، سماكة، تصوير حراري | ConditionReadings | هاتف | push: assetReading · maint.condition.record | — |
| طلب قطع غيار/مواد | PartsRequest | كلاهما | push: partIssue | — |
| المرفقات والصور الميدانية | AttachmentSheet | كلاهما | POST /v1/documents/upload · PUT /v1/documents/raw/:token | المرفقات restOnly: المزامنة تسحب الفهرس فقط، والرفع عبر الطابور المحلي (JSON للمكتب، presign+PUT للكاميرا) |
| خطة PM للمعدات الحرارية | PmPlanBoard | مكتب | pull: pmPlanInstance | — |
| مؤشرات MTBF/MTTR والتكدّس | MaintenanceCockpit | مكتب | دوال fn_mtbf_mttr / fn_wo_backlog_age في القاعدة | — |

**ج) الأدوار ومنحها الفعلي في هذه الشعبة**

| الدور | النطاق | # صلاحيات | الصلاحيات الفعلية (مجمّعة بوحدة الصلاحية) |
|---|---|---|---|
| فني صيانة (ميداني) `FIELD_TECHNICIAN` | `SUBDEPT` | 24 | **auth**: `auth.login`<br>**doc**: `doc.upload` · `doc.view`<br>**hr**: `hr.att.view` · `hr.form.create`<br>**lab**: `lab.result.enter` · `lab.result.view` · `lab.sample.create` · `lab.sample.view`<br>**maint**: `maint.asset.view` · `maint.condition.record` · `maint.permit.create` · `maint.permit.view` · `maint.wo.close` · `maint.wo.execute` · `maint.wo.view`<br>**notif**: `notif.view`<br>**org**: `org.dept.view`<br>**prod**: `prod.downtime.create` · `prod.log.view`<br>**sync**: `sync.pull` · `sync.push`<br>**wh**: `wh.req.create` · `wh.return` |
| مسؤول السلامة `HSE_OFFICER` | `DEPT` | 12 | **auth**: `auth.login`<br>**doc**: `doc.upload` · `doc.view`<br>**hr**: `hr.att.view`<br>**maint**: `maint.permit.approve` · `maint.permit.view` · `maint.wo.view`<br>**notif**: `notif.view`<br>**org**: `org.dept.view`<br>**prod**: `prod.log.view`<br>**sync**: `sync.pull` · `sync.push` |
| رئيس الشعبة `SECTION_HEAD` | `SUBDEPT` | 36 | **auth**: `auth.login`<br>**doc**: `doc.upload` · `doc.view`<br>**hr**: `hr.att.view` · `hr.emp.view` · `hr.form.view` · `hr.leave.approve` · `hr.shift.view`<br>**maint**: `maint.asset.manage` · `maint.asset.view` · `maint.backlog.view` · `maint.condition.record` · `maint.condition.view` · `maint.downtime.verify` · `maint.permit.approve` · `maint.permit.create` · `maint.permit.view` · `maint.pm.manage` · `maint.wo.assign` · `maint.wo.cancel` · `maint.wo.close` · `maint.wo.create` · `maint.wo.execute` · `maint.wo.view`<br>**notif**: `notif.view`<br>**org**: `org.dept.view`<br>**prod**: `prod.downtime.view` · `prod.log.view`<br>**report**: `report.export` · `report.view`<br>**sync**: `sync.pull` · `sync.push`<br>**wh**: `wh.item.view` · `wh.req.approve` · `wh.req.create` · `wh.return` |
**د) قواعد العمل الإلزامية** (تُنفَّذ في الخادم، لا في الواجهة فقط)

- أي عمل على خط بخار أو مبادل يتطلب تصريح عمل ساريًا وعزلًا موثقًا قبل IN_PROGRESS.
- إغلاق أمر الشغل يتطلب maint.wo.close ويسجَّل rootCause والقطع والساعات الفعلية.
- الأمر الطارئ (EMERGENCY) يبدأ فورًا ويُكمَّل تصريحه خلال 4 ساعات كحد أقصى.
- الحقول المعتمدة (status/approverId/closedAt) لا تُقبل من الهاتف: تُرَّد server_wins.

**هـ) مؤشرات الأداء**

- MTBF/MTTR لكل معدن حرج
- عمر التكدّس Backlog (أيام)
- نسبة العمل المخطط %
- إعادة العمل Rework %
- تسريبات مغلقة/مفتوحة

#### شعبة المعدات الدوارة — `MAINT-ROT`

> **الغرض:** المعدات الدوارة: الضواغط، المضخات، المراوح، تحليل الاهتزاز، المحاذاة بالليزر، التزييت.
>
> **نمط العمل:** ROTATING_EQUIPMENT · ميداني — وضع «دون اتصال» مفعّل في تطبيق الهاتف

**أ) المهام التشغيلية**

- صيانة المضخات والضواغط والتوربينات: محامل، محاورة، محاذاة بالليزر، موازنة ديناميكية.
- برامج مراقبة الحالة: اهتزاز، حرارة محامل، تحليل زيت، وحرارة الأجسام.
- متابعة الاحتياطيات الاستراتيجية (dowel kits، mechanical seals، محامل).
- تنسيق إيقافات التجديد الكبرى مع الإنتاج والمخطط.
- توثيق نتائج ما بعد الصيانة قبل إعادة التشغيل.

**ب) الميزات في النظام**

| الميزة | الشاشة/الوحدة | العميل | الواجهة/المسار | ملاحظات |
|---|---|---|---|---|
| قراءات الاهتزاز وحرارة المحامل | VibrationLog | هاتف | push: assetReading | — |
| خطة تحليل الزيت وسحب العينات | OilSamplePlan | كلاهما | push: labSample | entityType=ASSET |
| تقرير المحاذاة/الموازنة المرفق | AlignmentReport | مكتب | POST /v1/documents/upload · DocumentUploadQueue | — |
| أوامر الشغل وسجل العمالة | TasksScreen | كلاهما | /v1/maintenance/work-orders | — |
| خطة PM لكل معدن دوّار | PmPlanBoard | مكتب | pull: pmPlanInstance | — |

**ج) الأدوار ومنحها الفعلي في هذه الشعبة**

| الدور | النطاق | # صلاحيات | الصلاحيات الفعلية (مجمّعة بوحدة الصلاحية) |
|---|---|---|---|
| فني صيانة (ميداني) `FIELD_TECHNICIAN` | `SUBDEPT` | 21 | **auth**: `auth.login`<br>**doc**: `doc.upload` · `doc.view`<br>**hr**: `hr.att.view` · `hr.form.create`<br>**lab**: `lab.sample.view`<br>**maint**: `maint.asset.view` · `maint.condition.record` · `maint.permit.create` · `maint.permit.view` · `maint.wo.close` · `maint.wo.execute` · `maint.wo.view`<br>**notif**: `notif.view`<br>**org**: `org.dept.view`<br>**prod**: `prod.downtime.create` · `prod.log.view`<br>**sync**: `sync.pull` · `sync.push`<br>**wh**: `wh.req.create` · `wh.return` |
| رئيس الشعبة `SECTION_HEAD` | `SUBDEPT` | 36 | **auth**: `auth.login`<br>**doc**: `doc.upload` · `doc.view`<br>**hr**: `hr.att.view` · `hr.emp.view` · `hr.form.view` · `hr.leave.approve` · `hr.shift.view`<br>**maint**: `maint.asset.manage` · `maint.asset.view` · `maint.backlog.view` · `maint.condition.record` · `maint.condition.view` · `maint.downtime.verify` · `maint.permit.approve` · `maint.permit.create` · `maint.permit.view` · `maint.pm.manage` · `maint.wo.assign` · `maint.wo.cancel` · `maint.wo.close` · `maint.wo.create` · `maint.wo.execute` · `maint.wo.view`<br>**notif**: `notif.view`<br>**org**: `org.dept.view`<br>**prod**: `prod.downtime.view` · `prod.log.view`<br>**report**: `report.export` · `report.view`<br>**sync**: `sync.pull` · `sync.push`<br>**wh**: `wh.item.view` · `wh.req.approve` · `wh.req.create` · `wh.return` |
**د) قواعد العمل الإلزامية** (تُنفَّذ في الخادم، لا في الواجهة فقط)

- قراءة اهتزاز تتجاوز المنطقة D في ISO تفتح أمر شغل تلقائيًا ولا يُغلق إلا بإعادة قياس.
- تغيير محامل/سيل ميكانيكي يُسجَّل بطلب قطعة لربط التكلفة بالمعدن.
- لا إعادة تشغيل معدن دوّار قبل توقيع قراءة اهتزاز ما بعد الصيانة (maint.condition.record).

**هـ) مؤشرات الأداء**

- نسبة المعدات في المنطقة A/B %
- MTBF للمضخات الحرجة
- PM في موعدها %
- تكلفة الصيانة/ساعة تشغيل

#### شعبة الكهرباء — `MAINT-ELEC`

> **الغرض:** الكهرباء: MV/LV، المحركات، لوحات التوزيع، الصيانة الوقائية للعزل، الأنظمة الكهروميكانيكية.
>
> **نمط العمل:** ELECTRICAL · ميداني — وضع «دون اتصال» مفعّل في تطبيق الهاتف

**أ) المهام التشغيلية**

- صيانة نظم القدرة: محولات، MV/LV، لوحات، مفاتيح، كابلات، ومحركات كهربائية.
- اختبارات ومعايرة مرحلات الحماية وتنسيق الفصل (relay coordination) ومحاكاة الأعطال.
- الإضاءة، التأريض، الحماية من الصواعق، وتكييف غرف الكهرباء وإنذار الحريق فيها.
- دعم العزل/القفل الكهربائي وتراخيص العمل على الجهد.
- متابعة أحمال المغذيات وتوزيعها وتوثيق الانقطاعات.

**ب) الميزات في النظام**

| الميزة | الشاشة/الوحدة | العميل | الواجهة/المسار | ملاحظات |
|---|---|---|---|---|
| أوامر شغل كهرباء + قائمة تحقق LOTO | TasksScreen | كلاهما | /v1/maintenance/work-orders · push: permit | — |
| سجل قياسات العزل (Megger) والجهد | ElectricalReadings | هاتف | push: assetReading | — |
| سجل اختبار المرحلات وزمن الفصل | RelayTestLog | مكتب | push: workOrderLog | — |
| خريطة الأحمال والمغذيات | LoadMap | مكتب | assets (unit/type/tag) | — |
| طلب قطع غيار كهربائية حرجة | PartsRequest | كلاهما | push: partIssue | — |
| تصريح عمل كهربائي واعتماده | PermitSheet | كلاهما | push: permit | اعتماد: HSE + maint.permit.approve |

**ج) الأدوار ومنحها الفعلي في هذه الشعبة**

| الدور | النطاق | # صلاحيات | الصلاحيات الفعلية (مجمّعة بوحدة الصلاحية) |
|---|---|---|---|
| فني صيانة (ميداني) `FIELD_TECHNICIAN` | `SUBDEPT` | 22 | **auth**: `auth.login`<br>**doc**: `doc.upload` · `doc.view`<br>**hr**: `hr.att.view` · `hr.form.create`<br>**lab**: `lab.sample.view`<br>**maint**: `maint.asset.view` · `maint.condition.record` · `maint.permit.approve` · `maint.permit.create` · `maint.permit.view` · `maint.wo.close` · `maint.wo.execute` · `maint.wo.view`<br>**notif**: `notif.view`<br>**org**: `org.dept.view`<br>**prod**: `prod.downtime.create` · `prod.log.view`<br>**sync**: `sync.pull` · `sync.push`<br>**wh**: `wh.req.create` · `wh.return` |
| رئيس الشعبة `SECTION_HEAD` | `SUBDEPT` | 36 | **auth**: `auth.login`<br>**doc**: `doc.upload` · `doc.view`<br>**hr**: `hr.att.view` · `hr.emp.view` · `hr.form.view` · `hr.leave.approve` · `hr.shift.view`<br>**maint**: `maint.asset.manage` · `maint.asset.view` · `maint.backlog.view` · `maint.condition.record` · `maint.condition.view` · `maint.downtime.verify` · `maint.permit.approve` · `maint.permit.create` · `maint.permit.view` · `maint.pm.manage` · `maint.wo.assign` · `maint.wo.cancel` · `maint.wo.close` · `maint.wo.create` · `maint.wo.execute` · `maint.wo.view`<br>**notif**: `notif.view`<br>**org**: `org.dept.view`<br>**prod**: `prod.downtime.view` · `prod.log.view`<br>**report**: `report.export` · `report.view`<br>**sync**: `sync.pull` · `sync.push`<br>**wh**: `wh.item.view` · `wh.req.approve` · `wh.req.create` · `wh.return` |
**د) قواعد العمل الإلزامية** (تُنفَّذ في الخادم، لا في الواجهة فقط)

- العمل على جهد > 400V يتطلب تصريحًا معتمدًا من HSE ورئيس الشعبة وقفلًا مرقَّمًا موثقًا.
- لا إغلاق لأمر شغل كهربائي دون تسجيل نتيجة اختبار العزل مرفقة.
- أي تغيير في إعدادات المرحلات يسجَّل بالقيمة السابقة واللاحقة (audit) ويبلغ لغرفة السيطرة.

**هـ) مؤشرات الأداء**

- انقطاعات غير مخططة/شهر
- MTTR لاستعادة التغذية
- اختبارات المرحلات في موعدها %
- أعطال المحركات بعد الصيانة %

#### شعبة الصمامات — `MAINT-VALVE`

> **الغرض:** الصمامات: بنش تست لصمامات السلامة (PSV)، إصلاح الصمامات، سجل الصيانة والاختبارات، إعادة التركيب.
>
> **نمط العمل:** VALVE · ميداني — وضع «دون اتصال» مفعّل في تطبيق الهاتف

**أ) المهام التشغيلية**

- ورشة الصمامات: فك، تنظيف، استبدال مقاعد وأختام، وتجميع مع اختبار إغلاق.
- اختبارات الضغط والتسريب وتوثيق النتائج لكل صمام.
- إدارة مخزون الصمامات المُجدَّدة وتتبع مواقعها في الوحدات.
- دعم إيقافات التجديد: خريطة الصمامات الحرجة وأولويات الإصلاح.
- فحص صمامات الأمان (PSV) وضبط ضغط الفتح وفق الشهادة والتاريخ.

**ب) الميزات في النظام**

| الميزة | الشاشة/الوحدة | العميل | الواجهة/المسار | ملاحظات |
|---|---|---|---|---|
| بطاقة صمام داخل/خارج الورشة | ValveShopCard | كلاهما | push: workOrder · push: asset | — |
| نتائج اختبار الإغلاق والضغط | ValveTestResult | هاتف | push: assetReading | — |
| سجل شهادات PSV وإعادة الاختبار | PsvRegister | مكتب | GET /v1/documents/:id/content · pull: pmPlanInstance | — |
| ربط الصمام بموقعه/خطه | ValveMap | مكتب | assets (tag/lineNo/assetType) | — |
| صرف/إرجاع صمام مجدّد من المخزون | StoreIssue | مكتب | wh.issue · wh.return | — |

**ج) الأدوار ومنحها الفعلي في هذه الشعبة**

| الدور | النطاق | # صلاحيات | الصلاحيات الفعلية (مجمّعة بوحدة الصلاحية) |
|---|---|---|---|
| فني صيانة (ميداني) `FIELD_TECHNICIAN` | `SUBDEPT` | 21 | **auth**: `auth.login`<br>**doc**: `doc.upload` · `doc.view`<br>**hr**: `hr.att.view` · `hr.form.create`<br>**lab**: `lab.sample.view`<br>**maint**: `maint.asset.view` · `maint.condition.record` · `maint.permit.create` · `maint.permit.view` · `maint.wo.close` · `maint.wo.execute` · `maint.wo.view`<br>**notif**: `notif.view`<br>**org**: `org.dept.view`<br>**prod**: `prod.downtime.create` · `prod.log.view`<br>**sync**: `sync.pull` · `sync.push`<br>**wh**: `wh.req.create` · `wh.return` |
| رئيس الشعبة `SECTION_HEAD` | `SUBDEPT` | 36 | **auth**: `auth.login`<br>**doc**: `doc.upload` · `doc.view`<br>**hr**: `hr.att.view` · `hr.emp.view` · `hr.form.view` · `hr.leave.approve` · `hr.shift.view`<br>**maint**: `maint.asset.manage` · `maint.asset.view` · `maint.backlog.view` · `maint.condition.record` · `maint.condition.view` · `maint.downtime.verify` · `maint.permit.approve` · `maint.permit.create` · `maint.permit.view` · `maint.pm.manage` · `maint.wo.assign` · `maint.wo.cancel` · `maint.wo.close` · `maint.wo.create` · `maint.wo.execute` · `maint.wo.view`<br>**notif**: `notif.view`<br>**org**: `org.dept.view`<br>**prod**: `prod.downtime.view` · `prod.log.view`<br>**report**: `report.export` · `report.view`<br>**sync**: `sync.pull` · `sync.push`<br>**wh**: `wh.item.view` · `wh.req.approve` · `wh.req.create` · `wh.return` |
**د) قواعد العمل الإلزامية** (تُنفَّذ في الخادم، لا في الواجهة فقط)

- لا إعادة تركيب صمام قبل تسجيل نتيجة اختبار ناجحة وإرفاق الشهادة.
- صمام أمان تجاوز تاريخ اختباره يتحول تلقائيًا إلى أمر شغل ويُبلَّغ HSE.
- الكميات في الورشة تُخصم عبر صرف/إرجاع موثق حتى لا تنفصل التكلفة عن المعدن.

**هـ) مؤشرات الأداء**

- متوسط بقاء الصمام في الورشة (يوم)
- نسبة نجاح الاختبار الأول %
- PSV منتهية الشهادة (عدد)
- نسبة إعادة الاستخدام بدل الشراء %

#### شعبة الآلات الدقيقة — `MAINT-INST`

> **الغرض:** الآلات الدقيقة: أجهزة القياس، صمامات التحكم، أنظمة DCS/ESD/F&G، المحللات، عيارات (Calibration).
>
> **نمط العمل:** INSTRUMENTATION · ميداني — وضع «دون اتصال» مفعّل في تطبيق الهاتف

**أ) المهام التشغيلية**

- صيانة أجهزة القياس: ضغط، حرارة، مستوى، تدفق، وتحاليل مباشرة (online analyzers).
- معايرة الأجهزة وفق خطة معتمدة وتوثيق الشهادة قبل/بعد.
- الدعم الفني لنظم DCS/PLC/ESD وضبط تغييرات المنطق.
- اختبار الحلقات (loop tests) ومعايرة حلقات التحكم مع غرفة السيطرة.
- متابعة الإنذارات الكاذبة وجوده بيانات أنظمة القياس.

**ب) الميزات في النظام**

| الميزة | الشاشة/الوحدة | العميل | الواجهة/المسار | ملاحظات |
|---|---|---|---|---|
| خطة المعايرة ومتابعة انتهائها | CalibrationPlan | مكتب | pull: pmPlanInstance | — |
| بطاقة معايرة (قبل/بعد/انحراف) | CalibrationCard | هاتف | push: assetReading | — |
| نتائج اختبار الحلقة و ESD | LoopTestSheet | كلاهما | push: workOrderLog · POST /v1/documents/upload · GET /v1/documents?entityType=workOrder | — |
| سجل تغييرات منطق DCS/PLC | LogicChangeLog | مكتب | documents + audit_trails | جدول تغييرات مخصص في 1ب |
| أوامر شغل الأجهزة الدقيقة | TasksScreen | كلاهما | /v1/maintenance/work-orders | — |

**ج) الأدوار ومنحها الفعلي في هذه الشعبة**

| الدور | النطاق | # صلاحيات | الصلاحيات الفعلية (مجمّعة بوحدة الصلاحية) |
|---|---|---|---|
| فني صيانة (ميداني) `FIELD_TECHNICIAN` | `SUBDEPT` | 21 | **auth**: `auth.login`<br>**doc**: `doc.upload` · `doc.view`<br>**hr**: `hr.att.view` · `hr.form.create`<br>**lab**: `lab.sample.view`<br>**maint**: `maint.asset.view` · `maint.condition.record` · `maint.permit.create` · `maint.permit.view` · `maint.wo.close` · `maint.wo.execute` · `maint.wo.view`<br>**notif**: `notif.view`<br>**org**: `org.dept.view`<br>**prod**: `prod.downtime.create` · `prod.log.view`<br>**sync**: `sync.pull` · `sync.push`<br>**wh**: `wh.req.create` · `wh.return` |
| رئيس الشعبة `SECTION_HEAD` | `SUBDEPT` | 36 | **auth**: `auth.login`<br>**doc**: `doc.upload` · `doc.view`<br>**hr**: `hr.att.view` · `hr.emp.view` · `hr.form.view` · `hr.leave.approve` · `hr.shift.view`<br>**maint**: `maint.asset.manage` · `maint.asset.view` · `maint.backlog.view` · `maint.condition.record` · `maint.condition.view` · `maint.downtime.verify` · `maint.permit.approve` · `maint.permit.create` · `maint.permit.view` · `maint.pm.manage` · `maint.wo.assign` · `maint.wo.cancel` · `maint.wo.close` · `maint.wo.create` · `maint.wo.execute` · `maint.wo.view`<br>**notif**: `notif.view`<br>**org**: `org.dept.view`<br>**prod**: `prod.downtime.view` · `prod.log.view`<br>**report**: `report.export` · `report.view`<br>**sync**: `sync.pull` · `sync.push`<br>**wh**: `wh.item.view` · `wh.req.approve` · `wh.req.create` · `wh.return` |
**د) قواعد العمل الإلزامية** (تُنفَّذ في الخادم، لا في الواجهة فقط)

- جهاز تجاوز تاريخ معايرته يُعلَّم OUT_OF_CAL ويظهر تنبيهه في كل شاشة تستخدم قراءته.
- أي تغيير في منطق ESD/IL يحتاج موافقة رئيس الشعبة + مدير الإنتاج، ويسجَّل في audit_trails.
- شهادة المعايرة تُلحق كـ document مرتبط بالمعدن، وتاريخها يُقرأ في تقرير الانحرافات.

**هـ) مؤشرات الأداء**

- الالتزام بخطة المعايرة %
- أجهزة خارج الموضع > الحد %
- تعديلات PID موثقة/شهر
- إنذارات كاذبة لكل وحدة/شهر

#### شعبة المعدات العامة — `MAINT-GEN`

> **الغرض:** المعدات العامة: الأعمال المدنية، الهياكل، العزل الحراري والصباغة، الرافعات، الصيانة العامة للمبنى.
>
> **نمط العمل:** GENERAL_MAINTENANCE · ميداني — وضع «دون اتصال» مفعّل في تطبيق الهاتف

**أ) المهام التشغيلية**

- الصيانة المدنية: الخزانات، الأرضيات، الأسوار، المباني، والهياكل المعدنية.
- التكييف والتهوية (HVAC) للشركات والمباني الإدارية وغرف التحكم.
- شبكات الماء والصرف الصحي ومياه الإطفاء، وصيانة الطرق داخل الحدود.
- إدارة المعدات العامة والأدوات والعدد (tool crib) وتوثيق الاستعارة.
- التنظيف الصناعي ورفع المخلفات مع ضبط متطلبات السلامة والبيئة.

**ب) الميزات في النظام**

| الميزة | الشاشة/الوحدة | العميل | الواجهة/المسار | ملاحظات |
|---|---|---|---|---|
| طلب صيانة عام من أي شعبة | NewWorkOrderScreen | كلاهما | POST /v1/maintenance/work-orders | — |
| سجل الأدوات المستعارة/المُرجَّعة | ToolCrib | مكتب | push: asset · push: laborEntry | الأداة تُسجَّل كأصل فرعي |
| خطط صيانة المباني و HVAC | PmPlanBoard | مكتب | pull: pmPlanInstance | — |
| تذكرة تنظيف/رفع مخلفات مع مرفقات | WasteTicket | كلاهما | POST /v1/documents/presign · PUT /v1/documents/raw/:token | — |
| سجل السلامة للمقاولين الخارجيين | ContractorLog | مكتب | users/employees (CONTRACTOR) | — |

**ج) الأدوار ومنحها الفعلي في هذه الشعبة**

| الدور | النطاق | # صلاحيات | الصلاحيات الفعلية (مجمّعة بوحدة الصلاحية) |
|---|---|---|---|
| فني صيانة (ميداني) `FIELD_TECHNICIAN` | `SUBDEPT` | 21 | **auth**: `auth.login`<br>**doc**: `doc.upload` · `doc.view`<br>**hr**: `hr.att.view` · `hr.form.create`<br>**lab**: `lab.sample.view`<br>**maint**: `maint.asset.view` · `maint.condition.record` · `maint.permit.create` · `maint.permit.view` · `maint.wo.close` · `maint.wo.execute` · `maint.wo.view`<br>**notif**: `notif.view`<br>**org**: `org.dept.view`<br>**prod**: `prod.downtime.create` · `prod.log.view`<br>**sync**: `sync.pull` · `sync.push`<br>**wh**: `wh.req.create` · `wh.return` |
| رئيس الشعبة `SECTION_HEAD` | `SUBDEPT` | 36 | **auth**: `auth.login`<br>**doc**: `doc.upload` · `doc.view`<br>**hr**: `hr.att.view` · `hr.emp.view` · `hr.form.view` · `hr.leave.approve` · `hr.shift.view`<br>**maint**: `maint.asset.manage` · `maint.asset.view` · `maint.backlog.view` · `maint.condition.record` · `maint.condition.view` · `maint.downtime.verify` · `maint.permit.approve` · `maint.permit.create` · `maint.permit.view` · `maint.pm.manage` · `maint.wo.assign` · `maint.wo.cancel` · `maint.wo.close` · `maint.wo.create` · `maint.wo.execute` · `maint.wo.view`<br>**notif**: `notif.view`<br>**org**: `org.dept.view`<br>**prod**: `prod.downtime.view` · `prod.log.view`<br>**report**: `report.export` · `report.view`<br>**sync**: `sync.pull` · `sync.push`<br>**wh**: `wh.item.view` · `wh.req.approve` · `wh.req.create` · `wh.return` |
**د) قواعد العمل الإلزامية** (تُنفَّذ في الخادم، لا في الواجهة فقط)

- أي عمل رافعة/سقالة يحتاج تصريح عمل وقائمة تحقق سلامة مرفقة قبل البدء.
- المعدات العامة تُسجَّل كأصول بمركز تكلفة خاص لعزل التكلفة عن الإنتاج.
- طلب تنظيف متأخر > 7 أيام يُرفع تلقائيًا إلى مدير الصيانة في تقرير المعوقات.

**هـ) مؤشرات الأداء**

- الطلبات المفتوحة/المغلقة
- متوسط زمن الإغلاق (يوم)
- تكلفة الصيانة العامة/شهر
- المخالفات المتكررة للنظافة/السلامة

### الأقسام الإدارية — `ADMIN` (Administrative Sections)

الأقسام الإدارية تغطي الحضور والبصمة، والتجارية (البيع والتحميل)، والمالية (التكلفة والموازنة والتحصيل). طبيعتها مكتبية: العمل الأساسي من سطح المكتب، والهاتف للموافقات وطلب التصحيحات.

**ميزات عامة للقسم**

- البيانات الإدارية حساسة: نطاق SELF لمالك السجل، وALL لموظف الموارد البشرية/المالية عند الحاجة.
- التصدير إلى أنظمة خارجية (رواتب، فواتير) يمر بملفات موقّعة hash ولا يُعدَّل بعد التصدير.
- لا مزامنة دون اتصال في البصمة: الجهاز يجلب البيانات من خادم المصنع مباشرة.

**الشعب:** `ADM-BIO`، `ADM-COM`، `ADM-FIN`

#### شعبة البصمة — `ADM-BIO`

> **الغرض:** البصمة والانضباط: سحب سجلات الأجهزة، معالجة النواقص، بطاقة الملاك، جهات التعريف، التصدير إلى الرواتب.
>
> **نمط العمل:** BIOMETRIC · مكتبي — الواجهة الأساسية سطح المكتب

**أ) المهام التشغيلية**

- استلام بصمات/بصمات الوجه من أجهزة ZKTeco (ملف أو سحب دوري من الجهاز).
- معالجة النواقص: نسيان بصمة، مهمة رسمية، تكليف ميداني، إذن خروج.
- إدارة الجداول والدوريات (A/B/C، مناوبة ليلية) وطلبات التبادل بين الورديات.
- تسوية أجور اليوم/الشهر وتصدير قاعدة الرواتب إلى الشعبة المالية.
- أرشفة سجل الحضور والتسويات المعتمدة كسجل غير قابل للتعديل.

**ب) الميزات في النظام**

| الميزة | الشاشة/الوحدة | العميل | الواجهة/المسار | ملاحظات |
|---|---|---|---|---|
| استيراد بصمات من ZKTeco | PunchImport | مكتب | POST /v1/time/punches/import | hr.att.import |
| إعادة حساب الحضور ليوم/فترة | RecalcPanel | مكتب | POST /v1/time/recalculate | — |
| طلب تصحيح بصمة وموافقة المدير | CorrectionFlow | كلاهما | POST /v1/time/corrections · POST /corrections/:id/decide | — |
| لوحة حضور اليوم لكل شعبة | DailyAttendance | كلاهما | GET /v1/time/daily | — |
| تصدير ملف الرواتب (CSV + hash) | PayrollExport | مكتب | GET /v1/time/payroll-export | hr.att.export_payroll |
| خطة الورديات وبدلات التبادل | RosterEditor | مكتب | جداول hr/* · Phase 1b UI | hr.shift.manage |

**ج) الأدوار ومنحها الفعلي في هذه الشعبة**

| الدور | النطاق | # صلاحيات | الصلاحيات الفعلية (مجمّعة بوحدة الصلاحية) |
|---|---|---|---|
| موظف الموارد البشرية `HR_OFFICER` | `ALL` | 19 | **auth**: `auth.login`<br>**doc**: `doc.upload` · `doc.view`<br>**hr**: `hr.att.all` · `hr.att.correct` · `hr.att.export_payroll` · `hr.att.import` · `hr.att.view` · `hr.emp.view` · `hr.leave.approve` · `hr.shift.manage` · `hr.shift.view`<br>**notif**: `notif.view`<br>**org**: `org.delegation.manage` · `org.dept.view`<br>**report**: `report.export` · `report.view`<br>**sync**: `sync.pull` · `sync.push` |
| موظف الرواتب `PAYROLL_OFFICER` | `ALL` | 13 | **auth**: `auth.login`<br>**doc**: `doc.upload` · `doc.view`<br>**fin**: `fin.payroll.view`<br>**hr**: `hr.att.export_payroll` · `hr.att.view` · `hr.emp.view`<br>**notif**: `notif.view`<br>**org**: `org.dept.view`<br>**report**: `report.export` · `report.view`<br>**sync**: `sync.pull` · `sync.push` |
| رئيس الشعبة `SECTION_HEAD` | `SUBDEPT` | 15 | **auth**: `auth.login`<br>**doc**: `doc.upload` · `doc.view`<br>**hr**: `hr.att.correct` · `hr.att.view` · `hr.emp.view` · `hr.leave.approve` · `hr.shift.manage` · `hr.shift.view`<br>**notif**: `notif.view`<br>**org**: `org.dept.view`<br>**prod**: `prod.log.view`<br>**report**: `report.view`<br>**sync**: `sync.pull` · `sync.push` |
| مدير النظام `SYS_ADMIN` | `ALL` | 9 | **admin**: `admin.system`<br>**auth**: `auth.login`<br>**doc**: `doc.upload` · `doc.view`<br>**hr**: `hr.att.view`<br>**notif**: `notif.view`<br>**org**: `org.dept.view`<br>**sync**: `sync.pull` · `sync.push` |
**د) قواعد العمل الإلزامية** (تُنفَّذ في الخادم، لا في الواجهة فقط)

- نافذة قبول البصمة ±4 ساعات حول بداية الوردية؛ خارجها نقيصة تحتاج تصحيحًا معتمدًا.
- العمل الليلي +15%، ويوم الجمعة ×2، والإضافي بسقف شهري يعتمده مدير الموارد البشرية.
- التصحيح لا يعدّل الصف الأصلي: سجل تصحيح مستقل + إعادة حساب، ويحدث reconciliationHash.
- لا تُصدَّر قاعدة الرواتب قبل اعتماد كل التصحيحات المفتوحة للفترة (يمنعها الخادم).

**هـ) مؤشرات الأداء**

- نسبة الحضور الفوري %
- النواقص لكل شعبة/شهر
- زمن معالجة التصحيح (يوم)
- ساعات إضافية/عامل
- تكلفة العمل الليلي

#### الشعبة التجارية — `ADM-COM`

> **الغرض:** الشعبة التجارية: أوامر البيع/التحميل، العملاء ووكلاء التوزيع، الكميات المسلّمة، الأسعار والعقود.
>
> **نمط العمل:** COMMERCIAL · مكتبي — الواجهة الأساسية سطح المكتب

**أ) المهام التشغيلية**

- إدارة أوامر البيع (يوريا/أمونيا) وأسعارها وعقود العملاء وآجال التسليم.
- تنسيق التحميل: حجز موعد، وزن داخل/خارج، رقم التذكرة، وتوقيع السائق.
- حسابات العملاء والذمم المدينة وضوابط الاعتماد الائتماني.
- إصدار فواتير البيع ومطابقتها مع أذون التحميل وسندات الصرف.
- متابعة مخزون المنتج الجاهز وتخصيص الدفعات حسب شهادة التحليل.

**ب) الميزات في النظام**

| الميزة | الشاشة/الوحدة | العميل | الواجهة/المسار | ملاحظات |
|---|---|---|---|---|
| أمر بيع + فحص حد الائتمان | SalesOrderSheet | مكتب | sales_orders · com.order.create/confirm | — |
| إذن تحميل وتذكرة وزن | LoadingTicket | كلاهما | sales_order_lines.ticketInNo/ticketOutNo | — |
| فواتير البيع | InvoiceEditor | مكتب | sales_invoices · fin.invoice.manage | — |
| ربط الدفعة بشهادة التحليل | BatchCoaLink | مكتب | GET /v1/lab/certificates/:sampleId · POST /v1/documents/:id/metadata | — |
| كشف حساب عميل وأعمار الذمم | CustomerLedger | مكتب | com.customer.manage · report views | — |
| تصدير تقرير المبيعات | SalesReport | مكتب | com.report.export | — |

**ج) الأدوار ومنحها الفعلي في هذه الشعبة**

| الدور | النطاق | # صلاحيات | الصلاحيات الفعلية (مجمّعة بوحدة الصلاحية) |
|---|---|---|---|
| الموظف التجاري `COMMERCIAL_OFFICER` | `DEPT` | 15 | **auth**: `auth.login`<br>**com**: `com.customer.manage` · `com.order.confirm` · `com.order.create` · `com.order.view` · `com.report.export`<br>**doc**: `doc.upload` · `doc.view`<br>**hr**: `hr.att.view`<br>**notif**: `notif.view`<br>**org**: `org.dept.view`<br>**prod**: `prod.log.view`<br>**report**: `report.view`<br>**sync**: `sync.pull` · `sync.push` |
| رئيس الشعبة `SECTION_HEAD` | `SUBDEPT` | 23 | **auth**: `auth.login`<br>**com**: `com.customer.manage` · `com.order.confirm` · `com.order.create` · `com.order.view` · `com.pricing.manage` · `com.report.export`<br>**doc**: `doc.manage` · `doc.upload` · `doc.view`<br>**fin**: `fin.coa.view` · `fin.cost.view` · `fin.invoice.manage`<br>**hr**: `hr.att.view`<br>**maint**: `maint.wo.create`<br>**notif**: `notif.view`<br>**org**: `org.dept.view`<br>**prod**: `prod.downtime.view` · `prod.log.view`<br>**report**: `report.export` · `report.view`<br>**sync**: `sync.pull` · `sync.push` |
**د) قواعد العمل الإلزامية** (تُنفَّذ في الخادم، لا في الواجهة فقط)

- لا إذن تحميل قبل موافقة المالية على الحد الائتماني أو تسجيل دفعة مقدمة.
- الوزن الصافي = داخل − خارج بفرق مسموح ≤ 0.3%؛ التجاوز يوقف التحميل ويطلب تحقيقًا.
- الدفعة المرتبطة بشهادة مرفوضة لا تُحمَّل (ربط إجباري بشعبة المختبر).
- أي تعديل بعد إصدار الفاتورة يسجَّل بقيد عكسي، لا تعديل مباشر للصف.

**هـ) مؤشرات الأداء**

- مبيعات الشهر (طن/دينار)
- متوسط زمن دورة التحميل (دقيقة)
- الذمم > 60 يوم %
- شكاوى الجودة المرتبطة بالتحميل

#### الشعبة المالية — `ADM-FIN`

> **الغرض:** الشعبة المالية: القيود والسندات، أوامر الشراء وسلطات التوقيع، الرواتب، التحصيل، الموازنة وتكاليف الصيانة.
>
> **نمط العمل:** FINANCE · مكتبي — الواجهة الأساسية سطح المكتب

**أ) المهام التشغيلية**

- القيود اليومية والسندات (قبض/صرف)، شجرة الحسابات، وإقفال الفترة المالية.
- تحليل تكلفة الإنتاج: مواد، طاقة، عمالة، صيانة — لكل وحدة ولكل طن.
- إعداد ومتابعة الموازنة التشغيلية وتقارير الانحراف للمالك.
- اعتماد أوامر الشراء ومطابقة الفواتير مع أوامر الشراء والإيصال (3-way match).
- الجرد الدوري للمخازن وتسوية الفروقات والموافقة عليها.

**ب) الميزات في النظام**

| الميزة | الشاشة/الوحدة | العميل | الواجهة/المسار | ملاحظات |
|---|---|---|---|---|
| شجرة الحسابات والقيود | JournalEntries | مكتب | journal_entries · fin.journal.manage | — |
| تحليل تكلفة الطن | CostAnalysis | مكتب | cost_center_code · fin.cost.view · report.view | — |
| الموازنة ومتابعة الانحراف | BudgetTracking | مكتب | fin.budget.view/manage (1b UI) | — |
| اعتماد أوامر الشراء والمطابقة الثلاثية | PoApproval | مكتب | purchase_orders · grns · fin.po.approve · fin.grn_finance | — |
| الجرد وتسوية الفروقات | Stocktake | كلاهما | wh.stocktake · push: partIssue | — |
| استلام تسوية الرواتب من البصمة | PayrollSettlement | مكتب | GET /v1/time/payroll-export · fin.payroll.view/run | — |
| تحصيل الذمم ومتابعة الأعمار | Receivables | مكتب | fin.ar_collect | — |

**ج) الأدوار ومنحها الفعلي في هذه الشعبة**

| الدور | النطاق | # صلاحيات | الصلاحيات الفعلية (مجمّعة بوحدة الصلاحية) |
|---|---|---|---|
| محاسب `ACCOUNTANT` | `ALL` | 17 | **auth**: `auth.login`<br>**doc**: `doc.upload` · `doc.view`<br>**fin**: `fin.ar_collect` · `fin.coa.view` · `fin.cost.view` · `fin.grn_finance` · `fin.invoice.manage` · `fin.journal.manage` · `fin.po.view`<br>**hr**: `hr.att.view`<br>**notif**: `notif.view`<br>**org**: `org.dept.view`<br>**report**: `report.export` · `report.view`<br>**sync**: `sync.pull` · `sync.push` |
| مدقق (داخلي/خارجي) `AUDITOR` | `ALL` | 14 | **audit**: `audit.export` · `audit.view`<br>**auth**: `auth.login`<br>**doc**: `doc.view`<br>**fin**: `fin.coa.view` · `fin.cost.view` · `fin.journal.manage` · `fin.po.view`<br>**hr**: `hr.att.view`<br>**notif**: `notif.view`<br>**org**: `org.dept.view`<br>**report**: `report.export` · `report.view`<br>**sync**: `sync.pull` |
| المدير المالي `FINANCE_MANAGER` | `ALL` | 21 | **audit**: `audit.view`<br>**auth**: `auth.login`<br>**doc**: `doc.upload` · `doc.view`<br>**fin**: `fin.ar_collect` · `fin.budget.manage` · `fin.coa.view` · `fin.cost.view` · `fin.grn_finance` · `fin.invoice.manage` · `fin.journal.manage` · `fin.payroll.run` · `fin.po.approve` · `fin.rate.manage`<br>**hr**: `hr.att.view`<br>**notif**: `notif.view`<br>**org**: `org.dept.view`<br>**report**: `report.export` · `report.view`<br>**sync**: `sync.pull` · `sync.push` |
| رئيس الشعبة `SECTION_HEAD` | `SUBDEPT` | 29 | **audit**: `audit.view`<br>**auth**: `auth.login`<br>**doc**: `doc.manage` · `doc.upload` · `doc.view`<br>**fin**: `fin.ar_collect` · `fin.budget.manage` · `fin.budget.view` · `fin.coa.view` · `fin.cost.view` · `fin.grn_finance` · `fin.invoice.manage` · `fin.journal.manage` · `fin.payroll.run` · `fin.payroll.view` · `fin.po.approve` · `fin.po.view` · `fin.rate.manage`<br>**hr**: `hr.att.export_payroll` · `hr.att.view` · `hr.emp.view`<br>**maint**: `maint.backlog.view`<br>**notif**: `notif.view`<br>**org**: `org.dept.view`<br>**prod**: `prod.log.view`<br>**report**: `report.export` · `report.view`<br>**sync**: `sync.pull` · `sync.push` |
**د) قواعد العمل الإلزامية** (تُنفَّذ في الخادم، لا في الواجهة فقط)

- قيد معتمد لا يُعدَّل؛ يُعكَس بقيد مرتبط به ويسجَّل في audit_trails.
- لا صرف قبل أمر شراء معتمد + إيصال استلام مطابق للكمية والسعر.
- ملف الرواتب يُستورد بـ reconciliationHash ومطابقته شرط قبل الإقفال.
- تسوية الجرد تحتاج موافقة مدير المالية (fin.journal.manage) وتُنشئ قيدًا تلقائيًا.

**هـ) مؤشرات الأداء**

- تكلفة/طن (مواد + طاقة + صيانة)
- انحراف الموازنة %
- دورة مدفوعات الموردين
- قيمة المخزون الراكد
- فروقات الجرد (دينار/%)

---

## 4. الأدوار العامة (تجاوز مستوى الشعبة)

ممنوحة على مستوى المنشأة/القسم لأن صاحبها يعبر الأقسام:

| الدور | النطاق | # | الصلاحيات |
|---|---|---|---|
| رئيس القسم `DEPT_MANAGER` | `DEPT` | 35 | `prod.log.approve` · `maint.wo.assign` · `maint.wo.close` · `maint.wo.cancel` · `maint.pm.manage` · `maint.asset.manage` · `maint.backlog.view` · `maint.permit.approve` · `maint.downtime.verify` · `wh.req.approve` · `wh.issue` · `wh.grn` · `wh.stocktake` · `wh.manage` · `hr.leave.approve` · `hr.shift.manage` · `hr.att.correct` · `hr.form.view` · `prod.downtime.view` · `prod.param.view` · `com.order.confirm` · `fin.cost.view` · `fin.budget.view` · `report.view` · `report.export` · `doc.view` · `doc.upload` · `audit.view` · `auth.login` · `sync.pull` · `sync.push` · `notif.view` · `org.dept.view` · `lab.sample.view` · `lab.result.view` |
| مسؤول الوثائق `DOC_CONTROLLER` | `ALL` | 8 | `doc.manage` · `doc.upload` · `doc.view` · `report.export` · `auth.login` · `notif.view` · `sync.pull` · `admin.system` |
| مسؤول السلامة `HSE_OFFICER` | `ALL` | 13 | `maint.permit.approve` · `maint.permit.view` · `maint.wo.view` · `prod.downtime.view` · `lab.oos.manage` · `lab.oos.view` · `lab.result.view` · `report.view` · `doc.upload` · `auth.login` · `notif.view` · `sync.pull` · `sync.push` |
| مخطط صيانة `PLANNER` | `DEPT` | 15 | `maint.pm.manage` · `maint.wo.assign` · `maint.wo.view` · `maint.backlog.view` · `wh.item.view` · `wh.req.approve` · `prod.downtime.view` · `maint.condition.view` · `report.view` · `report.export` · `fin.cost.view` · `auth.login` · `sync.pull` · `sync.push` · `notif.view` |
| مدير المعمل/المشروع `PLANT_MANAGER` | `ALL` | 24 | `report.view` · `report.export` · `prod.log.approve` · `maint.wo.view` · `maint.wo.assign` · `maint.wo.close` · `maint.permit.approve` · `maint.backlog.view` · `maint.asset.view` · `lab.result.verify` · `lab.sample.view` · `lab.result.view` · `lab.oos.view` · `fin.budget.view` · `fin.cost.view` · `fin.po.approve` · `com.order.view` · `hr.leave.approve` · `hr.att.all` · `hr.shift.view` · `org.delegation.manage` · `audit.view` · `doc.manage` · `report.kpi.manage` |
| مستخدم عرض فقط `READONLY_GUEST` | `DEPT` | 12 | `report.view` · `prod.log.view` · `prod.param.view` · `maint.wo.view` · `maint.backlog.view` · `wh.item.view` · `com.order.view` · `fin.budget.view` · `lab.sample.view` · `lab.result.view` · `auth.login` · `notif.view` |
| مدير النظام `SYS_ADMIN` | `ALL` | 14 | `org.dept.manage` · `org.user.manage` · `org.user.view` · `org.role.manage` · `admin.system` · `audit.view` · `audit.export` · `doc.manage` · `report.kpi.manage` · `auth.login` · `notif.view` · `sync.pull` · `org.dept.view` · `hr.emp.view` |

---

## 5. خلاصة صلاحيات الاستخدام بحسب الوحدة

| الوحدة | قراءة | تنفيذ/إنشاء | اعتماد أو إقفال | إدارة |
|---|---|---|---|---|
| `maint` | `maint.wo.view`، `maint.asset.view`، `maint.condition.view`، `maint.backlog.view`، `maint.permit.view` | `maint.wo.create`، `maint.wo.execute`، `maint.wo.assign`، `maint.condition.record` · `maint.permit.create` | `maint.wo.close`، `maint.wo.cancel`، `maint.permit.approve`، `maint.downtime.verify` | `maint.asset.manage`، `maint.pm.manage` |
| `prod` | `prod.log.view`، `prod.param.view`، `prod.downtime.view` | `prod.log.create`، `prod.log.update`، `prod.param.create`، `prod.alarm.ack`، `prod.downtime.create` | `prod.log.approve` | `prod.utility.manage` |
| `lab` | — (القراءة عبر `prod`/`report`) | `lab.sample.create`، `lab.result.enter` | `lab.result.verify` | `lab.oos.manage`، `lab.report.export` |
| `wh` | `wh.item.view` | `wh.req.create`، `wh.return` | `wh.req.approve`، `wh.issue`، `wh.grn` | `wh.stocktake`، `wh.manage` |
| `hr` | `hr.att.view`، `hr.shift.view`، `hr.leave.view`، `hr.form.view`، `hr.emp.view` | `hr.leave.request`، `hr.form.create`، `hr.att.import` | `hr.att.correct`، `hr.leave.approve`، `hr.att.export_payroll` | `hr.shift.manage`، `hr.att.all` |
| `fin` | `fin.coa.view`، `fin.cost.view`، `fin.po.view`، `fin.budget.view`، `fin.payroll.view` | — (التنفيذ قيد الإدارة) | `fin.po.approve`، `fin.grn_finance`، `fin.payroll.run` | `fin.journal.manage`، `fin.invoice.manage`، `fin.budget.manage`، `fin.ar_collect`، `fin.rate.manage` |
| `com` | `com.order.view` | `com.order.create` | `com.order.confirm` | `com.customer.manage`، `com.pricing.manage`، `com.report.export` |
| `doc` | `doc.view` | `doc.upload` | — | `doc.manage` |
| `report` | `report.view` | `report.export` | — | `report.kpi.manage` |
| `org` | `org.dept.view`، `org.user.view` | — | — | `org.dept.manage`، `org.user.manage`، `org.role.manage`، `org.delegation.manage` |
| `audit` | `audit.view` | — | — | `audit.export` |
| `sync`/`notif`/`auth`/`admin` | `sync.pull`، `notif.view` | `sync.push`، `auth.login` | — | `admin.system` |

> ملاحظة: الاعتماد قرار إداري — لا يُقبل من الهاتف، والحقول الناتجة عنه (`approvedById`،
> `verifiedById`، `approverId`) يختمها الخادم من جلسة المستخدم.

## 6. ملاحظات الحوكمة

- **لا صلاحية ميتة:** كل صلاحية في `permissions.ts` ممنوحة لدور واحد على الأقل، باستثناء
  المؤجَّل صراحةً: `hr.emp.manage`
  (مرهون بترحيل بيانات العقود من نظام الموارد البشرية المركزي — المرحلة الثانية).
- **الفصل بين المهام:** `SYS_ADMIN` يدير النظام ولا يملك `maint.wo.create` ولا `prod.log.approve`؛
  و`AUDITOR`/`READONLY_GUEST` بلا `sync.push` ولا `doc.upload` (تأكيد حيّ في `scripts/e2e-smoke.mjs`:
  الفني يُحجَب عن إنشاء أمر شغل بـ 403، ومسارات البيانات مغلقة قبل تغيير كلمة المرور).
- **دوران التغيير الآمن:** تعديل `roles.ts` ← `npm test -w @newport/domain` ← `npm run docs:all -w @newport/api`
  ← `npm run seed -w @newport/api` ← `GET /v1/org/permissions-verify` يجب أن يعيد `inSync:true`.
- **الهيكل التنظيمي مرجعي:** لا تُضاف شعب جديدة من الواجهة؛ أي توسعة (خط ثانٍ/ثالث) تتم عبر
  `facilities` و`sub_departments` مع `npm run docs:all -w @newport/api` لفحص الانحراف.

---

*المجلدات: 3 · الشعب: 13 · التوليد: 2026-09-08*
