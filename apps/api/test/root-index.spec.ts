import { beforeEach, describe, expect, it } from 'vitest';
import { buildRootIndex, renderRootHtml, rootIndexMiddleware } from '../src/common/root-index.js';

interface FakeRes {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  removed: string[];
  setHeader(k: string, v: string): void;
  removeHeader(k: string): void;
  end(b: string): void;
}

const mkRes = (): FakeRes => ({
  statusCode: 0,
  headers: {},
  removed: [],
  body: '',
  setHeader(k, v) {
    this.headers[k.toLowerCase()] = v;
  },
  removeHeader(k) {
    this.removed.push(k);
  },
  end(b) {
    this.body = b;
  },
});

describe('بطاقة تعريف الخدمة', () => {
  it('كل مسار مذكور يبدأ ببادئة /api ولا يتكرر', () => {
    const card = buildRootIndex(() => new Date('2026-09-08T07:00:00.000Z'));
    expect(card.apiPrefix).toBe('/api');
    expect(card.endpoints.length).toBeGreaterThan(3);
    for (const e of card.endpoints) expect(e.startsWith('/api/')).toBe(true);
    expect(new Set(card.endpoints).size).toBe(card.endpoints.length);
    expect(card.serverTime).toBe('2026-09-08T07:00:00.000Z');
    expect(card.service).toBe('newport-api');
  });

  it('HTML يهرّب الوسوم الآتية من متغيّرات البيئة (لا حقن)', () => {
    // CONFIG يجمَّد عند الاستيراد، فالحقن يكون في البطاقة نفسها لا في process.env
    const card = { ...buildRootIndex(), facilityCode: '<img src=x onerror=alert(1)>', orgAr: '<b>معمل</b>' };
    const html = renderRootHtml(card);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('noindex');
    expect(html).not.toContain('<b>معمل</b>');
  });
});

describe('وسيط الجذر', () => {
  let nexted: number;
  const next = () => {
    nexted += 1;
  };

  beforeEach(() => {
    nexted = 0;
  });

  it('لا يتدخل في أي مسار آخر ولا في POST', () => {
    for (const [url, method] of [['/api/v1/auth/login', 'POST'], ['/api', 'POST'], ['/nope', 'GET'], ['/api/', 'DELETE']] as Array<[string, string]>) {
      const res = mkRes();
      nexted = 0; // كل حالة تُقاس على حدة
      // /api/ بذيّل سلاش ⇒ يُخدم (تطبيع)؛ /nope يمر
      rootIndexMiddleware({ method, url, headers: {} }, res, next);
      if (url === '/nope' || method === 'POST' || method === 'DELETE') expect(nexted, `${method} ${url}`).toBe(1);
      else expect(res.statusCode, `${method} ${url}`).toBe(200);
    }
  });

  it('متصفح ⇒ HTML مع استثناء التأطير، وعميل آلي ⇒ JSON', () => {
    const html = mkRes();
    rootIndexMiddleware({ method: 'GET', url: '/', headers: { accept: 'text/html,application/xhtml+xml' } }, html, next);
    expect(html.headers['content-type']).toContain('text/html');
    expect(html.headers['cache-control']).toBe('no-store');
    expect(html.removed).toContain('X-Frame-Options');

    const json = mkRes();
    rootIndexMiddleware({ method: 'GET', url: '/api?x=1', headers: { accept: 'application/json' } }, json, next);
    expect(json.headers['content-type']).toContain('application/json');
    expect(json.removed).toHaveLength(0);
    const parsed = JSON.parse(json.body) as { endpoints: string[]; orgAr: string };
    expect(parsed.endpoints[0]).toBe('/api/health');
    expect(parsed.orgAr).toContain('معمل الأسمدة الجنوبية');
  });

  it('رأس Accept غائب ⇒ JSON (لا محاولة تخمين متهورة)', () => {
    const res = mkRes();
    rootIndexMiddleware({ method: 'GET', url: '/', headers: {} }, res, next);
    expect(res.headers['content-type']).toContain('application/json');
    expect(() => JSON.parse(res.body)).not.toThrow();
  });
});
