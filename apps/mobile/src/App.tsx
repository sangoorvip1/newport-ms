/**
 * نقطة الدخول: بوابة جلسة + أشرطة تبويب مبنية على الصلاحيات.
 * ملاحظة معمارية: كل الشاشات تعمل بلا شبكة (تقرأ SQLite المحلي)؛ التبويب الإضافي يظهر حسب
 * الصلاحيات المحفوظة من آخر جلسة مُصدَّقة — والخادم يبقى صاحب القرار النهائي في كل طلب.
 */
import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { FieldRepo } from './data/fieldRepo.js';
import { restoreSession } from './net/api.js';
import { LoginScreen } from './screens/LoginScreen.js';
import { ShiftScreen } from './screens/ShiftScreen.js';
import { SyncScreen } from './screens/SyncScreen.js';
import { TasksScreen } from './screens/TasksScreen.js';
import { AppContext, type AppCtxValue, type ScreenName } from './state/app.js';
import { FieldSync } from './state/sync.js';

const TABS: Array<{ id: ScreenName; label: string; permission?: string }> = [
  { id: 'tasks', label: 'المهام' },
  { id: 'shift', label: 'الوردية', permission: 'prod.log.create' },
  { id: 'sync', label: 'المزامنة' },
];

export function App() {
  const [sync, setSync] = useState<FieldSync | null>(null);
  const [authed, setAuthed] = useState(false);
  const [screen, setScreen] = useState<ScreenName>('tasks');
  const [status, setStatus] = useState({ online: true, pending: 0, conflicts: 0 });
  const [restricted, setRestricted] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    void (async () => {
      const s = await FieldSync.create();
      setSync(s);
      s.subscribe((st) => setStatus({ online: st.online, pending: st.pending, conflicts: st.conflicts }));
      const has = await restoreSession();
      if (has) {
        await s.loadMe();
        if (s.restricted) {
          // جلسة مقيدة (كلمة مرور افتراضية): نعرض شاشة التغيير ولا نشغّل دورة المزامنة
          setRestricted(true);
          return;
        }
        await s.start();
        setAuthed(true);
      }
    })();
  }, []);

  const value = useMemo<AppCtxValue | null>(() => {
    if (!sync) return null;
    return {
      sync,
      repo: new FieldRepo(sync),
      access: sync.access,
      online: status.online,
      pending: status.pending,
      conflicts: status.conflicts,
      screen,
      go: setScreen,
      bump: () => setTick((t) => t + 1),
    };
  }, [sync, status, screen, tick]);

  if (!value) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0f1720', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#93a6bb' }}>جارٍ فتح قاعدة بيانات الجهاز…</Text>
      </View>
    );
  }

  const tabs = TABS.filter((t) => !t.permission || value.access.can(t.permission));

  return (
    <AppContext.Provider value={value}>
      {!authed ? (
        <LoginScreen
          restricted={restricted}
          onDone={async () => {
            setRestricted(false);
            await sync?.loadMe();
            await sync?.start();
            setAuthed(true);
          }}
        />
      ) : (
        <View style={{ flex: 1, backgroundColor: '#0f1720' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 10 }}>
            <Text style={{ color: '#e8eef5', fontWeight: '700' }}>{value.access.roles[0] ?? 'مستخدم الميدان'}</Text>
            <Text style={{ color: status.online ? '#37c98b' : '#ef6461', fontSize: 12 }}>
              {status.online ? 'متصل' : 'دون اتصال'} · {status.pending} معلق
            </Text>
          </View>
          {screen === 'tasks' ? <TasksScreen /> : null}
          {screen === 'shift' ? <ShiftScreen /> : null}
          {screen === 'sync' ? <SyncScreen /> : null}
          <View style={{ flexDirection: 'row', backgroundColor: '#16212e', borderTopWidth: 1, borderTopColor: '#26394d' }}>
            {tabs.map((t) => (
              <Text key={t.id} onPress={() => value.go(t.id)} style={{ flex: 1, textAlign: 'center', paddingVertical: 12, color: t.id === screen ? '#4aa3ff' : '#93a6bb' }}>
                {t.label}
                {t.id === 'sync' && status.conflicts ? ` (${status.conflicts})` : ''}
              </Text>
            ))}
          </View>
        </View>
      )}
    </AppContext.Provider>
  );
}
