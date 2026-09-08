import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * نصوص التطوير/التحقق (e2e، dev-db، مولّدات docs) لا تُنفَّذ في CI الاختباري، فأي خطأ تحليل فيها
 * يظهر أول ما يظهر على «نسخة مثبتة للتوّ» — وهذا بالتحديد ما عطّل dev-db.mjs (تصادم `const pg`
 * مع `import pg` وسطر بقايا diff). هذا الفحص يكلّف أجزاء من الثانية ويقفل الباب.
 */
const scriptsDir = join(__dirname, '..', 'scripts');

describe('scripts/*.mjs تُحلَّل كـ JavaScript صالح', () => {
  const files = readdirSync(scriptsDir).filter((f) => f.endsWith('.mjs'));

  it('يوجد ما نفحصه أصلًا', () => {
    expect(files.length).toBeGreaterThanOrEqual(2);
  });

  it.each(files)('node --check %s', (file) => {
    // لا stdout متوقع؛ أي فشل تحليل يرفع خطأ فيه المسار وسطر الخطأ
    execFileSync(process.execPath, ['--check', join(scriptsDir, file)], { encoding: 'utf8' });
  });
});
