/**
 * يولّد docs/03-features-and-permissions.md (المطلوب الثالث: ميزات وصلاحيات كل قسم وشعبة).
 *
 * لماذا مولَّدًا؟ جداول «الأدوار ومنحها» تُشتق من resolveGrants() — نفس الحساب الذي يزرع
 * role_subdept_grants ويتحقق منه AccessGuard. ولو كُتبت يدويًا لانفصلت عن الواقع.
 * كما يتحقق المولّد أن كل رمز صلاحية مذكور في النص موجود فعلًا في الكتالوج (لا رموح مخترعة).
 *
 * التشغيل: npm run docs:features   (أو npm run docs:all -w @newport/api)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ACCESS_MATRIX,
  DEFERRED_PHASE2_PERMISSIONS,
  ORG_STRUCTURE,
  PERMISSION_DEFS,
  READ_ONLY_ROLES,
  ROLE_DEFS,
  SYNC_ENTITIES,
  isPermissionCode,
  resolveGrants,
} from '../src/index.js';

/* ── المحتوى الوصفي (النثر هنا، والجداول مشتقة) ────────────────────────── */
interface FeatureRow {
  name: string;
  screen: string;
  client: 'مكتب' | 'هاتف' | 'كلاهما';
  api: string;
  note?: string;
}
interface SectionDoc {
  tasks: string[];
  features: FeatureRow[];
  rules: string[];
  kpis: string[];
}

const DEPT_DOC: Record<string, { intro: string; shared: string[] }> = {
  PROD: {
    intro:
      'قسم الإنتاج مسؤول عن تشغيل الخط الأول (يوريا/أمونيا/مرافق) وتثبيت نقطة التشغيل، وسجلوبات الورديات، ' +
      'وجودة المنتج، وإنهاء الأعطال التشغيلية عبر أوامر الشغل. نظامه داخل البرنامج: غرفة السيطرة + الميدان.',
    shared: [
      'سجلوبة الوردية موحّدة الشعب: نفس النموذج، والتمييز في حقول الوحدة (unit-specific fields).',
      'كل انحراف تشغيلي يتحول إلى أمر شغل بنقرة، مع الحفاظ على مصدر الطلب (sourceType=SHIFT_LOG).',
      'القراءة من الهاتف، الاعتماد من المكتب: قاعدة ثابتة في كل شعب الإنتاج.',
    ],
  },
  MAINT: {
    intro:
      'قسم الصيانة يملك تنفيذ أوامر الشغل على 6 شعب تخصصية، وخطط الصيانة الوقائية، وحالة المعدات، ' +
      'وقطع الغيار، والتصاريح. العمل الميداني دون اتصال هو الوضع الافتراضي لهذا القسم.',
    shared: [
      'كل شعبة صيانة ترى أوامرها (SUBDEPT)، ومدير القسم يرى القسم كله (DEPT).',
      'ساعات العمالة والقطع تُربط بأمر الشغل لتخرج تكلفة/معدن في المالية.',
      'الفريق الميداني يرفع الصور والملاحظات من الهاتف وتُقبَل كـ document مرتبط بالسجل.',
    ],
  },
  ADMIN: {
    intro:
      'الأقسام الإدارية تغطي الحضور والبصمة، والتجارية (البيع والتحميل)، والمالية (التكلفة والموازنة والتحصيل). ' +
      'طبيعتها مكتبية: العمل الأساسي من سطح المكتب، والهاتف للموافقات وطلب التصحيحات.',
    shared: [
      'البيانات الإدارية حساسة: نطاق SELF لمالك السجل، وALL لموظف الموارد البشرية/المالية عند الحاجة.',
      'التصدير إلى أنظمة خارجية (رواتب، فواتير) يمر بملفات موقّعة hash ولا يُعدَّل بعد التصدير.',
      'لا مزامنة دون اتصال في البصمة: الجهاز يجلب البيانات من خادم المصنع مباشرة.',
    ],
  },
};

const DOC: Record<string, SectionDoc> = {
  'PROD-UREA': {
    tasks: [
      'تشغيل غرفة سيطرة وحدة اليوريا: التفكيك/التبخر/التحبيب/التجفيف، وتثبيت نقطة التشغيل.',
      'تسجيل سجلوبة الوردية (إنتاج، استهلاك، حالات، ملاحظات السلامة) ثم اعتمادها.',
      'متابعة جودة المنتج النهائية: البيوريت، الرطوبة، حجم الحبيبات، مقاومة الانضغاط، اللون.',
      'إدارة التعبئة والتكديس وأوزان الأكياس وتسليم الدفعات إلى المستودع/الساحة.',
      'فتح أوامر شغل فورية للانحرافات إلى شعب الصيانة المختصة، وإغلاقها بنتيجة التشغيل.',
    ],
    features: [
      { name: 'سجلوبة الوردية: إنشاء/تصحيح/اعتماد', screen: 'ShiftScreen · شاشة الوردية', client: 'كلاهما', api: 'POST/GET /v1/production/shift-logs · POST /:id/approve' },
      { name: 'منحنى معاملات التشغيل مع حدود الإنذار', screen: 'ParamTrend', client: 'مكتب', api: 'GET /v1/production/params/trend' },
      { name: 'الاعتراف بالإنذارات مع توثيق السبب', screen: 'AlarmPanel', client: 'هاتف', api: 'push: alarmAck', note: 'ackById/ackAt يختمهما الخادم' },
      { name: 'تسجيل التوقفات وأسبابها', screen: 'DowntimeSheet', client: 'كلاهما', api: 'push: downtime' },
      { name: 'طلب تحليل عاجل من غرفة السيطرة', screen: 'LabRequest', client: 'كلاهما', api: 'push: labSample' },
      { name: 'فتح أمر شغل صيانة', screen: 'NewWorkOrderScreen', client: 'مكتب', api: 'POST /v1/maintenance/work-orders' },
      { name: 'لوحة إنتاج اليوريا اليومية + تصدير', screen: 'UreaDashboard', client: 'مكتب', api: 'report views · GET /v1/org/* للاطلاع', note: 'report.export للصادرات' },
    ],
    rules: [
      'السجلوبة المعتمدة لا تُعدَّل؛ التصحيح بسجلوبة تصحيحية مرتبطة بالأصل تُسجَّل في audit_trails.',
      'اعتماد السجلوبة يتطلب prod.log.approve ولا يُقبل من الهاتف (الخادم يختم approvedById/approvedAt).',
      'أي انحراف خارج الحدود يفتح OOS عبر المختبر، وتكراره 3 مرات في شهر يولّد أمر شغل مقترح.',
      'أوزان الأكياس تُسجَّل بعينة كل وردية؛ تجاوز الانحراف المسموح يوقف التعبئة حتى موافقة رئيس الشعبة.',
    ],
    kpis: ['طن متي/يوم ونسبة تحقق الخطة', 'توفر الوحدة Availability %', 'عدد حملات Biuret > 1.0%', 'استهلاك الطاقة (kWh/t)', 'نسبة الأكياس المرفوضة/المعادة'],
  },

  'PROD-AMM': {
    tasks: [
      'تشغيل وحدة الأمونيا: الإصلاح الأولي/الثانوي، التحويل، التخليق، الفصل، واسترجاع الحرارة.',
      'مراقبة الغازات السامة والقابلة للاشتعال (NH3، H2، CO) وربط الإنذار بالإخلاء الجزئي.',
      'إدارة المرافق: الغاز الطبيعي، البخار، هواء الآلات، النيتروجين، وتحسين كفاءة التوربين.',
      'متابعة المحفزات (عمر التشغيل، سقوط الضغط) وتنسيق إيقافات التجديد مع الصيانة.',
      'تنفيذ سيناريوهات الطوارئ: تسريب أمونيا، الإيقاف الطارئ الآمن (ESD)، وإعادة الإشعال.',
    ],
    features: [
      { name: 'سجلوبة الوردية لوحدة الأمونيا', screen: 'ShiftScreen', client: 'كلاهما', api: 'POST /v1/production/shift-logs' },
      { name: 'مراقبة كاشفات الغاز وربطها بالإنذارات', screen: 'GasAlarmWall', client: 'كلاهما', api: 'push: alarmAck · push: processParam' },
      { name: 'إدارة المرافق وتوزيع الحمل', screen: 'UtilityBoard', client: 'مكتب', api: 'push: processParam', note: 'prod.utility.manage ممنوحة لهذه الشعبة فقط' },
      { name: 'سجل حالة المحفزات وسقوط الضغط', screen: 'CatalystLog', client: 'مكتب', api: 'push: assetReading' },
      { name: 'تصاريح العمل في المناطق الخطرة', screen: 'PermitSheet', client: 'كلاهما', api: 'push: permit', note: 'يتطلب اعتماد maint.permit.approve' },
      { name: 'قوائم تحقق ESD وإعادة الإشعال', screen: 'StartupChecklist', client: 'مكتب', api: '— (وثيقة + سجل)', note: 'جدول قوائم تحقق مخصص في المرحلة 1ب' },
    ],
    rules: [
      'لا عمل داخل حيز أمونيا بدون تصريح ساري + قياس غازات كل 60 دقيقة يُسجَّل في التصريح.',
      'قراءة NH3 > 25 ppm ترفع إنذارًا فوريًا وتنقل الوحدة إلى ON_HOLD حتى زوال السبب وتوثيقه.',
      'إعادة الإشعال لا تُسجَّل إلا بقائمة تحقق موقَّعة من مراقبين؛ الأسماء تُؤخذ من جلسة كل مستخدم.',
      'تغيير نقطة ضبط حساسة (ضغط/حرارة) يمر عبر السجلوبة ويعتمد من رئيس الشعبة.',
    ],
    kpis: ['طن أمونيا/يوم', 'استهلاك الغاز (MMBtu/t)', 'عدد تسريبات NH3 المسجلة/شهر', 'إيقافات ESD غير المخططة', 'كفاءة توربين الغاز %'],
  },

  'PROD-CT': {
    tasks: [
      'تشغيل أبراج التبريد: الخلايا، المراوح، المضخات، توزيع الماء، والحشوات (fill).',
      'معالجة المياه: دورات التركيز، معامل الترسب (BI)، الكلور/المواد البيولوجية، والصرف.',
      'متابعة حرارة رجوع الماء وكفاءة التبريد مقابل درجة البصيلة الرطبة.',
      'برامج التنظيف الكيميائي والميكانيكي وتخطيط الإيقاف الجزئي للخلايا.',
      'رصد التآكل والترسب في خطوط الماء الدائرة والتنسيق مع المعدات الحرارية.',
    ],
    features: [
      { name: 'سجلوبة أبراج التبريد (خلايا/مضخات/كيمياء)', screen: 'ShiftScreen', client: 'كلاهما', api: 'push: shiftLog · GET /v1/production/shift-logs' },
      { name: 'متابعة كيمياء الماء ودورات التركيز', screen: 'WaterChemBoard', client: 'مكتب', api: 'push: processParam · push: labResult' },
      { name: 'جدول تنظيف/صيانة الخلايا', screen: 'PmPlanBoard', client: 'مكتب', api: 'pull: pmPlanInstance' },
      { name: 'قياس اهتزاز وحرارة مراوح الخلايا', screen: 'FanCondition', client: 'هاتف', api: 'push: assetReading' },
      { name: 'طلب صرف كيماويات من المخزن', screen: 'StoreRequest', client: 'كلاهما', api: 'push: partIssue', note: 'يتطلب wh.req.create للاعتماد wh.req.approve' },
      { name: 'تسجيل الخلية خارج الخدمة كتوقف', screen: 'DowntimeSheet', client: 'كلاهما', api: 'push: downtime' },
    ],
    rules: [
      'كل خلية خارج الخدمة تُسجَّل downtime بسبب (تآكل/مروحة/حشوة) ليدخل في حساب الكفاءة.',
      'نتيجة تحليل خارج الحدود (BI < 3 أو Cl < 0.3 ppm) تفتح OOS وتُلزم إجراءً تصحيحيًا موثقًا.',
      'تغيير جرعة الكيماوي يُقترح من الهاتف ويُعتمد من رئيس الشعبة قبل التنفيذ.',
    ],
    kpis: ['Approach °C لكل خلية', 'دورات التركيز', 'كفاءة التبريد %', 'استهلاك ماء Makeup (m³/h)', 'عدد الخلايا المتوقفة الآن'],
  },

  'PROD-LAB': {
    tasks: [
      'سحب العينات من نقاط العينة المعتمدة (عمليات + منتج) وتسجيل وقت السحب والعينة.',
      'إدخال النتائج (يوريا/أمونيا/مياه الغلايات/مياه التبريد/الغازات) مع مطابقة الحدود تلقائيًا.',
      'إدارة حالات عدم المطابقة (OOS) وتحقيقات الإجراءات التصحيحية والوقائية (CAPA) وإغلاقها.',
      'إصدار شهادات التحليل لكل دفعة وربطها بأوامر البيع والتحميل.',
      'إدارة أجهزة المختبر: معايرة، صيانة، مواد مرجعية، ومحاليل.',
    ],
    features: [
      { name: 'طلب عينة من الوردية/الإنتاج', screen: 'SampleRequest', client: 'كلاهما', api: 'POST /v1/lab/samples · push: labSample', note: 'العينة تملكها الشعبة المنتِجة؛ المختبر لا يفتحها باسم شعبة أخرى' },
      { name: 'إدخال نتائج التحاليل', screen: 'ResultEntry', client: 'كلاهما', api: 'POST /v1/lab/samples/:id/results · push: labResult', note: 'المدخل من الهاتف يبقى مبدئيًا حتى lab.result.verify؛ الاستبدال بعد الاعتماد 409' },
      { name: 'مطابقة تلقائية مع مواصفات المنتج', screen: 'SpecCheck', client: 'كلاهما', api: 'GET /v1/lab/parameters · evaluateSpec في @newport/domain', note: 'الحساب في حزمة واحدة ليراه الهاتف والخادم متطابقين' },
      { name: 'فتح/تحقيق/إغلاق OOS و CAPA', screen: 'OosCase', client: 'مكتب', api: 'GET /v1/lab/oos · POST /v1/lab/oos/:id', note: 'تُنشأ تلقائيًا من نتيجة مخالفة؛ الإغلاق يتطلب سببًا جذريًا + نص CAPA (قيد في القاعدة أيضًا)' },
      { name: 'تدقيق (اعتماد) النتائج نتيجةً نتيجة', screen: 'ResultVerification', client: 'مكتب', api: 'POST /v1/lab/results/:id/verify', note: 'lab.result.verify — المُدخِل لا يعتمد نتائج نفسه؛ اكتمال التدقيق ينقل العينة إلى VERIFIED' },
      { name: 'إصدار شهادة تحليل للدفعة', screen: 'CoAPreview', client: 'مكتب', api: 'GET /v1/lab/certificates/:sampleId · documents', note: 'lab.report.export — تُحجب ما دامت حالة OOS مفتوحة على العينة' },
      { name: 'مؤشرات المختبر (دوران/مطابقة/OOS)', screen: 'LabKpi', client: 'مكتب', api: 'GET /v1/lab/stats', note: 'نافذة 30 يومًا داخل نطاق المستخدم' },
      { name: 'سجل معايرة أجهزة المختبر', screen: 'CalibrationLog', client: 'كلاهما', api: 'push: assetReading' },
    ],
    rules: [
      'النتيجة لا تُعتمد إلا بصلاحية lab.result.verify؛ حقل VerifyById/At من ختم الخادم.',
      'نتيجة خارج الحد لا تُحذف: تُصحَّح بنتيجة جديدة مع سبب، ويُفتح OOS إجباريًا.',
      'شهادة التحليل لا تُصدَّر للعميل قبل اعتماد رئيس الشعبة أو من يفوّضه.',
      'lab.sample.create ممنوحة لمنتجي العينات في الإنتاج، لكن إدخال النتائج محصور بالمختبر.',
    ],
    kpis: ['متوسط زمن الدوران (سحب ← نتيجة معتمدة)', 'نسبة العينات المعادة %', 'OOS مفتوحة/مغلقة هذا الشهر', 'الالتزام بخطة معايرة الأجهزة %'],
  },

  'MAINT-HEAT': {
    tasks: [
      'صيانة المبادلات الحرارية، الأفران/المحوّلات، الغلايات، العزل الحراري، وخطوط البخار.',
      'فحص التسريبات الحرارية، اختبارات الضغط الهيدروستاتيكي، وتوثيق النتائج.',
      'تنظيف الكتل والمبادلات (كيميائي/ميكانيكي) وإدارة استبدال الأنابيب.',
      'دعم تصاريح العمل الساخن والعزل/القفل (LOTO) في المناطق الحرارية.',
      'قراءة سجلات الحرارة/الضغط وربطها بحالة المعدن (creep, carburization).',
    ],
    features: [
      { name: 'تنفيذ أوامر الشغل: استلام/بدء/إنهاء', screen: 'TasksScreen · WorkOrdersScreen', client: 'كلاهما', api: 'GET/POST /v1/maintenance/work-orders · POST /:id/transition' },
      { name: 'تسجيل ساعات العمالة والمعدات', screen: 'LaborEntry', client: 'كلاهما', api: 'POST /v1/maintenance/work-orders/:id/labor · push: laborEntry' },
      { name: 'قياسات الحالة: حرارة سطح، سماكة، تصوير حراري', screen: 'ConditionReadings', client: 'هاتف', api: 'push: assetReading · maint.condition.record' },
      { name: 'طلب قطع غيار/مواد', screen: 'PartsRequest', client: 'كلاهما', api: 'push: partIssue' },
      { name: 'المرفقات والصور الميدانية', screen: 'AttachmentSheet', client: 'كلاهما', api: 'push: document · POST /v1/documents/upload · PUT /v1/documents/raw/:token', note: 'الفهرس يُدفع مع المزامنة، والبايتات عبر قناة الرفع: JSON لسطح المكتب وpresign+PUT لكاميرا الهاتف' },
      { name: 'خطة PM للمعدات الحرارية', screen: 'PmPlanBoard', client: 'مكتب', api: 'pull: pmPlanInstance' },
      { name: 'مؤشرات MTBF/MTTR والتكدّس', screen: 'MaintenanceCockpit', client: 'مكتب', api: 'دوال fn_mtbf_mttr / fn_wo_backlog_age في القاعدة' },
    ],
    rules: [
      'أي عمل على خط بخار أو مبادل يتطلب تصريح عمل ساريًا وعزلًا موثقًا قبل IN_PROGRESS.',
      'إغلاق أمر الشغل يتطلب maint.wo.close ويسجَّل rootCause والقطع والساعات الفعلية.',
      'الأمر الطارئ (EMERGENCY) يبدأ فورًا ويُكمَّل تصريحه خلال 4 ساعات كحد أقصى.',
      'الحقول المعتمدة (status/approverId/closedAt) لا تُقبل من الهاتف: تُرَّد server_wins.',
    ],
    kpis: ['MTBF/MTTR لكل معدن حرج', 'عمر التكدّس Backlog (أيام)', 'نسبة العمل المخطط %', 'إعادة العمل Rework %', 'تسريبات مغلقة/مفتوحة'],
  },

  'MAINT-ROT': {
    tasks: [
      'صيانة المضخات والضواغط والتوربينات: محامل، محاورة، محاذاة بالليزر، موازنة ديناميكية.',
      'برامج مراقبة الحالة: اهتزاز، حرارة محامل، تحليل زيت، وحرارة الأجسام.',
      'متابعة الاحتياطيات الاستراتيجية (dowel kits، mechanical seals، محامل).',
      'تنسيق إيقافات التجديد الكبرى مع الإنتاج والمخطط.',
      'توثيق نتائج ما بعد الصيانة قبل إعادة التشغيل.',
    ],
    features: [
      { name: 'قراءات الاهتزاز وحرارة المحامل', screen: 'VibrationLog', client: 'هاتف', api: 'push: assetReading' },
      { name: 'خطة تحليل الزيت وسحب العينات', screen: 'OilSamplePlan', client: 'كلاهما', api: 'push: labSample', note: 'entityType=ASSET' },
      { name: 'تقرير المحاذاة/الموازنة المرفق', screen: 'AlignmentReport', client: 'مكتب', api: 'POST /v1/documents/upload · push: document' },
      { name: 'أوامر الشغل وسجل العمالة', screen: 'TasksScreen', client: 'كلاهما', api: '/v1/maintenance/work-orders' },
      { name: 'خطة PM لكل معدن دوّار', screen: 'PmPlanBoard', client: 'مكتب', api: 'pull: pmPlanInstance' },
    ],
    rules: [
      'قراءة اهتزاز تتجاوز المنطقة D في ISO تفتح أمر شغل تلقائيًا ولا يُغلق إلا بإعادة قياس.',
      'تغيير محامل/سيل ميكانيكي يُسجَّل بطلب قطعة لربط التكلفة بالمعدن.',
      'لا إعادة تشغيل معدن دوّار قبل توقيع قراءة اهتزاز ما بعد الصيانة (maint.condition.record).',
    ],
    kpis: ['نسبة المعدات في المنطقة A/B %', 'MTBF للمضخات الحرجة', 'PM في موعدها %', 'تكلفة الصيانة/ساعة تشغيل'],
  },

  'MAINT-ELEC': {
    tasks: [
      'صيانة نظم القدرة: محولات، MV/LV، لوحات، مفاتيح، كابلات، ومحركات كهربائية.',
      'اختبارات ومعايرة مرحلات الحماية وتنسيق الفصل (relay coordination) ومحاكاة الأعطال.',
      'الإضاءة، التأريض، الحماية من الصواعق، وتكييف غرف الكهرباء وإنذار الحريق فيها.',
      'دعم العزل/القفل الكهربائي وتراخيص العمل على الجهد.',
      'متابعة أحمال المغذيات وتوزيعها وتوثيق الانقطاعات.',
    ],
    features: [
      { name: 'أوامر شغل كهرباء + قائمة تحقق LOTO', screen: 'TasksScreen', client: 'كلاهما', api: '/v1/maintenance/work-orders · push: permit' },
      { name: 'سجل قياسات العزل (Megger) والجهد', screen: 'ElectricalReadings', client: 'هاتف', api: 'push: assetReading' },
      { name: 'سجل اختبار المرحلات وزمن الفصل', screen: 'RelayTestLog', client: 'مكتب', api: 'push: workOrderLog' },
      { name: 'خريطة الأحمال والمغذيات', screen: 'LoadMap', client: 'مكتب', api: 'assets (unit/type/tag)' },
      { name: 'طلب قطع غيار كهربائية حرجة', screen: 'PartsRequest', client: 'كلاهما', api: 'push: partIssue' },
      { name: 'تصريح عمل كهربائي واعتماده', screen: 'PermitSheet', client: 'كلاهما', api: 'push: permit', note: 'اعتماد: HSE + maint.permit.approve' },
    ],
    rules: [
      'العمل على جهد > 400V يتطلب تصريحًا معتمدًا من HSE ورئيس الشعبة وقفلًا مرقَّمًا موثقًا.',
      'لا إغلاق لأمر شغل كهربائي دون تسجيل نتيجة اختبار العزل مرفقة.',
      'أي تغيير في إعدادات المرحلات يسجَّل بالقيمة السابقة واللاحقة (audit) ويبلغ لغرفة السيطرة.',
    ],
    kpis: ['انقطاعات غير مخططة/شهر', 'MTTR لاستعادة التغذية', 'اختبارات المرحلات في موعدها %', 'أعطال المحركات بعد الصيانة %'],
  },

  'MAINT-VALVE': {
    tasks: [
      'ورشة الصمامات: فك، تنظيف، استبدال مقاعد وأختام، وتجميع مع اختبار إغلاق.',
      'اختبارات الضغط والتسريب وتوثيق النتائج لكل صمام.',
      'إدارة مخزون الصمامات المُجدَّدة وتتبع مواقعها في الوحدات.',
      'دعم إيقافات التجديد: خريطة الصمامات الحرجة وأولويات الإصلاح.',
      'فحص صمامات الأمان (PSV) وضبط ضغط الفتح وفق الشهادة والتاريخ.',
    ],
    features: [
      { name: 'بطاقة صمام داخل/خارج الورشة', screen: 'ValveShopCard', client: 'كلاهما', api: 'push: workOrder · push: asset' },
      { name: 'نتائج اختبار الإغلاق والضغط', screen: 'ValveTestResult', client: 'هاتف', api: 'push: assetReading' },
      { name: 'سجل شهادات PSV وإعادة الاختبار', screen: 'PsvRegister', client: 'مكتب', api: 'GET /v1/documents/:id/content · pull: pmPlanInstance' },
      { name: 'ربط الصمام بموقعه/خطه', screen: 'ValveMap', client: 'مكتب', api: 'assets (tag/lineNo/assetType)' },
      { name: 'صرف/إرجاع صمام مجدّد من المخزون', screen: 'StoreIssue', client: 'مكتب', api: 'wh.issue · wh.return' },
    ],
    rules: [
      'لا إعادة تركيب صمام قبل تسجيل نتيجة اختبار ناجحة وإرفاق الشهادة.',
      'صمام أمان تجاوز تاريخ اختباره يتحول تلقائيًا إلى أمر شغل ويُبلَّغ HSE.',
      'الكميات في الورشة تُخصم عبر صرف/إرجاع موثق حتى لا تنفصل التكلفة عن المعدن.',
    ],
    kpis: ['متوسط بقاء الصمام في الورشة (يوم)', 'نسبة نجاح الاختبار الأول %', 'PSV منتهية الشهادة (عدد)', 'نسبة إعادة الاستخدام بدل الشراء %'],
  },

  'MAINT-INST': {
    tasks: [
      'صيانة أجهزة القياس: ضغط، حرارة، مستوى، تدفق، وتحاليل مباشرة (online analyzers).',
      'معايرة الأجهزة وفق خطة معتمدة وتوثيق الشهادة قبل/بعد.',
      'الدعم الفني لنظم DCS/PLC/ESD وضبط تغييرات المنطق.',
      'اختبار الحلقات (loop tests) ومعايرة حلقات التحكم مع غرفة السيطرة.',
      'متابعة الإنذارات الكاذبة وجوده بيانات أنظمة القياس.',
    ],
    features: [
      { name: 'خطة المعايرة ومتابعة انتهائها', screen: 'CalibrationPlan', client: 'مكتب', api: 'pull: pmPlanInstance' },
      { name: 'بطاقة معايرة (قبل/بعد/انحراف)', screen: 'CalibrationCard', client: 'هاتف', api: 'push: assetReading' },
      { name: 'نتائج اختبار الحلقة و ESD', screen: 'LoopTestSheet', client: 'كلاهما', api: 'push: workOrderLog · push: document · GET /v1/documents?entityType=workOrder' },
      { name: 'سجل تغييرات منطق DCS/PLC', screen: 'LogicChangeLog', client: 'مكتب', api: 'documents + audit_trails', note: 'جدول تغييرات مخصص في 1ب' },
      { name: 'أوامر شغل الأجهزة الدقيقة', screen: 'TasksScreen', client: 'كلاهما', api: '/v1/maintenance/work-orders' },
    ],
    rules: [
      'جهاز تجاوز تاريخ معايرته يُعلَّم OUT_OF_CAL ويظهر تنبيهه في كل شاشة تستخدم قراءته.',
      'أي تغيير في منطق ESD/IL يحتاج موافقة رئيس الشعبة + مدير الإنتاج، ويسجَّل في audit_trails.',
      'شهادة المعايرة تُلحق كـ document مرتبط بالمعدن، وتاريخها يُقرأ في تقرير الانحرافات.',
    ],
    kpis: ['الالتزام بخطة المعايرة %', 'أجهزة خارج الموضع > الحد %', 'تعديلات PID موثقة/شهر', 'إنذارات كاذبة لكل وحدة/شهر'],
  },

  'MAINT-GEN': {
    tasks: [
      'الصيانة المدنية: الخزانات، الأرضيات، الأسوار، المباني، والهياكل المعدنية.',
      'التكييف والتهوية (HVAC) للشركات والمباني الإدارية وغرف التحكم.',
      'شبكات الماء والصرف الصحي ومياه الإطفاء، وصيانة الطرق داخل الحدود.',
      'إدارة المعدات العامة والأدوات والعدد (tool crib) وتوثيق الاستعارة.',
      'التنظيف الصناعي ورفع المخلفات مع ضبط متطلبات السلامة والبيئة.',
    ],
    features: [
      { name: 'طلب صيانة عام من أي شعبة', screen: 'NewWorkOrderScreen', client: 'كلاهما', api: 'POST /v1/maintenance/work-orders' },
      { name: 'سجل الأدوات المستعارة/المُرجَّعة', screen: 'ToolCrib', client: 'مكتب', api: 'push: asset · push: laborEntry', note: 'الأداة تُسجَّل كأصل فرعي' },
      { name: 'خطط صيانة المباني و HVAC', screen: 'PmPlanBoard', client: 'مكتب', api: 'pull: pmPlanInstance' },
      { name: 'تذكرة تنظيف/رفع مخلفات مع مرفقات', screen: 'WasteTicket', client: 'كلاهما', api: 'push: document · POST /v1/documents/presign' },
      { name: 'سجل السلامة للمقاولين الخارجيين', screen: 'ContractorLog', client: 'مكتب', api: 'users/employees (CONTRACTOR)' },
    ],
    rules: [
      'أي عمل رافعة/سقالة يحتاج تصريح عمل وقائمة تحقق سلامة مرفقة قبل البدء.',
      'المعدات العامة تُسجَّل كأصول بمركز تكلفة خاص لعزل التكلفة عن الإنتاج.',
      'طلب تنظيف متأخر > 7 أيام يُرفع تلقائيًا إلى مدير الصيانة في تقرير المعوقات.',
    ],
    kpis: ['الطلبات المفتوحة/المغلقة', 'متوسط زمن الإغلاق (يوم)', 'تكلفة الصيانة العامة/شهر', 'المخالفات المتكررة للنظافة/السلامة'],
  },

  'ADM-BIO': {
    tasks: [
      'استلام بصمات/بصمات الوجه من أجهزة ZKTeco (ملف أو سحب دوري من الجهاز).',
      'معالجة النواقص: نسيان بصمة، مهمة رسمية، تكليف ميداني، إذن خروج.',
      'إدارة الجداول والدوريات (A/B/C، مناوبة ليلية) وطلبات التبادل بين الورديات.',
      'تسوية أجور اليوم/الشهر وتصدير قاعدة الرواتب إلى الشعبة المالية.',
      'أرشفة سجل الحضور والتسويات المعتمدة كسجل غير قابل للتعديل.',
    ],
    features: [
      { name: 'استيراد بصمات من ZKTeco', screen: 'PunchImport', client: 'مكتب', api: 'POST /v1/time/punches/import', note: 'hr.att.import' },
      { name: 'إعادة حساب الحضور ليوم/فترة', screen: 'RecalcPanel', client: 'مكتب', api: 'POST /v1/time/recalculate' },
      { name: 'طلب تصحيح بصمة وموافقة المدير', screen: 'CorrectionFlow', client: 'كلاهما', api: 'POST /v1/time/corrections · POST /corrections/:id/decide' },
      { name: 'لوحة حضور اليوم لكل شعبة', screen: 'DailyAttendance', client: 'كلاهما', api: 'GET /v1/time/daily' },
      { name: 'تصدير ملف الرواتب (CSV + hash)', screen: 'PayrollExport', client: 'مكتب', api: 'GET /v1/time/payroll-export', note: 'hr.att.export_payroll' },
      { name: 'خطة الورديات وبدلات التبادل', screen: 'RosterEditor', client: 'مكتب', api: 'جداول hr/* · Phase 1b UI', note: 'hr.shift.manage' },
    ],
    rules: [
      'نافذة قبول البصمة ±4 ساعات حول بداية الوردية؛ خارجها نقيصة تحتاج تصحيحًا معتمدًا.',
      'العمل الليلي +15%، ويوم الجمعة ×2، والإضافي بسقف شهري يعتمده مدير الموارد البشرية.',
      'التصحيح لا يعدّل الصف الأصلي: سجل تصحيح مستقل + إعادة حساب، ويحدث reconciliationHash.',
      'لا تُصدَّر قاعدة الرواتب قبل اعتماد كل التصحيحات المفتوحة للفترة (يمنعها الخادم).',
    ],
    kpis: ['نسبة الحضور الفوري %', 'النواقص لكل شعبة/شهر', 'زمن معالجة التصحيح (يوم)', 'ساعات إضافية/عامل', 'تكلفة العمل الليلي'],
  },

  'ADM-COM': {
    tasks: [
      'إدارة أوامر البيع (يوريا/أمونيا) وأسعارها وعقود العملاء وآجال التسليم.',
      'تنسيق التحميل: حجز موعد، وزن داخل/خارج، رقم التذكرة، وتوقيع السائق.',
      'حسابات العملاء والذمم المدينة وضوابط الاعتماد الائتماني.',
      'إصدار فواتير البيع ومطابقتها مع أذون التحميل وسندات الصرف.',
      'متابعة مخزون المنتج الجاهز وتخصيص الدفعات حسب شهادة التحليل.',
    ],
    features: [
      { name: 'أمر بيع + فحص حد الائتمان', screen: 'SalesOrderSheet', client: 'مكتب', api: 'sales_orders · com.order.create/confirm' },
      { name: 'إذن تحميل وتذكرة وزن', screen: 'LoadingTicket', client: 'كلاهما', api: 'sales_order_lines.ticketInNo/ticketOutNo' },
      { name: 'فواتير البيع', screen: 'InvoiceEditor', client: 'مكتب', api: 'sales_invoices · fin.invoice.manage' },
      { name: 'ربط الدفعة بشهادة التحليل', screen: 'BatchCoaLink', client: 'مكتب', api: 'GET /v1/lab/certificates/:sampleId · POST /v1/documents/:id/metadata' },
      { name: 'كشف حساب عميل وأعمار الذمم', screen: 'CustomerLedger', client: 'مكتب', api: 'com.customer.manage · report views' },
      { name: 'تصدير تقرير المبيعات', screen: 'SalesReport', client: 'مكتب', api: 'com.report.export' },
    ],
    rules: [
      'لا إذن تحميل قبل موافقة المالية على الحد الائتماني أو تسجيل دفعة مقدمة.',
      'الوزن الصافي = داخل − خارج بفرق مسموح ≤ 0.3%؛ التجاوز يوقف التحميل ويطلب تحقيقًا.',
      'الدفعة المرتبطة بشهادة مرفوضة لا تُحمَّل (ربط إجباري بشعبة المختبر).',
      'أي تعديل بعد إصدار الفاتورة يسجَّل بقيد عكسي، لا تعديل مباشر للصف.',
    ],
    kpis: ['مبيعات الشهر (طن/دينار)', 'متوسط زمن دورة التحميل (دقيقة)', 'الذمم > 60 يوم %', 'شكاوى الجودة المرتبطة بالتحميل'],
  },

  'ADM-FIN': {
    tasks: [
      'القيود اليومية والسندات (قبض/صرف)، شجرة الحسابات، وإقفال الفترة المالية.',
      'تحليل تكلفة الإنتاج: مواد، طاقة، عمالة، صيانة — لكل وحدة ولكل طن.',
      'إعداد ومتابعة الموازنة التشغيلية وتقارير الانحراف للمالك.',
      'اعتماد أوامر الشراء ومطابقة الفواتير مع أوامر الشراء والإيصال (3-way match).',
      'الجرد الدوري للمخازن وتسوية الفروقات والموافقة عليها.',
    ],
    features: [
      { name: 'شجرة الحسابات والقيود', screen: 'JournalEntries', client: 'مكتب', api: 'journal_entries · fin.journal.manage' },
      { name: 'تحليل تكلفة الطن', screen: 'CostAnalysis', client: 'مكتب', api: 'cost_center_code · fin.cost.view · report.view' },
      { name: 'الموازنة ومتابعة الانحراف', screen: 'BudgetTracking', client: 'مكتب', api: 'fin.budget.view/manage (1b UI)' },
      { name: 'اعتماد أوامر الشراء والمطابقة الثلاثية', screen: 'PoApproval', client: 'مكتب', api: 'purchase_orders · grns · fin.po.approve · fin.grn_finance' },
      { name: 'الجرد وتسوية الفروقات', screen: 'Stocktake', client: 'كلاهما', api: 'wh.stocktake · push: partIssue' },
      { name: 'استلام تسوية الرواتب من البصمة', screen: 'PayrollSettlement', client: 'مكتب', api: 'GET /v1/time/payroll-export · fin.payroll.view/run' },
      { name: 'تحصيل الذمم ومتابعة الأعمار', screen: 'Receivables', client: 'مكتب', api: 'fin.ar_collect' },
    ],
    rules: [
      'قيد معتمد لا يُعدَّل؛ يُعكَس بقيد مرتبط به ويسجَّل في audit_trails.',
      'لا صرف قبل أمر شراء معتمد + إيصال استلام مطابق للكمية والسعر.',
      'ملف الرواتب يُستورد بـ reconciliationHash ومطابقته شرط قبل الإقفال.',
      'تسوية الجرد تحتاج موافقة مدير المالية (fin.journal.manage) وتُنشئ قيدًا تلقائيًا.',
    ],
    kpis: ['تكلفة/طن (مواد + طاقة + صيانة)', 'انحراف الموازنة %', 'دورة مدفوعات الموردين', 'قيمة المخزون الراكد', 'فروقات الجرد (دينار/%)'],
  },
};

/* ── حساب ─────────────────────────────────────────────────────────────── */
const roleAr = new Map(ROLE_DEFS.map((r) => [r.code, r.nameAr]));
const grants = resolveGrants();
const purposes = new Map(ACCESS_MATRIX.map((a) => [a.subDeptCode, a.purposeAr]));

function grantTable(subDeptCode: string): string {
  const rows = grants.filter((g) => g.subDeptCode === subDeptCode).sort((a, b) => a.role.localeCompare(b.role));
  if (rows.length === 0) return '_لا توجد منح على مستوى الشعبة._\n';
  const out = ['| الدور | النطاق | # صلاحيات | الصلاحيات الفعلية (مجمّعة بوحدة الصلاحية) |', '|---|---|---|---|'];
  for (const g of rows) {
    const grouped = new Map<string, string[]>();
    for (const code of [...g.permissions].sort()) {
      const mod = code.split('.')[0]!;
      grouped.set(mod, [...(grouped.get(mod) ?? []), code]);
    }
    const cells = [...grouped.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([mod, codes]) => `**${mod}**: ${codes.map((c) => `\`${c}\``).join(' · ')}`)
      .join('<br>');
    out.push(`| ${roleAr.get(g.role) ?? g.role} \`${g.role}\` | \`${g.scope}\` | ${g.permissions.length} | ${cells} |`);
  }
  return out.join('\n') + '\n';
}

function globalRoleTable(): string {
  const rows = grants.filter((g) => g.subDeptCode === null).sort((a, b) => a.role.localeCompare(b.role));
  const out = ['| الدور | النطاق | # | الصلاحيات |', '|---|---|---|---|'];
  for (const g of rows) {
    out.push(`| ${roleAr.get(g.role) ?? g.role} \`${g.role}\` | \`${g.scope}\` | ${g.permissions.length} | ${g.permissions.map((p) => `\`${p}\``).join(' · ')} |`);
  }
  return out.join('\n') + '\n';
}

const list = (items: string[]) => items.map((i) => `- ${i}`).join('\n') + '\n';

function featureTable(rows: FeatureRow[]): string {
  const out = ['| الميزة | الشاشة/الوحدة | العميل | الواجهة/المسار | ملاحظات |', '|---|---|---|---|---|'];
  for (const r of rows) out.push(`| ${r.name} | ${r.screen} | ${r.client} | ${r.api} | ${r.note ?? '—'} |`);
  return out.join('\n') + '\n';
}

/* ── بناء المستند ─────────────────────────────────────────────────────── */
const subDeptGrants = grants.filter((g) => g.subDeptCode).length;
const readOnly = [...READ_ONLY_ROLES].map((r) => `\`${r}\``).join('، ');

let md = `# 03 — ميزات وصلاحيات الأقسام والشعب

> **ملف مولَّد** بـ \`npm run docs:features\` من \`packages/domain\`. جداول الأدوار مشتقة من
> \`resolveGrants()\` — نفس الحساب الذي يزرع \`role_subdept_grants\` ويتحقق منه \`AccessGuard\`
> ونقطة \`GET /v1/org/permissions-verify\`. النثر (الميزات/القواعد/المؤشرات) في
> \`packages/domain/scripts/gen-features-doc.ts\`.

## 1. القواعد المشتركة

- **صيغة الصلاحية:** \`<module>.<entity>.<action>\` — مثل \`maint.wo.close\` أو \`prod.log.approve\`.
- **الحجم الفعلي:** ${PERMISSION_DEFS.length} صلاحية معرّفة · ${ROLE_DEFS.length} دورًا · ${subDeptGrants} منح (شعبة × دور) · ${SYNC_ENTITIES.length} كيان مزامنة.
- **النطاقات (ABAC):** \`SELF\` ← \`TEAM\` ← \`SUBDEPT\` ← \`DEPT\` ← \`ALL\`؛ لا يتجاوز منحُ دورٍ سقف \`maxScope\`
  الخاص بالصلاحية (يفحصه \`packages/domain/tests/permissions.spec.ts\`).
- **ثلاث طبقات تنفيذ**، لا تكفي واحدة:
  1. \`AccessGuard\`: يرفض قبل الوصول إلى المعالجة ويسجّل المحاولة في \`audit_trails\` (\`action=DENIED\`).
  2. \`buildScopeWhere()\`: يضيف شرط النطاق إلى كل استعلام Prisma.
  3. **RLS في PostgreSQL**: متغيرات \`app.*\` تضبط بـ \`set_config\` داخل المعاملة، فتُصفَّر نتائج أي
     استعلام خام نسي شرط النطاق.
- **الحد الأدنى الميداني:** كل دور يعمل من شعبة يحصل تلقائيًا على \`auth.login\` و\`sync.pull\` و\`sync.push\`
  و\`notif.view\` وعرض الهيكل والوثائق وإجازة الموظف. يُطبَّق داخل \`resolveGrants()\` ومحترمٌ لسقف كل
  صلاحية، ولا يُمنح لأدوار القراءة فقط (${readOnly}). بدونه يفقد الفني القدرة على رفع أعماله من الهاتف.
- **حقول لا يقبلها الخادم من الجهاز** (\`DENIED_COLUMNS\`) وتُرَّد \`server_wins\`:
  - \`status\`، \`approvedById/approvedAt\` (اعتماد أوامر الشغل والسجلوبات)
  - \`verifiedById/verifiedAt\` لنتائج المختبر، و\`closedAt/actualEndAt/approverId\` عند الإغلاق
  - \`createdById/byUserId/uploadedById/preparedById\` — تُختم من صاحب الجلسة لا من الجهاز
  - \`reconciliationHash/payrollExportedAt\` لسجل الحضور
- **جدول واحد = كيان مزامنة واحد.** \`trg_sync\` و\`trg_bump_version\` و\`trg_touch\` تُولَّد من
  \`sync_entity_registry\` (مصدر وحيد)، فلا تُعلَّق على جداول داخلية مثل \`users\` — لأن رفع
  \`users.version\` كان يبطل رمز JWT فور تسجيل الدخول.

## 2. ميزات مشتركة بين كل الأقسام

| الميزة | العميل | الواجهة | ملاحظات |
|---|---|---|---|
| دخول/خروج، رموز تحديث دوّارة، إلغاء العائلة عند إعادة الاستعمال | كلاهما | \`POST /v1/auth/login\` · \`/refresh\` · \`/logout\` | \`deviceId\` إلزامي؛ المطالب \`v\` يُبطل الجلسات عند تغيّر الصلاحيات |
| جلسة مقيّدة حتى تغيير كلمة المرور الافتراضية | كلاهما | \`POST /v1/auth/change-password\` | \`PASSWORD_BOOTSTRAP_PATHS\` تسمح بمسارات الحساب فقط (403 برسالة عربية) |
| الهوية والصلاحيات الفعلية | كلاهما | \`GET /v1/auth/me\` | يعيد \`permissions[]\` مع النطاق و\`mustChangePwd\` |
| الهيكل التنظيمي + كشف الانحراف عن المرجع | مكتب | \`GET /v1/org/tree\` · \`/sub-departments\` · \`/drift\` | \`drift.isAligned=true\` معيار قبول للنشر |
| مصفوفة الصلاحيات والتحقق من تطابق القاعدة | مكتب | \`GET /v1/org/permissions-matrix\` · \`/permissions-verify\` | يجب \`inSync:true\` |
| إدارة المستخدمين والأدوار والتكليف | مكتب | \`GET /v1/org/users\` · \`POST /v1/org/users/assign-role\` | يُعطِّل كاش الصلاحيات للمستخدم فورًا |
| رفع/سحب التغييرات دون اتصال + خطة الدفعة | كلاهما | \`POST /v1/sync/push\` · \`GET /v1/sync/pull\` · \`POST /v1/sync/batch-plan\` · \`GET /v1/sync/protocol\` | idempotency بـ \`opId\`؛ \`fullResyncRequired\` عند فجوة أو إصدار مخطط مختلف |
| سجل التدقيق + إحصاءاته | مكتب | \`GET /v1/audit\` · \`GET /v1/audit/stats\` | \`audit_trails\` append-only بمؤجّل قاعدة |
| مؤشرات الجاهزية | مراقبة | \`GET /api/health\` · \`GET /api/health/ready\` | يفحص القاعدة، تطابق الهيكل، RBAC، والتعارضات المفتوحة |
| الإشعارات داخل التطبيق | كلاهما | \`notifications\` + \`notif.view\` | تأكيد الاستلام يُزامن ككيان \`notificationAck\` |

---

## 3. الأقسام والشعب — المهام والميزات والصلاحيات
`;

for (const dept of ORG_STRUCTURE) {
  const info = DEPT_DOC[dept.code]!;
  md += `\n### ${dept.nameAr} — \`${dept.code}\` (${dept.nameEn})\n\n${info.intro}\n\n`;
  md += `**ميزات عامة للقسم**\n\n${list(info.shared)}\n`;
  md += `**الشعب:** ${dept.subDepartments.map((s) => `\`${s.code}\``).join('، ')}\n`;

  for (const sub of dept.subDepartments) {
    const doc = DOC[sub.code]!;
    md += `\n#### ${sub.nameAr} — \`${sub.code}\`\n\n`;
    md += `> **الغرض:** ${purposes.get(sub.code) ?? '—'}\n>\n> **نمط العمل:** ${sub.kind} · ${
      sub.fieldWork ? 'ميداني — وضع «دون اتصال» مفعّل في تطبيق الهاتف' : 'مكتبي — الواجهة الأساسية سطح المكتب'
    }\n\n`;
    md += `**أ) المهام التشغيلية**\n\n${list(doc.tasks)}\n`;
    md += `**ب) الميزات في النظام**\n\n${featureTable(doc.features)}\n`;
    md += `**ج) الأدوار ومنحها الفعلي في هذه الشعبة**\n\n${grantTable(sub.code)}`;
    md += `**د) قواعد العمل الإلزامية** (تُنفَّذ في الخادم، لا في الواجهة فقط)\n\n${list(doc.rules)}\n`;
    md += `**هـ) مؤشرات الأداء**\n\n${list(doc.kpis)}`;
  }
}

md += `
---

## 4. الأدوار العامة (تجاوز مستوى الشعبة)

ممنوحة على مستوى المنشأة/القسم لأن صاحبها يعبر الأقسام:

${globalRoleTable()}
---

## 5. خلاصة صلاحيات الاستخدام بحسب الوحدة

| الوحدة | قراءة | تنفيذ/إنشاء | اعتماد أو إقفال | إدارة |
|---|---|---|---|---|
| \`maint\` | \`maint.wo.view\`، \`maint.asset.view\`، \`maint.condition.view\`، \`maint.backlog.view\`، \`maint.permit.view\` | \`maint.wo.create\`، \`maint.wo.execute\`، \`maint.wo.assign\`، \`maint.condition.record\` · \`maint.permit.create\` | \`maint.wo.close\`، \`maint.wo.cancel\`، \`maint.permit.approve\`، \`maint.downtime.verify\` | \`maint.asset.manage\`، \`maint.pm.manage\` |
| \`prod\` | \`prod.log.view\`، \`prod.param.view\`، \`prod.downtime.view\` | \`prod.log.create\`، \`prod.log.update\`، \`prod.param.create\`، \`prod.alarm.ack\`، \`prod.downtime.create\` | \`prod.log.approve\` | \`prod.utility.manage\` |
| \`lab\` | — (القراءة عبر \`prod\`/\`report\`) | \`lab.sample.create\`، \`lab.result.enter\` | \`lab.result.verify\` | \`lab.oos.manage\`، \`lab.report.export\` |
| \`wh\` | \`wh.item.view\` | \`wh.req.create\`، \`wh.return\` | \`wh.req.approve\`، \`wh.issue\`، \`wh.grn\` | \`wh.stocktake\`، \`wh.manage\` |
| \`hr\` | \`hr.att.view\`، \`hr.shift.view\`، \`hr.leave.view\`، \`hr.form.view\`، \`hr.emp.view\` | \`hr.leave.request\`، \`hr.form.create\`، \`hr.att.import\` | \`hr.att.correct\`، \`hr.leave.approve\`، \`hr.att.export_payroll\` | \`hr.shift.manage\`، \`hr.att.all\` |
| \`fin\` | \`fin.coa.view\`، \`fin.cost.view\`، \`fin.po.view\`، \`fin.budget.view\`، \`fin.payroll.view\` | — (التنفيذ قيد الإدارة) | \`fin.po.approve\`، \`fin.grn_finance\`، \`fin.payroll.run\` | \`fin.journal.manage\`، \`fin.invoice.manage\`، \`fin.budget.manage\`، \`fin.ar_collect\`، \`fin.rate.manage\` |
| \`com\` | \`com.order.view\` | \`com.order.create\` | \`com.order.confirm\` | \`com.customer.manage\`، \`com.pricing.manage\`، \`com.report.export\` |
| \`doc\` | \`doc.view\` | \`doc.upload\` | — | \`doc.manage\` |
| \`report\` | \`report.view\` | \`report.export\` | — | \`report.kpi.manage\` |
| \`org\` | \`org.dept.view\`، \`org.user.view\` | — | — | \`org.dept.manage\`، \`org.user.manage\`، \`org.role.manage\`، \`org.delegation.manage\` |
| \`audit\` | \`audit.view\` | — | — | \`audit.export\` |
| \`sync\`/\`notif\`/\`auth\`/\`admin\` | \`sync.pull\`، \`notif.view\` | \`sync.push\`، \`auth.login\` | — | \`admin.system\` |

> ملاحظة: الاعتماد قرار إداري — لا يُقبل من الهاتف، والحقول الناتجة عنه (\`approvedById\`،
> \`verifiedById\`، \`approverId\`) يختمها الخادم من جلسة المستخدم.

## 6. ملاحظات الحوكمة

- **لا صلاحية ميتة:** كل صلاحية في \`permissions.ts\` ممنوحة لدور واحد على الأقل، باستثناء
  المؤجَّل صراحةً: ${DEFERRED_PHASE2_PERMISSIONS.map((p) => `\`${p}\``).join('، ')}
  (مرهون بترحيل بيانات العقود من نظام الموارد البشرية المركزي — المرحلة الثانية).
- **الفصل بين المهام:** \`SYS_ADMIN\` يدير النظام ولا يملك \`maint.wo.create\` ولا \`prod.log.approve\`؛
  و\`AUDITOR\`/\`READONLY_GUEST\` بلا \`sync.push\` ولا \`doc.upload\` (تأكيد حيّ في \`scripts/e2e-smoke.mjs\`:
  الفني يُحجَب عن إنشاء أمر شغل بـ 403، ومسارات البيانات مغلقة قبل تغيير كلمة المرور).
- **دوران التغيير الآمن:** تعديل \`roles.ts\` ← \`npm test -w @newport/domain\` ← \`npm run docs:all -w @newport/api\`
  ← \`npm run seed -w @newport/api\` ← \`GET /v1/org/permissions-verify\` يجب أن يعيد \`inSync:true\`.
- **الهيكل التنظيمي مرجعي:** لا تُضاف شعب جديدة من الواجهة؛ أي توسعة (خط ثانٍ/ثالث) تتم عبر
  \`facilities\` و\`sub_departments\` مع \`npm run docs:all\` لفحص الانحراف.

---

*المجلدات: ${ORG_STRUCTURE.length} · الشعب: ${ORG_STRUCTURE.flatMap((d) => d.subDepartments).length} · التوليد: ${new Date().toISOString().slice(0, 10)}*
`;

/* ── حارس الجودة: كل رمز صلاحية مذكور في النص يجب أن يكون حقيقيًا ────────── */
const knownModules = new Set(PERMISSION_DEFS.map((d) => d.module));
const mentioned = new Set<string>();
for (const m of md.matchAll(/`([a-z_]+\.[a-z_.]+)`/g)) {
  const code = m[1]!;
  if (!knownModules.has(code.split('.')[0]!)) continue; // أسماء ملفات/جداول لا صلاحيات
  mentioned.add(code);
}
const invented = [...mentioned].filter((c) => !isPermissionCode(c));
if (invented.length) {
  throw new Error(`رموز صلاحيات غير موجودة في الكتالوج مذكورة في docs/03: ${invented.join(', ')}`);
}

const out = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', '03-features-and-permissions.md');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, md, 'utf8');
console.log(`✓ docs/03-features-and-permissions.md — ${md.split('\n').length} سطرًا، ${Object.keys(DOC).length} شعبة، ${mentioned.size} رمز صلاحية موثّق ومطابق للكتالوج`);
