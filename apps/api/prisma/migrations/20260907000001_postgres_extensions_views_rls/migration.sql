-- ══════════════════════════════════════════════════════════════════════════
-- Newport LP. LTD — معمل الأسمدة الجنوبية / الخط الأول (البصرة)
-- طبقة SQL إضافية فوق ما يولّده Prisma: توسعات، تسلسلات، مؤجلات، دوال،
-- قيود، فهارس متخصصة، مناورات تقارير، وأمن بيانات (Row-Level Security).
--
-- ⚠️ قاعدة صارمة: Prisma يولّد الأعمدة بصيغة camelCase مقبّسة، لذا كل مرجع
--    إلى عمود في هذا الملف يجب أن يكون بين علامتَي اقتباس ("subDeptId").
--    الأسماء: id/status/debit/credit/value/kind/qty/type/level/at/entity/op/payload
--    هي الوحيدة المأمونة بلا اقتباس (كلها أحرف صغيرة فعلًا).
--    التحقق: يُختبَر هذا الملف على PostgreSQL حيّ في CI (انظر docs/05).
-- ══════════════════════════════════════════════════════════════════════════

-- ─── 1) توسعات مطلوبة ────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- بحث عربي/إنجليزي غامض بالنص
CREATE EXTENSION IF NOT EXISTS btree_gin;    -- فهارس مركّبة (نص + JSONB)
CREATE EXTENSION IF NOT EXISTS pgcrypto;     -- hashing لتوكنات التحديث وأختام البصمة

-- ─── 2) تسلسلات الأرقام البشرية المقروءة ─────────────────────────────────
-- تُسنَد الأرقام من الخادم فقط (حتى لو أُنشئ السجل من جهاز دون اتصال، يبقى رقمه بعد أول مزامنة).
CREATE SEQUENCE wo_number_seq         START 1 INCREMENT 1;
CREATE SEQUENCE lab_sample_number_seq START 1 INCREMENT 1;
CREATE SEQUENCE permit_number_seq     START 1 INCREMENT 1;
CREATE SEQUENCE grn_number_seq        START 1 INCREMENT 1;
CREATE SEQUENCE mi_number_seq         START 1 INCREMENT 1;
CREATE SEQUENCE req_number_seq        START 1 INCREMENT 1;
CREATE SEQUENCE pr_number_seq         START 1 INCREMENT 1;
CREATE SEQUENCE po_number_seq         START 1 INCREMENT 1;
CREATE SEQUENCE so_number_seq         START 1 INCREMENT 1;
CREATE SEQUENCE si_number_seq         START 1 INCREMENT 1;
CREATE SEQUENCE je_number_seq         START 1 INCREMENT 1;
CREATE SEQUENCE oos_number_seq        START 1 INCREMENT 1;
CREATE SEQUENCE incident_number_seq   START 1 INCREMENT 1;

CREATE OR REPLACE FUNCTION next_business_number(seq regclass, prefix text, year int, pad int DEFAULT 6)
RETURNS text LANGUAGE sql AS $$
  SELECT prefix || '-' || year::text || '-' || lpad(nextval(seq)::text, pad, '0')
$$;

-- ─── 3) إبقاء updatedAt صحيحًا حتى عند التحديث بـ SQL الخام (المزامنة/runbook) ──
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- تحديثات داخلية (ختم syncSeq من trigger) لا تُحرّك updatedAt
  IF COALESCE(current_setting('app.internal_sync', true), '') = 'true' THEN
    RETURN NEW;
  END IF;
  NEW."updatedAt" = now();
  RETURN NEW;
END $$;

DO $do$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_name = c.table_name AND tb.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND c.column_name = 'updatedAt' AND tb.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_touch ON %I;
       CREATE TRIGGER trg_touch BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_updated_at()',
      t.table_name, t.table_name);
  END LOOP;
END $do$;

-- ─── 4) سجل التغييرات (Change Feed) — يملؤه Trigger فلا يفوته أي مسار كتابة ────
-- جدول الربط هو المرجع الوحيد: يُملأ هنا (من نفس قائمة الكيانات) ثم يُحدَّثه seed
-- مطابقةً لـ SYNC_META في @newport/domain. لا مؤجّل يُرفَق بجدول غير مسجَّل هنا —
-- وإلا شمل الـ bump جداول غير متزامنة مثل users، فتُبطل جلسات JWT الموقّعة بعمود version.
CREATE TABLE IF NOT EXISTS sync_entity_registry (
  entity        text PRIMARY KEY,
  table_name    text NOT NULL UNIQUE,
  merge         text NOT NULL CHECK (merge IN ('server_wins','field_merge','append_only','reject')),
  push_priority smallint NOT NULL DEFAULT 2
);

INSERT INTO sync_entity_registry (entity, table_name, merge, push_priority) VALUES
  ('workOrder',        'work_orders',            'field_merge',   2),
  ('workOrderLog',     'wo_logs',                'append_only',   1),
  ('laborEntry',       'wo_labor_entries',       'append_only',   2),
  ('partIssue',        'part_requisitions',      'reject',        1),
  ('shiftLog',         'production_shift_logs',  'field_merge',   1),
  ('processParam',     'process_parameters',     'append_only',   2),
  ('downtime',         'equipment_downtimes',    'field_merge',   1),
  ('alarmAck',         'production_alarms',      'append_only',   1),
  ('labSample',        'lab_samples',            'field_merge',   2),
  ('labResult',        'lab_results',            'field_merge',   2),
  ('permit',           'permits_to_work',        'reject',        1),
  ('asset',            'assets',                 'server_wins',   3),
  ('assetReading',     'asset_readings',         'append_only',   2),
  ('pmPlanInstance',   'pm_plan_instances',      'server_wins',   2),
  ('attendancePunch',  'attendance_punches',     'append_only',   3),
  ('leaveRequest',     'leave_requests',         'field_merge',   3),
  ('mobileFormRecord', 'mobile_form_records',    'append_only',   1),
  ('document',         'documents',              'append_only',   3),
  ('notificationAck',  'notifications',          'append_only',   3)
ON CONFLICT (entity) DO UPDATE
  SET table_name = EXCLUDED.table_name, merge = EXCLUDED.merge, push_priority = EXCLUDED.push_priority;

-- لا يُعتمد على التطبيق في تسجيل التغييرات؛ المزامنة تفشل صامتًا إن نسي المطوّر التسجيل.
CREATE OR REPLACE FUNCTION fn_sync_changelog() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  entity_name text := TG_ARGV[0];
  meta_json   jsonb;
  payload     jsonb;
BEGIN
  -- التحديثات التي يولّدها trg_stamp_entity_seq نفسها: تُتجاهل وإلا تدفق لا نهائي
  IF COALESCE(current_setting('app.internal_sync', true), '') = 'true' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    meta_json := to_jsonb(OLD);
    payload   := jsonb_build_object('id', OLD.id);
  ELSE
    meta_json := to_jsonb(NEW);
    payload   := to_jsonb(NEW);
  END IF;

  -- إزالة الحقول الحساسة من النسخة المنشورة إلى العملاء
  payload := payload - 'passwordHash' - 'clientOpId';

  INSERT INTO sync_change_log ("facilityId", entity, "recordId", op, version, payload, "actorId", "deviceId", "subDeptId")
  VALUES (
    NULLIF(meta_json #>> '{facilityId}', '')::uuid,
    entity_name,
    NULLIF(meta_json #>> '{id}', '')::uuid,
    CASE WHEN TG_OP = 'DELETE' THEN 'DELETE'::"SyncOp" ELSE 'UPSERT'::"SyncOp" END,
    COALESCE(NULLIF(meta_json #>> '{version}', '')::int, 1),
    payload,
    COALESCE(
      NULLIF(current_setting('app.user_id', true), '')::uuid,
      NULLIF(meta_json #>> '{createdById}', '')::uuid,
      NULLIF(meta_json #>> '{byUserId}', '')::uuid,
      NULLIF(meta_json #>> '{loggedById}', '')::uuid
    ),
    NULLIF(current_setting('app.device_id', true), ''),
    NULLIF(meta_json #>> '{subDeptId}', '')::uuid
  );
  RETURN COALESCE(NEW, OLD);
END $$;

-- ربط مؤجّل Change Feed بكل جدول مسجَّل (جدول واحد لكل كيان — انظر القاعدة أعلاه)
DO $do$
DECLARE m record;
BEGIN
  FOR m IN SELECT entity, table_name FROM sync_entity_registry ORDER BY entity LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = m.table_name) THEN
      RAISE EXCEPTION 'sync registry: missing table % (entity %)', m.table_name, m.entity;
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS trg_sync ON %1$I;
                    CREATE TRIGGER trg_sync AFTER INSERT OR UPDATE OR DELETE ON %1$I
                    FOR EACH ROW EXECUTE FUNCTION fn_sync_changelog(%2$L)', m.table_name, m.entity);
  END LOOP;
END $do$;

-- ─── 5) زيادة الإصدار التلقائي — للكيانات المتزامنة فقط ─────────────────────
-- version هو قفل تفاؤلي للمزامنة **وعضوٌ في توكن JWT (claim v)**: رفعه على جداول غير
-- متزامنة (مثل users) يُبطل الجلسة عند كل تحديث جانبي، لذا القائمة مقيّدة بالسجل.
CREATE OR REPLACE FUNCTION fn_bump_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- ختم syncSeq عملية داخلية صرفة: لا تُغيّر version وإلا أفسدت القفل التفاؤلي للعملاء
  IF COALESCE(current_setting('app.internal_sync', true), '') = 'true' THEN
    RETURN NEW;
  END IF;
  NEW."version" = COALESCE(OLD."version", NEW."version", 0) + 1;
  NEW."syncSeq" := NULL; -- تُختم لاحقًا من AFTER-trigger على sync_change_log
  RETURN NEW;
END $$;

DO $do$
DECLARE m record;
BEGIN
  FOR m IN
    SELECT r.table_name
    FROM sync_entity_registry r
    JOIN information_schema.columns c
      ON c.table_schema = 'public' AND c.table_name = r.table_name AND c.column_name = 'version'
    JOIN information_schema.columns c2
      ON c2.table_schema = 'public' AND c2.table_name = r.table_name AND c2.column_name = 'syncSeq'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_bump_version ON %I;
                    CREATE TRIGGER trg_bump_version BEFORE UPDATE ON %I
                    FOR EACH ROW EXECUTE FUNCTION fn_bump_version()', m.table_name, m.table_name);
  END LOOP;
END $do$;

-- ─── 5ب) ختم syncSeq على السجل نفسه — يربط كل سجل بترتيب التغييرات ─────────
CREATE OR REPLACE FUNCTION fn_stamp_entity_seq() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  tbl text;
BEGIN
  SELECT table_name INTO tbl FROM sync_entity_registry WHERE entity = NEW.entity;
  IF tbl IS NULL THEN RETURN NULL; END IF;
  -- راوي "تحديث داخلي": يمنع trg_sync/trg_bump_version/trg_touch من الاشتعال من جديد
  PERFORM set_config('app.internal_sync', 'true', true);
  BEGIN
    EXECUTE format('UPDATE %I SET "syncSeq" = $1 WHERE id = $2', tbl) USING NEW.seq, NEW."recordId";
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL; -- جدول بلا syncSeq (كيان غير متزامن): لا شيء لربطه
  END;
  PERFORM set_config('app.internal_sync', 'false', true);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_stamp_entity_seq ON sync_change_log;
CREATE TRIGGER trg_stamp_entity_seq AFTER INSERT ON sync_change_log
  FOR EACH ROW EXECUTE FUNCTION fn_stamp_entity_seq();

-- ─── 6) قيود سلامة البيانات (camelCase مقبَّس كما يولّده Prisma) ─────────────
ALTER TABLE work_orders                 ADD CONSTRAINT ck_wo_target_after_start CHECK ("targetEndAt" IS NULL OR "planStartAt" IS NULL OR "targetEndAt" >= "planStartAt");
ALTER TABLE work_orders                 ADD CONSTRAINT ck_wo_actuals            CHECK ("actualEndAt" IS NULL OR "actualStartAt" IS NULL OR "actualEndAt" >= "actualStartAt");
ALTER TABLE work_orders                 ADD CONSTRAINT ck_wo_closed_has_end     CHECK (status <> 'CLOSED' OR "actualEndAt" IS NOT NULL);
ALTER TABLE work_orders                 ADD CONSTRAINT ck_wo_desc_min_length    CHECK (description IS NULL OR length(description) >= 10); -- يمنع أوامر شغل بلا وصف كافٍ
ALTER TABLE work_orders                 ADD CONSTRAINT ck_wo_est_hours          CHECK ("estHours"   IS NULL OR "estHours"   >= 0);
ALTER TABLE work_orders                 ADD CONSTRAINT ck_wo_labor_hours        CHECK ("laborHours" IS NULL OR "laborHours" >= 0);
ALTER TABLE work_orders                 ADD CONSTRAINT ck_wo_costs_nonneg       CHECK (COALESCE("partsCost",0) >= 0 AND COALESCE("laborCost",0) >= 0 AND COALESCE("contractorCost",0) >= 0);
ALTER TABLE permits_to_work             ADD CONSTRAINT ck_permit_window         CHECK ("validTo" > "validFrom");
ALTER TABLE permits_to_work             ADD CONSTRAINT ck_permit_close          CHECK (status <> 'CLOSED' OR "closedAt" IS NOT NULL);
ALTER TABLE production_shift_logs       ADD CONSTRAINT ck_shiftlog_rate         CHECK ("designRateTph" IS NULL OR "designRateTph" > 0);
ALTER TABLE production_shift_logs       ADD CONSTRAINT ck_shiftlog_pct          CHECK ("availabilityPct" IS NULL OR ("availabilityPct" BETWEEN 0 AND 100));
ALTER TABLE production_shift_logs       ADD CONSTRAINT ck_shiftlog_tons         CHECK ("productionTons" IS NULL OR "productionTons" >= 0);
ALTER TABLE attendance_daily_summaries  ADD CONSTRAINT ck_att_minutes           CHECK ("workedMinutes" >= 0 AND "lateMinutes" >= 0 AND "overtimeMinutes" >= 0);
ALTER TABLE attendance_daily_summaries  ADD CONSTRAINT ck_att_scheduled         CHECK ("scheduledMinutes" >= 0 AND "scheduledMinutes" <= 1440);
ALTER TABLE stock_balances              ADD CONSTRAINT ck_stock_qty             CHECK ("onHandQty" >= 0);
ALTER TABLE stock_balances              ADD CONSTRAINT ck_stock_levels          CHECK ("minLevel" IS NULL OR "maxLevel" IS NULL OR "maxLevel" >= "minLevel");
ALTER TABLE lab_results                 ADD CONSTRAINT ck_lab_result_value      CHECK (value IS NOT NULL);
ALTER TABLE leave_requests              ADD CONSTRAINT ck_leave_window          CHECK ("toAt" >= "fromAt");
ALTER TABLE journal_lines               ADD CONSTRAINT ck_journal_debit_credit  CHECK (NOT (debit <> 0 AND credit <> 0));
ALTER TABLE budget_lines                ADD CONSTRAINT ck_budget_positive       CHECK ("totalAmount" >= 0);
ALTER TABLE documents                   ADD CONSTRAINT ck_doc_size              CHECK ("sizeBytes" >= 0 AND "sizeBytes" <= 262144000); -- ≤ 250MB
ALTER TABLE equipment_downtimes         ADD CONSTRAINT ck_dt_window              CHECK ("endAt" IS NULL OR "endAt" >= "startAt");
ALTER TABLE stock_movements             ADD CONSTRAINT ck_mov_qty_sign           CHECK ((kind IN ('ISSUE','TRANSFER_OUT','SCRAP') AND qty <= 0) OR kind NOT IN ('ISSUE','TRANSFER_OUT','SCRAP'));

-- فهارس غامضة للبحث الميداني (اسم الصنف/الأصل بالعربية) + فهارس عمل المزامنة
CREATE INDEX IF NOT EXISTS ix_stockitem_name_trgm ON stock_items USING gin ("nameAr" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_asset_name_trgm     ON assets      USING gin ("nameAr" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_wo_text_trgm        ON work_orders USING gin ((title || ' ' || description) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_wo_sync_pending     ON work_orders ("syncSeq") WHERE "syncSeq" IS NULL;
CREATE INDEX IF NOT EXISTS ix_wo_open_dept        ON work_orders ("departmentId", status) WHERE status NOT IN ('CLOSED','CANCELLED','REJECTED');

-- ─── 7) جدول التدقيق: append-only (ممنوع التعديل والحذف) ──────────────────────
CREATE OR REPLACE FUNCTION fn_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_trails is append-only (immutability requirement)';
END $$;

DROP TRIGGER IF EXISTS trg_audit_immutable ON audit_trails;
CREATE TRIGGER trg_audit_immutable BEFORE UPDATE OR DELETE ON audit_trails
  FOR EACH ROW EXECUTE FUNCTION fn_immutable();

REVOKE UPDATE, DELETE, TRUNCATE ON audit_trails FROM PUBLIC;

-- ─── 8) مناورات التقارير (Materialized views — تُحدَّث كل 5 دقائق) ────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_maintenance_kpi_daily AS
WITH wo AS (
  SELECT w.*,
         EXTRACT(EPOCH FROM (w."actualStartAt" - w."createdAt")) / 3600.0 AS response_hours,
         EXTRACT(EPOCH FROM (COALESCE(w."actualEndAt", now()) - w."actualStartAt")) / 3600.0 AS exec_hours,
         COALESCE(w."partsCost", 0) + COALESCE(w."laborCost", 0) + COALESCE(w."contractorCost", 0) AS total_cost
  FROM work_orders w
  WHERE w."deletedAt" IS NULL
)
SELECT d.code                                   AS "departmentCode",
       sd.code                                  AS "subdeptCode",
       date_trunc('day', wo."createdAt")::date  AS day,
       count(*)                                                                      AS total_wo,
       count(*) FILTER (WHERE wo.status = 'CLOSED')                                  AS closed_wo,
       count(*) FILTER (WHERE wo.priority IN ('EMERGENCY','URGENT') AND wo."sourceType" <> 'PM') AS reactive_wo,
       count(*) FILTER (WHERE wo.status NOT IN ('CLOSED','CANCELLED','REJECTED'))    AS open_wo,
       avg(wo.response_hours) FILTER (WHERE wo.response_hours IS NOT NULL)          AS avg_response_hours,
       avg(wo.exec_hours)     FILTER (WHERE wo.exec_hours     IS NOT NULL)           AS avg_mttr_hours,
       sum(wo.total_cost)                                                          AS cost,
       count(*) FILTER (WHERE wo.status = 'CLOSED' AND wo."targetEndAt" IS NOT NULL AND wo."actualEndAt" <= wo."targetEndAt") AS on_time_closed,
       count(*) FILTER (WHERE wo.status = 'CLOSED' AND wo."targetEndAt" IS NOT NULL) AS targeted_closed
FROM wo
LEFT JOIN sub_departments sd ON sd.id = wo."subDeptId"
LEFT JOIN departments d      ON d.id = COALESCE(sd."departmentId", wo."departmentId")
GROUP BY 1, 2, 3;

CREATE UNIQUE INDEX IF NOT EXISTS ux_mv_wo_kpi ON mv_maintenance_kpi_daily ("departmentCode", "subdeptCode", day);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_production_daily AS
SELECT l."shiftDate"::date                  AS day,
       pu.code                              AS "unitCode",
       sum(l."productionTons")              AS tons,
       avg(l."availabilityPct")             AS availability_pct,
       sum(COALESCE(l."downtimeHours", 0))  AS downtime_hours,
       sum(l."lopiCount")                   AS lopi_count,
       count(*) FILTER (WHERE l.status = 'APPROVED')  AS approved_logs,
       count(*) FILTER (WHERE l.status <> 'APPROVED') AS pending_logs
FROM production_shift_logs l
JOIN production_units pu ON pu.id = l."unitId"
WHERE l."deletedAt" IS NULL
GROUP BY 1, 2;

CREATE UNIQUE INDEX IF NOT EXISTS ux_mv_prod ON mv_production_daily (day, "unitCode");

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_attendance_daily AS
SELECT s."workDate"::date                   AS day,
       sd.code                              AS "subdeptCode",
       s."shiftCode",
       count(*)                                                                AS headcount,
       count(*) FILTER (WHERE s.status IN ('PRESENT','LATE_IN','EARLY_OUT'))  AS present,
       count(*) FILTER (WHERE s.status = 'ABSENT')                             AS absent,
       count(*) FILTER (WHERE s.status IN ('MISSING_IN','MISSING_OUT','UNRESOLVED')) AS unresolved,
       sum(s."overtimeMinutes") / 60.0                                         AS ot_hours,
       sum(s."lateMinutes")                                                    AS late_minutes,
       avg(s."workedMinutes")                                                  AS avg_worked_min
FROM attendance_daily_summaries s
JOIN employees e        ON e.id = s."employeeId"
JOIN sub_departments sd ON sd.id = e."subDeptId"
GROUP BY 1, 2, 3;

CREATE UNIQUE INDEX IF NOT EXISTS ux_mv_att ON mv_attendance_daily (day, "subdeptCode", "shiftCode");

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_stock_critical AS
SELECT i.id AS "itemId", i."partNumber", i."nameAr", i.uom, b."warehouseId",
       b."onHandQty", b."reservedQty", b."reorderPoint",
       (b."onHandQty" - b."reservedQty") AS available_qty,
       CASE WHEN b."onHandQty" - b."reservedQty" <= COALESCE(b."reorderPoint", b."minLevel")
            THEN true ELSE false END     AS below_reorder,
       i."isCriticalSpare"
FROM stock_items i
JOIN stock_balances b ON b."itemId" = i.id
WHERE i."isActive" = true AND i."isCriticalSpare" = true;

CREATE UNIQUE INDEX IF NOT EXISTS ux_mv_stock ON mv_stock_critical ("itemId", "warehouseId");

-- ─── 9) أمن البيانات: Row-Level Security ─────────────────────────────────────
-- الخادم يضبط app.scope_* في كل معاملة (PrismaService.withScope → SET LOCAL).
--طبقة أمان ثانية ضد أخطاء الاستعلامات؛ تُفعَّل بجدوى عند استخدام دور تطبيق غير المالك (newport_app).
CREATE OR REPLACE FUNCTION fn_scope_subdepts() RETURNS setof uuid LANGUAGE sql STABLE AS $$
  SELECT NULL::uuid
  WHERE current_setting('app.scope_kind', true) IS DISTINCT FROM 'SUBDEPT'
    AND current_setting('app.scope_kind', true) IS DISTINCT FROM 'DEPT'
  UNION ALL
  SELECT s.id FROM sub_departments s
  WHERE current_setting('app.scope_kind', true) = 'SUBDEPT'
    AND s.id = NULLIF(current_setting('app.subdept_id', true), '')::uuid
  UNION ALL
  SELECT s.id FROM sub_departments s
  WHERE current_setting('app.scope_kind', true) = 'DEPT'
    AND s."departmentId" = NULLIF(current_setting('app.dept_id', true), '')::uuid;
$$;

ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders FORCE  ROW LEVEL SECURITY;
CREATE POLICY p_wo_scope ON work_orders
  USING (
    current_setting('app.scope_kind', true) = 'ALL'
    OR "deletedAt" IS NOT NULL                                     -- allow reading tombstones for sync
    OR "subDeptId" IN (SELECT * FROM fn_scope_subdepts())
    OR "departmentId" = NULLIF(current_setting('app.dept_id', true), '')::uuid
    OR "createdById" = NULLIF(current_setting('app.user_id', true), '')::uuid
  );

ALTER TABLE production_shift_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_shift_logs FORCE  ROW LEVEL SECURITY;
CREATE POLICY p_slog_scope ON production_shift_logs
  USING (
    current_setting('app.scope_kind', true) = 'ALL'
    OR "preparedById" = NULLIF(current_setting('app.user_id', true), '')::uuid
    OR "approvedById" = NULLIF(current_setting('app.user_id', true), '')::uuid
  );

ALTER TABLE attendance_punches ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_punches FORCE  ROW LEVEL SECURITY;
CREATE POLICY p_punch_scope ON attendance_punches
  USING (
    NULLIF(current_setting('app.biometric_privileged', true), '') = 'true'
    OR current_setting('app.scope_kind', true) = 'ALL'
    OR "employeeId" IN (SELECT e.id FROM employees e
                        WHERE e."subDeptId" IN (SELECT * FROM fn_scope_subdepts()))
  );

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries FORCE  ROW LEVEL SECURITY;
CREATE POLICY p_je_finance ON journal_entries
  USING (
    NULLIF(current_setting('app.fin_access', true), '') = 'true'
    OR current_setting('app.scope_kind', true) = 'ALL'
    OR "preparedById" = NULLIF(current_setting('app.user_id', true), '')::uuid
  );

-- ─── 10) دوال تقارير مساعدة (تُستعمل في لوحات القيادة والتقارير) ───────────────
CREATE OR REPLACE FUNCTION fn_wo_backlog_age(p_subdept uuid DEFAULT NULL)
RETURNS TABLE (bucket text, cnt bigint) LANGUAGE sql AS $$
  SELECT CASE
           WHEN age(now(), w."createdAt") < interval '3 days'  THEN '0-3d'
           WHEN age(now(), w."createdAt") < interval '7 days'  THEN '4-7d'
           WHEN age(now(), w."createdAt") < interval '30 days' THEN '8-30d'
           ELSE '30d+'
         END,
         count(*)
  FROM work_orders w
  WHERE (p_subdept IS NULL OR w."subDeptId" = p_subdept)
    AND w.status NOT IN ('CLOSED','CANCELLED','REJECTED')
    AND w."deletedAt" IS NULL
  GROUP BY 1
  ORDER BY 1;
$$;

CREATE OR REPLACE FUNCTION fn_mtbf_mttr(p_asset uuid, p_from date, p_to date)
RETURNS TABLE (downtime_hours numeric, mttr_hours numeric, events integer, uptime_hours numeric)
LANGUAGE sql AS $$
  WITH dt AS (
    SELECT EXTRACT(EPOCH FROM (COALESCE(d."endAt", now()) - d."startAt")) / 3600.0 AS hours
    FROM equipment_downtimes d
    WHERE d."assetId" = p_asset AND d."startAt" >= p_from AND d."startAt" < p_to AND d."endAt" IS NOT NULL
  )
  SELECT COALESCE(sum(downtime.hours), 0),
         CASE WHEN count(*) = 0 THEN NULL ELSE avg(downtime.hours) END,
         count(*)::int,
         GREATEST(0, EXTRACT(EPOCH FROM (p_to::timestamp - p_from::timestamp)) / 3600.0 - COALESCE(sum(downtime.hours), 0))
  FROM dt AS downtime;
$$;

-- ─── 11) أرشفة سجل التغييرات (تُنفَّذ شهريًا عبر pg_cron أو CronJob) ───────────
CREATE OR REPLACE FUNCTION fn_archive_sync_log(p_keep_days int DEFAULT 45) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  DELETE FROM sync_change_log WHERE at < now() - make_interval(days => p_keep_days);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION fn_refresh_reports() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_maintenance_kpi_daily;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_production_daily;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_attendance_daily;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_stock_critical;
END $$;

-- ─── 12) مواءمة تسلسلات الأرقام مع الصفوف الموجودة ──────────────────────────
-- الأرقام (WO-2026-000007 …) تُسند من تسلسلات PostgreSQL. إذا أُدخِلت صفوف بأرقام مكتوبة
-- يدويًا (seed تجريبي، ترحيل من نظام قديم، إصلاح runbook) يتصادم أول رقم مولّد معها.
-- تُنفَّذ بعد كل seed/استيراد، وفي الـ API يوجد retry دفاعي كطبقة ثانية.
CREATE OR REPLACE FUNCTION fn_align_number_sequences() RETURNS TABLE (seq text, next_value bigint) LANGUAGE plpgsql AS $$
DECLARE
  pair    record;
  v_next  bigint;
BEGIN
  FOR pair IN
    SELECT * FROM (VALUES
      ('wo_number_seq',          'work_orders',        'number'),
      ('lab_sample_number_seq',  'lab_samples',        'sampleNumber'),
      ('permit_number_seq',      'permits_to_work',    'permitNumber'),
      ('grn_number_seq',         'grns',               'number'),
      ('mi_number_seq',          'material_issues',    'number'),
      ('req_number_seq',         'part_requisitions',  'number'),
      ('pr_number_seq',          'purchase_requisitions','number'),
      ('po_number_seq',          'purchase_orders',    'number'),
      ('so_number_seq',          'sales_orders',       'number'),
      ('si_number_seq',          'sales_invoices',     'number'),
      ('je_number_seq',          'journal_entries',    'number'),
      ('oos_number_seq',         'lab_oos_cases',      'code'),
      ('incident_number_seq',    'safety_incidents',   'code')
    ) AS t(seq, tbl, col)
  LOOP
    IF EXISTS (SELECT 1 FROM pg_class pc JOIN pg_namespace n ON n.oid = pc.relnamespace
                WHERE n.nspname = 'public' AND pc.relname = pair.tbl AND pc.relkind = 'r')
       AND EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = pair.tbl AND column_name = pair.col)
       AND EXISTS (SELECT 1 FROM pg_class pc JOIN pg_namespace n ON n.oid = pc.relnamespace
                WHERE n.nspname = 'public' AND pc.relname = pair.seq AND pc.relkind = 'S')
    THEN
      EXECUTE format(
        'SELECT COALESCE(MAX((substring(%I::text from %L))::bigint), 0) + 1 FROM %I',
        pair.col, '[0-9]+$', pair.tbl
      ) INTO v_next;
      EXECUTE 'SELECT setval($1::regclass, $2::bigint, false)' USING pair.seq, GREATEST(v_next, 1);
      seq := pair.seq;
      next_value := v_next;
      RETURN NEXT;
    END IF;
  END LOOP;
END $$;
