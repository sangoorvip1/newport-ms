import { Module } from '@nestjs/common';
import { LabController } from './lab.controller.js';
import { LabService } from './lab.service.js';

/**
 * وحدة المختبر (شعبة PROD-LAB في الهيكل المرجعي).
 * PrismaModule عام (Global) فلا يُستورد هنا صراحة — انظر docs/05 §4.1.
 * ملاحظة: بيانات العينات/النتائج تدخل أيضًا عبر محرك المزامنة (labSample/labResult)؛ هذه المسارات
 * هي مسار المكتب والمسار الوحيد الذي يختم الأرقام وحالات OOS والاعتمادات.
 */
@Module({
  controllers: [LabController],
  providers: [LabService],
  exports: [LabService],
})
export class LabModule {}
