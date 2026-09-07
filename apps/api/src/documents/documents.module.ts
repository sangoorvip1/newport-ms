import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';

/**
 * وحدة الوثائق: المسار الوحيد لرفع/تحميل المرفقات (صور الميدان، PDF، شهادات).
 * لا تعتمد على أي عميل سحابة — المخزن المحلي + توكن موقّع، وobjectKey بنفس شكل مفاتيح MinIO.
 */
@Module({ controllers: [DocumentsController], providers: [DocumentsService], exports: [DocumentsService] })
export class DocumentsModule {}
