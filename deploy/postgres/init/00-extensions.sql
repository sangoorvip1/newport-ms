-- ينفَّذ مرة واحدة عند إنشاء الـ volume من الصفر (docker-entrypoint-initdb.d).
-- الغرض: ما يلزم خادم القاعدة قبل الترحيل، لا أكثر.
--
-- الدقة هنا مقصودة: الترحيل 20260907000001 هو مصدر الحقيقة للامتدادات التي يعتمد عليها المخطط
-- (pg_trgm, btree_gin, pgcrypto) — ولا نضيف امتدادات «احتياطية» لا يستعملها شيء:
-- citext و uuid-ossp حُذفا من هذا الملف لأن المخطط لا يستخدم أياً منهما:
--   * المفاتيح العامة يولّدها Prisma (`@default(uuid(7))` على 80 نموذجًا)، و gen_random_uuid() المستعملة في
--     sync-engine متاحة مضمّنًا من PostgreSQL 13 (ولا تحتاج uuid-ossp).
--   * المقارنة غير الحساسة للحالة تُجرى على أعمدة يملؤها التطبيق بقيم معيارية، فلا حاجة إلى citext.
CREATE EXTENSION IF NOT EXISTS pg_trgm;             -- بحث نصي في العناوين/الأرقام
CREATE EXTENSION IF NOT EXISTS btree_gin;           -- فهارس composite مع jsonb/text
CREATE EXTENSION IF NOT EXISTS pgcrypto;            -- gen_random_uuid() + digest()
-- للأداء فقط (يحتاج shared_preload_libraries المضبوط في docker-compose command)؛ آمن الحذف.
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- لا فهارس هنا: ix_wo_text_trgm (وكل الفهارس الأخرى) تُنشأ في الترحيل/من Prisma،
-- وتكرارها في سكربت تهيئة كان سيخالف الاسم الحقيقي ويوحي بوجود فهرس زائد.
