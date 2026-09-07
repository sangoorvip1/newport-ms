/** شاشة المزامنة: حالة الدورة، الطابور، التعارضات مع قرار المستخدم (نسختي/نسخة الخادم)، وأزرار إدارية */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { SCHEMA_VERSION, type LocalConflict, type PendingOp } from '@newport/domain';
import { localStore } from '../data/syncStore.js';
import { useDesktopSync } from '../state/sync.js';

const OUTCOME_AR: Record<string, string> = {
  APPLIED: 'مطبّق',
  MERGED: 'مدموج',
  CONFLICT: 'تعارض',
  REJECTED: 'مرفوض',
  DEDUPLICATED: 'مُكرَّر (تم تجاهله)',
};

export function SyncScreen() {
  const { handle, status } = useDesktopSync();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const queue = useQuery({
    queryKey: ['pending'],
    queryFn: async (): Promise<PendingOp[]> => localStore.pending(),
    refetchInterval: 5_000,
  });
  const conflicts = useQuery({
    queryKey: ['conflicts'],
    queryFn: () => handle.client.conflicts(),
    refetchInterval: 7_000,
  });
  const stats = useQuery({
    queryKey: ['local-stats'],
    queryFn: async () => (localStore.stats ? localStore.stats() : { records: 0, pending: 0, conflicts: 0 }),
    refetchInterval: 5_000,
  });

  const decide = async (c: LocalConflict, side: 'local' | 'server') => {
    setBusy(true);
    try {
      await handle.client.resolveConflict(c.opId, side);
      setNote(side === 'local' ? 'أُعيد جدولة نسختك للدفع في الدورة القادمة.' : 'اعتُمدت نسخة الخادم وأُغلقت العملية.');
      void conflicts.refetch();
      void queue.refetch();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <section className="card">
        <h2>حالة المزامنة</h2>
        <dl className="cols">
          <div>
            <dt>الشبكة</dt>
            <dd>{status.online ? 'متصلة' : 'منقطعة — العمل مستمر محليًا'}</dd>
          </div>
          <div>
            <dt>دورة جارية</dt>
            <dd>{status.running ? 'نعم' : 'لا'}</dd>
          </div>
          <div>
            <dt>cursor المحلي</dt>
            <dd>{status.lastReport?.cursor ?? '—'}</dd>
          </div>
          <div>
            <dt>سجلات محلية</dt>
            <dd>{stats.data?.records ?? 0}</dd>
          </div>
          <div>
            <dt>عمليات معلقة</dt>
            <dd>{status.pending}</dd>
          </div>
          <div>
            <dt>تعارضات</dt>
            <dd>{status.conflicts}</dd>
          </div>
          <div>
            <dt>إصدار المخطط</dt>
            <dd>v{SCHEMA_VERSION}</dd>
          </div>
          <div>
            <dt>إعادة المحاولة القادمة</dt>
            <dd>{status.nextRetryAt ? new Date(status.nextRetryAt).toLocaleTimeString('ar-IQ') : '—'}</dd>
          </div>
        </dl>
        {status.lastError && <div className="warn">آخر خطأ: {status.lastError}</div>}
        {status.lastReport?.fullResyncRequired && <div className="warn">{status.lastReport.resyncReasonAr}</div>}
        <div className="row">
          <button
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void (async () => {
                const r = await handle.client.syncOnce();
                setNote(`دورة يدوية: ${r.pushed.applied} مُطبّق، ${r.pushed.conflicts} تعارض، ${r.pulled} مسحوب.`);
                setBusy(false);
              })();
            }}
          >
            مزامنة الآن
          </button>
          <button
            className="ghost"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void (async () => {
                const r = await handle.client.fullResync();
                setNote(`أُعيدت المزامنة الكاملة: ${r.pulled} سجل.`);
                setBusy(false);
              })();
            }}
          >
            إعادة مزامنة كاملة
          </button>
          {note && <span className="ok">{note}</span>}
        </div>
      </section>

      <section className="card">
        <h2>طابور الدفع ({queue.data?.length ?? 0})</h2>
        <table>
          <thead>
            <tr>
              <th>الكيان</th>
              <th>النوع</th>
              <th>محاولات</th>
              <th>آخر خطأ</th>
            </tr>
          </thead>
          <tbody>
            {(queue.data ?? []).map((p) => (
              <tr key={p.op.opId}>
                <td>{p.op.entity}</td>
                <td>{p.op.kind}</td>
                <td>{p.attempts}</td>
                <td className="dim">{p.lastError ?? '—'}</td>
              </tr>
            ))}
            {!(queue.data ?? []).length && (
              <tr>
                <td colSpan={4} className="dim">
                  الطابور فارغ — كل شيء مُدفع
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>تعارضات تحتاج قرارًا ({conflicts.data?.length ?? 0})</h2>
        {(conflicts.data ?? []).map((c) => (
          <div key={c.opId} className="conflict">
            <div>
              <strong>
                {c.entity} · {OUTCOME_AR[c.outcome] ?? c.outcome}
              </strong>
              <div className="dim">{c.reasonAr}</div>
            </div>
            <pre className="json">{JSON.stringify({ client: c.client, server: c.server }, null, 1)}</pre>
            <div className="row">
              <button disabled={busy} onClick={() => void decide(c, 'local')}>
                اعتمد نسختي
              </button>
              <button className="ghost" disabled={busy} onClick={() => void decide(c, 'server')}>
                اعتمد نسخة الخادم
              </button>
            </div>
          </div>
        ))}
        {!(conflicts.data ?? []).length && <p className="dim">لا تعارضات — سياسة الدمج حسمت كل شيء آليًا.</p>}
      </section>
    </div>
  );
}
