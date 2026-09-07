/**
 * شاشة الدخول في الميدان: خادم + مستخدم + كلمة مرور.
 * المرحلة الثانية (اضطورية): لو كانت كلمة المرور هي الافتراضية المزروعة يرفض الخادم كل
 * مسارات البيانات حتى التغيير — لذا نعرض نموذج التغيير هنا ثم نُكمل الدخول تلقائيًا.
 */
import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { loginDto } from '@newport/domain';
import { changePassword, getBaseUrl, login, setBaseUrl } from '../net/api.js';
import { Badge, Button, Card, S, Screen, Title } from '../ui/kit.js';

function passwordProblems(next: string): string[] {
  const out: string[] = [];
  if (next.length < 10) out.push('10 أحرف على الأقل');
  if (!/[A-Za-z]/.test(next)) out.push('حرف لاتيني واحد على الأقل');
  if (!/[0-9]/.test(next)) out.push('رقم واحد على الأقل');
  return out;
}

export function LoginScreen({ onDone, restricted: restrictedProp }: { onDone: () => Promise<void> | void; restricted?: boolean }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [server, setServer] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [currentServer, setCurrentServer] = useState('');
  const [pending, setPending] = useState<{ username: string; password: string } | null>(null);

  // جلسة مُستعادة بكلمة مرور افتراضية: ابدأ مباشرة من مرحلة التغيير
  useEffect(() => {
    if (restrictedProp) setMsg('كلمة المرور الحالية افتراضية — غيّرها للمتابعة');
  }, [restrictedProp]);

  useEffect(() => {
    void getBaseUrl().then((b) => {
      setCurrentServer(b);
      setServer((prev) => prev || b.replace(/:\d+$/, ''));
    });
  }, []);

  const submit = async () => {
    const parsed = loginDto.safeParse({ username, password, deviceId: 'mobile', platform: 'ANDROID' });
    if (!parsed.success) {
      setMsg(parsed.error.issues.map((i) => `${String(i.path[0])}: ${i.message}`).join('، '));
      return;
    }
    setBusy(true);
    try {
      if (server.trim()) await setBaseUrl(server.trim());
      const session = await login(username.trim(), password);
      setMsg(null);
      if (session.mustChangePwd) {
        setPending({ username: username.trim(), password });
        return; // نعرض نموذج تغيير كلمة المرور بدل الدخول المقيد
      }
      await onDone();
    } catch (e) {
      setMsg(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  if (pending) {
    return <ChangePasswordForm user={pending} onBusy={setBusy} onMsg={setMsg} msg={msg} busy={busy} onDone={onDone} />;
  }

  return (
    <Screen>
      <Title text="Newport —_FIELD" sub="معمل الأسمدة الجنوبية / الخط الأول" />
      <Card>
        <Text style={S.dim}>اسم المستخدم</Text>
        <TextInput style={S.input} value={username} onChangeText={setUsername} autoCapitalize="none" placeholder="heat.tech" />
        <Text style={[S.dim, { marginTop: 8 }]}>كلمة المرور</Text>
        <TextInput style={S.input} value={password} onChangeText={setPassword} secureTextEntry />
        <Text style={[S.dim, { marginTop: 8 }]}>عنوان خادم المعمل (اختياري)</Text>
        <TextInput
          style={S.input}
          value={server}
          onChangeText={setServer}
          autoCapitalize="none"
          placeholder={currentServer || 'http://192.168.10.20:3000'}
        />
        {msg ? <Text style={S.bad}>{msg}</Text> : null}
        <View style={[S.row, { marginTop: 10 }]}>
          <Button label={busy ? 'جارٍ الدخول…' : 'دخول'} onPress={() => void submit()} disabled={busy} />
          <Badge label="يعمل دون اتصال: السجلات تُحفظ على الجهاز" tone="warn" />
        </View>
      </Card>
    </Screen>
  );
}

function ChangePasswordForm({
  user,
  msg,
  busy,
  onBusy,
  onMsg,
  onDone,
}: {
  user: { username: string; password: string };
  msg: string | null;
  busy: boolean;
  onBusy(v: boolean): void;
  onMsg(v: string | null): void;
  onDone(): Promise<void> | void;
}) {
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const problems = passwordProblems(next);
  const mismatch = confirm.length > 0 && confirm !== next;

  const submit = async () => {
    if (problems.length || mismatch) {
      onMsg(problems.length ? `متطلبات: ${problems.join('، ')}` : 'التأكيد غير مطابق');
      return;
    }
    onBusy(true);
    try {
      await changePassword(user.password, next);
      await login(user.username, next); // الرمز القديم أُبطل — نُعيد المصادقة بالجديدة
      onMsg(null);
      await onDone();
    } catch (e) {
      onMsg(String((e as Error).message));
    } finally {
      onBusy(false);
    }
  };

  return (
    <Screen>
      <Title text="تغيير كلمة المرور الإلزامي" sub={user.username} />
      <Card>
        <Text style={S.dim}>كلمة المرور الجديدة</Text>
        <TextInput style={S.input} value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" />
        <Text style={[S.dim, { marginTop: 8 }]}>تأكيد الجديدة</Text>
        <TextInput style={S.input} value={confirm} onChangeText={setConfirm} secureTextEntry autoCapitalize="none" />
        {next.length > 0 && problems.length > 0 ? <Text style={S.warn}>{`متطلبات: ${problems.join('، ')}`}</Text> : null}
        {mismatch ? <Text style={S.bad}>التأكيد غير مطابق</Text> : null}
        {msg ? <Text style={S.bad}>{msg}</Text> : null}
        <View style={[S.row, { marginTop: 10 }]}>
          <Button label={busy ? 'جارٍ الحفظ…' : 'حفظ ومتابعة'} onPress={() => void submit()} disabled={busy} />
          <Badge label="بعدها تُفتح بقية الشاشات" tone="ok" />
        </View>
      </Card>
    </Screen>
  );
}
