import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { AppState, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

const STORAGE_KEY = '@fitpulse/mobile/fasting-session/v1';
const HOUR_MS = 60 * 60 * 1000;
const DIAL_SIZE = 174;
const DIAL_RADIUS = 72;
const DIAL_CIRCUMFERENCE = 2 * Math.PI * DIAL_RADIUS;

type Session = { startedAt: number; duration: number };
type Plan = '16:8' | '18:6' | 'custom';
type Palette = ReturnType<typeof useColors>;

function isSession(value: unknown): value is Session {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.startedAt === 'number'
    && Number.isFinite(record.startedAt)
    && record.startedAt > 0
    && record.startedAt <= Date.now()
    && typeof record.duration === 'number'
    && Number.isInteger(record.duration)
    && record.duration >= 1
    && record.duration <= 23;
}

function clockTime(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [hours, minutes, remainder].map((part) => String(part).padStart(2, '0')).join(':');
}

function dateTime(timestamp: number) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function Preset({ title, subtitle, selected, colors, onPress, testID }: {
  title: string;
  subtitle: string;
  selected: boolean;
  colors: Palette;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.preset,
        {
          backgroundColor: selected ? colors.secondary : colors.card,
          borderColor: selected ? colors.secondaryForeground : colors.border,
          opacity: pressed ? 0.76 : 1,
        },
      ]}
    >
      <Text style={[styles.presetTitle, { color: selected ? colors.secondaryForeground : colors.foreground }]}>{title}</Text>
      <Text style={[styles.presetSubtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>
    </Pressable>
  );
}

export default function FastingCard() {
  const colors = useColors();
  const [session, setSession] = useState<Session | null>(null);
  const [plan, setPlan] = useState<Plan>('16:8');
  const [customHours, setCustomHours] = useState('14');
  const [now, setNow] = useState(Date.now);
  const [error, setError] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [writable, setWritable] = useState(false);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (!mounted) return;
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (isSession(parsed)) {
          setSession({ startedAt: parsed.startedAt, duration: parsed.duration });
          setWritable(true);
        } else {
          setError('Your saved fasting session could not be read. The saved data has been left unchanged.');
        }
      } else {
        setWritable(true);
      }
      setNow(Date.now());
      setHydrated(true);
    }).catch(() => {
      if (!mounted) return;
      setError('Your saved fasting session could not be loaded. The saved data has been left unchanged.');
      setHydrated(true);
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!hydrated) return undefined;
    const refresh = () => setNow(Date.now());
    const interval = setInterval(refresh, 1000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [hydrated]);

  const customNumber = Number(customHours);
  const customValid = /^\d+$/.test(customHours)
    && Number.isInteger(customNumber)
    && customNumber >= 1
    && customNumber <= 23;
  const selectedHours = plan === '16:8' ? 16 : plan === '18:6' ? 18 : customNumber;
  const endsAt = session ? session.startedAt + session.duration * HOUR_MS : 0;
  const remaining = session ? Math.max(0, endsAt - now) : 0;
  const complete = !!session && remaining === 0;
  const progress = session
    ? Math.min(1, Math.max(0, (now - session.startedAt) / (session.duration * HOUR_MS)))
    : 0;
  const progressOffset = DIAL_CIRCUMFERENCE * (1 - progress);

  async function start() {
    if (!hydrated || !writable) return;
    if (plan === 'custom' && !customValid) {
      setError('Enter a whole number of fasting hours from 1 to 23.');
      return;
    }
    const next = { startedAt: Date.now(), duration: selectedHours };
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      setError('This device could not save your session. Check storage and try again.');
      return;
    }
    setSession(next);
    setNow(next.startedAt);
    setError('');
  }

  async function reset() {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      setError('This device could not clear the saved session. Try again.');
      return;
    }
    setSession(null);
    setNow(Date.now());
    setError('');
  }

  function choosePlan(next: Plan) {
    setPlan(next);
    if (writable) setError('');
  }

  return (
    <View
      accessibilityLabel="Intermittent fasting"
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.foreground }]}
    >
      <View style={styles.header}>
        <View style={styles.headingGroup}>
          <View style={styles.eyebrowRow}>
            <Feather name="clock" size={12} color={colors.primary} />
            <Text style={[styles.eyebrow, { color: colors.primary }]}>YOUR OWN RHYTHM</Text>
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>Intermittent fasting</Text>
        </View>
        <View style={[styles.status, {
          backgroundColor: complete ? colors.accent : session ? colors.secondary : colors.muted,
        }]}>
          <View style={[styles.statusDot, { backgroundColor: complete ? colors.secondaryForeground : session ? colors.secondaryForeground : colors.mutedForeground }]} />
          <Text style={[styles.statusText, { color: complete ? colors.accentForeground : session ? colors.secondaryForeground : colors.mutedForeground }]}>
            {complete ? 'Window open' : session ? 'In progress' : !hydrated ? 'Loading' : writable ? 'Not started' : 'Unavailable'}
          </Text>
        </View>
      </View>

      <Text style={[styles.intro, { color: colors.mutedForeground }]}>
        {complete
          ? 'Your planned fasting window has ended. Eat when it works for you.'
          : session
            ? 'Your eating window opens when this countdown reaches zero.'
            : 'A simple timer if you choose to use one. Nothing is running yet.'}
      </Text>

      <View style={styles.main}>
        <View
          accessibilityRole={session ? 'progressbar' : undefined}
          accessibilityLabel={session ? 'Fasting window progress' : undefined}
          accessibilityValue={session ? { min: 0, max: 100, now: Math.round(progress * 100) } : undefined}
          style={styles.dialWrap}
        >
          <Svg width={DIAL_SIZE} height={DIAL_SIZE} viewBox={`0 0 ${DIAL_SIZE} ${DIAL_SIZE}`}>
            <Circle
              cx={DIAL_SIZE / 2}
              cy={DIAL_SIZE / 2}
              r={DIAL_RADIUS}
              fill="none"
              stroke={colors.muted}
              strokeWidth={11}
            />
            <Circle
              cx={DIAL_SIZE / 2}
              cy={DIAL_SIZE / 2}
              r={DIAL_RADIUS}
              fill="none"
              stroke={colors.secondaryForeground}
              strokeWidth={11}
              strokeDasharray={DIAL_CIRCUMFERENCE}
              strokeDashoffset={progressOffset}
              strokeLinecap="round"
              transform={`rotate(-90 ${DIAL_SIZE / 2} ${DIAL_SIZE / 2})`}
            />
            <Circle
              cx={DIAL_SIZE / 2}
              cy={DIAL_SIZE / 2}
              r={DIAL_RADIUS - 13}
              fill="none"
              stroke={colors.border}
              strokeWidth={1}
            />
          </Svg>
          <View style={styles.dialCopy}>
            <Feather name={complete ? 'sun' : 'moon'} size={17} color={colors.secondaryForeground} />
            <Text accessibilityRole="timer" style={[styles.countdown, { color: colors.foreground }]}>
              {session ? complete ? '00:00:00' : clockTime(remaining) : '— —'}
            </Text>
            <Text style={[styles.dialCaption, { color: colors.mutedForeground }]}>
              {complete ? 'Window open' : session ? 'Until eating window' : 'Ready when you are'}
            </Text>
          </View>
        </View>

        <View style={styles.detail}>
          <Text style={[styles.detailLabel, { color: colors.primary }]}>{session ? 'YOUR WINDOW' : 'A GENTLE START'}</Text>
          <Text style={[styles.detailTitle, { color: colors.secondaryForeground }]}>
            {session ? `${session.duration} hours fasting · ${24 - session.duration} hours eating` : 'Set your own pace.'}
          </Text>
          <Text style={[styles.detailBody, { color: colors.mutedForeground }]}>
            {session
              ? complete
                ? 'This session is finished. Reset whenever you want to plan another.'
                : 'The timer follows real time, even if you close the app.'
              : 'Pick a window below, then start it when you’re ready. There’s no need to begin.'}
          </Text>
          {session && (
            <View style={[styles.times, { borderTopColor: colors.border }]}>
              <View style={styles.timeRow}>
                <Text style={[styles.timeLabel, { color: colors.mutedForeground }]}>Started</Text>
                <Text style={[styles.timeValue, { color: colors.foreground }]}>{dateTime(session.startedAt)}</Text>
              </View>
              <View style={styles.timeRow}>
                <Text style={[styles.timeLabel, { color: colors.mutedForeground }]}>Eating window</Text>
                <Text style={[styles.timeValue, { color: colors.foreground }]}>{dateTime(endsAt)}</Text>
              </View>
            </View>
          )}
        </View>
      </View>

      {session ? (
        <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <Text style={[styles.footerNote, { color: colors.mutedForeground }]}>
            {complete ? 'Your timer will stay here until you reset it.' : 'You can stop this session at any time.'}
          </Text>
          <Pressable
            testID="reset-fast"
            accessibilityRole="button"
            onPress={reset}
            style={({ pressed }) => [styles.resetButton, {
              backgroundColor: colors.card,
              borderColor: colors.border,
              opacity: pressed ? 0.72 : 1,
            }]}
          >
            <Text style={[styles.resetText, { color: colors.primary }]}>{complete ? 'Reset timer' : 'Stop & reset'}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.setup, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <Text style={[styles.setupTitle, { color: colors.foreground }]}>Choose a fasting / eating window</Text>
          <View style={styles.presets}>
            <Preset title="16:8" subtitle="16h fast · 8h eat" selected={plan === '16:8'} colors={colors} onPress={() => choosePlan('16:8')} testID="button-fast-preset-16-8" />
            <Preset title="18:6" subtitle="18h fast · 6h eat" selected={plan === '18:6'} colors={colors} onPress={() => choosePlan('18:6')} testID="button-fast-preset-18-6" />
            <Preset title="Custom" subtitle="Your hours" selected={plan === 'custom'} colors={colors} onPress={() => choosePlan('custom')} testID="button-fast-custom" />
          </View>
          {plan === 'custom' && (
            <View style={styles.customRow}>
              <View style={styles.customField}>
                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Fasting hours (1–23)</Text>
                <TextInput
                  testID="input-custom-fasting-hours"
                  accessibilityLabel="Fasting hours, 1 to 23"
                  value={customHours}
                  onChangeText={(value) => { setCustomHours(value); setError(''); }}
                  keyboardType="number-pad"
                  maxLength={2}
                  selectTextOnFocus
                  style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                />
              </View>
              <Text style={[styles.customOutput, { color: colors.mutedForeground }]}>
                Eating window: <Text style={[styles.customOutputStrong, { color: colors.foreground }]}>{customValid ? `${24 - customNumber} hours` : '—'}</Text>
              </Text>
            </View>
          )}
          {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
          <View style={styles.actionRow}>
            <Pressable
              testID="start-fast"
              accessibilityRole="button"
              disabled={!hydrated || !writable}
              onPress={start}
              style={({ pressed }) => [styles.startButton, {
                backgroundColor: colors.primary,
                opacity: !hydrated || !writable ? 0.55 : pressed ? 0.78 : 1,
              }]}
            >
              <Text style={[styles.startText, { color: colors.primaryForeground }]}>Start fast now</Text>
              <Feather name="arrow-right" size={15} color={colors.primaryForeground} />
            </Pressable>
            <Text style={[styles.actionNote, { color: colors.mutedForeground }]}>Starts only when you choose.</Text>
          </View>
        </View>
      )}
      {session && error ? <Text accessibilityRole="alert" style={[styles.footerError, { color: colors.destructive }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    minWidth: 0,
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: 17,
    shadowOpacity: 0.045,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 5 },
    elevation: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 9,
    paddingHorizontal: 19,
    paddingTop: 19,
  },
  headingGroup: { flex: 1, minWidth: 0 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  eyebrow: { fontFamily: 'DMSans_700Bold', fontSize: 9, letterSpacing: 1.4 },
  title: { marginTop: 6, fontFamily: 'DMSans_700Bold', fontSize: 19, lineHeight: 24, letterSpacing: -0.6 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 6, marginTop: 1 },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontFamily: 'DMSans_700Bold', fontSize: 9 },
  intro: { marginTop: 8, marginHorizontal: 19, fontFamily: 'DMSans_400Regular', fontSize: 11, lineHeight: 17 },
  main: { alignItems: 'center', paddingHorizontal: 19, paddingTop: 18, paddingBottom: 20, gap: 17 },
  dialWrap: { width: DIAL_SIZE, height: DIAL_SIZE, alignItems: 'center', justifyContent: 'center' },
  dialCopy: { position: 'absolute', alignItems: 'center', justifyContent: 'center', width: 126 },
  countdown: { marginTop: 4, fontFamily: 'DMSans_700Bold', fontSize: 26, lineHeight: 32, letterSpacing: -1.3, fontVariant: ['tabular-nums'] },
  dialCaption: { marginTop: 2, textAlign: 'center', fontFamily: 'DMSans_700Bold', fontSize: 8, letterSpacing: 0.8, textTransform: 'uppercase' },
  detail: { width: '100%', minWidth: 0 },
  detailLabel: { textAlign: 'center', fontFamily: 'DMSans_700Bold', fontSize: 9, letterSpacing: 1.3 },
  detailTitle: { marginTop: 5, textAlign: 'center', fontFamily: 'DMSans_700Bold', fontSize: 20, lineHeight: 25, letterSpacing: -0.5 },
  detailBody: { marginTop: 5, textAlign: 'center', fontFamily: 'DMSans_400Regular', fontSize: 11, lineHeight: 17 },
  times: { gap: 8, marginTop: 13, paddingTop: 11, borderTopWidth: 1 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  timeLabel: { fontFamily: 'DMSans_400Regular', fontSize: 10 },
  timeValue: { flexShrink: 1, textAlign: 'right', fontFamily: 'DMSans_700Bold', fontSize: 10, fontVariant: ['tabular-nums'] },
  setup: { paddingHorizontal: 17, paddingVertical: 17, borderTopWidth: 1 },
  setupTitle: { marginBottom: 9, fontFamily: 'DMSans_700Bold', fontSize: 11 },
  presets: { flexDirection: 'row', gap: 6 },
  preset: { flex: 1, minWidth: 0, minHeight: 55, justifyContent: 'center', alignItems: 'flex-start', gap: 3, paddingHorizontal: 8, borderWidth: 1, borderRadius: 10 },
  presetTitle: { fontFamily: 'DMSans_700Bold', fontSize: 12 },
  presetSubtitle: { fontFamily: 'DMSans_400Regular', fontSize: 8, lineHeight: 11 },
  customRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12, marginTop: 12 },
  customField: { gap: 6 },
  fieldLabel: { fontFamily: 'DMSans_700Bold', fontSize: 10 },
  input: { width: 120, height: 40, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, fontFamily: 'DMSans_400Regular', fontSize: 14 },
  customOutput: { paddingBottom: 8, fontFamily: 'DMSans_400Regular', fontSize: 10 },
  customOutputStrong: { fontFamily: 'DMSans_700Bold' },
  error: { marginTop: 10, fontFamily: 'DMSans_400Regular', fontSize: 11, lineHeight: 16 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 11, marginTop: 15 },
  startButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 15, borderRadius: 9 },
  startText: { fontFamily: 'DMSans_700Bold', fontSize: 11 },
  actionNote: { flexShrink: 1, fontFamily: 'DMSans_400Regular', fontSize: 9, lineHeight: 14 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, paddingHorizontal: 17, paddingVertical: 14, borderTopWidth: 1 },
  footerNote: { flex: 1, minWidth: 140, fontFamily: 'DMSans_400Regular', fontSize: 10, lineHeight: 15 },
  resetButton: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 11, borderWidth: 1, borderRadius: 9 },
  resetText: { fontFamily: 'DMSans_700Bold', fontSize: 10 },
  footerError: { marginHorizontal: 17, marginBottom: 12, fontFamily: 'DMSans_400Regular', fontSize: 11, lineHeight: 16 },
});