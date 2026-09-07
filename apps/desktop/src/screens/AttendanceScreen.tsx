/** شاشة البصمة/الحضور (شعبة البصمة + رؤساء الشعب): عرض يومي وإعادة حساب وتصدير الرواتب */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch } from '../data/api.js';
import { useAuth } from '../state/auth.js';

interface DailyRow {
  employeeNumber: string;
  jobTitle: string | null;
  subDept: string | null;
  date: string;
  shift: string;
  firstIn: string | null;
  lastOut: string | null;
  workedHours: number;
  lateMinutes: number;
  overtimeHours: number;
  status: string;
  exceptions: string[];
  isLocked: boolean;
}

const today = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => new Date().toISOString().slice(0, 7);

export function AttendanceScreen() {
  const { access } = useAuth();
  const [date, setDate] = useState(today());
  const [month, setMonth] = useState(thisMonth());
  const [msg, setMsg] = useState<string | null>(null);

  const daily = useQuery({
    queryKey: ['att', date],
    enabled: access.can('hr.att.view') || access.can('hr.att.all'),
    queryFn: () => apiFetch<DailyRow[]>('/v1/time/daily', { query: { date } }),
  });
  const payroll = useQuery({
    queryKey: ['payroll', month],
    enabled: access.can('hr.att.export_payroll'),
    queryFn: () => apiFetch<Array<{ employeeNumber: string; days: number; otHours: number; lateMinutes: number; absent: number }>>('/v1/time/payroll-export', { query: { month } }),
  });

  const recalc = async () => {
    setMsg('جارٍ إعادة الحساب…');
    try {
      const r = await apiFetch<{ updated: number }>('/v1/time/recalculate', { method: 'POST', query: { date } });
      setMsg(`أُعيد حساب ${r.updated} سجل`);
      void daily.refetch();
    } catch (e) {
      setMsg(String((e as Error).message));
    }
  };

  const exportCsv = () => {
    const rows = payroll.data ?? [];
    const csv = ['employeeNumber,days,otHours,lateMinutes,absent', ...rows.map((r) => `${r.employeeNumber},${r.days},${r.otHours},${r.lateMinutes},${r.absent}`)].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="stack">
      <section className="card">
        <div className="row">
          <label>
            اليوم
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          {access.can('hr.att.recalc') && (
            <button className="ghost" onClick={() => void recalc()}>
              إعادة حساب اليوم
            </button>
          )}
          <span className="dim">المنطقة الزمنية Asia/Baghdad (UTC+3) — نافذة البصمة ±4 ساعات حول الوردية</span>
        </div>
        {msg && <div className="ok">{msg}</div>}
        <table>
          <thead>
            <tr>
              <th>الرقم الوظيفي</th>
              <th>الشعبة</th>
              <th>الوردية</th>
              <th>أول دخول</th>
              <th>آخر خروج</th>
              <th>ساعات</th>
              <th>تأخير (د)</th>
              <th>إضافي</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {(daily.data ?? []).map((r) => (
              <tr key={`${r.employeeNumber}-${r.date}`}>
                <td>{r.employeeNumber}</td>
                <td>{r.subDept ?? '—'}</td>
                <td>{r.shift}</td>
                <td>{r.firstIn ? new Date(r.firstIn).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                <td>{r.lastOut ? new Date(r.lastOut).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                <td>{r.workedHours}</td>
                <td>{r.lateMinutes}</td>
                <td>{r.overtimeHours}</td>
                <td>
                  {r.status}
                  {r.isLocked && <span className="tag">مقفل</span>}
                  {r.exceptions.length > 0 && <span className="tag warn">{r.exceptions.join('، ')}</span>}
                </td>
              </tr>
            ))}
            {!daily.data?.length && (
              <tr>
                <td colSpan={9} className="dim">
                  {daily.isLoading ? 'جارٍ التحميل…' : 'لا توجد سجلات لهذا اليوم ضمن صلاحياتك'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {access.can('hr.att.export_payroll') && (
        <section className="card">
          <div className="row">
            <label>
              الشهر
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </label>
            <button onClick={exportCsv}>تنزيل CSV للأقسام المالية</button>
          </div>
          <table>
            <thead>
              <tr>
                <th>الرقم الوظيفي</th>
                <th>أيام</th>
                <th>ساعات إضافية</th>
                <th>دقائق تأخير</th>
                <th>غياب</th>
              </tr>
            </thead>
            <tbody>
              {(payroll.data ?? []).map((r) => (
                <tr key={r.employeeNumber}>
                  <td>{r.employeeNumber}</td>
                  <td>{r.days}</td>
                  <td>{r.otHours}</td>
                  <td>{r.lateMinutes}</td>
                  <td>{r.absent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
