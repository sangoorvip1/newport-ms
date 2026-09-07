/**
 * الهيكل العام: RTL، شريط جانبي للتنقّل، وشريط حالة يعرض الاتصال + عدد العمليات المعلقة + آخر مزامنة.
 * كل الأزرار تُفلتَر بالصلاحيات الفعلية (AccessView) حتى لا يرى الفني ما لا يملكه — والمصادقة النهائية تبقى في الخادم.
 */
import type { ReactNode } from 'react';
import { useAuth } from '../state/auth.js';
import type { SyncStatus } from '../data/syncStore.js';

export interface NavItem {
  id: string;
  label: string;
  permission?: string;
}

export function Shell({ nav, active, onNavigate, sync, children }: { nav: NavItem[]; active: string; onNavigate: (id: string) => void; sync: SyncStatus | null; children: ReactNode }) {
  const { access, me, signOut } = useAuth();
  const items = nav.filter((n) => !n.permission || access.can(n.permission));
  return (
    <div className="app" dir="rtl">
      <aside className="side">
        <div className="brand">
          <strong>Newport</strong>
          <span>معمل الأسمدة الجنوبية — الخط الأول</span>
        </div>
        <nav>
          {items.map((i) => (
            <button key={i.id} className={i.id === active ? 'on' : ''} onClick={() => onNavigate(i.id)}>
              {i.label}
            </button>
          ))}
        </nav>
        <div className="who">
          <div>{me?.roles.join('، ') || '—'}</div>
          <small>{access.size} صلاحية فعّالة</small>
          <button className="ghost" onClick={() => void signOut()}>
            خروج
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="bar">
          <span className={sync && sync.online ? 'pill ok' : 'pill bad'}>{sync?.online ? 'متصل بالخادم' : 'دون اتصال — العمل محفوظ محليًا'}</span>
          <span className="pill">{sync?.pending ?? 0} عملية بانتظار الدفع</span>
          {(sync?.conflicts ?? 0) > 0 && <span className="pill warn">{sync?.conflicts} تعارض بانتظار المراجعة</span>}
          <span className="pill">{sync?.records ?? 0} سجل محلي</span>
          <span className="dim">{sync?.lastReport ? `آخر مزامنة ${new Date().toLocaleTimeString('ar-IQ')}` : 'لم تبدأ المزامنة بعد'}</span>
        </header>
        {children}
      </main>
    </div>
  );
}
