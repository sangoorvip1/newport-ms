/** شاشة الدخول: اسم مستخدم/كلمة مرور + تلميح بالعمل دون اتصال عند تعذّر الوصول للخادم */
import { useState, type FormEvent } from 'react';
import { passwordIssues, useAuth } from '../state/auth.js';

export function LoginScreen() {
  const { signIn, status, busy, error } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  if (status === 'restricted') return <ChangePasswordScreen />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void signIn(username.trim(), password);
  };

  return (
    <div className="login" dir="rtl">
      <form onSubmit={submit} className="card">
        <h1>Newport LP. LTD</h1>
        <p className="sub">معمل الأسمدة الجنوبية — الخط الأول (BFC-L1)</p>
        <label>
          اسم المستخدم
          <input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" placeholder="heat.tech" />
        </label>
        <label>
          كلمة المرور
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        {error && <div className="err">{error}</div>}
        <button disabled={busy || username.length < 3 || password.length < 8}>{busy ? 'جارٍ التحقق…' : 'دخول'}</button>
        <small className="dim">
          الجلسة السابقة تُستعاد تلقائيًا دون الحاجة للشبكة (توكن صالح مخزَّن ومُشفَّر على الجهاز). عند انقطاع الخادم تبقى
          السجلات التي تُنشئها في قاعدة بيانات الجهاز وتُدفع وحدها عند عودة الشبكة.
        </small>
      </form>
    </div>
  );
}

/**
 * أول دخول بعد الزراعة (seed) تكون mustChangePwd = true، والخادم يرفض كل ما عدا مسارات الحساب.
 * هذه الشاشة ترفع هذا القيد بأمان: تغيير كلمة المرور ثم إعادة تسجيل الدخول بالرمز الجديد.
 */
function ChangePasswordScreen() {
  const { completePasswordChange, busy, error, signOut, session } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const problems = passwordIssues(next);
  const mismatch = confirm.length > 0 && confirm !== next;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (mismatch || problems.length) return;
    void completePasswordChange(current, next);
  };

  return (
    <div className="login" dir="rtl">
      <form onSubmit={submit} className="card">
        <h1>تغيير كلمة المرور الإلزامي</h1>
        <p className="sub">
          المستخدم: <b>{session?.user.fullName ?? session?.user.username ?? '—'}</b> — لا يفتح النظام بقية الشاشات قبل تغيير
          كلمة المرور الافتراضية.
        </p>
        <label>
          كلمة المرور الحالية
          <input autoFocus type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </label>
        <label>
          كلمة المرور الجديدة
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </label>
        <label>
          تأكيد الجديدة
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </label>
        {next.length > 0 && problems.length > 0 && <div className="warn">متطلبات: {problems.join('، ')}</div>}
        {mismatch && <div className="err">التأكيد غير مطابق</div>}
        {error && <div className="err">{error}</div>}
        <button disabled={busy || current.length < 8 || next.length < 10 || mismatch || problems.length > 0}>
          {busy ? 'جارٍ الحفظ…' : 'حفظ ومتابعة'}
        </button>
        <button type="button" className="ghost" onClick={() => void signOut()}>
          خروج
        </button>
      </form>
    </div>
  );
}
