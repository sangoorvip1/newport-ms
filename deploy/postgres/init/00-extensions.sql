-- ينفَّذ مرة واحدة عند إنشاء الـ volume من الصفر.
-- الامتدادات المطلوبة في مخطط القاعدة + توحيد الترتيب العربي/الإنجليزي.
CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- بحث نصي (orders/titles)
CREATE EXTENSION IF NOT EXISTS citext;       -- أسماء مستخدمين/رموز بلا حساسية حالة
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- gen_random_uuid بديل في سكربتات الطوارئ
CREATE EXTENSION IF NOT EXISTS btree_gin;    -- فهارس composite مع jsonb/text
-- pg_stat_statements يحتاج shared_preload_libraries (مُفعَّل في docker-compose command)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- فهرس نصي عام للبحث في أوامر العمل (يُنشأ أيضًا في الترحيل؛ مكرر هنا لأمان إعادة الإنشاء)
-- ملاحظة: كل الأسماء camelCase بين علامات اقتباس لأن Prisma @@map يغيّر الجداول فقط.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'work_orders') THEN
    EXECUTE $$CREATE INDEX IF NOT EXISTS ix_wo_search_trgm ON work_orders USING gin ((("title" || ' ' || "description") gin_trgm_ops))$$;
  END IF;
END $$;
