/**
 * طابور رفع الوثائق/الصور لعملاء بلا اتصال (سطح المكتب + الهاتف).
 *
 * لماذا ملف مشترك؟ لأن العقد نفسه يجب أن يُطابَق في العميلين: الفهرس (titleAr/docType/…) والبايتات
 * تُرسل إلى `/v1/documents`، ثم يختفي السجل من الطابور المحلي. **المزامنة ليست قناة رفع**:
 * `documents.objectKey` و`sha256` و`sizeBytes` تُختم من الملفات الفعلية في الخادم، فتمريرها في
 * `sync.push` يعني صفوفًا تشير إلى بايتات غير موجودة (ولهذا `SYNC_META.document.restOnly = true`).
 *
 * خصائص مقصودة:
 *  - `id` يولّده العميل ويُعاد في كل محاولة ⇒ إعادة المحاولة لا تُنشئ سطرًا مكرّرًا (المساران يقبلان id).
 *  - التحقق من الحجم/النوع محليًا قبل الشبكة: رسالة عربية للمستخدم فورًا، لا 413 بعد رفع 8 ميغابايت على 4G.
 *  - الحمولات تُفحص بمخططات DTO المشتركة، فانحراف العقد بين العميل والخادم يظهر في الاختبار لا في الميدان.
 *  - `flush` يدفع عددًا قليلًا في كل دورة (limit) ولا يحذف السجل عند الفشل: يبقى مع attempts/lastErrorAr.
 */
import { documentMetadataDto, documentPresignDto, documentUploadDto, type DocumentUploadDto } from './dto.js';
import { newUuidV7 } from './client.js';

/** جدول الأنواع المسموحة — مصدر واحد للخادم والعملاء (مرجع: apps/api/src/documents/document-store.ts) */
export const DOCUMENT_MIME_EXTENSIONS: Readonly<Record<string, string>> = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/csv': 'csv',
});

/** صيغة مقروءة للحجم في رسائل المستخدم (لا "0.0 ميغابايت" لصور مصغّرة) */
export function formatBytes(n: number): string {
  const v = Math.max(0, Math.floor(n));
  if (v < 1024) return `${v} بايت`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(v < 10 * 1024 ? 1 : 0)} كيلوبايت`;
  return `${(v / 1024 / 1024).toFixed(v < 10 * 1024 * 1024 ? 1 : 0)} ميغابايت`;
}

/** SVG/HTML مرفوضان عمدًا: يُفتحان في المتصفح بنفس الأصل فينفّذان سكريبت باسم المستخدم */
export const DOCUMENT_DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

export function documentExtensionFor(mimeType: string): string | null {
  return DOCUMENT_MIME_EXTENSIONS[String(mimeType ?? '').toLowerCase().trim()] ?? null;
}

/** طول البايتات بعد فك base64 دون تحويلها فعليًا (الحشو = و) — يُستعمل لسقف الحجم قبل الشبكة */
export function base64ByteLength(dataBase64: string): number {
  const body = String(dataBase64 ?? '')
    .slice(String(dataBase64 ?? '').indexOf(',') + 1)
    .replace(/\s/g, '');
  if (!body) return 0;
  const pad = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((body.length * 3) / 4) - pad);
}

export type DocumentUploadEntityType = NonNullable<DocumentUploadDto['entityType']>;

export interface DocumentUploadRequest {
  /** يُولَّد إن غاب — ويُعاد استعماله في كل إعادة محاولة لنفس الملف */
  id?: string;
  docType: string;
  titleAr: string;
  originalName: string;
  mimeType: string;
  dataBase64: string;
  entityType?: DocumentUploadEntityType;
  entityId?: string | null;
  categoryCode?: string | null;
  code?: string | null;
  isEncrypted?: boolean;
}

export interface DocumentPendingRecord {
  id: string;
  docType: string;
  titleAr: string;
  originalName: string;
  mimeType: string;
  dataBase64: string;
  entityType: string | null;
  entityId: string | null;
  categoryCode: string | null;
  code: string | null;
  isEncrypted: boolean;
  sizeBytes: number;
  attempts: number;
  lastErrorAr: string | null;
  queuedAt: string;
  /** يُختم بعد قبول الخادم، ثم يُحذف السجل من الطابور */
  objectKey: string | null;
}

/** يخزّنه العميل حيث شاء (SQLite في الهاتف، Dexie على المكتب) — البايتات هنا لا في طابور المزامنة */
export interface DocumentPendingStore {
  listPending(): Promise<DocumentPendingRecord[]>;
  savePending(rec: DocumentPendingRecord): Promise<void>;
  forgetPending(id: string): Promise<void>;
}

export interface DocumentUploadTransport {
  isOnline(): boolean;
  /**
   * يرفع السجل كاملاً ويعيد objectKey الذي ختمه الخادم.
   * القرار «كيف» يعود للعميل: الهاتف يستخدم `POST /v1/documents/upload` (JSON/base64 — أبسط مسار في
   * React Native لأن أجسام thunk الثنائية تحتاج Blob/ملفًا)، والمكتب يستخدم `presign` ثم `PUT` بجسم
   * ArrayBuffer بلا تضخيم 33%. الطابور لا يفرّق: كلاهما يطابق نفس DTOs.
   */
  upload(rec: DocumentPendingRecord): Promise<{ objectKey?: string | null } | void>;
}

export interface DocumentQueueOptions {
  store: DocumentPendingStore;
  transport: DocumentUploadTransport;
  maxBytes?: number;
  now?: () => Date;
  onEvent?: (e: DocumentQueueEvent) => void;
}

export type DocumentQueueEvent =
  | { kind: 'queued'; id: string; sizeBytes: number }
  | { kind: 'rejected'; reasonAr: string; field?: string }
  | { kind: 'uploaded'; id: string; attempts: number }
  | { kind: 'failed'; id: string; attempts: number; reasonAr: string };

export interface DocumentQueueResult {
  ok: boolean;
  id: string;
  reasonAr?: string;
}

export interface DocumentFlushReport {
  attempted: number;
  uploaded: number;
  failed: number;
  deferred: number;
  skippedOffline: boolean;
}

export class DocumentUploadQueue {
  private readonly maxBytes: number;
  private readonly now: () => Date;

  constructor(private readonly o: DocumentQueueOptions) {
    this.maxBytes = o.maxBytes ?? DOCUMENT_DEFAULT_MAX_BYTES;
    this.now = o.now ?? (() => new Date());
  }

  /** بلا شبكة: نفحص محليًا ثم نخزّن. تُستدعى من واجهة الميدان وتُبلَّغ العلة للمستخدم فورًا. */
  async add(req: DocumentUploadRequest): Promise<DocumentQueueResult> {
    const id = req.id ?? newUuidV7();
    const problem = this.validate(req);
    if (problem) {
      this.o.onEvent?.({ kind: 'rejected', reasonAr: problem.reasonAr, field: problem.field });
      return { ok: false, id, reasonAr: problem.reasonAr };
    }

    const rec: DocumentPendingRecord = {
      id,
      docType: req.docType,
      titleAr: req.titleAr.trim(),
      originalName: req.originalName.trim(),
      mimeType: req.mimeType.toLowerCase().trim(),
      dataBase64: req.dataBase64,
      entityType: req.entityType ?? null,
      entityId: req.entityId ?? null,
      categoryCode: req.categoryCode ?? null,
      code: req.code ?? null,
      isEncrypted: req.isEncrypted ?? false,
      sizeBytes: base64ByteLength(req.dataBase64),
      attempts: 0,
      lastErrorAr: null,
      queuedAt: this.now().toISOString(),
      objectKey: null,
    };
    await this.o.store.savePending(rec);
    this.o.onEvent?.({ kind: 'queued', id, sizeBytes: rec.sizeBytes });
    void this.flush().catch(() => undefined); // محاولة فورية إن كان متصلًا — لا ننتظر دورة المزامنة
    return { ok: true, id };
  }

  private validate(req: DocumentUploadRequest): { reasonAr: string; field?: string } | null {
    if (!documentExtensionFor(req.mimeType ?? '')) {
      return {
        field: 'mimeType',
        reasonAr: `نوع ملف غير مسموح: ${req.mimeType}. المسموح: ${Object.keys(DOCUMENT_MIME_EXTENSIONS).join('، ')}`,
      };
    }
    if (!/^[A-Za-z0-9._-]+\.[A-Za-z0-9]{1,8}$/.test(req.originalName ?? '')) {
      return { field: 'originalName', reasonAr: 'اسم الملف يحمل محارف غير مسموحة — أعد تسميته بلا مسافات أو رموز' };
    }
    if ((req.titleAr ?? '').trim().length < 2) return { field: 'titleAr', reasonAr: 'العنوان مطلوب (حرفان على الأقل)' };
    if (req.entityType && !req.entityId) return { field: 'entityId', reasonAr: `الربط بـ${req.entityType} يحتاج معرّف السجل نفسه` };

    const size = base64ByteLength(req.dataBase64);
    if (size <= 0) return { field: 'dataBase64', reasonAr: 'الملف فارغ — لا تُرفع بايتات صفرية' };
    if (size > this.maxBytes) {
      return {
        field: 'dataBase64',
        reasonAr: `حجم الملف ${formatBytes(size)} يتجاوز سقف الرفع ${formatBytes(this.maxBytes)} — اضغط الصورة أو ارفعها من مكتب الوثائق`,
      };
    }

    // فحص أخير بمخططات DTO المشتركة: ما يقبله الطابور يقبله الخادم حتمًا (نفس المصدر، لا انحراف)
    const payload = {
      id: req.id ?? undefined,
      docType: req.docType,
      titleAr: req.titleAr,
      originalName: req.originalName,
      mimeType: req.mimeType,
      entityType: req.entityType,
      entityId: req.entityId ?? undefined,
      categoryCode: req.categoryCode ?? undefined,
      code: req.code ?? undefined,
      isEncrypted: req.isEncrypted ?? false,
    };
    const presign = documentPresignDto.safeParse(payload);
    if (!presign.success) {
      const first = presign.error.issues[0];
      return { field: String(first?.path?.join('.') ?? 'payload'), reasonAr: `البيانات الوصفية لا تطابق العقد: ${first?.message ?? 'غير صالحة'}` };
    }
    if (req.dataBase64.length > 14_000_000) {
      return { field: 'dataBase64', reasonAr: 'حمولة base64 تتجاوز حد العقد (14M محرفًا) — استخدم قناة المكتب مع presign' };
    }
    const upload = documentUploadDto.safeParse({ ...payload, dataBase64: req.dataBase64 });
    if (!upload.success && req.dataBase64.length <= 14_000_000) {
      const first = upload.error.issues[0];
      return { field: String(first?.path?.join('.') ?? 'payload'), reasonAr: `الطلب لا يطابق عقد الرفع: ${first?.message ?? 'غير صالح'}` };
    }
    return null;
  }

  /**
   * جولة دفع جارية — بلا هذا الحارس تتزامن استدعاءان (المحاولة الفورية بعد add + دورة استعادة الشبكة)
   * على نفس السجل فيُرسل مرتين، والثانية تصطدم بكتابة `wx` على المفتاح نفسه في الخادم.
   */
  private inFlight: Promise<DocumentFlushReport> | null = null;

  /** ادفع ما يمكن دفعه (بلا انتظار): تقرير بعد كل محاولة. تُنادى عند استعادة الشبكة وبعد كل حفظ. */
  async flush(limit = 4): Promise<DocumentFlushReport> {
    if (this.inFlight) {
      // انتظار الجولة الجارية ثم جولة ثانية: من ينادي بعد استعادة الشبكة للتوّ يجب ألا يبتلع
      // نتيجة الجولة القديمة (التي أُنجِزت بلا اتصال وتقول deferred=N)، وإلا يبقى السجل حتى الدورة التالية.
      const running = await this.inFlight.catch(() => null);
      const next = await this.doFlush(limit);
      return running ? { ...next, attempted: running.attempted + next.attempted, uploaded: running.uploaded + next.uploaded, failed: running.failed + next.failed } : next;
    }
    this.inFlight = this.doFlush(limit).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async doFlush(limit: number): Promise<DocumentFlushReport> {
    const report: DocumentFlushReport = { attempted: 0, uploaded: 0, failed: 0, deferred: 0, skippedOffline: false };
    const all = await this.o.store.listPending();
    if (!this.o.transport.isOnline()) {
      return { ...report, deferred: all.filter((r) => !r.objectKey).length, skippedOffline: true };
    }

    const queue = all
      .filter((r) => !r.objectKey)
      .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt) || a.id.localeCompare(b.id))
      .slice(0, Math.max(1, limit));

    for (const rec of queue) {
      report.attempted += 1;
      const size = base64ByteLength(rec.dataBase64);
      if (size <= 0 || size > this.maxBytes) {
        // الملف على القرص/في القاعدة لم يعد مطابقًا للقياس عند الإضافة (ضغط، بتر، مخزن تالف)
        await this.o.store.savePending({ ...rec, attempts: rec.attempts + 1, lastErrorAr: 'حجم البايتات المحلي لم يعد مطابقًا — أعد الالتقاط' });
        report.failed += 1;
        this.o.onEvent?.({ kind: 'failed', id: rec.id, attempts: rec.attempts + 1, reasonAr: 'حجم غير مطابق' });
        continue;
      }
      try {
        const sent = await this.o.transport.upload(rec);
        await this.o.store.savePending({ ...rec, objectKey: sent?.objectKey ?? 'uploaded', attempts: rec.attempts + 1, lastErrorAr: null });
        await this.o.store.forgetPending(rec.id);
        report.uploaded += 1;
        this.o.onEvent?.({ kind: 'uploaded', id: rec.id, attempts: rec.attempts + 1 });
      } catch (e) {
        const reasonAr = String((e as Error)?.message ?? e).slice(0, 200);
        await this.o.store.savePending({ ...rec, attempts: rec.attempts + 1, lastErrorAr: reasonAr });
        report.failed += 1;
        this.o.onEvent?.({ kind: 'failed', id: rec.id, attempts: rec.attempts + 1, reasonAr });
      }
    }

    report.deferred = (await this.o.store.listPending()).filter((r) => !r.objectKey).length;
    return report;
  }

  async pending(): Promise<Array<{ id: string; titleAr: string; attempts: number; lastErrorAr: string | null; sizeBytes: number }>> {
    return (await this.o.store.listPending()).map((r) => ({
      id: r.id,
      titleAr: r.titleAr,
      attempts: r.attempts,
      lastErrorAr: r.lastErrorAr,
      sizeBytes: r.sizeBytes,
    }));
  }

  /** تعديل وصفي لاحق (شعبة الوثائق) — يبقى محليًا حتى اتصال، ثم يُدفع إلى /v1/documents/:id/metadata */
  async patchMetadata(id: string, changes: Parameters<typeof documentMetadataDto.parse>[0]): Promise<void> {
    documentMetadataDto.parse(changes);
    const [rec] = (await this.o.store.listPending()).filter((r) => r.id === id);
    if (!rec) throw new Error('الوثيقة رُفعت بالفعل — عدّلها من شاشة الوثائق بعد إعادة التحميل');
    await this.o.store.savePending({ ...rec, ...(changes as Partial<DocumentPendingRecord>) });
  }
}

/** مخزن طابور في الذاكرة — لبيئة التطوير والاختبارات؛ العميلان يستعملان SQLite/Dexie بدل هذا */
export class InMemoryDocumentStore implements DocumentPendingStore {
  readonly rows = new Map<string, DocumentPendingRecord>();

  async listPending(): Promise<DocumentPendingRecord[]> {
    return [...this.rows.values()].map((r) => ({ ...r }));
  }
  async savePending(rec: DocumentPendingRecord): Promise<void> {
    this.rows.set(rec.id, { ...rec });
  }
  async forgetPending(id: string): Promise<void> {
    this.rows.delete(id);
  }
}
