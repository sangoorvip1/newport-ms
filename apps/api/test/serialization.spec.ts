import { describe, expect, it } from 'vitest';
import { installBigIntJson } from '../src/common/json-bigint.js';

/**
 * أعمدة BigInt في المخطط (syncSeq/syncCursor/sizeBytes) تصل إلى JSON.stringify عبر
 * مسارات تعرض صفوفًا خامئة (مثل GET /maintenance/work-orders/:id). بدون مُسلسل عالمي
 * ينهار الطلب بـ TypeError → 500 (حدث فعليًا في الاختبار الحي).
 */
describe('BigInt → JSON (rows exposed raw)', () => {
  installBigIntJson();

  it('serializes small bigints as numbers', () => {
    expect(JSON.stringify({ syncSeq: 42n, cursor: 0n })).toBe('{"syncSeq":42,"cursor":0}');
  });

  it('keeps precision above 2^53 by falling back to a string', () => {
    const huge = 9007199254740993n; // > Number.MAX_SAFE_INTEGER
    const parsed = JSON.parse(JSON.stringify({ syncSeq: huge }));
    expect(parsed.syncSeq).toBe('9007199254740993');
  });

  it('is idempotent (double install does not wrap the prototype twice)', () => {
    installBigIntJson();
    expect(JSON.stringify({ v: 7n })).toBe('{"v":7}');
  });
});
