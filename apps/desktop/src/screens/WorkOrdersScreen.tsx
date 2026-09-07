/**
 * شاشة أوامر العمل: قائمة من الخادم تُدمج معها فورًا السجلات المحلية غير المدفوعة (isOfflineCreated)،
 * ولوحة تفاصيل فيها: ملاحظة ميدانية (append)، صورة من القرص، وانتقالات الحالة بحساب محلي من الـ FSM المشترك.
 * الكتابة تتم دائمًا عبر LocalRepo ⇒ نفس المسار يعمل متصلًا وغير متصل، والخادم هو من يحسم الهوية والحالة.
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type ChangeEvent } from 'react';
import { allowedNextStates, computeSla, type WoState } from '@newport/domain';
import { apiFetch } from '../data/api.js';
import { useLocalRecords, useServerList } from '../hooks/query.js';
import { useAuth } from '../state/auth.js';
import { useDesktopSync } from '../state/sync.js';

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'مسودة',
  SUBMITTED: 'مُقدَّم',
  APPROVED: 'معتمد',
  ASSIGNED: 'مُسند',
  IN_PROGRESS: 'قيد التنفيذ',
  ON_HOLD: 'متوقف مؤقتًا',
  AWAITING_PARTS: 'بانتظار قطع غيار',
  AWAITING_PERMIT: 'بانتظار تصريح عمل',
  COMPLETED: 'مُنجَز',
  CLOSED: 'مغلق',
  CANCELLED: 'ملغي',
  REJECTED: 'مرفوض',
};

interface WoRow {
  id: string;
  number: string;
  title: string;
  status: WoState;
  priority: string;
  assetTag: string | null;
  assetName: string | null;
  subDept: string | null;
  createdBy: string;
  assignedTo: string | null;
  createdAt: string;
  startedAt: string | null;
  closedAt: string | null;
  version: number;
  syncSeq: number;
  counts?: { logs?: number; labor?: number; requisitions?: number };
  sla?: { breachedResponse: boolean; breachedResolve: boolean; responseHours?: number; resolveHours?: number };
}

interface WoDetail {
  id: string;
  number: string;
  title: string;
  description: string;
  status: WoState;
  priority: string;
  version: number;
  requirePermit?: boolean;
  safetyNotes?: string | null;
  subDept?: { code: string; nameAr: string } | null;
  logs?: Array<{ id: string; kind: string; note: string | null; at: string; by?: { fullNameAr: string } | null }>;
  attachments?: Array<{ id: string; fileName: string; mimeType: string; sizeBytes: number }>;
}

export function WorkOrdersScreen() {
  const { access } = useAuth();
  const { repo, nudge } = useDesktopSync();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [onlyMy, setOnlyMy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const list = useServerList<WoRow>(['wo', status, q, onlyMy], '/v1/maintenance/work-orders', {
    status,
    q,
    onlyMy: onlyMy ? 'true' : undefined,
    take: 60,
  });
  const local = useLocalRecords<Record<string, unknown>>('workOrder');
  const detail = useQuery({
    queryKey: ['wo-detail', selected],
    enabled: !!selected,
    queryFn: () => apiFetch<WoDetail>(`/v1/maintenance/work-orders/${selected}`),
    staleTime: 15_000,
  });

  const rows = useMemo(() => {
    const server = list.data?.items ?? [];
    const seen = new Set(server.map((s) => s.id));
    const offline: WoRow[] = local.rows
      .filter((r) => !seen.has(r.id) && r.data.isOfflineCreated === true)
      .map((r) => ({
        id: r.id,
        number: String(r.data.number ?? 'محلي'),
        title: String(r.data.title ?? ''),
        status: (String(r.data.status ?? 'SUBMITTED') as WoState) || 'SUBMITTED',
        priority: String(r.data.priority ?? 'MEDIUM'),
        assetTag: (r.data.equipmentTag as string) ?? null,
        assetName: null,
        subDept: (r.data.requestedSubDeptCode as string) ?? null,
        createdBy: 'أنت',
        assignedTo: null,
        createdAt: String(r.data.createdAt ?? new Date().toISOString()),
        startedAt: null,
        closedAt: null,
        version: r.version,
        syncSeq: 0,
        sla: computeSla({
          priority: String(r.data.priority ?? 'MEDIUM') as never,
          submittedAt: String(r.data.createdAt ?? new Date().toISOString()),
          startedAt: null,
          closedAt: null,
        }),
      }));
    return [...offline, ...server];
  }, [list.data, local.rows]);

  const current = rows.find((r) => r.id === selected) ?? null;
  const perms = useMemo(() => new Set(access.codes()), [access]);
  const transitions = current ? allowedNextStates(current.status, perms) : [];

  const addNote = async () => {
    if (!current || !note.trim()) return;
    setBusy(true);
    try {
      await repo.appendWorkOrderNote(current.id, note.trim());
      setNote('');
      setMsg('حُفظت الملاحظة محليًا وتُلحق بنسخة الخادم دون أن تمسح ملاحظات الآخرين.');
      nudge();
    } finally {
      setBusy(false);
    }
  };

  const addPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !current) return;
    if (file.size > 3 * 1024 * 1024) {
      setMsg('حجم الصورة كبير — الحد 3 ميجابايت لهذا المسار (المرفقات الكبيرة تُرفع من الهاتف).');
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(file);
    });
    await repo.attachPhoto(current.id, { fileName: file.name, dataUrl, takenAt: new Date().toISOString(), caption: '' });
    setMsg('أُضيفت الصورة إلى طابور المزامنة.');
    nudge();
  };

  const move = async (to: WoState) => {
    if (!current) return;
    setBusy(true);
    try {
      await apiFetch(`/v1/maintenance/work-orders/${current.id}/transition`, { method: 'POST', body: { to } });
      setMsg(`نُفِّذ الانتقال إلى ${STATUS_LABEL[to] ?? to}`);
      void list.refetch();
      void detail.refetch();
    } catch (e) {
      setMsg(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid2">
      <section className="card">
        <div className="row">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">كل الحالات</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <input placeholder="بحث في العنوان/الوصف" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="chk">
            <input type="checkbox" checked={onlyMy} onChange={(e) => setOnlyMy(e.target.checked)} /> المسندة إليّ
          </label>
          <button className="ghost" onClick={() => void list.refetch()}>
            تحديث
          </button>
        </div>
        {list.isError && <div className="warn">تعذّر التحديث من الخادم — القائمة من ذاكرة الجهاز.</div>}
        <table>
          <thead>
            <tr>
              <th>الرقم</th>
              <th>العنوان</th>
              <th>الحالة</th>
              <th>الأولوية</th>
              <th>المعدة</th>
              <th>SLA</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.id === selected ? 'sel' : ''} onClick={() => setSelected(r.id)}>
                <td>
                  {r.number}
                  {r.syncSeq === 0 && <span className="tag">محلي</span>}
                </td>
                <td>{r.title}</td>
                <td>{STATUS_LABEL[r.status] ?? r.status}</td>
                <td>{r.priority}</td>
                <td>{r.assetTag ?? '—'}</td>
                <td>{r.sla?.breachedResolve ? <span className="tag warn">تجاوز المعالجة</span> : r.sla?.breachedResponse ? <span className="tag">تجاوز الاستجابة</span> : '—'}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="dim">
                  {list.isLoading ? 'جارٍ التحميل…' : 'لا توجد أوامر عمل مطابقة'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="card">
        {!current && <p className="dim">اختر أمر عمل لعرض تفاصيله وإضافة ملاحظة ميدانية أو صورة.</p>}
        {current && (
          <>
            <h2>
              {current.number} — {current.title}
            </h2>
            <p className="desc">{detail.data?.description ?? (current.syncSeq === 0 ? 'سجل محلي لم يُدفع بعد' : 'جارٍ تحميل الوصف…')}</p>
            <dl className="cols">
              <div>
                <dt>الحالة</dt>
                <dd>{STATUS_LABEL[current.status] ?? current.status}</dd>
              </div>
              <div>
                <dt>الشعبة المنفذة</dt>
                <dd>{current.subDept ?? detail.data?.subDept?.nameAr ?? '—'}</dd>
              </div>
              <div>
                <dt>مُنشئ الطلب</dt>
                <dd>{current.createdBy}</dd>
              </div>
              <div>
                <dt>نسخة</dt>
                <dd>v{current.version}</dd>
              </div>
            </dl>
            {!!detail.data?.logs?.length && (
              <ul className="logs">
                {detail.data.logs.slice(0, 8).map((l) => (
                  <li key={l.id}>
                    <b>{l.kind}</b> {l.note ?? ''} <span className="dim">{new Date(l.at).toLocaleString('ar-IQ')}</span> {l.by ? `— ${l.by.fullNameAr}` : ''}
                  </li>
                ))}
              </ul>
            )}
            <textarea rows={3} placeholder="ملاحظة ميدانية (تُلحق ولا تستبدل ملاحظات الآخرين)" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="row">
              <button disabled={busy} onClick={() => void addNote()}>
                إضافة ملاحظة
              </button>
              <label className="file">
                صورة
                <input type="file" accept="image/*" onChange={(e) => void addPhoto(e)} />
              </label>
            </div>
            {transitions.length > 0 && (
              <div className="row">
                {transitions.map((t) => (
                  <button key={t} className="ghost" disabled={busy || current.syncSeq === 0} onClick={() => void move(t)}>
                    ← {STATUS_LABEL[t] ?? t}
                  </button>
                ))}
                {current.syncSeq === 0 && <span className="dim">الانتقالات متاحة بعد دفع السجل المحلي</span>}
              </div>
            )}
            {msg && <div className="ok">{msg}</div>}
          </>
        )}
      </section>
    </div>
  );
}
