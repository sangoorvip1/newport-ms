/** شاشة المزامنة في الميدان: عدّادات، طابور، تعارضات بقرار واحد، وإعدادات الخادم/إعادة المزامنة */
import { useCallback, useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import type { LocalConflict, PendingOp } from '@newport/domain';
import { getBaseUrl, setBaseUrl } from '../net/api.js';
import { useApp } from '../state/app.js';
import { Badge, Button, Card, Field, Row, S, Screen, Title } from '../ui/kit.js';

export function SyncScreen() {
  const { sync, pending, conflicts, online } = useApp();
  const [queue, setQueue] = useState<PendingOp[]>([]);
  const [list, setList] = useState<LocalConflict[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [server, setServer] = useState('');
  const [auto, setAuto] = useState(true);

  const load = useCallback(async () => {
    setQueue(await sync.store.pending());
    setList(await sync.client.conflicts());
    setServer((await getBaseUrl()) ?? '');
  }, [sync]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 6_000);
    return () => clearInterval(t);
  }, [load]);

  const decide = async (c: LocalConflict, side: 'local' | 'server') => {
    await sync.client.resolveConflict(c.opId, side);
    setMsg(side === 'local' ? 'أُعيد جدولة نسختك' : 'اعتُمدت نسخة الخادم');
    await load();
  };

  return (
    <Screen>
      <Title text="المزامنة" sub="الطابور المحلي والتعارضات وإعدادات الاتصال" />
      <Card>
        <Row>
          <Badge label={online ? 'متصل' : 'دون اتصال'} tone={online ? 'ok' : 'bad'} />
          <Badge label={`${pending} عملية معلقة`} tone={pending ? 'warn' : 'dim'} />
          <Badge label={`${conflicts} تعارض`} tone={conflicts ? 'warn' : 'dim'} />
          <Badge label={`cursor ${sync.status.lastReport?.cursor ?? 0}`} />
        </Row>
        <View style={{ height: 8 }} />
        <Row>
          <Button label="مزامنة الآن" onPress={() => void sync.run().then(() => load())} />
          <Button label="سحب كامل" ghost onPress={() => void sync.forceFullResync().then((r) => {
            setMsg(`سُحبت ${r.pulled} تغييرات بعد إعادة المزامنة`);
            void load();
          })} />
          <View style={[S.row, { gap: 4 }]}>
            <Switch value={auto} onValueChange={(v: boolean) => {
              setAuto(v);
              if (v) void sync.start();
              else sync.stop();
            }} />
            <Text style={S.dim}>دوري</Text>
          </View>
        </Row>
        {sync.status.lastError ? <Text style={S.bad}>{sync.status.lastError}</Text> : null}
        {msg ? <Text style={S.ok}>{msg}</Text> : null}
      </Card>

      <Card>
        <Text style={S.h2}>طابور الدفع ({queue.length})</Text>
        {queue.length === 0 ? <Text style={S.dim}>فارغ — كل شيء مُدفع</Text> : null}
        {queue.map((p) => (
          <View key={p.op.opId} style={{ marginBottom: 6 }}>
            <Text style={S.p}>
              {p.op.entity} · {p.op.kind}
            </Text>
            <Text style={S.dim}>
              محاولات {p.attempts}
              {p.lastError ? ` — ${p.lastError}` : ''}
            </Text>
          </View>
        ))}
      </Card>

      <Card>
        <Text style={S.h2}>تعارضات ({list.length})</Text>
        {list.length === 0 ? <Text style={S.dim}>سياسة الدمج حسمت كل شيء آليًا</Text> : null}
        {list.map((c) => (
          <View key={c.opId} style={{ borderBottomWidth: 1, borderBottomColor: S.card.borderColor, paddingVertical: 8 }}>
            <Text style={S.p}>{c.reasonAr}</Text>
            <Text style={S.dim} numberOfLines={3}>
              {JSON.stringify(c.client).slice(0, 160)}
            </Text>
            <Text style={S.dim} numberOfLines={3}>
              {JSON.stringify(c.server ?? {}).slice(0, 160)}
            </Text>
            <Row>
              <Button label="نسختي" onPress={() => void decide(c, 'local')} />
              <Button label="نسخة الخادم" onPress={() => void decide(c, 'server')} ghost />
            </Row>
          </View>
        ))}
      </Card>

      <Card>
        <Text style={S.h2}>عنوان الخادم</Text>
        <Field label="API base URL" value={server} onChange={setServer} placeholder="http://192.168.10.20:3000" />
        <Button
          label="حفظ العنوان"
          onPress={() => {
            void setBaseUrl(server).then(() => {
              setMsg('حُفظ العنوان — جرّب مزامنة الآن');
              void load();
            });
          }}
        />
      </Card>
    </Screen>
  );
}
