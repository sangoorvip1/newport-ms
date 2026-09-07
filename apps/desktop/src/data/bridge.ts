/**
 * وصول آمن إلى جسر Electron مع بديل للمتصفح.
 * في المتصفح (تطوير ويب) تعمل الواجهة فوق fetch + localStorage، وهذا مفيد لمراجعة الـ UI
 * دون تشغيل Electron — لكن الجلسة لا تُخزَّن بشكل آمن لذا لا تُستخدم للإنتاج.
 */
export interface NewportBridge {
  getApiBase(): Promise<string>;
  getToken(): Promise<{ access: string | null; refresh: string | null }>;
  setToken(payload: { access: string | null; refresh: string | null }): Promise<boolean>;
  isOnline(): Promise<boolean>;
  getVersion(): Promise<{ app: string; electron: string; chrome: string }>;
  timeSkew(serverTimeIso: string): Promise<number>;
}

declare global {
  interface Window {
    newportBridge?: NewportBridge;
  }
}

export const isElectron = typeof window !== 'undefined' && !!window.newportBridge;

const browserToken = {
  get(): { access: string | null; refresh: string | null } {
    return { access: localStorage.getItem('newport.access'), refresh: localStorage.getItem('newport.refresh') };
  },
  set(p: { access: string | null; refresh: string | null }) {
    if (p.access) localStorage.setItem('newport.access', p.access);
    else localStorage.removeItem('newport.access');
    if (p.refresh) localStorage.setItem('newport.refresh', p.refresh);
    else localStorage.removeItem('newport.refresh');
  },
};

export const bridge: NewportBridge = {
  async getApiBase() {
    if (isElectron) return window.newportBridge!.getApiBase();
    return (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_URL ?? '';
  },
  async getToken() {
    if (isElectron) return window.newportBridge!.getToken();
    return browserToken.get();
  },
  async setToken(p) {
    if (isElectron) return window.newportBridge!.setToken(p);
    browserToken.set(p);
    return true;
  },
  async isOnline() {
    if (isElectron) return window.newportBridge!.isOnline();
    return navigator.onLine;
  },
  async getVersion() {
    if (isElectron) return window.newportBridge!.getVersion();
    return { app: 'dev-web', electron: '-', chrome: '-' };
  },
  async timeSkew(serverTimeIso) {
    if (isElectron) return window.newportBridge!.timeSkew(serverTimeIso);
    return new Date(serverTimeIso).getTime() - Date.now();
  },
};
