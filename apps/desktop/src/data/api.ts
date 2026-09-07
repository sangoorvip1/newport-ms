/** عميل REST للخادم مع تجديد تلقائي لرمز الوصول (refresh) وجدولة إعادة المحاولة عند انقطاع الشبكة */
import type { AuthSession } from '@newport/domain';
import { bridge } from './bridge.js';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
  }
}

let basePromise: Promise<string> | null = null;
const baseUrl = () => (basePromise ??= bridge.getApiBase().then((b) => `${b}/api`));

type Tokens = { access: string | null; refresh: string | null };
let tokens: Tokens = { access: null, refresh: null };
const listeners = new Set<(t: Tokens) => void>();

export function onTokens(fn: (t: Tokens) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
async function persist(next: Tokens): Promise<void> {
  tokens = next;
  await bridge.setToken(next);
  for (const l of listeners) l(next);
}
export const currentTokens = () => tokens;

export async function restoreSession(): Promise<boolean> {
  tokens = await bridge.getToken();
  return !!tokens.access;
}

async function rawFetch(path: string, init: RequestInit, token: string | null): Promise<Response> {
  const base = await baseUrl();
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  if (init.body) headers.set('content-type', 'application/json');
  headers.set('x-device-id', deviceId());
  if (token) headers.set('authorization', `Bearer ${token}`);
  return fetch(`${base}${path}`, { ...init, headers, credentials: 'omit' });
}

export function deviceId(): string {
  const KEY = 'newport.deviceId';
  let v = localStorage.getItem(KEY);
  if (!v) {
    v = `desk-${(crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)).slice(0, 18)}`;
    localStorage.setItem(KEY, v);
  }
  return v;
}

let refreshing: Promise<AuthSession | null> | null = null;
async function doRefresh(): Promise<AuthSession | null> {
  if (!tokens.refresh) return null;
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const res = await rawFetch('/v1/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: tokens.refresh, deviceId: deviceId() }) }, tokens.access);
      if (!res.ok) {
        await persist({ access: null, refresh: null });
        return null;
      }
      const session = (await res.json()) as AuthSession;
      await persist({ access: session.accessToken, refresh: session.refreshToken });
      return session;
    } catch {
      return null; // انقطاع الشبكة: لا نسجّل الخروج، نحاول لاحقًا
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  /** لا تُجدّد الجلسة تلقائيًا (يُستخدم عند تسجيل الدخول نفسه) */
  noRefresh?: boolean;
  signal?: AbortSignal;
}

export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const qs = opts.query
    ? `?${new URLSearchParams(Object.entries(opts.query).filter(([, v]) => v !== undefined) as Array<[string, string]>).toString()}`
    : '';
  const init: RequestInit = { method: opts.method ?? 'GET', signal: opts.signal };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);

  let res: Response;
  try {
    res = await rawFetch(path + qs, init, tokens.access);
  } catch (e) {
    throw new ApiError(0, 'لا يمكن الوصول إلى خادم المعمل — تحقّق من الشبكة', String((e as Error).message));
  }
  if (res.status === 401 && !opts.noRefresh) {
    const session = await doRefresh();
    if (session) res = await rawFetch(path + qs, init, session.accessToken);
    else throw new ApiError(401, 'انتهت الجلسة — سجّل الدخول من جديد');
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const payload: unknown = text ? safeJson(text) : null;
  if (!res.ok) {
    const msg =
      (payload as { messageAr?: string; message?: string | string[] } | null)?.messageAr ??
      (payload as { message?: string | string[] } | null)?.message ??
      `خطأ ${res.status}`;
    throw new ApiError(res.status, Array.isArray(msg) ? msg.join('، ') : String(msg), payload ?? undefined);
  }
  return payload as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function login(username: string, password: string): Promise<AuthSession> {
  const session = await apiFetch<AuthSession>('/v1/auth/login', { method: 'POST', body: { username, password, deviceId: deviceId(), platform: 'WIN' }, noRefresh: true });
  await persist({ access: session.accessToken, refresh: session.refreshToken });
  return session;
}

/** تغيير كلمة المرور (مطلوب عند أول دخول بكلمة مرور مزروعة) — يُبطل الجلسات الأخرى */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiFetch('/v1/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
}

export async function logout(): Promise<void> {
  try {
    await apiFetch('/v1/auth/logout', { method: 'POST', body: { refreshToken: tokens.refresh, deviceId: deviceId() } });
  } finally {
    await persist({ access: null, refresh: null });
  }
}

/** ناقل المزامنة: يستخدم نفس قناة HTTP مع التوكنات حتى تبقى الدورة الواحدة متسقة */
export const syncTransport = {
  async request<T>(input: { method: 'GET' | 'POST'; path: string; body?: unknown; query?: Record<string, string | number> }): Promise<T> {
    return apiFetch<T>(input.path, { method: input.method, body: input.body, query: input.query as Record<string, string | undefined> });
  },
};

export async function reportClockSkew(serverTimeIso: string): Promise<number> {
  return bridge.timeSkew(serverTimeIso);
}
