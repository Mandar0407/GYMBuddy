import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, AppState, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet,
  Text, TextInput, View,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import {
  getMovement, putMovementNative, useGetMovement, useAddMovementManual,
  usePutMovementSettings, useResetMovementManual, getGetMovementQueryKey,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import FitnessApp from '@/components/FitnessApp';
import { useFitness, type MovementSummary } from '@/providers/FitnessProvider';

const PAIR_KEY = 'fitpulsePairKey';
const readPairKey = () => Platform.OS === 'web' ? AsyncStorage.getItem(PAIR_KEY) : SecureStore.getItemAsync(PAIR_KEY);
const savePairKey = (value: string) => Platform.OS === 'web' ? AsyncStorage.setItem(PAIR_KEY, value) : SecureStore.setItemAsync(PAIR_KEY, value);
const blank = () => Array(24).fill(0) as number[];
const total = (hours: number[]) => hours.reduce((sum, count) => sum + count, 0);
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

type SensorState = 'checking' | 'needs-permission' | 'denied' | 'unavailable' | 'reading' | 'ready' | 'error';
type NativeDay = { date: string; hours: number[] };
type MobileMovementSummary = MovementSummary & { paired: boolean };

function MovementScreen({ embedded, onSummaryChange }: { embedded?: boolean; onSummaryChange?: (summary: MobileMovementSummary) => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const fitness = useFitness();
  const [key, setKey] = useState('');
  const [pairInput, setPairInput] = useState('');
  const [pairError, setPairError] = useState('');
  const [sensor, setSensor] = useState<SensorState>(Platform.OS === 'ios' ? 'checking' : 'unavailable');
  const [canAskMotion, setCanAskMotion] = useState(false);
  const [nativeDays, setNativeDays] = useState<NativeDay[]>([]);
  const [syncError, setSyncError] = useState('');
  const [manualInput, setManualInput] = useState('');
  const [message, setMessage] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const autoReadKey = useRef<string | null>(null);
  const request = { headers: { Authorization: `Bearer ${key}` } };
  const movement = useGetMovement({ query: { queryKey: [...getGetMovementQueryKey(), key], enabled: !!key, retry: false, refetchOnWindowFocus: true, refetchInterval: 45_000 }, request });
  const addManual = useAddMovementManual({ request });
  const resetManual = useResetMovementManual({ request });
  const saveSettings = usePutMovementSettings({ request });
  const refreshRemote = () => queryClient.invalidateQueries({ queryKey: getGetMovementQueryKey() });
  const today = dateKey(new Date());
  const remoteToday = movement.data?.days.find((day) => day.date === today);
  const localToday = nativeDays.find((day) => day.date === today);
  const nativeHours = localToday?.hours ?? remoteToday?.nativeHours ?? blank();
  const manualHours = remoteToday?.manualHours ?? blank();
  const hourly = nativeHours.map((value, index) => value + manualHours[index]);
  const steps = total(hourly);
  const paired = !!key && !!movement.data;
  const goal = paired ? movement.data!.goal : fitness.profile.stepTarget;
  const autoStride = Math.round(fitness.profile.height * 0.415);
  const stride = movement.data?.strideCm ?? autoStride;
  const weight = movement.data?.weightKg ?? fitness.profile.weight;
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
      date: day,
      known: !!(remote || local),
      label: new Intl.DateTimeFormat('en', { weekday: 'short' }).format(date),
      value: total(local?.hours ?? remote?.nativeHours ?? blank()) + total(remote?.manualHours ?? blank()),
    };
  });
  const history = new Map<string, number>();
  movement.data?.days.forEach((day) => {
    history.set(day.date, total(day.nativeHours ?? blank()) + total(day.manualHours));
  });
  nativeDays.forEach((day) => {
    const remote = movement.data?.days.find((item) => item.date === day.date);
    history.set(day.date, total(day.hours) + total(remote?.manualHours ?? blank()));
  });
  const historySignature = [...history].map(([date, count]) => `${date}:${count}`).join('|');

  useEffect(() => {
    onSummaryChange?.({ steps, goal, paired, week: [...history].map(([date, count]) => ({ date, steps: count })) });
  }, [steps, goal, paired, historySignature, onSummaryChange]);

  useEffect(() => {
    fitness.setMovementSteps(localToday || remoteToday ? steps : null);
  }, [steps, localToday, remoteToday, fitness.setMovementSteps]);

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
    readPairKey().then((saved) => {
      if (alive && saved) {
        setKey(saved);
        void fitness.setJournalPairingKey(saved);
      }
    })
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
  }, [fitness.setJournalPairingKey]);

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
      await savePairKey(next);
      setKey(next); setPairInput('');
      await fitness.setJournalPairingKey(next);
      setMessage('Connected to your GYM Buddy Movement page.');
      if (Platform.OS !== 'web') await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
  const clearManual = async () => {
    if (!key) return;
    setSaving(true);
    setMessage('');
    try {
      await resetManual.mutateAsync({ date: today });
      await refreshRemote();
      setMessage('Today’s manual steps were cleared. Phone history was kept.');
    } catch { setMessage('Manual steps could not be cleared. Phone history was not changed. Try again.'); }
    finally { setSaving(false); }
  };
  const confirmClearManual = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Clear all manually added steps for today? Recorded phone history will be kept.')) void clearManual();
      return;
    }
    Alert.alert('Clear manual steps?', 'This removes manually added steps for today only. Recorded phone history is kept.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear manual steps', style: 'destructive', onPress: () => void clearManual() },
    ]);
  };
  const saveMovementSettings = async (next: { goal: number; weight: number; height: number; stride: number }) => {
    setSaving(true);
    setMessage('');
    try {
      const profileUpdate = await fitness.applyPlan({
        weight: next.weight,
        height: next.height,
        ...(!key ? { stepTarget: next.goal } : {}),
      });
      if (!profileUpdate) return 'Profile settings could not be saved on this device. Paired movement settings were not changed.';
      if (key) {
        try {
          await saveSettings.mutateAsync({ data: { goal: next.goal, strideCm: next.stride, weightKg: next.weight } });
          await refreshRemote();
        } catch {
          return 'Your weight and height were saved on this device, but paired goal/stride settings were not saved. Try saving again.';
        }
        const localGoalSaved = await fitness.applyPlan({ stepTarget: next.goal });
        if (!localGoalSaved) {
          return 'Paired goal and stride settings were saved, but the daily goal in this device profile could not be updated.';
        }
      }
      setMessage('Movement settings saved.');
      setSettingsOpen(false);
      return '';
    } finally {
      setSaving(false);
    }
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
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={[styles.content, {
      paddingTop: embedded ? 22 : Platform.OS === 'web' ? 67 : insets.top + 18,
      paddingBottom: Platform.OS === 'web' ? 40 : insets.bottom + 32,
    }]}>
      {!embedded && <View style={styles.brand}><View style={[styles.brandMark, { backgroundColor: colors.primary }]}><MaterialCommunityIcons name="dumbbell" size={20} color={colors.primaryForeground} /></View><Text style={[styles.brandText, { color: colors.foreground }]}>GYM Buddy</Text><Text style={[styles.brandSide, { color: colors.mutedForeground }]}>MOVEMENT</Text></View>}
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
            <Text style={[styles.description, { color: colors.mutedForeground }]}>iPhone records supported walking steps while locked. GYM Buddy reads the last seven days when you open or return to the app; it does not run a continuous background listener.</Text>
            {sensor === 'checking' || sensor === 'reading' ? <View style={styles.row}><ActivityIndicator color={colors.primary} /><Text style={{ color: colors.foreground }}>{sensor === 'reading' ? 'Reading hourly history…' : 'Checking sensor…'}</Text></View> : null}
            {sensor === 'needs-permission' && button('Allow Motion & Fitness', allowMotion, 'allow-motion')}
            {sensor === 'denied' && <><Text style={{ color: colors.destructive }}>Motion access denied. {canAskMotion ? 'Try permission again.' : 'Enable Motion & Fitness for GYM Buddy in Settings.'}</Text>{canAskMotion ? button('Ask again', allowMotion, 'ask-motion-again', true) : button('Open Settings', () => void Linking.openSettings(), 'open-settings', true)}</>}
            {sensor === 'unavailable' && <Text style={{ color: colors.mutedForeground }}>A supported iPhone pedometer is not available on this device.</Text>}
            {sensor === 'error' && button('Try reading again', () => void readHistory(key), 'retry-steps')}
            {sensor === 'ready' && button('Refresh phone steps', () => void readHistory(key), 'refresh-steps', true)}
          </>
        ) : <Text style={[styles.description, { color: colors.mutedForeground }]}>{Platform.OS === 'android' ? 'Android limitation: this version does not read Android step-sensor history or recover steps recorded while the app is backgrounded or the screen is locked. Manual entries still sync when paired.' : 'Browser limitation: a browser has no access to native phone step history, so this preview does not report sensor steps. You can still add manual steps; use the iOS app for supported iPhone history.'}</Text>}
        {!!syncError && <Text style={{ color: colors.destructive }}>{syncError}</Text>}
      </>)}
      {card(<>
        <View style={styles.row}><Feather name="link" size={19} color={colors.secondaryForeground} /><Text style={[styles.heading, { color: colors.foreground }]}>Sync with the web</Text></View>
        {key ? <Text style={[styles.description, { color: colors.secondaryForeground }]}>Paired with your GYM Buddy Movement page. Phone steps replace earlier browser estimates for the same day; manual additions stay separate.</Text> : <>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>Create a private pairing key on the web Movement page and paste it here. Do not share it with anyone else.</Text>
          <TextInput testID="pairing-input" value={pairInput} onChangeText={setPairInput} autoCapitalize="none" autoCorrect={false} placeholder="Paste pairing key" placeholderTextColor={colors.mutedForeground} style={[styles.input, { borderColor: colors.border, color: colors.foreground }]} />
          {button('Pair my movement', () => void pair(), 'pair-movement')}
          {!!pairError && <Text style={{ color: colors.destructive }}>{pairError}</Text>}
        </>}
        {!!key && <Text style={[styles.description, { color: colors.mutedForeground }]}>
          Journal sync covers meals, strength sets, completed sessions, water, weight, goals, saved meal templates and completed live workouts. Active workout drafts stay on this phone.
        </Text>}
        {!!key && <View style={styles.row}>
          <Text accessibilityRole="alert" style={[styles.description, { color: fitness.journalSyncError ? colors.destructive : colors.mutedForeground, flex: 1 }]}>
            {fitness.journalSyncStatus === 'syncing' ? 'Syncing meals, workouts and goals…'
              : fitness.journalSyncError || (fitness.journalSyncStatus === 'synced' ? 'Journal synced.' : 'Journal sync is waiting.')}
          </Text>
          <Pressable testID="refresh-journal-sync" disabled={fitness.journalSyncStatus === 'syncing'} onPress={() => void fitness.syncJournal()}>
            <Text style={{ color: colors.primary, fontWeight: '700' }}>Refresh</Text>
          </Pressable>
        </View>}
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
        <View style={styles.split}><Text style={[styles.heading, { color: colors.foreground }]}>Quick add</Text><Pressable testID="clear-manual-steps" accessibilityHint="Available after pairing and adding manual steps" disabled={!key || saving || total(manualHours) === 0} onPress={confirmClearManual} style={[styles.resetButton, { borderColor: colors.destructive, opacity: !key || saving || total(manualHours) === 0 ? 0.45 : 1 }]}><Feather name="rotate-ccw" size={15} color={colors.destructive} /><Text style={{ color: colors.destructive, fontWeight: '700', fontSize: 12 }}>Clear manual</Text></Pressable></View>
        <View style={styles.quick}>{[500, 1000, 2500].map((amount) => <Pressable key={amount} testID={`add-${amount}`} disabled={!key || saving} onPress={() => void add(amount)} style={[styles.quickButton, { backgroundColor: colors.secondary, opacity: !key ? 0.5 : 1 }]}><Text style={{ color: colors.secondaryForeground, fontWeight: '700' }}>+{amount.toLocaleString()}</Text></Pressable>)}</View>
        <View style={styles.row}><TextInput testID="manual-input" value={manualInput} onChangeText={setManualInput} keyboardType="number-pad" placeholder="Custom steps" placeholderTextColor={colors.mutedForeground} style={[styles.input, { borderColor: colors.border, color: colors.foreground, flex: 1 }]} /><Pressable testID="add-custom" disabled={!key || saving} onPress={() => void add(Number(manualInput))} style={[styles.addIcon, { backgroundColor: colors.primary, opacity: !key ? 0.5 : 1 }]}><Feather name="plus" size={22} color={colors.primaryForeground} /></Pressable></View>
        <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Manual steps are separate from phone history and sync to the web.</Text>
      </>)}
      {card(<>
        <View style={styles.split}><View><Text style={[styles.heading, { color: colors.foreground }]}>Movement settings</Text><Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 4 }}>Goal, body measurements and stride estimate</Text></View>{button('Edit settings', () => setSettingsOpen(true), 'edit-movement-settings', true)}</View>
      </>)}
      {!!message && <Text accessibilityRole="alert" style={{ color: /could not|not saved|not changed|failed/i.test(message) ? colors.destructive : colors.secondaryForeground }}>{message}</Text>}
      {settingsOpen && <MovementSettingsModal
        goal={goal}
        weight={weight}
        height={fitness.profile.height}
        stride={stride}
        saving={saving}
        paired={!!key}
        colors={colors}
        onClose={() => setSettingsOpen(false)}
        onSave={saveMovementSettings}
      />}
    </ScrollView>
  );
}

function MovementSettingsModal({ goal, weight, height, stride, saving, paired, colors, onClose, onSave }: {
  goal: number;
  weight: number;
  height: number;
  stride: number;
  saving: boolean;
  paired: boolean;
  colors: ReturnType<typeof useColors>;
  onClose: () => void;
  onSave: (settings: { goal: number; weight: number; height: number; stride: number }) => Promise<string>;
}) {
  const [goalValue, setGoalValue] = useState(String(goal));
  const [weightValue, setWeightValue] = useState(String(weight));
  const [heightValue, setHeightValue] = useState(String(height));
  const auto = Math.round(Number(heightValue) * 0.415);
  const [strideOverride, setStrideOverride] = useState<string | null>(
    Math.round(height * 0.415) === stride ? null : String(stride)
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const visibleStride = strideOverride ?? (Number.isFinite(auto) ? String(auto) : '');
  const save = async () => {
    const nextGoal = Number(goalValue);
    const nextWeight = Number(weightValue);
    const nextHeight = Number(heightValue);
    const nextStride = Number(visibleStride);
    if (!Number.isSafeInteger(nextGoal) || nextGoal < 1000 || nextGoal > 100000 ||
      !Number.isFinite(nextWeight) || nextWeight < 20 || nextWeight > 500 ||
      !Number.isFinite(nextHeight) || nextHeight < 100 || nextHeight > 230 ||
      !Number.isFinite(nextStride) || nextStride < 30 || nextStride > 150) {
      setError('Use a goal of 1,000–100,000 whole steps, weight of 20–500 kg, height of 100–230 cm, and stride of 30–150 cm.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await onSave({ goal: nextGoal, weight: nextWeight, height: nextHeight, stride: nextStride });
      if (result) setError(result);
    } catch {
      setError('Settings could not be saved. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  const field = (label: string, value: string, onChangeText: (value: string) => void, testID: string, keyboardType: 'number-pad' | 'decimal-pad' = 'decimal-pad') => (
    <View style={styles.settingField}>
      <Text style={{ color: colors.foreground, fontWeight: '600', fontSize: 13 }}>{label}</Text>
      <TextInput testID={testID} value={value} onChangeText={(next) => { onChangeText(next); setError(''); }} keyboardType={keyboardType} selectTextOnFocus style={[styles.input, { borderColor: colors.border, color: colors.foreground }]} />
    </View>
  );
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.modalBackdrop, { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalScroll}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.split}><Text style={[styles.heading, { color: colors.foreground }]}>Movement settings</Text><Pressable accessibilityLabel="Close movement settings" testID="close-movement-settings" onPress={onClose}><Feather name="x" size={22} color={colors.foreground} /></Pressable></View>
            <Text style={[styles.description, { color: colors.mutedForeground }]}>Personalize your daily target and movement estimates. {paired ? 'Your goal and stride sync to paired devices.' : 'Your goal is saved to this device until paired.'}</Text>
            {field('Daily step goal', goalValue, setGoalValue, 'movement-goal-input', 'number-pad')}
            {field('Body weight (kg)', weightValue, setWeightValue, 'movement-weight-input')}
            {field('Height (cm)', heightValue, (value) => {
              setHeightValue(value);
              if (strideOverride === null) setStrideOverride(null);
            }, 'movement-height-input')}
            {field('Stride length (cm)', visibleStride, setStrideOverride, 'movement-stride-input')}
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Auto stride uses height × 0.415 ({Number.isFinite(auto) ? auto : '—'} cm). Distance uses stride and estimated active energy also uses body weight.</Text>
            <Pressable testID="reset-stride-auto" disabled={busy || saving} onPress={() => { setStrideOverride(null); setError(''); }} style={[styles.resetButton, { borderColor: colors.border, alignSelf: 'flex-start', opacity: busy || saving ? 0.5 : 1 }]}><Feather name="rotate-ccw" size={15} color={colors.foreground} /><Text style={{ color: colors.foreground, fontWeight: '700', fontSize: 12 }}>Reset stride to Auto</Text></Pressable>
            {!!error && <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{error}</Text>}
            <View style={styles.row}>
              <Pressable testID="cancel-movement-settings" onPress={onClose} disabled={busy || saving} style={[styles.button, { backgroundColor: colors.secondary, flex: 1 }]}><Text style={[styles.buttonText, { color: colors.secondaryForeground }]}>Cancel</Text></Pressable>
              <Pressable testID="save-movement-settings" onPress={() => void save()} disabled={busy || saving} style={[styles.button, { backgroundColor: colors.primary, flex: 1, opacity: busy || saving ? 0.6 : 1 }]}><Text style={[styles.buttonText, { color: colors.primaryForeground }]}>{busy || saving ? 'Saving…' : 'Save settings'}</Text></Pressable>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function Home() {
  const [movementSummary, setMovementSummary] = useState<MobileMovementSummary>({ steps: 0, goal: 10000, paired: false, week: [] });
  const onSummaryChange = useCallback((next: MobileMovementSummary) => {
    setMovementSummary((previous) =>
      previous.steps === next.steps && previous.goal === next.goal && previous.paired === next.paired &&
      JSON.stringify(previous.week) === JSON.stringify(next.week) ? previous : next
    );
  }, []);
  return (
    <FitnessApp
      movementSummary={movementSummary}
      movementScreen={<MovementScreen embedded onSummaryChange={onSummaryChange} />}
    />
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
  resetButton: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  settingField: { gap: 7 },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 18 },
  modalScroll: { flexGrow: 1, justifyContent: 'center' },
  modalCard: { width: '100%', maxWidth: 500, alignSelf: 'center', borderWidth: 1, borderRadius: 20, padding: 20, gap: 14 },
});