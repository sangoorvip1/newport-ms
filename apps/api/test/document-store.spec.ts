/**
 * فحوص مخزن الوثائق المحلي: التوقيع/التحقق من التوكن، حراسة المسار، واشتقاق الامتداد.
 * لا قاعدة بيانات هنا عمدًا — هذه الطبقة يجب أن تُختبر منفردة لأن خطؤها يعني كتابة ملفات خارج الجذر
 * أو قبول توكن مزوّر (وهو مسار AllowAnonymous بلا جلسة).
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { allowedMimeTypes, extensionFor, fileExists, fileStream, issueTicket, objectKeyFor, putBytes, readTicket, resolveObjectPath } from '../src/documents/document-store.js';

const ID = '799880a2-e618-4735-9f5f-0871656e2f51';

describe('document store: keys & mime', () => {
  it('الامتداد من النوع المعتمد فقط، وأنواع خطرة مرفوضة', () => {
    expect(extensionFor('image/jpeg')).toBe('jpg');
    expect(extensionFor('application/pdf')).toBe('pdf');
    expect(extensionFor('application/x-msdownload')).toBeNull();
    expect(extensionFor('image/svg+xml')).toBeNull(); // SVG قد ينفّذ سكريبت عند الفتح في المتصفح
    expect(allowedMimeTypes).not.toContain('text/html');
  });

  it('objectKey يمر بمسار شهري ولا يحمل حرفًا غريبًا', () => {
    const key = objectKeyFor(`01A0-${ID.toUpperCase()}`, 'image/png');
    expect(key).toMatch(/^docs\/\d{4}\/\d{2}\/[0-9a-fA-F-]+\.png$/);
    expect(key).not.toContain('..');
  });

  it('resolveObjectPath يرفض الخروج من الجذر (لا ../ ولا مفتاح مطلق)', () => {
    expect(() => resolveObjectPath('../../etc/passwd')).toThrow(/escapes storage root/);
    expect(() => resolveObjectPath('a/../../b.png')).toThrow(/escapes storage root/);
    expect(resolveObjectPath('docs/2026/09/x.png')).toContain(join('docs', '2026', '09', 'x.png'));
  });
});

describe('document store: signed tickets', () => {
  const meta = {
    userId: 'u1',
    facilityId: 'f1',
    ownerSubDeptId: 's1',
    entityType: 'workOrder',
    entityId: ID,
    docType: 'PHOTO',
    titleAr: 'لقطة',
    originalName: 'a.jpg',
    mimeType: 'image/jpeg',
  };

  it('توكن صالح يُقرأ ويُعيد ملكيته كما صدرت', () => {
    const { token, id } = issueTicket(meta);
    const parsed = readTicket(token);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.ticket.userId).toBe('u1');
      expect(parsed.ticket.entityId).toBe(ID);
      expect(parsed.ticket.id).toBe(id);
    }
  });

  it('تعديل الحمولة أو التوقيع ⇒ رفض (لا كتابة بصلاحيات غيرك)', () => {
    const { token } = issueTicket(meta);
    const [payload, mac] = token.split('.');
    const evil = Buffer.from(JSON.stringify({ ...meta, id: 'fixed-id', userId: 'attacker', expiresAt: Math.floor(Date.now() / 1000) + 600 }), 'utf8').toString('base64url');
    expect(readTicket(`${evil}.${mac}`).ok).toBe(false); // توقيع لا يطابق الحمولة الجديدة
    expect(readTicket(`${payload}.0000`).ok).toBe(false); // توقيع مكسور
    expect(readTicket(String(payload)).ok).toBe(false); // بلا توقيع
    expect(readTicket('..').ok).toBe(false);
  });

  it('توكن بنوع ملف مرفوض يُرفض عند القراءة أيضًا (دفاع ثانٍ)', () => {
    const { token } = issueTicket({ ...meta, mimeType: 'application/x-msdownload' });
    const parsed = readTicket(token);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reasonAr).toContain('نوع ملف');
  });
});

describe('document store: bytes on disk', () => {
  const key = 'docs-test/vitest-x.png';

  it('putBytes يكتب مرة واحدة (wx) ولا يستبدل ملفًا قائمًا صامتًا', async () => {
    const { rm } = await import('node:fs/promises');
    const { readFile } = await import('node:fs/promises');
    await rm(resolveObjectPath(key), { force: true });
    const bytes = Buffer.from('hello');
    const r = await putBytes(key, bytes);
    expect(r.sizeBytes).toBe(bytes.length);
    expect(fileExists(key)).toBe(true);
    // wx عمدًا: استبدال بايتات مسجّلة في القاعدة بملف آخر يجب أن يفشل لا أن يمر بصمت
    await expect(putBytes(key, bytes)).rejects.toThrow(/EEXIST/);
    const back = await readFile(resolveObjectPath(key));
    expect(back.toString()).toBe('hello');
    expect(fileStream(key).sizeBytes).toBe(bytes.length);
    await rm(resolveObjectPath(key), { force: true });
  });

  it('ملف غائب ⇒ fileExists:false وfileStream يرمي (المسار يترجمها 404)', () => {
    expect(fileExists('docs-test/missing-here.png')).toBe(false);
    expect(() => fileStream('docs-test/missing-here.png')).toThrow();
  });
});
