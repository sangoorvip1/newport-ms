/**
 * طابور رفع الوثائق/الصور على سطح المكتب.
 *
 * الفرق عن الهاتف: المتصفح (Chromium في Electron) يقبل Uint8Array جسمًا لـ fetch، فنستخدم
 * `presign` ثم `PUT` خام — لا تضخيم base64 (33%) على شبكة المعمل، والسقف يُطبَّق أثناء البث في الخادم.
 * البايتات تبقى في IndexedDB حتى يقبل الخادم السطر، ولا تمرّ بطابور المزامنة (المرفقات restOnly).
 */
import { DocumentUploadQueue, base64ByteLength, type DocumentPendingRecord, type DocumentPendingStore } from '@newport/domain';
import { apiFetch, putSigned } from './api.js';

interface PresignAck {
  documentId: string;
  method: 'PUT';
  url: string;
  expiresAt: string;
  headers?: Record<string, string>;
  maxBytes?: number;
}

function base64ToBytes(b64: string): Uint8Array {
  const body = b64.slice(b64.indexOf(',') + 1);
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export interface DesktopDocsDeps {
  store: DocumentPendingStore;
  maxBytes?: number;
  isOnline?: () => boolean;
}

export function createDesktopDocumentQueue(deps: DesktopDocsDeps): DocumentUploadQueue {
  return new DocumentUploadQueue({
    store: deps.store,
    maxBytes: deps.maxBytes,
    transport: {
      isOnline: deps.isOnline ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false)),
      async upload(rec: DocumentPendingRecord) {
        const expected = base64ByteLength(rec.dataBase64);
        const presign = await apiFetch<PresignAck>('/v1/documents/presign', {
          method: 'POST',
          body: {
            id: rec.id, // معرّف العميل نفسه في كل إعادة محاولة ⇒ لا سطر مكرّر عند تكرار الرفع
            docType: rec.docType,
            titleAr: rec.titleAr,
            originalName: rec.originalName,
            mimeType: rec.mimeType,
            ...(rec.entityType ? { entityType: rec.entityType } : {}),
            ...(rec.entityId ? { entityId: rec.entityId } : {}),
            ...(rec.categoryCode ? { categoryCode: rec.categoryCode } : {}),
            ...(rec.code ? { code: rec.code } : {}),
            isEncrypted: rec.isEncrypted,
            expectedSizeBytes: expected,
          },
        });
        const ack = await putSigned(presign.url, base64ToBytes(rec.dataBase64), rec.mimeType);
        return { objectKey: ack?.objectKey ?? null };
      },
    },
  });
}
