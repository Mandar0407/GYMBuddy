import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, AppState, Linking, Platform, Pressable, ScrollView, StyleSheet,
  Text, TextInput, View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import {
  getMovement, putMovementNative, useGetMovement, useAddMovementManual,
  usePutMovementSettings, getGetMovementQueryKey,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';

const PAIR_KEY = 'fitpulsePairKey';
const blank = () => Array(24).fill(0) as number[];
const total = (hours: number[]) => hours.reduce((sum, count) => sum + count, 0);
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

type SensorState = 'checking' | 'needs-permission' | 'denied' | 'unavailable' | 'reading' | 'ready' | 'error';
type NativeDay = { date: string; hours: number[] };

export default function MovementScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [key, setKey] = useState('');
  const [pairInput, setPairInput] = useState('');
  const [pairError, setPairError] = useState('');
  const [sensor, setSensor] = useState<SensorState>(Platform.OS === 'ios' ? 'checking' : 'unavailable');
  const [canAskMotion, setCanAskMotion] = useState(false);
  const [nativeDays, setNativeDays] = useState<NativeDay[]>([]);
  const [syncError, setSyncError] = useState('');
  const [manualInput, setManualInput] = useState('');
  const [message, setMessage] = useState('');
  const [goalInput, setGoalInput] = useState('');
  const [saving, setSaving] = useState(false);
  const autoReadKey = useRef<string | null>(null);
  const request = { headers: { Authorization: `Bearer ${key}` } };
  const movement = useGetMovement({ query: { queryKey: [...getGetMovementQueryKey(), key], enabled: !!key, retry: false, refetchOnWindowFocus: true, refetchInterval: 45_000 }, request });
  const addManual = useAddMovementManual({ request });
  const saveSettings = usePutMovementSettings({ request });
  const refreshRemote = () => queryClient.invalidateQueries({ queryKey: getGetMovementQueryKey() });
  const today = dateKey(new Date());
  const remoteToday = movement.data?.days.find((day) => day.date === today);
  const localToday = nativeDays.find((day) => day.date === today);
  const nativeHours = localToday?.hours ?? remoteToday?.nativeHours ?? blank();
  const manualHours = remoteToday?.manualHours ?? blank();
  const hourly = nativeHours.map((value, index) => value + manualHours[index]);
  const steps = total(hourly);
  const goal = movement.data?.goal ?? 10000;
  const stride = movement.data?.strideCm ?? 74;
  const weight = movement.data?.weightKg ?? 68;
  const progress = Math.min(100, Math.round(steps / goal * 100));
  const distance = steps * stride / 100000;
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const day = dateKey(date);
    const remote = movement.data?.days.find((item) => item.date === day);
    const local = nativeDays.find((item) => item.date === day);
    return {
      label: new Intl.DateTimeFormat('en', { weekday: 'short' }).format(date),
      value: total(local?.hours ?? remote?.nativeHours ?? blank()) + total(remote?.manualHours ?? blank()),
    };
  });

  const readHistory = useCallback(async (pairKey: string) => {
    if (Platform.OS !== 'ios') return;
    setSensor('reading');
    setSyncError('');
    try {
      const { Pedometer } = await import('expo-sensors');
      if (!await Pedometer.isAvailableAsync()) { setSensor('unavailable'); return; }
      const now = new Date();
      const snapshots: NativeDay[] = [];
      for (let offset = 6; offset >= 0; offset--) {
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - offset);
        const hours = blank();
        const lastHour = offset === 0 ? now.getHours() : 23;
        // Query fixed local-hour intervals. A snapshot replaces the previous one,
        // never increments it, so reopening after a locked walk cannot double count.
        for (let hour = 0; hour <= lastHour; hour++) {
          const from = new Date(start); from.setHours(hour);
          const until = new Date(start); until.setHours(hour + 1);
          const end = until < now ? until : now;
          // On spring-forward days, the skipped local hour maps to the same
          // instant as the following hour. Core Motion rejects an empty range.
          if (end <= from) continue;
          hours[hour] = (await Pedometer.getStepCountAsync(from, end)).steps;
        }
        snapshots.push({ date: dateKey(start), hours });
      }
      setNativeDays(snapshots);
      setSensor('ready');
      if (pairKey) {
        try {
          for (const snapshot of snapshots) {
            await putMovementNative(snapshot, { headers: { Authorization: `Bearer ${pairKey}` } });
          }
          await queryClient.invalidateQueries({ queryKey: getGetMovementQueryKey() });
        } catch { setSyncError('Phone steps were read, but could not sync. Reopen the app or tap Refresh when online.'); }
      }
    } catch {
      setSensor('error');
      setSyncError('Could not read step history. Check Motion & Fitness access and try again.');
    }
  }, [queryClient]);

  useEffect(() => {
    let alive = true;
    SecureStore.getItemAsync(PAIR_KEY).then((saved) => { if (alive && saved) setKey(saved); })
      .catch(() => { if (alive) setPairError('Could not read the saved pairing key.'); });
    if (Platform.OS === 'ios') {
      import('expo-sensors').then(async ({ Pedometer }) => {
        if (!alive) return;
        if (!await Pedometer.isAvailableAsync()) { setSensor('unavailable'); return; }
        const permission = await Pedometer.getPermissionsAsync();
        if (alive) {
          setCanAskMotion(permission.canAskAgain);
          setSensor(permission.granted ? 'ready' : permission.status === 'denied' ? 'denied' : 'needs-permission');
        }
      }).catch(() => { if (alive) setSensor('unavailable'); });
    }
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (sensor !== 'ready') return;
    if (autoReadKey.current === key) return;
    autoReadKey.current = key;
    void readHistory(key);
  }, [key, sensor, readHistory]);

  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active' && (sensor === 'ready' || sensor === 'reading')) void readHistory(key);
    });
    return () => listener.remove();
  }, [key, sensor, readHistory]);

  const allowMotion = async () => {
    if (Platform.OS !== 'ios') return;
    try {
      const { Pedometer } = await import('expo-sensors');
      const response = await Pedometer.requestPermissionsAsync();
      setCanAskMotion(response.canAskAgain);
      setSensor(response.granted ? 'ready' : 'denied');
    } catch { setSensor('error'); }
  };
  const pair = async () => {
    const next = pairInput.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(next)) { setPairError('Enter the full 64-character key from the web Movement page.'); return; }
    setSaving(true); setPairError('');
    try {
      await getMovement({ headers: { Authorization: `Bearer ${next}` } });
      await SecureStore.setItemAsync(PAIR_KEY, next);
      setKey(next); setPairInput('');
      setMessage('Connected to your FitPulse Movement page.');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { setPairError('Key not found or server unavailable. Check the key and connection.'); }
    finally { setSaving(false); }
  };
  const add = async (amount: number) => {
    if (!key) { setMessage('Pair with the web app before adding manual steps.'); return; }
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 100000) { setMessage('Enter 1–100,000 whole steps.'); return; }
    setSaving(true); setMessage('');
    try {
      await addManual.mutateAsync({ data: { id: `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`, date: today, hour: new Date().getHours(), amount } });
      await refreshRemote(); setManualInput('');
      setMessage(`${amount.toLocaleString()} manual steps saved.`);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { setMessage('Manual steps were not saved. Try again.'); }
    finally { setSaving(false); }
  };
  const setGoal = async () => {
    const value = Number(goalInput);
    if (!Number.isSafeInteger(value) || value < 1000 || value > 100000) { setMessage('Goal must be 1,000–100,000 steps.'); return; }
    setSaving(true);
    try {
      await saveSettings.mutateAsync({ data: { goal: value, strideCm: stride, weightKg: weight } });
      await refreshRemote(); setGoalInput(''); setMessage('Daily goal updated on both devices.');
    } catch { setMessage('Goal could not be saved. Try again.'); }
    finally { setSaving(false); }
  };
  const button = (label: string, action: () => void, testID: string, subdued = false) => (
    <Pressable testID={testID} onPress={action} disabled={saving} style={({ pressed }) => [
      styles.button, { backgroundColor: subdued ? colors.secondary : colors.primary, opacity: pressed || saving ? 0.65 : 1 },
    ]}>
      <Text style={[styles.buttonText, { color: subdued ? colors.secondaryForeground : colors.primaryForeground }]}>{label}</Text>
    </Pressable>
  );
  const card = (children: React.ReactNode) => (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18 }]}>{children}</View>
  );

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={[styles.content, {
      paddingTop: Platform.OS === 'web' ? 67 : insets.top + 18,
      paddingBottom: Platform.OS === 'web' ? 40 : insets.bottom + 32,
    }]}>
      <View style={styles.brand}><View style={[styles.brandMark, { backgroundColor: colors.primary }]}><Feather name="activity" size={20} color={colors.primaryForeground} /></View><Text style={[styles.brandText, { color: colors.foreground }]}>fitpulse</Text><Text style={[styles.brandSide, { color: colors.mutedForeground }]}>MOVEMENT</Text></View>
      <Text style={[styles.eyebrow, { color: colors.secondaryForeground }]}>MOVEMENT · TODAY</Text>
      <Text style={[styles.title, { color: colors.foreground }]}>Take the{'\n'}long way.</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Steps are a gentle vote for more energy.</Text>
      {card(<>
        <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>TODAY'S MOVEMENT</Text>
        <Text testID="mobile-step-total" style={[styles.number, { color: colors.foreground }]}>{steps.toLocaleString()}<Text style={styles.unit}> steps</Text></Text>
        <View style={[styles.track, { backgroundColor: colors.muted }]}><View style={[styles.fill, { backgroundColor: colors.primary, width: `${progress}%` }]} /></View>
        <View style={styles.split}><Text style={{ color: colors.mutedForeground }}>{progress}% of goal</Text><Text style={{ color: colors.foreground }}>{goal.toLocaleString()} planned</Text></View>
        <View style={[styles.statRow, { borderTopColor: colors.border }]}>
          <View><Text style={[styles.statValue, { color: colors.foreground }]}>{distance.toFixed(2)} km</Text><Text style={{ color: colors.mutedForeground }}>Est. distance</Text></View>
          <View><Text style={[styles.statValue, { color: colors.foreground }]}>{Math.round(distance * weight * 0.53)} kcal</Text><Text style={{ color: colors.mutedForeground }}>Est. active energy</Text></View>
        </View>
      </>)}
      {card(<>
        <View style={styles.row}><Feather name="smartphone" size={19} color={colors.primary} /><Text style={[styles.heading, { color: colors.foreground }]}>Phone step history</Text></View>
        {Platform.OS === 'ios' ? (
          <>
            <Text style={[styles.description, { color: colors.mutedForeground }]}>iPhone records supported walking steps while locked. FitPulse reads the last seven days when you open or return to the app; it does not run a continuous background listener.</Text>
            {sensor === 'checking' || sensor === 'reading' ? <View style={styles.row}><ActivityIndicator color={colors.primary} /><Text style={{ color: colors.foreground }}>{sensor === 'reading' ? 'Reading hourly history…' : 'Checking sensor…'}</Text></View> : null}
            {sensor === 'needs-permission' && button('Allow Motion & Fitness', allowMotion, 'allow-motion')}
            {sensor === 'denied' && <><Text style={{ color: colors.destructive }}>Motion access denied. {canAskMotion ? 'Try permission again.' : 'Enable Motion & Fitness for FitPulse in Settings.'}</Text>{canAskMotion ? button('Ask again', allowMotion, 'ask-motion-again', true) : button('Open Settings', () => void Linking.openSettings(), 'open-settings', true)}</>}
            {sensor === 'unavailable' && <Text style={{ color: colors.mutedForeground }}>A supported iPhone pedometer is not available on this device.</Text>}
            {sensor === 'error' && button('Try reading again', () => void readHistory(key), 'retry-steps')}
            {sensor === 'ready' && button('Refresh phone steps', () => void readHistory(key), 'refresh-steps', true)}
          </>
        ) : <Text style={[styles.description, { color: colors.mutedForeground }]}>{Platform.OS === 'android' ? 'Android Expo pedometer cannot recover steps after the app was backgrounded or the screen was locked. Native background history is unavailable here; manual entries still sync when paired.' : 'Step history requires a physical iPhone. This preview does not report sensor steps.'}</Text>}
        {!!syncError && <Text style={{ color: colors.destructive }}>{syncError}</Text>}
      </>)}
      {card(<>
        <View style={styles.row}><Feather name="link" size={19} color={colors.secondaryForeground} /><Text style={[styles.heading, { color: colors.foreground }]}>Sync with the web</Text></View>
        {key ? <Text style={[styles.description, { color: colors.secondaryForeground }]}>Paired with your FitPulse Movement page. Phone steps replace earlier browser estimates for the same day; manual additions stay separate.</Text> : <>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>Create a private pairing key on the web Movement page and paste it here. Do not share it with anyone else.</Text>
          <TextInput testID="pairing-input" value={pairInput} onChangeText={setPairInput} autoCapitalize="none" autoCorrect={false} placeholder="Paste pairing key" placeholderTextColor={colors.mutedForeground} style={[styles.input, { borderColor: colors.border, color: colors.foreground }]} />
          {button('Pair my movement', () => void pair(), 'pair-movement')}
          {!!pairError && <Text style={{ color: colors.destructive }}>{pairError}</Text>}
        </>}
        {!!key && movement.isError && <Text style={{ color: colors.destructive }}>Could not load paired data. Check your connection and reopen the app.</Text>}
      </>)}
      {card(<>
        <View style={styles.split}><Text style={[styles.heading, { color: colors.foreground }]}>Steps by hour</Text><Text style={{ color: colors.mutedForeground }}>{total(hourly).toLocaleString()} timed</Text></View>
        <View style={styles.chart}>{hourly.map((value, hour) => <View key={hour} style={styles.column}><View style={[styles.bar, { backgroundColor: colors.primary, height: Math.max(2, Math.min(92, value / Math.max(...hourly, 1) * 92)) }]} /></View>)}</View>
        <View style={styles.split}>{['12 AM', '6 AM', '12 PM', '6 PM'].map((label) => <Text key={label} style={{ color: colors.mutedForeground, fontSize: 11 }}>{label}</Text>)}</View>
        <Text style={[styles.description, { color: colors.mutedForeground }]}>Phone readings and manual additions appear in their respective hours.</Text>
      </>)}
      {card(<>
        <Text style={[styles.heading, { color: colors.foreground }]}>Your week in motion</Text>
        <View style={styles.chart}>{week.map((day, index) => <View key={index} style={styles.column}><Text style={{ fontSize: 10, color: colors.mutedForeground }}>{day.value ? day.value >= 1000 ? `${(day.value / 1000).toFixed(1)}k` : day.value : '—'}</Text><View style={[styles.bar, { backgroundColor: index === 6 ? colors.primary : colors.accent, height: Math.max(2, Math.min(82, day.value / Math.max(goal, ...week.map((d) => d.value), 1) * 82)) }]} /><Text style={{ fontSize: 10, color: colors.mutedForeground }}>{day.label}</Text></View>)}</View>
      </>)}
      {card(<>
        <Text style={[styles.heading, { color: colors.foreground }]}>Quick add</Text>
        <View style={styles.quick}>{[500, 1000, 2500].map((amount) => <Pressable key={amount} testID={`add-${amount}`} disabled={!key || saving} onPress={() => void add(amount)} style={[styles.quickButton, { backgroundColor: colors.secondary, opacity: !key ? 0.5 : 1 }]}><Text style={{ color: colors.secondaryForeground, fontWeight: '700' }}>+{amount.toLocaleString()}</Text></Pressable>)}</View>
        <View style={styles.row}><TextInput testID="manual-input" value={manualInput} onChangeText={setManualInput} keyboardType="number-pad" placeholder="Custom steps" placeholderTextColor={colors.mutedForeground} style={[styles.input, { borderColor: colors.border, color: colors.foreground, flex: 1 }]} /><Pressable testID="add-custom" disabled={!key || saving} onPress={() => void add(Number(manualInput))} style={[styles.addIcon, { backgroundColor: colors.primary, opacity: !key ? 0.5 : 1 }]}><Feather name="plus" size={22} color={colors.primaryForeground} /></Pressable></View>
        <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Manual steps are separate from phone history and sync to the web.</Text>
      </>)}
      {!!key && card(<>
        <Text style={[styles.heading, { color: colors.foreground }]}>Daily goal</Text>
        <View style={styles.row}><TextInput testID="goal-input" value={goalInput} onChangeText={setGoalInput} keyboardType="number-pad" placeholder={String(goal)} placeholderTextColor={colors.mutedForeground} style={[styles.input, { borderColor: colors.border, color: colors.foreground, flex: 1 }]} />{button('Save goal', () => void setGoal(), 'save-goal', true)}</View>
      </>)}
      {!!message && <Text accessibilityRole="alert" style={{ color: colors.secondaryForeground }}>{message}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 17, maxWidth: 600, width: '100%', alignSelf: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 10 },
  brandMark: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  brandText: { fontSize: 21, fontFamily: 'DMSans_700Bold', letterSpacing: -1 },
  brandSide: { marginLeft: 'auto', fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  title: { fontSize: 48, lineHeight: 51, letterSpacing: -2.4, fontFamily: 'DMSans_700Bold' },
  subtitle: { fontSize: 15, marginBottom: 4 },
  card: { borderWidth: 1, padding: 20, gap: 14 },
  number: { fontSize: 49, fontFamily: 'DMSans_700Bold', letterSpacing: -2 },
  unit: { fontSize: 17, fontWeight: '400' },
  track: { height: 9, borderRadius: 9, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 9 },
  split: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, paddingTop: 17 },
  statValue: { fontSize: 19, fontFamily: 'DMSans_700Bold' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heading: { fontSize: 18, fontFamily: 'DMSans_700Bold' },
  description: { fontSize: 13, lineHeight: 20 },
  button: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 13, alignItems: 'center' },
  buttonText: { fontSize: 13, fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, fontSize: 14, minHeight: 46 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 112, gap: 3 },
  column: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center', gap: 3 },
  bar: { width: '70%', borderRadius: 4 },
  quick: { flexDirection: 'row', gap: 8 },
  quickButton: { flex: 1, paddingVertical: 11, borderRadius: 11, alignItems: 'center' },
  addIcon: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});