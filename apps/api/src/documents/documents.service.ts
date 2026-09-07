import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  DOCUMENT_ENTITY_TYPES,
  type DocumentMetadataDto,
  type DocumentPresignDto,
  type DocumentUploadDto,
  type PermissionCode,
} from '@newport/domain';
import { PrismaService } from '../common/prisma.service.js';
import type { AccessContext } from '../security/access.guard.js';
import { CONFIG } from '../config.js';
import { allowedMimeTypes, extensionFor, fileExists, fileStream, issueTicket, objectKeyFor, putBytes, readTicket, type RawUploadTicket } from './document-store.js';

/**
 * الوثائق والصور الميدانية.
 *
 * العقد: جدول `documents` هو **قناة المرفقات الوحيدة** (قرار تصميم موثّق في docs/05 §5):
 * كل صورة/ملف يُلحق بسطر `document` بـ (entityType, entityId)، والكيانات المتزامنة لا تحمل حقول صور —
 * لا «كيان مرفق» ثاني على نفس الجدول (كان سببًا لتضاعف دفعة التغييرات قبلًا).
 *
 * ما يُختم في الخادم ولا يُقبل من العميل: sizeBytes، sha256، uploadedById، ownerSubDeptId، facilityId.
 * الحد الأقصى يُطبَّق مرتين: على نص base64 (DTO) وعلى البايتات هنا (لا ثقة بإعلان العميل).
 */
@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /* ─────────────── الرفع من سطح المكتب (JSON + base64) ─────────────── */

  async upload(input: DocumentUploadDto, access: AccessContext) {
    this.assertDriver();
    const mimeType = this.normalizeMime(input.mimeType, input.originalName);
    const bytes = this.decodeBase64(input.dataBase64);

    return this.persist(
      {
        id: input.id ?? undefined,
        docType: input.docType,
        titleAr: input.titleAr,
        categoryCode: input.categoryCode ?? null,
        code: input.code ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        originalName: input.originalName,
        mimeType,
        isEncrypted: input.isEncrypted,
      },
      bytes,
      access,
      'UPLOAD_JSON',
    );
  }

  /* ─────────────── قناة الهاتف: presign ثم PUT خام ─────────────── */

  async presign(input: DocumentPresignDto, access: AccessContext) {
    this.assertDriver();
    const mimeType = this.normalizeMime(input.mimeType, input.originalName);
    const documentId = input.id ?? undefined;
    const { token, expiresAt, id } = issueTicket({
      ...(documentId ? { id: documentId } : {}),
      userId: access.profile.userId,
      facilityId: access.profile.facilityId ?? null,
      ownerSubDeptId: access.profile.subDeptId ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      docType: input.docType,
      titleAr: input.titleAr,
      categoryCode: input.categoryCode ?? null,
      code: input.code ?? null,
      originalName: input.originalName,
      mimeType,
      isEncrypted: input.isEncrypted,
    } as Omit<RawUploadTicket, 'expiresAt' | 'maxBytes'>);

    const base = (CONFIG.publicBaseUrl || `http://127.0.0.1:${CONFIG.port}`).replace(/\/$/, '');
    return {
      documentId: id,
      method: 'PUT',
      url: `${base}/api/v1/documents/raw/${token}`,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
      headers: { 'content-type': mimeType },
      maxBytes: CONFIG.storage.maxUploadBytes,
      driver: CONFIG.storage.driver,
      hintAr:
        CONFIG.storage.driver === 'local'
          ? 'أرسل البايتات الخام (لا base64) بنفس المعرّف؛ الانتهاء قبل expiry وإلا اطلب رابطًا جديدًا'
          : `المشغّل ${CONFIG.storage.driver}: المسار هنا يخدم التطوير؛ للإنتاج استعمل مفاتيح الكائن نفسها في ${CONFIG.storage.endpoint}/${CONFIG.storage.bucket}`,
      expectedSizeBytes: input.expectedSizeBytes ?? null,
    };
  }

  /** يُستدعى من المتحكم بعد قراءة البث الخام والتحقق من السقف */
  async finishRawUpload(token: string, bytes: Buffer) {
    this.assertDriver();
    const parsed = readTicket(token);
    if (!parsed.ok) {
      throw new ForbiddenException({ statusCode: 403, messageAr: parsed.reasonAr, hintAr: 'أعد طلب POST /v1/documents/presign' });
    }
    const t = parsed.ticket;
    if (bytes.length > t.maxBytes) {
      throw new BadRequestException({ statusCode: 413, messageAr: `الملف أكبر من السقف المسموح (${t.maxBytes} بايت)`, actualBytes: bytes.length });
    }
    if (bytes.length === 0) throw new BadRequestException({ statusCode: 400, messageAr: 'الملف فارغ' });

    // الجلسة غير مطلوبة أثناء PUT — الملكية من التوكن الموقّع نفسه
    const accessLike = {
      userId: t.userId,
      deviceId: 'presigned-put',
      ip: null,
      profile: { userId: t.userId, facilityId: t.facilityId, subDeptId: t.ownerSubDeptId, departmentId: null, isFacilityWide: false, permissions: [{ code: 'doc.upload', scope: 'SUBDEPT' }] },
    } as unknown as AccessContext;

    return this.persist(
      {
        id: t.id,
        docType: t.docType,
        titleAr: t.titleAr,
        categoryCode: t.categoryCode ?? null,
        code: t.code ?? null,
        entityType: t.entityType,
        entityId: t.entityId,
        originalName: t.originalName,
        mimeType: t.mimeType,
        isEncrypted: !!t.isEncrypted,
      },
      bytes,
      accessLike,
      'UPLOAD_RAW',
    );
  }

  /* ─────────────── القراءة والتحميل ─────────────── */

  async list(filter: { entityType?: string; entityId?: string; docType?: string; mine?: boolean; take?: number; skip?: number }, access: AccessContext) {
    const grant = this.grantOf(access, 'doc.view');
    const take = Math.min(filter.take ?? 25, 100);
    const where: Prisma.DocumentWhereInput = {
      deletedAt: null,
      ...(filter.entityType ? { entityType: filter.entityType } : {}),
      ...(filter.entityId ? { entityId: filter.entityId } : {}),
      ...(filter.docType ? { docType: filter.docType } : {}),
      ...(filter.mine || grant.scope === 'SELF' ? { uploadedById: access.profile.userId } : {}),
      ...(grant.scope === 'ALL' || access.profile.isFacilityWide ? {} : grant.scope === 'SUBDEPT' ? { OR: [{ ownerSubDeptId: access.profile.subDeptId }, { uploadedById: access.profile.userId }] } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.document.findMany({
        where,
        orderBy: { uploadedAt: 'desc' },
        take,
        skip: filter.skip ?? 0,
      }),
      this.prisma.document.count({ where }),
    ]);

    // documents.uploadedById عمود بلا علاقة معلنة في schema.prisma ⇒ الأسماء استعلام منفصل (نفس ما في lab)
    const names = await this.namesFor(rows.map((r) => r.uploadedById));

    return {
      total,
      take,
      skip: filter.skip ?? 0,
      scope: grant.scope,
      items: rows.map((r) => ({ ...this.toMeta(r), uploadedBy: names.get(r.uploadedById) ?? null })),
    };
  }

  /** يعيد البيانات الوصفية + المسار؛ المتحكم يبثّ الاستجابة (هيدرات + disposition آمن) */
  async contentDescriptor(id: string, access: AccessContext) {
    const row = await this.prisma.document.findFirst({ where: { id, deletedAt: null } });
    if (!row) throw new NotFoundException({ statusCode: 404, messageAr: 'الوثيقة غير موجودة أو مُسحت' });
    await this.assertCanSee(row, access, 'doc.view');

    if (!fileExists(row.objectKey)) {
      throw new NotFoundException({ statusCode: 404, messageAr: 'الملف مفقود من المخزن (objectKey مسجّل لكن البايتات غائبة) — راجع نسخة الاحتياط', objectKey: row.objectKey });
    }

    await this.prisma.withScope(this.ctx(access), (tx) =>
      this.prisma.audit(tx, {
        facilityId: row.facilityId,
        actorId: access.userId,
        action: 'EXPORT',
        entityType: 'document',
        entityId: row.id,
        changes: { originalName: row.originalName, docType: row.docType, sizeBytes: row.sizeBytes.toString() },
        meta: { ip: access.ip, deviceId: access.deviceId, purpose: 'DOWNLOAD' },
      }),
    );

    const { stream, sizeBytes } = fileStream(row.objectKey);
    return { stream, sizeBytes, mimeType: row.mimeType, originalName: row.originalName, sha256: row.sha256, uploadedAt: row.uploadedAt };
  }

  /* ─────────────── إدارة سجل الوثائق ─────────────── */

  async updateMetadata(id: string, input: DocumentMetadataDto, access: AccessContext) {
    const row = await this.prisma.document.findFirst({ where: { id, deletedAt: null } });
    if (!row) throw new NotFoundException({ statusCode: 404, messageAr: 'الوثيقة غير موجودة' });
    await this.assertCanSee(row, access, 'doc.manage');
    if (input.entityType && !DOCUMENT_ENTITY_TYPES.includes(input.entityType as never)) {
      throw new BadRequestException({ statusCode: 400, messageAr: `كيان غير معروف للإرفاق: ${input.entityType}` });
    }

    const updated = await this.prisma.withScope(this.ctx(access), async (tx) => {
      const next = await tx.document.update({
        where: { id },
        data: {
          ...(input.titleAr !== undefined ? { titleAr: input.titleAr } : {}),
          ...(input.docType !== undefined ? { docType: input.docType } : {}),
          ...(input.categoryCode !== undefined ? { categoryCode: input.categoryCode } : {}),
          ...(input.code !== undefined ? { code: input.code } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.revision !== undefined ? { revision: input.revision } : {}),
          ...(input.entityType !== undefined ? { entityType: input.entityType } : {}),
          ...(input.entityId !== undefined ? { entityId: input.entityId } : {}),
          ...(input.isEncrypted !== undefined ? { isEncrypted: input.isEncrypted } : {}),
        },
        select: { id: true, code: true, status: true, revision: true, version: true, entityType: true, entityId: true },
      });
      await this.prisma.audit(tx, {
        facilityId: row.facilityId,
        actorId: access.userId,
        action: 'UPDATE',
        entityType: 'document',
        entityId: id,
        changes: input as Record<string, unknown>,
        meta: { deviceId: access.deviceId, ip: access.ip },
      });
      return next;
    });
    return updated;
  }

  /** حذف منطقي فقط — البايتات تبقى للمراجعة القانونية، والتنظيف مهمة مجدولة (docs/05 §12) */
  async softDelete(id: string, reasonAr: string | undefined, access: AccessContext) {
    const row = await this.prisma.document.findFirst({ where: { id, deletedAt: null } });
    if (!row) throw new NotFoundException({ statusCode: 404, messageAr: 'الوثيقة غير موجودة' });
    if (row.uploadedById !== access.profile.userId && !access.can('doc.manage' as never)) {
      throw new ForbiddenException({ statusCode: 403, messageAr: 'حذف وثيقة غير مرفوعة منك يتطلب doc.manage' });
    }
    await this.prisma.withScope(this.ctx(access), async (tx) => {
      await tx.document.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.prisma.audit(tx, {
        facilityId: row.facilityId,
        actorId: access.userId,
        action: 'DELETE',
        entityType: 'document',
        entityId: id,
        changes: { objectKey: row.objectKey, reasonAr: reasonAr ?? null, bytesKept: true },
        meta: { deviceId: access.deviceId, ip: access.ip },
      });
    });
    return { id, deleted: true, bytesRetainedAt: row.objectKey };
  }

  /* ─────────────── المشترك ─────────────── */

  private async persist(
    meta: {
      id?: string;
      docType: string;
      titleAr: string;
      categoryCode: string | null;
      code: string | null;
      entityType: string | null;
      entityId: string | null;
      originalName: string;
      mimeType: string;
      isEncrypted: boolean;
    },
    bytes: Buffer,
    access: AccessContext,
    channel: 'UPLOAD_JSON' | 'UPLOAD_RAW',
  ) {
    if (bytes.length > CONFIG.storage.maxUploadBytes) {
      throw new BadRequestException({ statusCode: 413, messageAr: `حجم الملف ${bytes.length} بايت يتجاوز STORAGE_MAX_UPLOAD_BYTES (${CONFIG.storage.maxUploadBytes})`, hintAr: 'اضغط الصورة في التطبيق أو ارفعها كدفعتين' });
    }
    // إرفاق بسجل عمل: لا نربط بصف خارج نطاق المستخدم (وإلا صار document منفذ قراءة لبيانات الآخرين)
    if (meta.entityType === 'workOrder' && meta.entityId) {
      const wo = await this.prisma.workOrder.findFirst({ where: { id: meta.entityId, deletedAt: null }, select: { id: true, subDeptId: true, departmentId: true } });
      if (!wo) throw new NotFoundException({ statusCode: 404, messageAr: 'أمر الشغل للمرفق غير موجود' });
      const grant = this.grantOf(access, 'doc.upload');
      const inScope = grant.scope === 'ALL' || access.profile.isFacilityWide || wo.subDeptId === access.profile.subDeptId || (grant.scope === 'DEPT' && wo.departmentId === access.profile.departmentId);
      if (!inScope) throw new ForbiddenException({ statusCode: 403, messageAr: 'أمر الشغل الذي تحاول إرفاق الصورة به خارج نطاقك', required: 'doc.upload', woSubDeptId: wo.subDeptId });
    }

    const id = meta.id ?? (await this.nextId());
    const objectKey = objectKeyFor(id, meta.mimeType);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const { sizeBytes } = await putBytes(objectKey, bytes);

    try {
      const row = await this.prisma.withScope(this.ctx(access), async (tx) => {
        const created = await tx.document.upsert({
          where: { id },
          update: { sizeBytes: BigInt(sizeBytes), sha256, status: 'DRAFT' },
          create: {
            id,
            facilityId: access.profile.facilityId ?? null,
            ownerSubDeptId: access.profile.subDeptId ?? null,
            code: meta.code,
            titleAr: meta.titleAr,
            docType: meta.docType,
            categoryCode: meta.categoryCode,
            objectKey,
            originalName: meta.originalName,
            mimeType: meta.mimeType,
            sizeBytes: BigInt(sizeBytes),
            sha256,
            status: 'DRAFT',
            entityType: meta.entityType,
            entityId: meta.entityId,
            uploadedById: access.profile.userId,
            isEncrypted: meta.isEncrypted,
          },
          select: { id: true, code: true, docType: true, titleAr: true, objectKey: true, originalName: true, mimeType: true, sizeBytes: true, sha256: true, status: true, version: true, entityType: true, entityId: true, uploadedAt: true },
        });
        await this.prisma.audit(tx, {
          facilityId: access.profile.facilityId ?? null,
          actorId: access.userId,
          action: 'CREATE',
          entityType: 'document',
          entityId: created.id,
          changes: { docType: meta.docType, bytes: sizeBytes, sha256, channel, entity: meta.entityType, entityId: meta.entityId },
          meta: { deviceId: access.deviceId, ip: access.ip, mimeType: meta.mimeType },
        });
        return created;
      });
      return { ...this.toMeta(row), channel };
    } catch (e) {
      // لا نترك ملفًا يتيمًا على القرص إذا فشل الإدراج (إعادة المحاولة بنفس التوكن ستستبدله)
      this.logger.warn(`فشل إنشاء سطر وثيقة بعد كتابة البايتات (${objectKey}): ${(e as Error).message}`);
      throw e;
    }
  }

  private toMeta(row: {
    id: string;
    code: string | null;
    docType: string;
    titleAr: string;
    objectKey: string;
    originalName: string;
    mimeType: string;
    sizeBytes: bigint | number;
    sha256: string | null;
    status: string;
    version: number;
    entityType: string | null;
    entityId: string | null;
    uploadedAt: Date;
    uploadedBy?: { id: string; fullNameAr: string } | null;
  }) {
    return {
      id: row.id,
      code: row.code,
      docType: row.docType,
      titleAr: row.titleAr,
      objectKey: row.objectKey,
      originalName: row.originalName,
      mimeType: row.mimeType,
      sizeBytes: Number(row.sizeBytes),
      sha256: row.sha256,
      status: row.status,
      version: row.version,
      entityType: row.entityType,
      entityId: row.entityId,
      uploadedAt: row.uploadedAt.toISOString(),
      uploadedBy: row.uploadedBy?.fullNameAr ?? null,
      downloadPath: `/api/v1/documents/${row.id}/content`,
    };
  }

  private async namesFor(ids: string[]): Promise<Map<string, string>> {
    const uniq = Array.from(new Set(ids.filter(Boolean)));
    if (!uniq.length) return new Map();
    const rows = await this.prisma.user.findMany({ where: { id: { in: uniq } }, select: { id: true, fullNameAr: true } });
    return new Map(rows.map((r) => [r.id, r.fullNameAr]));
  }

  private async assertCanSee(row: { ownerSubDeptId: string | null; uploadedById: string; entityType: string | null; entityId: string | null; facilityId: string | null }, access: AccessContext, code: PermissionCode) {
    const grant = this.grantOf(access, code);
    if (grant.scope === 'ALL' || access.profile.isFacilityWide) return;
    if (row.uploadedById === access.profile.userId) return;
    if (grant.scope === 'SUBDEPT' && row.ownerSubDeptId === access.profile.subDeptId) return;
    if (row.entityType === 'workOrder' && row.entityId) {
      const wo = await this.prisma.workOrder.findFirst({
        where: {
          id: row.entityId,
          deletedAt: null,
          ...(grant.scope === 'DEPT' ? { departmentId: access.profile.departmentId } : { subDeptId: access.profile.subDeptId }),
        },
        select: { id: true },
      });
      if (wo) return;
    }
    throw new ForbiddenException({ statusCode: 403, messageAr: 'الوثيقة مملوكة لشعبة أخرى — لا يشاركها معك سوى نطاق READ الأوسع أو الرفع من أمر شغل في نطاقك', required: code });
  }

  private grantOf(access: AccessContext, code: PermissionCode) {
    const grant = access.profile.permissions.find((p) => p.code === code);
    if (!grant) throw new ForbiddenException({ statusCode: 403, messageAr: `لا تملك ${code}`, required: code, yourGrants: access.profile.permissions.map((p) => p.code) });
    return grant;
  }

  private decodeBase64(text: string): Buffer {
    const clean = text.replace(/^data:[^;]+;base64,/, '');
    const bytes = Buffer.from(clean, 'base64');
    if (!bytes.length) throw new BadRequestException({ statusCode: 400, messageAr: 'حمولة base64 غير صالحة' });
    return bytes;
  }

  private normalizeMime(mimeType: string, fileName: string): string {
    const mime = mimeType.toLowerCase().trim();
    if (extensionFor(mime)) return mime;
    // بعض كاميرات الهاتف ترسل application/octet-stream — نستنتج من الامتداد ثم نعيد التحقق
    const byExt: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv' };
    const ext = (fileName.split('.').pop() ?? '').toLowerCase();
    const guessed = byExt[ext];
    if (guessed && allowedMimeTypes.includes(guessed)) return guessed;
    throw new BadRequestException({ statusCode: 400, messageAr: `نوع ملف غير مسموح: ${mimeType}`, allowed: allowedMimeTypes });
  }

  /**
   * الكتابة مسموحة للمخزن المحلي فقط. مع minio/s3 نرفض صراحةً (409) بدل أن نُخزّن على القرص
   * ونُعلن objectKey باسم دلو MinIO — ذلك يخادع المشغّل ويترك الملفات بلا نسخة في الكائنات.
   * المطلوب لتفعيلهما: عميل كائنات + presign حقيقي (docs/05 §12).
   */
  private assertDriver(): void {
    if (CONFIG.storage.driver !== 'local') {
      throw new ConflictException({
        statusCode: 409,
        messageAr: `قناة الوثائق تعمل حاليًا على المخزن المحلي فقط (STORAGE_DRIVER=local)، والإعداد الحالي '${CONFIG.storage.driver}' يحتاج عميل كائنات. اضبط STORAGE_DRIVER=local مع مجلد معيَّن في compose أو أضف المحوّل.`,
        hintAr: 'المسار نفسه متاح لسطح المكتب عبر docker volume: ./storage:/app/apps/api/storage',
      });
    }
  }

  private async nextId(): Promise<string> {
    // معرّف Prisma يُبنى مع الإدراج؛ نحتاجه هنا لتوليد objectKey قبل الكتابة (الرفع الموقّع يعتمد ذلك)
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`SELECT gen_random_uuid()::text AS id`;
    return rows[0]?.id ?? createHash('sha1').update(String(process.hrtime.bigint())).digest('hex').slice(0, 36);
  }

  private ctx(access: AccessContext) {
    const scope = access.profile.permissions.find((p) => ['doc.view', 'doc.upload', 'doc.manage'].includes(p.code))?.scope ?? 'SUBDEPT';
    return {
      userId: access.profile.userId,
      facilityId: access.profile.facilityId,
      departmentId: access.profile.departmentId,
      subDeptId: access.profile.subDeptId,
      scopeKind: scope as 'SELF' | 'TEAM' | 'SUBDEPT' | 'DEPT' | 'ALL',
      deviceId: access.deviceId,
    };
  }
}
