/**
 * قناة HTTP للخادم في تطبيق الميدان:
 *  - أساس العنوان يُضبط من شاشة الإعدادات (خادم المعمل على LAN أو بوابة السحابة).
 *  - JWT في الرأس مع تجديد تلقائي للجلسة عند 401 وحفظ التوكنات في التخزين الآمن.
 *  - عند انقطاع الشبكة لا نرمي خطأ بيانات: الواجهة تقرأ من SQLite والمزامنة تُعيد المحاولة لاحقًا.
 */
import type { AuthSession } from '@newport/domain';
import { getSecure, setSecure } from './secure.js';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
  }
}

const BASE_KEY = 'apiBaseUrl';
const DEVICE_KEY = 'deviceId';
let baseCache: string | null = null;

export async function getBaseUrl(): Promise<string> {
  if (baseCache) return baseCache;
  const saved = await getSecure(BASE_KEY);
  // الافتراضي: بوابة المعمل (nginx على جهاز الخادم المحلي)
  baseCache = (saved ?? 'http://192.168.10.20:3000').replace(/\/$/, '');
  return baseCache;
}
export async function setBaseUrl(url: string): Promise<void> {
  baseCache = url.replace(/\/$/, '');
  await setSecure(BASE_KEY, baseCache);
}

export async function ensureDeviceId(): Promise<string> {
  const cur = await getSecure(DEVICE_KEY);
  if (cur) return cur;
  const id = `mob-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await setSecure(DEVICE_KEY, id);
  return id;
}

type Tokens = { access: string | null; refresh: string | null };
let tokens: Tokens = { access: null, refresh: null };
export const currentTokens = (): Tokens => tokens;

export async function restoreSession(): Promise<boolean> {
  const access = await getSecure('access');
  const refreshT = await getSecure('refresh');
  tokens = { access, refresh: refreshT };
  return !!access;
}
async function persist(t: Tokens): Promise<void> {
  tokens = t;
  await setSecure('access', t.access);
  await setSecure('refresh', t.refresh);
}

interface Options {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  timeoutMs?: number;
}

async function call(path: string, opts: Options, token: string | null): Promise<Response> {
  const base = await getBaseUrl();
  const qs = opts.query
    ? `?${new URLSearchParams(Object.entries(opts.query).filter(([, v]) => v !== undefined) as Array<[string, string]>).toString()}`
    : '';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 12_000);
  try {
    return await fetch(`${base}/api${path}${qs}`, {
      method: opts.method ?? 'GET',
      headers: {
        accept: 'application/json',
        ...(opts.body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        'x-device-id': await ensureDeviceId(),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

let refreshing: Promise<AuthSession | null> | null = null;
async function doRefresh(): Promise<AuthSession | null> {
  if (!tokens.refresh) return null;
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const res = await call('/v1/auth/refresh', { method: 'POST', body: { refreshToken: tokens.refresh, deviceId: await ensureDeviceId() } }, tokens.access);
      if (!res.ok) {
        await persist({ access: null, refresh: null });
        return null;
      }
      const s = (await res.json()) as AuthSession;
      await persist({ access: s.accessToken, refresh: s.refreshToken });
      return s;
    } catch {
      return null; // انقطاع: لا نسجّل الخروج، ونُبقي العمل المحلي
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function apiFetch<T>(path: string, opts: Options = {}): Promise<T> {
  let res: Response;
  try {
    res = await call(path, opts, tokens.access);
  } catch {
    throw new ApiError(0, 'لا يوجد اتصال بخادم المعمل — ستُحفظ البيانات على الجهاز وتُرسل لاحقًا');
  }
  if (res.status === 401) {
    const s = await doRefresh();
    if (!s) throw new ApiError(401, 'انتهت الجلسة — أعد تسجيل الدخول');
    res = await call(path, opts, s.accessToken);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const m =
      (payload as { messageAr?: string; message?: string | string[] } | null)?.messageAr ??
      (payload as { message?: string | string[] } | null)?.message ??
      `HTTP ${res.status}`;
    throw new ApiError(res.status, Array.isArray(m) ? m.join('، ') : String(m), payload ?? undefined);
  }
  return payload as T;
}

export async function login(username: string, password: string, platform: 'ANDROID' | 'IOS' = 'ANDROID'): Promise<AuthSession> {
  const s = await apiFetch<AuthSession>('/v1/auth/login', { method: 'POST', body: { username, password, deviceId: await ensureDeviceId(), platform } });
  await persist({ access: s.accessToken, refresh: s.refreshToken });
  return s;
}

/** تغيير كلمة المرور — مطلوب عند أول دخول بكلمة مرور مزروعة (mustChangePwd) */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiFetch('/v1/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
}

export async function logout(): Promise<void> {
  try {
    await apiFetch('/v1/auth/logout', { method: 'POST', body: { refreshToken: tokens.refresh } });
  } finally {
    await persist({ access: null, refresh: null });
  }
}

/** ناقل المزامنة لـ SyncClient (نفس القناة، بنفس التجديد التلقائي) */
export const syncTransport = {
  async request<T>(input: { method: 'GET' | 'POST'; path: string; body?: unknown; query?: Record<string, string | number> }): Promise<T> {
    return apiFetch<T>(input.path, { method: input.method, body: input.body, query: input.query as Record<string, string | undefined> });
  },
};
