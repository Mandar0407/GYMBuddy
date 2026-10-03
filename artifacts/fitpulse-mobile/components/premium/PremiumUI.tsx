import React, { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { usePremium } from '@/providers/PremiumProvider';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';

export function Box({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const c = useColors();
  return <View style={[styles.box, { backgroundColor: c.card, borderColor: c.border }]}>
    <Text style={[styles.title, { color: c.foreground }]}>{title}</Text>
    {!!subtitle && <Copy>{subtitle}</Copy>}{children}
  </View>;
}
export function Copy({ children, error = false }: { children: ReactNode; error?: boolean }) {
  const c = useColors();
  return <Text accessibilityRole={error ? 'alert' : undefined} style={[styles.copy, { color: error ? c.destructive : c.mutedForeground }]}>{children}</Text>;
}
export function Button({ children, onPress, secondary = false, disabled = false, testID }: {
  children: ReactNode; onPress: () => void; secondary?: boolean; disabled?: boolean; testID?: string;
}) {
  const c = useColors(); const p = usePremium();
  const label=React.Children.toArray(children).map(child=>typeof child==='string'||typeof child==='number'?String(child):'').join('');
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} accessibilityLabel={label} testID={testID} disabled={disabled}
    onPress={() => { if (p.settings.haptics && Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => {}); onPress(); }}
    style={({ pressed }) => [styles.button, { backgroundColor: secondary ? c.secondary : c.accent, opacity: pressed || disabled ? .55 : 1 }]}>
    <Text style={[styles.buttonText, { color: secondary ? c.secondaryForeground : c.accentForeground }]}>{children}</Text>
  </Pressable>;
}
export function Input({ label, value, onChange, numeric, testID, multiline = false }: {
  label: string; value: string; onChange: (value: string) => void; numeric?: boolean; testID?: string; multiline?: boolean;
}) {
  const c = useColors();
  return <View style={{ gap: 7 }}><Text style={[styles.label, { color: c.foreground }]}>{label}</Text>
    <TextInput accessibilityLabel={label} testID={testID} value={value} onChangeText={onChange} keyboardType={numeric ? 'decimal-pad' : 'default'}
      multiline={multiline} maxLength={multiline ? 20000 : 120} placeholderTextColor={c.mutedForeground}
      style={[styles.input, { color: c.foreground, backgroundColor: c.background, borderColor: c.border, minHeight: multiline ? 100 : 48 }]} /></View>;
}
export function Choice({ values, value, onChange, testID }: { values: string[]; value: string; onChange: (value: string) => void; testID?: string }) {
  const c = useColors();
  return <View style={styles.row}>{values.map(v => <Pressable accessibilityRole="radio" accessibilityState={{ selected: v === value }}
    testID={testID ? `${testID}-${v.replace(/\s/g,'-')}` : undefined} key={v} onPress={() => onChange(v)}
    style={[styles.pill, { backgroundColor: v === value ? c.accent : c.secondary }]}>
    <Text style={[styles.buttonText, { color: v === value ? c.accentForeground : c.secondaryForeground }]}>{v}</Text></Pressable>)}</View>;
}
export function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const c = useColors(); const insets = useSafeAreaInsets();
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => sub.remove();
  }, []);
  return <Modal visible={visible} transparent animationType={reduced ? 'none' : 'slide'} onRequestClose={onClose}>
    <View style={[styles.backdrop, { paddingTop: Platform.OS === 'web' ? 67 : insets.top + 12 }]}>
      <View style={[styles.sheet, { backgroundColor: c.background, borderColor: c.border }]}>
        <View style={[styles.sheetHeader, { borderBottomColor: c.border }]}>
          <Text style={[styles.title, { color: c.foreground, flex: 1 }]}>{title}</Text>
          <Pressable onPress={onClose} accessibilityLabel={`Close ${title}`} testID="close-premium-sheet" style={{ padding: 12 }}><Feather name="x" size={22} color={c.foreground} /></Pressable>
        </View>
        <KeyboardAwareScrollViewCompat style={{ flex: 1 }} bottomOffset={30} keyboardDismissMode="on-drag" contentContainerStyle={{ padding: 20, paddingBottom: Math.max(insets.bottom,34)+24, gap: 16 }}>
          {children}
        </KeyboardAwareScrollViewCompat>
      </View>
    </View>
  </Modal>;
}
export const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 22, padding: 18, gap: 12 },
  title: { fontFamily: 'DMSans_700Bold', fontSize: 21, lineHeight: 27, letterSpacing: -.6 },
  copy: { fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 20 },
  label: { fontFamily: 'DMSans_700Bold', fontSize: 13 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { minHeight: 46, paddingHorizontal: 15, paddingVertical: 13, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  buttonText: { fontFamily: 'DMSans_700Bold', fontSize: 13 },
  pill: { minHeight: 42, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontFamily: 'DMSans_400Regular', fontSize: 16 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.45)', justifyContent: 'flex-end' },
  sheet: { flex: 1, maxHeight: '96%', width: '100%', maxWidth: 640, alignSelf: 'center', borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, overflow: 'hidden' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1 },
});