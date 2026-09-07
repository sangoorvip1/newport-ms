/** إنشاء أمر عمل من المكتب: تحقق فوري بنفس مخطط الخادم (zod) ثم إرسال أو إدراج في الطابور */
import { useMemo, useState } from 'react';
import { PRIORITIES, workOrderCreateDto } from '@newport/domain';
import { apiFetch } from '../data/api.js';
import { useOnline } from '../hooks/query.js';
import { useDesktopSync } from '../state/sync.js';
import { useAuth } from '../state/auth.js';

const SOURCES = [
  ['BREAKDOWN', 'عطل'],
  ['SHIFT_LOG', 'سجل وردية'],
  ['LAB', 'نتيجة مختبر'],
  ['INSPECTION', 'فحص/صيانة دورية'],
  ['PM', 'خطة صيانة وقائية'],
  ['MANAGEMENT', 'تكليف إداري'],
] as const;
const SECTIONS = [
  ['MAINT-HEAT', 'المعدات الحرارية'],
  ['MAINT-ROT', 'المعدات الدوارة'],
  ['MAINT-ELEC', 'الكهرباء'],
  ['MAINT-VALVE', 'الصمامات'],
  ['MAINT-INST', 'الآلات الدقيقة'],
  ['MAINT-GEN', 'المعدات العامة'],
] as const;
const PRIORITY_AR: Record<string, string> = {
  EMERGENCY: 'طارئ جدًا',
  URGENT: 'عاجل',
  HIGH: 'عالٍ',
  MEDIUM: 'متوسط',
  LOW: 'منخفض',
  ROUTINE_PM: 'روتيني (PM)',
};

export function NewWorkOrderScreen() {
  const online = useOnline();
  const { repo, nudge } = useDesktopSync();
  const { access } = useAuth();
  const [form, setForm] = useState({
    title: '',
    description: '',
    equipmentTag: '',
    priority: 'HIGH',
    sourceType: 'BREAKDOWN',
    requestedSubDeptCode: 'MAINT-ROT',
    safetyNotes: '',
    estimatedHours: '',
    requirePermit: false,
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const parsed = useMemo(() => {
    const src: Record<string, unknown> = {
      title: form.title,
      description: form.description,
      priority: form.priority,
      sourceType: form.sourceType,
      requestedSubDeptCode: form.requestedSubDeptCode,
      requirePermit: form.requirePermit,
    };
    if (form.equipmentTag.trim()) src.equipmentTag = form.equipmentTag.trim();
    if (form.safetyNotes.trim()) src.safetyNotes = form.safetyNotes.trim();
    if (form.estimatedHours.trim()) src.estimatedHours = Number(form.estimatedHours);
    return workOrderCreateDto.safeParse(src);
  }, [form]);

  const save = async () => {
    if (!parsed.success) {
      setMsg(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('، '));
      return;
    }
    setBusy(true);
    try {
      if (online) {
        await apiFetch('/v1/maintenance/work-orders', { method: 'POST', body: parsed.data });
        setMsg('أُرسل أمر العمل إلى الخادم مباشرةً.');
      } else {
        await repo.createWorkOrder(parsed.data);
        setMsg('الخادم غير متاح: حُفظ الأمر محليًا وفي طابور المزامنة.');
        nudge();
      }
      setForm((f) => ({ ...f, title: '', description: '', safetyNotes: '', equipmentTag: '' }));
    } catch (e) {
      setMsg(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  if (!access.can('maint.wo.create')) {
    return (
      <div className="card">
        <p className="warn">لا تملك صلاحية maint.wo.create — الطلبات تمر عبر رئيس الشعبة أو شعبة التخطيط.</p>
      </div>
    );
  }

  return (
    <div className="card narrow" dir="rtl">
      <h2>أمر عمل جديد</h2>
      <div className={online ? 'ok' : 'warn'}>{online ? 'متصل — سيُرسل فورًا' : 'دون اتصال — سيُدرج في طابور المزامنة'}</div>
      <label>
        العنوان
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="تسريب ميكانيكي من مضخة" />
      </label>
      <label>
        الوصف / الأعراض
        <textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </label>
      <div className="row">
        <label>
          رقم المعدة
          <input value={form.equipmentTag} onChange={(e) => setForm({ ...form, equipmentTag: e.target.value })} placeholder="101-P-101A" />
        </label>
        <label>
          الأولوية
          <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_AR[p] ?? p}
              </option>
            ))}
          </select>
        </label>
        <label>
          المصدر
          <select value={form.sourceType} onChange={(e) => setForm({ ...form, sourceType: e.target.value })}>
            {SOURCES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="row">
        <label>
          الشعبة المطلوبة
          <select value={form.requestedSubDeptCode} onChange={(e) => setForm({ ...form, requestedSubDeptCode: e.target.value })}>
            {SECTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          ساعات تقديرية
          <input value={form.estimatedHours} onChange={(e) => setForm({ ...form, estimatedHours: e.target.value })} inputMode="decimal" />
        </label>
        <label className="chk">
          <input type="checkbox" checked={form.requirePermit} onChange={(e) => setForm({ ...form, requirePermit: e.target.checked })} /> يتطلب تصريح عمل
        </label>
      </div>
      <label>
        ملاحظات سلامة
        <input value={form.safetyNotes} onChange={(e) => setForm({ ...form, safetyNotes: e.target.value })} placeholder="عزل كهربائي، غازات سامة، عمل على ارتفاع" />
      </label>
      <div className="row">
        <button disabled={busy} onClick={() => void save()}>
          حفظ
        </button>
        <span className="dim">{parsed.success ? 'البيانات مطابقة لمخطط الخادم' : 'راجع الحقول المطلوبة'}</span>
      </div>
      {msg && <div className="ok">{msg}</div>}
    </div>
  );
}
