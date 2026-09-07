import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessView, loginDto, type AuthSession } from '@newport/domain';
import {
  ApiError,
  changePassword as apiChangePassword,
  deviceId,
  login as apiLogin,
  logout as apiLogout,
  restoreSession,
} from '../data/api.js';
import { fetchMe, type MeResponse } from '../data/syncStore.js';

interface AuthState {
  /** 'restricted' = تمّت المصادقة لكن كلمة المرور الافتراضية لم تُغيَّر بعد */
  status: 'booting' | 'anonymous' | 'restricted' | 'authenticated';
  session: AuthSession | null;
  me: MeResponse | null;
  access: AccessView;
  error: string | null;
  busy: boolean;
  mustChangePwd: boolean;
  signIn(username: string, password: string): Promise<boolean>;
  completePasswordChange(currentPassword: string, newPassword: string): Promise<boolean>;
  signOut(): Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

/** مخطط كلمة المرور نفسه الذي يفرضه الخادم (≥10) + تلميح عملي للمستخدم */
export function passwordIssues(next: string): string[] {
  const out: string[] = [];
  if (next.length < 10) out.push('10 أحرف على الأقل');
  if (!/[A-Za-z]/.test(next)) out.push('حرف لاتيني واحد على الأقل');
  if (!/[0-9]/.test(next)) out.push('رقم واحد على الأقل');
  return out;
}

export function AuthProvider({ children, onSignedIn }: { children: ReactNode; onSignedIn?: (userId: string) => void }) {
  const [status, setStatus] = useState<AuthState['status']>('booting');
  const [session, setSession] = useState<AuthSession | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mustChangePwd, setMustChangePwd] = useState(false);

  const hydrate = useCallback(
    async (s: AuthSession | null) => {
      const m = await fetchMe();
      setMe(m);
      setSession(s);
      setMustChangePwd(Boolean(s?.mustChangePwd));
      setStatus(s?.mustChangePwd ? 'restricted' : 'authenticated');
      if (!s?.mustChangePwd) onSignedIn?.(m.userId);
      return Boolean(s?.mustChangePwd);
    },
    [onSignedIn],
  );

  useEffect(() => {
    void (async () => {
      const has = await restoreSession();
      if (!has) {
        setStatus('anonymous');
        return;
      }
      try {
        // /auth/me يعيد mustChangePwd: نفتح شاشة التغيير الإلزامي بدل مفاجأة 403 في كل شاشة
        const m = await fetchMe();
        setMe(m);
        setMustChangePwd(m.mustChangePwd === true);
        setStatus(m.mustChangePwd ? 'restricted' : 'authenticated');
        if (!m.mustChangePwd) onSignedIn?.(m.userId);
      } catch (e) {
        // توكن منتهي/غير صالح: نخرج للواجهة بلا جلسة، والطابور المحلي يبقى محفوظًا
        void apiLogout().catch(() => undefined);
        setStatus('anonymous');
        setError(String((e as Error).message ?? e));
      }
    })();
  }, [hydrate, onSignedIn]);

  const signIn = useCallback(async (username: string, password: string) => {
    const parsed = loginDto.safeParse({ username, password, deviceId: deviceId(), platform: 'WIN' });
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => `${String(i.path[0])}: ${i.message}`).join('، '));
      return false;
    }
    setBusy(true);
    setError(null);
    try {
      const s = await apiLogin(username, password);
      if (s.mustChangePwd) {
        // جلسة مقيدة: لا استدعاءات بيانات قبل تغيير كلمة المرور (الحارس سيرفض 403)
        setSession(s);
        setMustChangePwd(true);
        setStatus('restricted');
        return true;
      }
      await hydrate(s);
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'تعذّر الاتصال بالخادم — جرّب لاحقًا أو اعمل دون اتصال');
      return false;
    } finally {
      setBusy(false);
    }
  }, [hydrate]);

  const completePasswordChange = useCallback(async (currentPassword: string, newPassword: string) => {
    const problems = passwordIssues(newPassword);
    if (problems.length) {
      setError(`كلمة المرور الجديدة غير مقبولة: ${problems.join('، ')}`);
      return false;
    }
    setBusy(true);
    setError(null);
    try {
      await apiChangePassword(currentPassword, newPassword);
      // الرمز الحالي أصبح باطلًا (ref rotation + version bump) → تسجيل دخول جديد بكلمة المرور الجديدة
      const s = await apiLogin(session?.user.username ?? '', newPassword);
      await hydrate(s);
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'تعذّر تغيير كلمة المرور');
      return false;
    } finally {
      setBusy(false);
    }
  }, [hydrate, session]);

  const signOut = useCallback(async () => {
    await apiLogout().catch(() => undefined);
    setMe(null);
    setSession(null);
    setMustChangePwd(false);
    setStatus('anonymous');
  }, []);

  const access = useMemo(() => AccessView.from(me ?? { permissions: [] }), [me]);
  const value = useMemo<AuthState>(
    () => ({ status, session, me, access, error, busy, mustChangePwd, signIn, completePasswordChange, signOut }),
    [status, session, me, access, error, busy, mustChangePwd, signIn, completePasswordChange, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
