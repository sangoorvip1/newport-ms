import { Body, Controller, Get, InternalServerErrorException, Logger, Param, ParseUUIDPipe, Post, Put, Query, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { createHash } from 'node:crypto';
import {
  documentListQueryDto,
  documentMetadataDto,
  documentPresignDto,
  documentUploadDto,
  type DocumentListQueryDto,
  type DocumentMetadataDto,
  type DocumentPresignDto,
  type DocumentUploadDto,
} from '@newport/domain';
import { AllowAnonymous, CurrentAccess, RequirePermission, type AccessContext } from '../security/access.guard.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { CONFIG } from '../config.js';
import { DocumentsService } from './documents.service.js';
import { readTicket } from './document-store.js';

/**
 * قناة المرفقات (صور أوامر الشغل، نتائج المختبر، مخططات شعبة الوثائق).
 *
 * مسار raw PUT هو الوحيد المسموح بلا جلسة، وسبله: توكن موقّع قصير العمر صادر بعد تفويض صحيح
 * (HMAC بمفتاح الخادم) + سقف حجم يُطبَّق أثناء البث + صلاحية النوع من التوكن لا من الرأس المرسل.
 */
@Controller('v1/documents')
export class DocumentsController {
  private readonly logger = new Logger(DocumentsController.name);

  constructor(private readonly docs: DocumentsService) {}

  @RequirePermission(['doc.upload'])
  @Post('upload')
  upload(@Body(new ZodPipe(documentUploadDto)) body: DocumentUploadDto, @CurrentAccess() access: AccessContext) {
    return this.docs.upload(body, access);
  }

  @RequirePermission(['doc.upload'])
  @Post('presign')
  presign(@Body(new ZodPipe(documentPresignDto)) body: DocumentPresignDto, @CurrentAccess() access: AccessContext) {
    return this.docs.presign(body, access);
  }

  /** رفع بايتات خام (كاميرا الهاتف) — التوكن هو التفويض، والحد يُطبَّق أثناء التدفق */
  @AllowAnonymous()
  @Put('raw/:token')
  async raw(@Param('token') token: string, @Req() req: { [k: string]: unknown }, @Res() res: { status(c: number): { json(b: unknown): unknown }; setHeader(k: string, v: string): void }) {
    const parsed = readTicket(token);
    if (!parsed.ok) {
      res.status(403).json({ statusCode: 403, messageAr: parsed.reasonAr });
      return;
    }
    const max = Math.min(parsed.ticket.maxBytes, CONFIG.storage.maxUploadBytes);
    const hash = createHash('sha256');
    const chunks: Buffer[] = [];
    let size = 0;
    const reqAny = req as unknown as AsyncIterable<Buffer>;
    for await (const chunk of reqAny) {
      size += chunk.length;
      if (size > max) {
        res.status(413).json({ statusCode: 413, messageAr: `تجاوزت الحد المسموح (${max} بايت) — أُلغي الرفع ولم يُكتب شيء`, maxBytes: max });
        return;
      }
      hash.update(chunk);
      chunks.push(chunk);
    }
    const created = await this.docs.finishRawUpload(token, Buffer.concat(chunks));
    // نتحقق داخليًا أن البصمة المحسوبة أثناء البث هي ما سجّله الخدمة (لا انحراف في نصف مسجّل)
    if (created.sha256 && created.sha256 !== hash.digest('hex')) {
      throw new InternalServerErrorException({ statusCode: 500, messageAr: 'بصمة الرفع غير مطابقة بين البث والسجل — أبلغ المشرف', documentId: created.id });
    }
    res.status(201).json(created);
  }

  @RequirePermission(['doc.view'])
  @Get()
  list(
    @Query(new ZodPipe(documentListQueryDto)) query: DocumentListQueryDto,
    @CurrentAccess() access: AccessContext,
  ) {
    return this.docs.list(query, access);
  }

  /**
   * بثّ الملف: `stream.pipe(res)` — لا `res.pipe(stream)` (لا وجود لها في express، وكان سبب 500
   * كشفه فحص الوثائق). أخطاء القراءة تُترجم إلى JSON قبل أن تُغلق الاستجابة جزئيًا.
   */
  @RequirePermission(['doc.view'])
  @Get(':id/content')
  async content(@Param('id', new ParseUUIDPipe()) id: string, @CurrentAccess() access: AccessContext, @Res() res: Response): Promise<void> {
    const { stream, sizeBytes, mimeType, originalName, sha256 } = await this.docs.contentDescriptor(id, access);
    res.setHeader('content-type', mimeType);
    res.setHeader('content-length', String(sizeBytes));
    res.setHeader('content-disposition', `inline; filename="${originalName.replace(/["\r\n]/g, '_')}"`);
    if (sha256) res.setHeader('x-content-sha256', sha256);
    res.setHeader('cache-control', 'private, max-age=60');
    stream.on('error', (e: Error) => {
      this.logger.error(`تعذّر بثّ ${id}: ${e.message}`);
      if (!res.headersSent) res.status(500).json({ statusCode: 500, messageAr: 'تعذّر قراءة الملف من المخزن', documentId: id });
      else res.destroy();
    });
    stream.pipe(res);
  }

  @RequirePermission(['doc.manage'])
  @Post(':id/metadata')
  metadata(@Param('id') id: string, @Body(new ZodPipe(documentMetadataDto)) body: DocumentMetadataDto, @CurrentAccess() access: AccessContext) {
    return this.docs.updateMetadata(id, body, access);
  }

  // الحذف الميداني لمرفق رفعه المستخدم مسموح (doc.upload)، وإدارة السجل تتطلب doc.manage —
  // الملكية يفحصها Service حتى مع doc.manage لا يحذف المستخدم مرفق غيره بلا سبب.
  @RequirePermission(['doc.manage', 'doc.upload'], { anyOf: true })
  @Post(':id/delete')
  remove(@Param('id') id: string, @Body() body: { reasonAr?: string }, @CurrentAccess() access: AccessContext) {
    return this.docs.softDelete(id, body?.reasonAr, access);
  }
}
