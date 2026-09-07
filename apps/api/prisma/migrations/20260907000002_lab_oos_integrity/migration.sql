-- سلامة بيانات المختبر: كانت lab_oos_cases تحمل sampleId/resultId كأعمدة رقمية بلا مفاتيح أجنبية،
-- فأي سطر يتيم (عينة حُذفت) كان يبقى في قائمة المتابعة إلى الأبد، ولا يمكن الربط عبر Prisma (لا join).
-- تُضاف المفاتيح الأجنبية + قيود CHECK على حالة OOS وشدّتها (الآلة في packages/domain/src/lab.ts).

-- 1) المفاتيح الأجنبية
ALTER TABLE lab_oos_cases
  ADD CONSTRAINT fk_lab_oos_sample FOREIGN KEY ("sampleId") REFERENCES lab_samples (id) ON DELETE CASCADE;

-- resultId اختياري (حالة قد تُفتح على عينة قبل تثبيت النتيجة) ⇒ إزالة الربط لا حذف الحالة
ALTER TABLE lab_oos_cases
  ADD CONSTRAINT fk_lab_oos_result FOREIGN KEY ("resultId") REFERENCES lab_results (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_oos_sample ON lab_oos_cases ("sampleId");
CREATE INDEX IF NOT EXISTS ix_oos_open_by ON lab_oos_cases ("openedById", status);

-- 2) نظافة الصفوف اليتيماء قبل تقييد القاعدة (آمن: لا شيء مزروع حاليًا)
DELETE FROM lab_oos_cases o WHERE NOT EXISTS (SELECT 1 FROM lab_samples s WHERE s.id = o."sampleId");
UPDATE lab_oos_cases o SET "resultId" = NULL
 WHERE o."resultId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lab_results r WHERE r.id = o."resultId");

-- 3) القيود: الحالات مطابقة لـ OOS_TRANSITIONS في الدومين، والشدّة ثلاث درجات فقط
ALTER TABLE lab_oos_cases
  ADD CONSTRAINT ck_oos_status CHECK ("status" IN ('OPEN','INVESTIGATING','CAPA_DEFINED','EFFECTIVENESS_CHECK','CLOSED','REJECTED'));
ALTER TABLE lab_oos_cases
  ADD CONSTRAINT ck_oos_severity CHECK ("severity" IN ('MINOR','MAJOR','CRITICAL'));
-- لا إغلاق بلا سبب جذري وإجراء تصحيحي (نفس ما يفرضه LabService، مكرّر في القاعدة عمدًا:
-- الاستيراد اليدوي من DBA لا يمر بالخدمة)
ALTER TABLE lab_oos_cases
  ADD CONSTRAINT ck_oos_close_requires_docs CHECK ("status" <> 'CLOSED' OR ("rootCauseAr" IS NOT NULL AND "capaAr" IS NOT NULL));
