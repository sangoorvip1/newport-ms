import { describe, expect, it } from 'vitest';
import { base64ByteLength, DocumentUploadQueue, documentExtensionFor, type DocumentPendingRecord, type DocumentPendingStore } from '../src/documents.js';
import type { DocumentUploadTransport } from '../src/documents.js';

const PNG_B64 = Buffer.from('\x89PNG\r\n\x1a\nfake-bytes', 'utf8').toString('base64');

// نسخ حيّة عمدًا: بعض الفحوص تُتلف السجل بعد الإضافة لتحاكي بترًا على القرص، فالتحويل إلى نسخ
// هنا كان يُخفي العلة بدل أن يكشفها (الطابور العام InMemoryDocumentStore يعزل القراءة).
function memStore(): DocumentPendingStore & { rows: DocumentPendingRecord[] } {
  const rows: DocumentPendingRecord[] = [];
  return {
    rows,
    async listPending() {
      return rows;
    },
    async savePending(rec) {
      const i = rows.findIndex((r) => r.id === rec.id);
      if (i >= 0) rows[i] = rec;
      else rows.push(rec);
    },
    async forgetPending(id) {
      const i = rows.findIndex((r) => r.id === id);
      if (i >= 0) rows.splice(i, 1);
    },
  };
}

function harness(opts?: { online?: boolean; maxBytes?: number; failFirst?: number }) {
  const store = memStore();
  const calls: Array<{ id: string; attempt: number }> = [];
  let failures = opts?.failFirst ?? 0;
  const transport: DocumentUploadTransport = {
    isOnline: () => opts?.online ?? true,
    async upload(rec) {
      calls.push({ id: rec.id, attempt: rec.attempts + 1 });
      if (failures > 0) {
        failures -= 1;
        throw new Error('413 Payload Too Large — انقطع البث');
      }
      return { objectKey: `docs/2026/09/${rec.id}.png` };
    },
  };
  const events: string[] = [];
  const queue = new DocumentUploadQueue({
    store,
    transport,
    maxBytes: opts?.maxBytes,
    onEvent: (e) => events.push(`${e.kind}:${'id' in e ? (e.id ?? '').slice(0, 8) : ''}`),
  });
  return { queue, store, calls, events };
}

const req = (over: Partial<Parameters<DocumentUploadQueue['add']>[0]> = {}) => ({
  docType: 'FIELD_PHOTO',
  titleAr: 'صورة تآكل المبادل',
  originalName: 'exchanger-01.png',
  mimeType: 'image/png',
  dataBase64: PNG_B64,
  ...over,
});

describe('DocumentUploadQueue: فحص محلي قبل الشبكة', () => {
  it('يرفض الأنواع خارج القائمة الصريحة (svg/exe) ولا يلمس الشبكة', async () => {
    const { queue, calls, store } = harness();
    for (const mime of ['image/svg+xml', 'application/x-msdownload', 'text/html']) {
      const r = await queue.add(req({ mimeType: mime }));
      expect(r.ok).toBe(false);
      expect(r.reasonAr).toContain('نوع ملف غير مسموح');
    }
    expect(calls).toHaveLength(0);
    expect(store.rows).toHaveLength(0);
  });

  it('يرفض تجاوز سقف الحجم ويذكر الرقمين ليعرف الفني ما فعله', async () => {
    const { queue, calls } = harness({ maxBytes: 16 });
    const r = await queue.add(req());
    expect(r.ok).toBe(false);
    expect(r.reasonAr).toMatch(/يتجاوز سقف الرفع/);
    expect(r.reasonAr).toContain('19 بايت'); // الحجم الفعلي والملف الحدّ كلاهما مذكّران
    expect(r.reasonAr).toContain('16 بايت');
    expect(calls).toHaveLength(0);
  });

  it('يرفض الملف الفارغ والربط بلا معرّف سجل', async () => {
    const { queue } = harness();
    expect((await queue.add(req({ dataBase64: '' }))).ok).toBe(false);
    const orphan = await queue.add(req({ entityType: 'workOrder' }));
    expect(orphan.ok).toBe(false);
    expect(orphan.reasonAr).toContain('يحتاج معرّف السجل');
  });

  it('اسم ملف بمسافة يُرفض محليًا (كان يصل الخادم ثم يُرفض بعد النقل)', async () => {
    const { queue, calls } = harness();
    const r = await queue.add(req({ originalName: 'صورة المبادل.png' }));
    expect(r.ok).toBe(false);
    expect(r.reasonAr).toContain('اسم الملف');
    expect(calls).toHaveLength(0);
  });
});

describe('DocumentUploadQueue: الدفع وإعادة المحاولة', () => {
  it('بلا شبكة: يبقى السجل في الطابور ولا محاولة ولا حذف', async () => {
    const { queue, store } = harness({ online: false });
    const added = await queue.add(req());
    expect(added.ok).toBe(true);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]!.sizeBytes).toBe(base64ByteLength(PNG_B64));
    const rep = await queue.flush();
    expect(rep).toMatchObject({ attempted: 0, uploaded: 0, deferred: 1, skippedOffline: true });
  });

  it('متصل: يُرفع بنفس معرّف العميل، والطابور يُفرَّغ، ولا إرسال مزدوج', async () => {
    const { queue, store, calls, events } = harness();
    const added = await queue.add(req());
    expect(added.ok).toBe(true);
    // المحاولة الفورية داخل add() «fire and forget»؛ استدعاء flush آخر أثناءها يجب ألا يُضاعف الرفع
    const rep = await queue.flush();
    expect(rep.attempted).toBeLessThanOrEqual(1);
    expect(calls).toHaveLength(1); // ← الحارس: جولة واحدة فقط لنفس السجل
    expect(calls[0]!.id).toBe(added.id);
    expect(store.rows).toHaveLength(0);
    expect(events).toContain('uploaded:' + added.id.slice(0, 8));
  });

  it('بعد فشل الشبكة: يبقى السجل، وإعادة المحاولة بنفس المعرّف (لا سطر مكرّر)', async () => {
    let online = false;
    const store = memStore();
    const ids: string[] = [];
    let attempt = 0;
    const queue = new DocumentUploadQueue({
      store,
      transport: {
        isOnline: () => online,
        async upload(rec) {
          ids.push(rec.id);
          attempt += 1;
          if (attempt === 1) throw new Error('ECONNRESET');
          return { objectKey: `docs/2026/09/${rec.id}.png` };
        },
      },
    });
    const added = await queue.add(req());
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]!.attempts).toBe(0); // بلا اتصال ⇒ لا محاولة أصلًا

    online = true;
    await queue.flush();
    expect(store.rows[0]!.attempts).toBe(1);
    expect(store.rows[0]!.lastErrorAr).toContain('ECONNRESET');

    const rep = await queue.flush();
    expect(rep.uploaded).toBe(1);
    expect(ids).toEqual([added.id, added.id]); // نفس معرّف العميل ⇒ الخادم لا يُنشئ سطرًا ثانيًا
    expect(store.rows).toHaveLength(0);
  });

  it('limit يحترم أولوية الأقدم ويُبقي الباقي مؤجلاً', async () => {
    const { queue, store } = harness({ online: false });
    for (let i = 0; i < 6; i += 1) {
      await queue.add(req({ id: `00000000-0000-7000-8000-00000000000${i}`, titleAr: `صورة ${i}`, originalName: `p${i}.png` }));
    }
    store.rows.forEach((r, i) => (r.queuedAt = new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString()));
    expect(store.rows).toHaveLength(6);
    const online = new DocumentUploadQueue({
      store,
      transport: { isOnline: () => true, async upload(rec) { return { objectKey: `docs/2026/09/${rec.id}.png` }; } },
    });
    const rep = await online.flush(2);
    expect(rep).toMatchObject({ attempted: 2, uploaded: 2, failed: 0, deferred: 4 });
  });

  it('بايتات تالفة محليًا (حجم صفر بعد القراءة) تُعلَّم ولا تُرسل', async () => {
    let online = false;
    const store = memStore();
    const calls: string[] = [];
    const queue = new DocumentUploadQueue({
      store,
      transport: {
        isOnline: () => online,
        async upload(rec) {
          calls.push(rec.id);
          return {};
        },
      },
    });
    const added = await queue.add(req());
    store.rows[0]!.dataBase64 = ''; // تلف/بتر بعد الإضافة (قرص ممتلئ، نسخة قديمة)
    online = true;
    const rep = await queue.flush(1);
    expect(rep).toMatchObject({ attempted: 1, failed: 1, uploaded: 0 });
    expect(store.rows[0]!.lastErrorAr).toContain('لم يعد مطابقًا');
    expect(store.rows[0]!.attempts).toBe(1);
    expect(calls).toHaveLength(0);
    expect(added.ok).toBe(true);
  });
});

describe('أدوات مشتركة مع الخادم', () => {
  it('base64ByteLength يطابق الطول الفعلي للبايتات بحشو equal', () => {
    for (const n of [1, 2, 3, 4, 5, 17, 1000]) {
      const buf = Buffer.from('x'.repeat(n), 'utf8');
      expect(base64ByteLength(buf.toString('base64'))).toBe(buf.length);
    }
    expect(base64ByteLength('')).toBe(0);
    expect(base64ByteLength('data:image/png;base64,' + PNG_B64)).toBe(base64ByteLength(PNG_B64));
  });

  it('اشتقاق الامتداد من النوع فقط، والنواع الخطرة بلا امتداد', () => {
    expect(documentExtensionFor('Image/JPEG ')).toBe('jpg');
    expect(documentExtensionFor('application/pdf')).toBe('pdf');
    expect(documentExtensionFor('image/svg+xml')).toBeNull();
    expect(documentExtensionFor('')).toBeNull();
  });
});
