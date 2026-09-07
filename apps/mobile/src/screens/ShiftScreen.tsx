/**
 * سجل الوردية الإنتاجية: وحدة (يوريا/أمونيا/أبراج تبريد/منافع/مختبر) + تاريخ + رمز الوردية
 * + أحداث + قراءات عمليات. التحقق بنفس مخطط الخادم، والكتابة محليًا ثم للدفع.
 */
import { useState } from 'react';
import { Text, View } from 'react-native';
import { SHIFT_CODES, shiftLogDto, type ShiftLogDto } from '@newport/domain';
import { useApp } from '../state/app.js';
import { Badge, Button, Card, Field, Row, S, Screen, Title } from '../ui/kit.js';

const UNITS = ['UREA', 'AMMONIA', 'COOLING_TOWER', 'UTILITY', 'LAB'] as const;
const UNIT_AR: Record<string, string> = {
  UREA: 'اليوريا',
  AMMONIA: 'الأمونيا',
  COOLING_TOWER: 'أبراج التبريد',
  UTILITY: 'المنافع',
  LAB: 'المختبر',
};

interface ParamRow {
  paramCode: string;
  value: string;
  unit: string;
}

export function ShiftScreen() {
  const { repo, sync, online, bump } = useApp();
  const [unit, setUnit] = useState<(typeof UNITS)[number]>('UREA');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [shift, setShift] = useState<string>(SHIFT_CODES[0] ?? 'A');
  const [tons, setTons] = useState('');
  const [availability, setAvailability] = useState('');
  const [notes, setNotes] = useState('');
  const [events, setEvents] = useState('');
  const [params, setParams] = useState<ParamRow[]>([{ paramCode: '401-FIC-101', value: '', unit: 't/h' }]);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async () => {
    const body: ShiftLogDto = {
      unitCode: unit,
      shiftDate: date,
      shiftCode: shift as ShiftLogDto['shiftCode'],
      productionTons: tons.trim() ? Number(tons) : undefined,
      availabilityPct: availability.trim() ? Number(availability) : undefined,
      notes: notes.trim() || undefined,
      events: events
        .split('\n')
        .map((t) => t.trim())
        .filter(Boolean)
        .map((text) => ({ at: new Date().toISOString(), text })),
      params: params
        .filter((p) => p.paramCode.trim() && p.value.trim())
        .map((p) => ({ paramCode: p.paramCode.trim(), value: Number(p.value), unit: p.unit || '%' })),
    };
    try {
      await repo.submitShiftLog(body);
      setMsg(`حُفظ سجل وردية ${UNIT_AR[unit] ?? unit} (${shift}) — ${online ? 'سيُدفع الآن' : 'في الطابور'}`);
      setNotes('');
      setEvents('');
      setTons('');
      setAvailability('');
      bump();
      void sync.nudge();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  return (
    <Screen>
      <Title text="سجل الوردية" sub="يُقبله رئيس الشعبة/مشرف الوردية على الخادم عند الاعتماد" />
      <Card>
        <Row>
          {UNITS.map((u) => (
            <Badge key={u} label={UNIT_AR[u] ?? u} tone={u === unit ? 'ok' : 'dim'} />
          ))}
        </Row>
        <View style={{ marginTop: 6 }}>
          <Row>
            <Button label="◀ الوحدة" onPress={() => setUnit(UNITS[(UNITS.indexOf(unit) + UNITS.length - 1) % UNITS.length] ?? 'UREA')} ghost />
            <Button label="الوحدة ▶" onPress={() => setUnit(UNITS[(UNITS.indexOf(unit) + 1) % UNITS.length] ?? 'UREA')} ghost />
            <Button label={`الوردية ${shift}`} onPress={() => setShift(SHIFT_CODES[(SHIFT_CODES.indexOf(shift as never) + 1) % SHIFT_CODES.length] ?? 'A')} ghost />
          </Row>
        </View>
        <Row>
          <Field label="التاريخ" value={date} onChange={setDate} placeholder="YYYY-MM-DD" />
          <Field label="الإنتاج (طن)" value={tons} onChange={setTons} keyboardType="decimal-pad" />
          <Field label="الجاهزية %" value={availability} onChange={setAvailability} keyboardType="decimal-pad" />
        </Row>
        <Field label="أحداث الوردية (سطر لكل حدث)" value={events} onChange={setEvents} multiline />
        <Field label="ملاحظات" value={notes} onChange={setNotes} multiline />
      </Card>

      <Card>
        <Text style={S.h2}>قراءات العمليات</Text>
        {params.map((p, i) => (
          <Row key={i}>
            <Field label="الرمز" value={p.paramCode} onChange={(v) => setParams(params.map((x, j) => (j === i ? { ...x, paramCode: v } : x)))} />
            <Field label="القيمة" value={p.value} onChange={(v) => setParams(params.map((x, j) => (j === i ? { ...x, value: v } : x)))} keyboardType="decimal-pad" />
            <Field label="الوحدة" value={p.unit} onChange={(v) => setParams(params.map((x, j) => (j === i ? { ...x, unit: v } : x)))} />
          </Row>
        ))}
        <Row>
          <Button label="+ قراءة" onPress={() => setParams([...params, { paramCode: '', value: '', unit: 't/h' }])} ghost />
          <Button
            label="حفظ السجل"
            onPress={() => {
              void submit();
            }}
          />
          <Button
            label="تفريغ الحقول"
            ghost
            onPress={() => {
              const r = shiftLogDto.safeParse({ unitCode: unit, shiftDate: date, shiftCode: shift, events: [], params: [] });
              setMsg(r.success ? 'المخطط سليم — يمكن الحفظ' : r.error.issues.map((i) => i.message).join('، '));
            }}
          />
        </Row>
        {msg ? <Text style={S.ok}>{msg}</Text> : null}
      </Card>
    </Screen>
  );
}
