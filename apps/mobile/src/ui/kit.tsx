/** عناصر واجهة صغيرة (بديل خفيف عن مكتبات UI) + سمة داكنة موحّدة مع واجهة المكتب */
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

export const C = {
  bg: '#0f1720',
  panel: '#16212e',
  panel2: '#1d2b3a',
  line: '#26394d',
  text: '#e8eef5',
  dim: '#93a6bb',
  ok: '#37c98b',
  warn: '#f0b429',
  bad: '#ef6461',
  accent: '#4aa3ff',
};

export const S = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg, padding: 12 },
  card: { backgroundColor: C.panel, borderColor: C.line, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  h1: { color: C.text, fontSize: 18, fontWeight: '700', marginBottom: 6 },
  h2: { color: C.text, fontSize: 15, fontWeight: '600', marginBottom: 4 },
  p: { color: C.text, fontSize: 14, lineHeight: 22 },
  dim: { color: C.dim, fontSize: 12 },
  ok: { color: C.ok, fontSize: 12 },
  warn: { color: C.warn, fontSize: 12 },
  bad: { color: C.bad, fontSize: 12 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  input: {
    backgroundColor: '#101c28',
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 8,
    color: C.text,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 42,
    fontSize: 14,
  },
  btn: { backgroundColor: C.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  btnTxt: { color: '#04121f', fontWeight: '700', fontSize: 14 },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  btnGhostTxt: { color: C.text, fontSize: 13 },
  badge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  badgeTxt: { fontSize: 11 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  tabBar: { flexDirection: 'row', backgroundColor: C.panel, borderTopWidth: 1, borderTopColor: C.line },
});

export function Card({ children, style }: { children?: any; style?: any;
  key?: any;
  id?: any;
  testID?: any;
}) {
  return <View style={[S.card, style]}>{children}</View>;
}

export function Row({ children, style }: { children?: any; style?: any;
  key?: any;
  id?: any;
  testID?: any;
}) {
  return <View style={[S.row, style]}>{children}</View>;
}


export function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  keyboardType = 'default',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad';
  key?: any;
}) {
  return (
    <View style={{ marginBottom: 8, flex: 1, minWidth: 140 }}>
      <Text style={S.dim}>{label}</Text>
      <TextInput
        style={[S.input, multiline ? { minHeight: 88, textAlignVertical: 'top' } : null]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.dim}
        multiline={multiline}
        keyboardType={keyboardType}
      />
    </View>
  );
}

export function Button({ label, onPress, ghost, disabled }: { label: string; onPress: () => void; ghost?: boolean; disabled?: boolean;
  key?: any;
  id?: any;
  testID?: any;
}) {
  return (
    <Pressable onPress={disabled ? undefined : onPress} style={ghost ? S.btnGhost : S.btn}>
      <Text style={ghost ? S.btnGhostTxt : S.btnTxt}>{label}</Text>
    </Pressable>
  );
}

export function Badge({ label, tone = 'dim', numberOfLines }: { label: string; tone?: 'dim' | 'ok' | 'warn' | 'bad'; numberOfLines?: any;
  key?: any;
  id?: any;
  testID?: any;
}) {
  const color = tone === 'ok' ? C.ok : tone === 'warn' ? C.warn : tone === 'bad' ? C.bad : C.dim;
  return (
    <View style={[S.badge, { borderColor: color }]}>
      <Text style={[S.badgeTxt, { color }]}>{label}</Text>
    </View>
  );
}

export function Screen({ children, contentContainerStyle }: { children?: any; contentContainerStyle?: any; key?: any }) {
  return (
    <ScrollView style={S.screen} contentContainerStyle={contentContainerStyle ?? { paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function Title({ text, sub }: { text: string; sub?: string; key?: any }) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={S.h1}>{text}</Text>
      {sub ? <Text style={S.dim}>{sub}</Text> : null}
    </View>
  );
}
