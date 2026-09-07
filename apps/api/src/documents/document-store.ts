import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createReadStream, statSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { CONFIG } from '../config.js';

/**
 * مخزن الملفات المحلي (driver='local') + قناة الرفع الموقّعة للتطبيقات الميدانية.
 *
 * لماذا لا نضيف عميل K8s/MinIO (`@aws-sdk/client-s3`)؟ بيئة المعمل تعمل بلا إنترنت، وقناة محلية واحدة تكفي حاجتها الفعلية:
 * صور أوامر الشغل ونتائج التحاليل (ملفات صغيرة نسبيًا). objectKey هنا بنفس شكل مفاتيح K8s/MinIO
 * (`docs/yyyy/mm/<id>.<ext>`) حتى يكون تبديل المشغّل إلى MinIO لاحقًا تغيير إعداد لا تغيير عقود.
 *
 * التوكن الموقّع: للكاميرا في الهاتف — إرسال bytes خام أصح من base64 في JSON (يزيد الحجم 33%
 * ويستهلك ذاكرة الجهاز). التوكن يحمل البيانات الوصفية + HMAC، فلا يحتاج جلسة أثناء الرفع،
 * وينتهي بعد STORAGE_SIGNED_TTL ثانية.
 */

/** الأنواع المسموحة صراحةً: ما عدا ذلك يُرفض قبل المساس بالقرص */
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/csv': 'csv',
};

export const allowedMimeTypes = Object.keys(ALLOWED_TYPES);

export function extensionFor(mimeType: string): string | null {
  return ALLOWED_TYPES[mimeType] ?? null;
}

/** مسار نسبي داخل المخزن — بلا نقطة أو slash تجريبيين (منع ../) ومبني على معرّف مولّد */
export function objectKeyFor(id: string, mimeType: string): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const ext = extensionFor(mimeType) ?? 'bin';
  return `docs/${yyyy}/${mm}/${id.replace(/[^0-9a-fA-F-]/g, '')}.${ext}`;
}

const ROOT = () => join(process.cwd(), CONFIG.storage.localDir);

/** تحويل مفتاح نسبي إلى مسار مطلق مع حراسة الخروج من الجذر (defense in depth) */
export function resolveObjectPath(objectKey: string): string {
  const root = ROOT();
  const abs = join(root, objectKey.replace(/^\/+/, ''));
  if (!abs.startsWith(root + '/')) throw new Error(`object key escapes storage root: ${objectKey}`);
  return abs;
}

export async function putBytes(objectKey: string, bytes: Buffer): Promise<{ path: string; sizeBytes: number }> {
  const path = resolveObjectPath(objectKey);
  await mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true });
  await writeFile(path, bytes, { flag: 'wx' }); // wx: لا استبدال صامت لملف موجود
  return { path, sizeBytes: bytes.length };
}

export function fileStream(objectKey: string): { stream: NodeJS.ReadableStream; sizeBytes: number } {
  const path = resolveObjectPath(objectKey);
  const size = statSync(path).size;
  return { stream: createReadStream(path), sizeBytes: size };
}

export function fileExists(objectKey: string): boolean {
  try {
    return statSync(resolveObjectPath(objectKey)).isFile();
  } catch {
    return false;
  }
}

/* ─────────────── التوكن الموقّع (presign محلي) ─────────────── */

export interface RawUploadTicket {
  /** معرّف الصف الذي سيُنشأ — يُولَّد وقت الطلب ليبقى idempotent عبر إعادة المحاولة */
  id: string;
  userId: string;
  facilityId: string | null;
  ownerSubDeptId: string | null;
  entityType: string | null;
  entityId: string | null;
  docType: string;
  titleAr: string;
  categoryCode?: string | null;
  isEncrypted?: boolean;
  originalName: string;
  mimeType: string;
  maxBytes: number;
  expiresAt: number;
  /** رقم المستند الاختياري من شعبة الوثائق */
  code?: string | null;
}

const b64u = (buf: Buffer) => buf.toString('base64url');
const sign = (payload: string) => createHmac('sha256', CONFIG.jwtSecret).update(`v1.${payload}`).digest('hex');

export function issueTicket(meta: Omit<RawUploadTicket, 'expiresAt' | 'id' | 'maxBytes'> & { id?: string; maxBytes?: number }): { token: string; expiresAt: number; id: string } {
  const ttl = Math.max(60, CONFIG.storage.publicDownloadTtlSec);
  const ticket: RawUploadTicket = {
    ...meta,
    id: meta.id ?? cryptoId(),
    maxBytes: meta.maxBytes ?? CONFIG.storage.maxUploadBytes,
    expiresAt: Math.floor(Date.now() / 1000) + ttl,
  };
  const payload = b64u(Buffer.from(JSON.stringify(ticket), 'utf8'));
  return { token: `${payload}.${sign(payload)}`, expiresAt: ticket.expiresAt, id: ticket.id };
}

export function readTicket(token: string): { ok: true; ticket: RawUploadTicket } | { ok: false; reasonAr: string } {
  const [payload, mac] = token.split('.');
  if (!payload || !mac) return { ok: false, reasonAr: 'توكن غير مكتمل' };
  const expected = Buffer.from(sign(payload), 'utf8');
  const got = Buffer.from(mac, 'utf8');
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return { ok: false, reasonAr: 'توقيع التوكن غير مطابق' };
  let ticket: RawUploadTicket;
  try {
    ticket = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as RawUploadTicket;
  } catch {
    return { ok: false, reasonAr: 'حمولة التوكن تالفة' };
  }
  if (ticket.expiresAt < Math.floor(Date.now() / 1000)) return { ok: false, reasonAr: 'انتهت صلاحية التوكن — اطلب رابطًا جديدًا' };
  if (!extensionFor(ticket.mimeType)) return { ok: false, reasonAr: `نوع ملف غير مسموح: ${ticket.mimeType}` };
  return { ok: true, ticket };
}

const cryptoId = () => {
  // UUIDv7 مصغّر: طابع زمني + عشوائية — يولّد Prisma العادة، لكن التوكن يحتاج المعرّف قبل الإدراج
  const ts = Date.now().toString(16).padStart(12, '0');
  const r = randomBytes(10).toString('hex');
  return `${ts.slice(0, 8)}-${ts.slice(8, 12)}-7${r.slice(0, 3)}-8${r.slice(3, 6)}-${r.slice(6, 18)}`;
};
