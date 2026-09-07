/**
 * أوامر العمل في الميدان: قائمة من المخزن المحلي (سريعة وشغّالة دون شبكة) + سطر بحث،
 * ولوحة تنفيذ: إقرار الاستلام، ملاحظة تُلحق، صورة، وإنشاء أمر جديد عند اكتشاف عطل.
 */
import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { PRIORITIES, workOrderCreateDto, type WoState } from '@newport/domain';
import { apiFetch } from '../net/api.js';
import { useApp } from '../state/app.js';
import { Badge, Button, Card, Field, Row, S, Screen, Title } from '../ui/kit.js';

const STATUS_AR: Record<string, string> = {
  DRAFT: 'مسودة',
  SUBMITTED: 'مُقدَّم',
  APPROVED: 'معتمد',
  ASSIGNED: 'مُسند',
  IN_PROGRESS: 'قيد التنفيذ',
  ON_HOLD: 'متوقف',
  AWAITING_PARTS: 'بانتظار قطعة',
  AWAITING_PERMIT: 'بانتظار تصريح',
  COMPLETED: 'مُنجَز',
  CLOSED: 'مغلق',
  CANCELLED: 'ملغي',
  REJECTED: 'مرفوض',
};
const PRIORITY_AR: Record<string, string> = {
  EMERGENCY: 'طارئ',
  URGENT: 'عاجل',
  HIGH: 'عالٍ',
  MEDIUM: 'متوسط',
  LOW: 'منخفض',
  ROUTINE_PM: 'PM',
};

interface RowT {
  id: string;
  number: string;
  title: string;
  status: WoState;
  priority: string;
  subDept: string | null;
  syncSeq: number;
  local: boolean;
}

export function TasksScreen() {
  const { sync, repo, access, online, bump } = useApp();
  const [filter, setFilter] = useState<'open' | 'mine' | 'all'>('open');
  const [note, setNote] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ title: '', description: '', equipmentTag: '', priority: 'HIGH', requestedSubDeptCode: 'MAINT-ROT', sourceType: 'BREAKDOWN' });
  const [local, setLocal] = useState<Array<{ id: string; data: Record<string, unknown>; deleted: boolean }>>([]);

  /** القراءة من Store المحلي (SQLite) — نفس المصدر الذي يكتبه SyncClient، فلا ازدواج في المصدر */
  const reload = async () => {
    const ids = await sync.store.listIds('workOrder');
    const rows: Array<{ id: string; data: Record<string, unknown>; deleted: boolean }> = [];
    for (const id of ids) {
      const rec = await sync.store.read('workOrder', id);
      if (rec) rows.push({ id: rec.id, data: rec.data, deleted: rec.deleted });
    }
    setLocal(rows);
  };

  useEffect(() => {
    void reload();
    const t = setInterval(() => void reload(), 8_000);
    return () => clearInterval(t);
  }, []);

  const rows = useMemo<RowT[]>(() => {
    const out: RowT[] = [];
    for (const rec of local) {
      if (rec.deleted) continue;
      const d = rec.data as Record<string, any>;
      const status = (d.status ?? 'SUBMITTED') as WoState;
      if (filter === 'open' && ['CLOSED', 'CANCELLED', 'REJECTED'].includes(status)) continue;
      out.push({
        id: rec.id,
        number: String(d.number ?? 'محلي'),
        title: String(d.title ?? ''),
        status,
        priority: String(d.priority ?? 'MEDIUM'),
        subDept: (d.subDept?.nameAr ?? d.requestedSubDeptCode ?? null) as string | null,
        syncSeq: Number(d.syncSeq ?? 0),
        local: d.isOfflineCreated === true,
      });
    }
    return out.sort((a, b) => PRIORITIES.indexOf(a.priority as never) - PRIORITIES.indexOf(b.priority as never));
  }, [filter, local]);

  const pullTasks = async () => {
    setMsg('جارٍ سحب المهام من الخادم…');
    try {
      const r = await sync.client.syncOnce();
      const res = await apiFetch<{ items: any[] }>('/v1/maintenance/work-orders', { query: { take: 40, onlyMy: filter === 'mine' ? 'true' : undefined } });
      for (const wo of res.items ?? []) {
        await sync.store.write('workOrder', String(wo.id), { id: String(wo.id), version: wo.version ?? 1, deleted: false, data: { ...wo, isOfflineCreated: false } });
      }
      setMsg(`سُحبت ${res.items?.length ?? 0} مهمة (cursor ${r.cursor}).`);
      await reload();
    } catch (e) {
      setMsg(String((e as Error).message));
    }
  };

  const create = async () => {
    const body = { ...draft, equipmentTag: draft.equipmentTag || undefined, priority: draft.priority, sourceType: draft.sourceType, requestedSubDeptCode: draft.requestedSubDeptCode, requirePermit: false };
    const parsed = workOrderCreateDto.safeParse(body);
    if (!parsed.success) {
      setMsg(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('، '));
      return;
    }
    await repo.createWorkOrder(parsed.data);
    setCreating(false);
    setDraft({ ...draft, title: '', description: '', equipmentTag: '' });
    setMsg('أُضيف الأمر إلى الطابور' + (online ? ' — سيُدفع الآن' : ' — سيُدفع عند عودة الشبكة'));
    bump();
    await reload();
  };

  return (
    <Screen>
      <Title text="مهامي" sub={online ? 'متصل بالخادم' : 'دون اتصال — العرض من ذاكرة الجهاز'} />
      <Row>
        <Button label="تحديث" onPress={() => void pullTasks()} ghost={!online} />
        {access.can('maint.wo.create') ? <Button label="أمر عمل جديد" onPress={() => setCreating((v) => !v)} /> : null}
        <Button label={filter === 'open' ? 'المفتوحة' : filter === 'mine' ? 'المسندة إليّ' : 'الكل'} onPress={() => setFilter(filter === 'open' ? 'mine' : filter === 'mine' ? 'all' : 'open')} ghost />
      </Row>

      {creating ? (
        <Card>
          <Text style={S.h2}>عنوان الطلب</Text>
          <Field label="العنوان" value={draft.title} onChange={(v) => setDraft({ ...draft, title: v })} placeholder="تسريب من مضخة" />
          <Field label="الأعراض/الوصف" value={draft.description} onChange={(v) => setDraft({ ...draft, description: v })} multiline />
          <Row>
            <Field label="رقم المعدة" value={draft.equipmentTag} onChange={(v) => setDraft({ ...draft, equipmentTag: v })} placeholder="101-P-101A" />
            <Field label="الشعبة" value={draft.requestedSubDeptCode} onChange={(v) => setDraft({ ...draft, requestedSubDeptCode: v })} placeholder="MAINT-ROT" />
          </Row>
          <Row>
            <Badge label={PRIORITY_AR[draft.priority] ?? draft.priority} tone="warn" />
            <Button label="إرسال الطلب" onPress={() => void create()} />
            <Button label="إلغاء" onPress={() => setCreating(false)} ghost />
          </Row>
        </Card>
      ) : null}

      {msg ? <Text style={S.ok}>{msg}</Text> : null}

      {rows.length === 0 ? <Card><Text style={S.dim}>لا توجد مهام محليًا — اسحب من الخادم عند توفر الشبكة.</Text></Card> : null}
      {rows.map((r) => (
        <Card key={r.id}>
          <Row>
            <Text style={S.h2}>{r.number}</Text>
            <Badge label={STATUS_AR[r.status] ?? r.status} tone={r.status === 'CLOSED' ? 'dim' : 'ok'} />
            <Badge label={PRIORITY_AR[r.priority] ?? r.priority} tone={r.priority === 'EMERGENCY' ? 'bad' : 'warn'} />
            {r.local ? <Badge label="محلي — غير مُرسَل" tone="warn" /> : null}
          </Row>
          <Text style={S.p}>{r.title}</Text>
          <Text style={S.dim}>{r.subDept ?? '—'}</Text>
          <View style={{ height: 6 }} />
          <Row>
            <Button
              label="إقرار استلام"
              ghost
              onPress={() => {
                void repo.acknowledgeWorkOrder(r.id, `استلم الفني المهمة ${new Date().toLocaleString('ar-IQ')}`).then(() => {
                  setMsg('سُجّل الإقرار محليًا (append)');
                  bump();
                });
              }}
            />
            <Button label={selected === r.id ? 'طيّ' : 'ملاحظة/صورة'} onPress={() => setSelected(selected === r.id ? null : r.id)} ghost />
          </Row>
          {selected === r.id ? (
            <View style={{ marginTop: 8 }}>
              <Field label="ملاحظة ميدانية (تُلحق بملاحظات الفريق)" value={note} onChange={setNote} multiline />
              <Button
                label="حفظ الملاحظة"
                onPress={() => {
                  void repo.appendNote(r.id, note).then(() => {
                    setNote('');
                    setMsg('حُفظت محليًا — الخادم يُلحقها ولا يمحو غيرها');
                    bump();
                  });
                }}
              />
            </View>
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}
