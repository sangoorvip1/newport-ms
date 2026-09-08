import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * كل «npm run X» في الوثائق يجب أن يكون موجودًا فعلًا في package.json الذي يُنفَّذ منه.
 * النص هنا يقرأ الحِزَم الخمس ثم يفحص RUN.md وREADME.md وdocs/*.md — لأن أمرًا منقولًا من
 * ذاكرة الكاتب (مثلاً `npm run db:seed -w @newport/api` بينما الاسم في الـworkspace هو `seed`)
 * لا يفشل عند المراجعة بل عند أول مستخدم ينفّذه على Windows بعد منتصف الليل.
 */
const repoRoot = join(__dirname, '..', '..', '..');
const rootScripts = new Set<string>(Object.keys(readJson(join(repoRoot, 'package.json')).scripts ?? {}));
const workspaceScripts = new Map<string, Set<string>>();
for (const dir of ['packages/domain', 'apps/api', 'apps/desktop', 'apps/mobile']) {
  const pkg = readJson(join(repoRoot, dir, 'package.json'));
  workspaceScripts.set(pkg.name, new Set<string>(Object.keys(pkg.scripts ?? {})));
}

function readJson(path: string): { name: string; scripts?: Record<string, string> } {
  return JSON.parse(readFileSync(path, 'utf8')) as { name: string; scripts?: Record<string, string> };
}

function docFiles(): string[] {
  const files = ['README.md', 'RUN.md'].filter((f) => exists(join(repoRoot, f)));
  for (const f of readdirSync(join(repoRoot, 'docs')).sort()) if (f.endsWith('.md')) files.push(`docs/${f}`);
  return files;
}

function exists(path: string): boolean {
  try {
    readFileSync(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * `npm run X` ثم — إن وجد قريبًا — `-w @newport/<ws>` تحدد أي package.json يُقرأ منه الاسم.
 * خطوط docker تُستثني: فيها يُنفَّذ npm داخل الحاوية حيث cwd هو apps/api لا جذر المستودع.
 */
const NPM_RUN = /npm run ([A-Za-z0-9:_-]+)/g;
const WORKSPACE = /-w\s+['"]?@newport\/([a-z]+)/;

describe('أوامر npm في الوثائق مطابقة لـ package.json', () => {
  const broken: string[] = [];
  let checked = 0;

  for (const rel of docFiles()) {
    const lines = readFileSync(join(repoRoot, rel), 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (line.includes('docker compose') || line.includes('docker-compose')) return;
      for (const m of line.matchAll(NPM_RUN)) {
        const script = m[1]!;
        const tail = line.slice(m.index, m.index + 64);
        const hit = tail.match(WORKSPACE);
        const ws = hit ? `@newport/${hit[1]}` : undefined;
        checked += 1;
        const pool = ws ? workspaceScripts.get(ws) : rootScripts;
        if (!pool) {
          broken.push(`${rel}:${i + 1} — حزمة غير معروفة: ${ws}`);
        } else if (!pool.has(script)) {
          const where = ws ? `-w ${ws}` : '(جذر المستودع)';
          broken.push(`${rel}:${i + 1} — «npm run ${script} ${where}» غير موجود؛ المتاح: ${[...pool].slice(0, 8).join(', ')}`);
        }
      }
    });
  }

  it('يفحص عددًا معتبرًا من المراجع (وإلا فالصمت كاذب)', () => {
    expect(checked).toBeGreaterThan(40);
  });

  it('كل مرجع صالح — لا أمر منقول من الذاكرة', () => {
    expect(broken, broken.join('\n')).toEqual([]);
  });

  it('الأسماء المتاح فعلاً في الـworkspaces (مرجع للكاتب)', () => {
    // يضمن أن الفحص أعلاه لا يمر على خرائط فارغة بعد إعادة تسمية حزمة
    expect(workspaceScripts.size).toBe(4);
    for (const set of workspaceScripts.values()) expect(set.size).toBeGreaterThan(3);
    expect(rootScripts.has('test:all')).toBe(true);
    expect(rootScripts.has('typecheck:all')).toBe(true);
  });
});
