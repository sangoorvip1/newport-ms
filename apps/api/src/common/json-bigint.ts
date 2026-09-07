/**
 * Prisma يعيد الأعمدة من نوع BigInt (`syncSeq`, `syncCursor`, `lastPullCursor`, `sizeBytes`)
 * ككائنات BigInt، و `JSON.stringify` يرفضها بـ `TypeError: Do not know how to serialize a BigInt`
 * ← أي مسار يعرض صفًّا خامًا ينهار بـ 500.
 *
 * الحل تسلسلٌ عالمي واحد بدل تنميق كل endpoint:
 *  - القيم داخل Number.MAX_SAFE_INTEGER → رقم (وهذا يشمل كل syncSeq/cursor واقعي: < 9e15)
 *  - ما فوقها → نص، فلا تُفقد دقة مؤشر مزامنة كبير على نظام طويل العمر.
 * يُثبَّت مرة واحدة في bootstrap قبل إنشاء التطبيق.
 */
export function installBigIntJson(): void {
  const proto = BigInt.prototype as unknown as { toJSON?: (this: bigint) => number | string };
  if (typeof proto.toJSON === 'function') return; // تثبيت مزدوج غير مطلوب (وأيضًا لا يسقط الأنواع الأصلية)
  proto.toJSON = function (this: bigint): number | string {
    const asNumber = Number(this);
    return Number.isSafeInteger(asNumber) ? asNumber : this.toString();
  };
}
