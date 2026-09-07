/**
 * عملية Electron الرئيسية (Windows).
 * مسؤولياتها فقط: النافذة، حفظ الجلسة بأمان (safeStorage/DPAPI)، قراءة عنوان خادم API، ومزامنة ساعة الجهاز.
 * كل منطق البيانات والمزامنة يعيش في العملية الرسومية (renderer) فوق Dexie + @newport/domain.
 */
import { app, BrowserWindow, ipcMain, net, safeStorage, session, shell } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DATA_DIR = join(app.getPath('userData'), 'secure');
const ensureDir = () => {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
};
const fileFor = (name: string) => join(DATA_DIR, `${name}.enc`);

/** التوكنات لا تُخزَّن في localStorage: تُشفَّر عبر DPAPI على Windows ثم تُكتب على القرص */
function writeSecret(name: string, value: string | null): void {
  ensureDir();
  const f = fileFor(name);
  if (value === null) {
    if (existsSync(f)) writeFileSync(f, '');
    return;
  }
  if (safeStorage.isEncryptionAvailable()) {
    writeFileSync(f, safeStorage.encryptString(value));
  } else {
    // بيئة بلا التشفير (تطوير على لينكس مثلًا) — لا يُنصح بها للإنتاج
    writeFileSync(f, Buffer.from(`plain:${value}`, 'utf8'));
  }
}

function readSecret(name: string): string | null {
  const f = fileFor(name);
  if (!existsSync(f)) return null;
  const buf = readFileSync(f);
  if (!buf.length) return null;
  if (safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(buf);
    } catch {
      return null;
    }
  }
  const text = buf.toString('utf8');
  return text.startsWith('plain:') ? text.slice(6) : null;
}

function apiBase(): string {
  const fromEnv = process.env.NEWPORT_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  try {
    const cfg = join(app.getPath('userData'), 'config.json');
    if (existsSync(cfg)) {
      const parsed = JSON.parse(readFileSync(cfg, 'utf8')) as { apiBaseUrl?: string };
      if (parsed.apiBaseUrl) return parsed.apiBaseUrl.replace(/\/$/, '');
    }
  } catch {
    /* إعداد تالف — نستخدم الافتراضي */
  }
  // خادم المعمل على الشبكة المحلية (انظر docs/04): منفذ 3000 خلف nginx
  return 'http://127.0.0.1:3000';
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1120,
    minHeight: 700,
    backgroundColor: '#0f1720',
    autoHideMenuBar: true,
    title: 'Newport — معمل الأسمدة الجنوبية / الخط الأول',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  // الروابط الخارجية تُفتح في المتصفح الافتراضي لا داخل التطبيق
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    void win.loadURL(devUrl);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    void win.loadFile(join(app.getAppPath(), 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  // سياسة أمان صارمة: لا وسائط، لا إخطارات بلا إذن، لا ملفات محلية من الشبكة
  void session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(['notifications'].includes(permission));
  });

  ipcMain.handle('newport:api-base', () => apiBase());
  ipcMain.handle('newport:token:get', () => ({ access: readSecret('access'), refresh: readSecret('refresh') }));
  ipcMain.handle('newport:token:set', (_e, payload: { access: string | null; refresh: string | null }) => {
    writeSecret('access', payload.access);
    writeSecret('refresh', payload.refresh);
    return true;
  });
  ipcMain.handle('newport:online', async () => {
    const base = apiBase().replace(/^http/, 'http');
    return new Promise<boolean>((resolve) => {
      const req = net.request({ method: 'GET', url: `${base}/api/v1/auth/health` });
      const timer = setTimeout(() => {
        req.abort();
        resolve(false);
      }, 1500);
      req.on('response', (res) => {
        clearTimeout(timer);
        res.on('data', () => undefined);
        resolve(res.statusCode < 500);
      });
      req.on('error', () => {
        clearTimeout(timer);
        resolve(false);
      });
      req.end();
    });
  });
  ipcMain.handle('newport:version', () => ({ app: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome }));
  ipcMain.handle('newport:time-skew', async (_e, serverTimeIso: string) => Math.round(new Date(serverTimeIso).getTime() - Date.now()));

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
