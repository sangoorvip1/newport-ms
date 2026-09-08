/**
 * طابور رفع صور/وثائق الميدان على الهاتف.
 *
 * لماذا لا presign+PUT هنا؟ React Native لا يرفع ثنائيًا من سلاسل base64 بلا Blob/ملف على نظام الملفات
 * (وexpo-file-system ليس ضمن اعتماديات التطبيق)، فاستعمال `POST /v1/documents/upload` (JSON/base64)
 * هو المسار الذي يعمل على 4G بلا اعتماد جديد، وسقف الحجم نفسه يُطبَّق في الخادم على كلتا القناتين.
 * البايتات تُخزَّن مؤقتًا في جدول `pending_documents` المحلي (لا في طابور المزامنة) وتُمحى بعد القبول.
 */
import { DocumentUploadQueue, type DocumentPendingRecord, type DocumentPendingStore } from '@newport/domain';
import { apiFetch } from '../net/api.js';

interface UploadAck {
  id: string;
  objectKey?: string | null;
}

export interface MobileDocsDeps {
  store: DocumentPendingStore;
  isOnline: () => boolean;
  /** سقف الخادم (STORAGE_MAX_UPLOAD_BYTES) — يُبلَّغ الفني قبل رفع 8 ميغابايت عبثًا */
  maxBytes?: number;
}

export function createMobileDocumentQueue(deps: MobileDocsDeps): DocumentUploadQueue {
  return new DocumentUploadQueue({
    store: deps.store,
    maxBytes: deps.maxBytes,
    transport: {
      isOnline: deps.isOnline,
      async upload(rec: DocumentPendingRecord) {
        const body: Record<string, unknown> = {
          id: rec.id, // نفس المعرّف في كل إعادة محاولة ⇒ لا سطر مكرّر في documents
          docType: rec.docType,
          titleAr: rec.titleAr,
          originalName: rec.originalName,
          mimeType: rec.mimeType,
          dataBase64: rec.dataBase64,
          isEncrypted: rec.isEncrypted,
        };
        if (rec.entityType) body.entityType = rec.entityType;
        if (rec.entityId) body.entityId = rec.entityId;
        if (rec.categoryCode) body.categoryCode = rec.categoryCode;
        if (rec.code) body.code = rec.code;
        const ack = await apiFetch<UploadAck>('/v1/documents/upload', { method: 'POST', body });
        return { objectKey: ack?.objectKey ?? null };
      },
    },
  });
}
