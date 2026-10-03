import { BrandMark } from '@/components/BrandMark';
import { BrandWordmark } from '@/components/BrandWordmark';
import React, { useEffect, useRef, useState } from 'react';
import {usePageVisible}from'@/components/PersistentPage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, AppState, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useReducedMotion } from '@/hooks/useReducedMotion';

type Settings = { sets: number; work: number; rest: number; skipLastRest: boolean };
type SavedRoutine = Settings & { id: string; name: string };
type Phase = 'prepare' | 'work' | 'rest' | 'complete';
type Session = {
  phase: Phase;
  setIndex: number;
  remainingMs: number;
  deadline: number;
  running: boolean;
  settings: Settings;
};

const PREPARE_SECONDS = 5;
const STORAGE_KEY = '@fitpulse/mobile/interval-presets/v1';
const DEFAULT_SETTINGS: Settings = { sets: 4, work: 40, rest: 90, skipLastRest: true };
const PRESETS: { id: string; name: string; detail: string; settings: Settings }[] = [
  { id: 'heavy', name: 'Heavy Strength', detail: '5 sets · 0:45 / 3:00', settings: { sets: 5, work: 45, rest: 180, skipLastRest: true } },
  { id: 'hypertrophy', name: 'Hypertrophy', detail: '4 sets · 0:40 / 1:30', settings: { sets: 4, work: 40, rest: 90, skipLastRest: true } },
  { id: 'tabata', name: 'HIIT Tabata', detail: '8 sets · 0:20 / 0:10', settings: { sets: 8, work: 20, rest: 10, skipLastRest: true } },
];

const formatTime = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

function sanitizeRoutineName(value: string) {
  return Array.from(value.normalize('NFC').replace(/[<>\u0000-\u001f\u007f-\u009f]/g, '')).slice(0, 32).join('');
}

function normalizedRoutineName(value: string) {
  return sanitizeRoutineName(value).trim().replace(/\s+/g, ' ');
}

function isSettings(value: unknown): value is Settings {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return Number.isInteger(record.sets) && Number(record.sets) >= 1 && Number(record.sets) <= 30
    && Number.isInteger(record.work) && Number(record.work) >= 5 && Number(record.work) <= 3599 && Number(record.work) % 5 === 0
    && Number.isInteger(record.rest) && Number(record.rest) >= 0 && Number(record.rest) <= 3599 && Number(record.rest) % 5 === 0
    && typeof record.skipLastRest === 'boolean';
}

function isSavedRoutine(value: unknown): value is SavedRoutine {
  if (!isSettings(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string' && record.id.length > 0 && record.id.length <= 100
    && typeof record.name === 'string'
    && record.name.length > 0 && record.name.length <= 32
    && normalizedRoutineName(record.name) === record.name;
}

function parseSavedRoutines(raw: string): SavedRoutine[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length > 30 || !parsed.every(isSavedRoutine)) {
    throw new Error('Invalid saved interval routines');
  }
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const routine of parsed) {
    const normalized = routine.name.toLocaleLowerCase();
    if (ids.has(routine.id) || names.has(normalized)) throw new Error('Duplicate saved interval routine');
    ids.add(routine.id);
    names.add(normalized);
  }
  return parsed.map(routine => ({ ...routine }));
}

function advance(session: Session): Session {
  const { settings } = session;
  if (session.phase === 'prepare') {
    return { ...session, phase: 'work', remainingMs: settings.work * 1000, deadline: session.deadline + settings.work * 1000 };
  }
  if (session.phase === 'work' && settings.rest > 0 && (session.setIndex < settings.sets || !settings.skipLastRest)) {
    return { ...session, phase: 'rest', remainingMs: settings.rest * 1000, deadline: session.deadline + settings.rest * 1000 };
  }
  if (session.setIndex < settings.sets) {
    return {
      ...session,
      phase: 'work',
      setIndex: session.setIndex + 1,
      remainingMs: settings.work * 1000,
      deadline: session.deadline + settings.work * 1000,
    };
  }
  return { ...session, phase: 'complete', remainingMs: 0, running: false };
}

function tickSession(session: Session, now: number): Session {
  if (!session.running) return session;
  let next = session;
  let transitions = 0;
  while (next.running && now >= next.deadline && transitions++ < 1000) next = advance(next);
  return next.running ? { ...next, remainingMs: Math.max(0, next.deadline - now) } : next;
}

function Stepper({ label, value, min, max, step, display, onChange, testID, colors }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (next: number) => void;
  testID: string;
  colors: ReturnType<typeof useColors>;
}) {
  const canIncrease = value + step <= max;
  return (
    <View style={[styles.stepper, { borderColor: colors.border, backgroundColor: colors.background }]}>
      <Text style={[styles.stepLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <View style={styles.stepRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          disabled={value <= min}
          testID={`decrease-${testID}`}
          onPress={() => onChange(Math.max(min, value - step))}
          style={({ pressed }) => [styles.stepButton, { backgroundColor: colors.card, borderColor: colors.border, opacity: value <= min ? 0.4 : pressed ? 0.65 : 1 }]}
        >
          <Feather name="minus" size={15} color={colors.foreground} />
        </Pressable>
        <Text accessibilityLabel={`${label}: ${display}`} style={[styles.stepValue, { color: colors.foreground }]}>{display}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          disabled={!canIncrease}
          testID={`increase-${testID}`}
          onPress={() => onChange(value + step)}
          style={({ pressed }) => [styles.stepButton, { backgroundColor: colors.card, borderColor: colors.border, opacity: !canIncrease ? 0.4 : pressed ? 0.65 : 1 }]}
        >
          <Feather name="plus" size={15} color={colors.foreground} />
        </Pressable>
      </View>
      <Text style={[styles.stepHint, { color: colors.mutedForeground }]}>{label === 'Sets' ? '1–30 sets' : 'min : sec'}</Text>
    </View>
  );
}

export default function IntervalTimer() {
  const pageVisible=usePageVisible();
  const colors = useColors();
  const reduced=useReducedMotion();
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [selectedPreset, setSelectedPreset] = useState('hypertrophy');
  const [savedRoutines, setSavedRoutines] = useState<SavedRoutine[]>([]);
  const [routineName, setRoutineName] = useState('');
  const [presetError, setPresetError] = useState('');
  const [presetStorageReady, setPresetStorageReady] = useState(false);
  const [presetBusy, setPresetBusy] = useState(false);
  const presetOperationRef = useRef(false);
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);

  const publish = (next: Session | null) => {
    sessionRef.current = next;
    setSession(next);
  };

  useEffect(() => {
    if(!pageVisible)return;
    const tick = () => {
      const current = sessionRef.current;
      if (!current?.running) return;
      const next = tickSession(current, Date.now());
      if (next !== current) publish(next);
    };
    tick();
    const interval = setInterval(tick, 1000);
    const appState = AppState.addEventListener('change', state => {
      if (state === 'active') tick();
    });
    return () => {
      clearInterval(interval);
      appState.remove();
    };
  }, [pageVisible]);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (!mounted) return;
      if (raw === null) {
        setSavedRoutines([]);
      } else {
        try {
          setSavedRoutines(parseSavedRoutines(raw));
        } catch {
          setPresetError('Saved routines could not be read. Existing storage was left unchanged.');
          setPresetStorageReady(false);
          return;
        }
      }
      setPresetStorageReady(true);
    }).catch(() => {
      if (!mounted) return;
      setPresetError('Saved routines could not be loaded. Existing storage was left unchanged.');
      setPresetStorageReady(false);
    });
    return () => { mounted = false; };
  }, []);

  const updateSetting = (key: keyof Settings, value: number | boolean) => {
    setSettings(current => ({ ...current, [key]: value }));
    setSelectedPreset('');
    if (presetStorageReady) setPresetError('');
  };
  const choosePreset = (preset: typeof PRESETS[number]) => {
    setSettings({ ...preset.settings });
    setSelectedPreset(preset.id);
    if (presetStorageReady) setPresetError('');
  };
  const loadRoutine = (routine: SavedRoutine) => {
    setSettings({ sets: routine.sets, work: routine.work, rest: routine.rest, skipLastRest: routine.skipLastRest });
    setSelectedPreset(routine.id);
    setPresetError('');
  };
  const persistRoutines = async (next: SavedRoutine[], failureMessage: string) => {
    if (!presetStorageReady || presetOperationRef.current) return false;
    presetOperationRef.current = true;
    setPresetBusy(true);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setSavedRoutines(next);
      setPresetError('');
      return true;
    } catch {
      setPresetError(failureMessage);
      return false;
    } finally {
      presetOperationRef.current = false;
      setPresetBusy(false);
    }
  };
  const saveRoutine = async () => {
    const name = normalizedRoutineName(routineName);
    if (!presetStorageReady) {
      setPresetError('Saved routines are unavailable because storage could not be read.');
      return;
    }
    if (!name) {
      setPresetError('Enter a name for this routine.');
      return;
    }
    if (savedRoutines.some(item => item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setPresetError('A routine with that name already exists.');
      return;
    }
    if (savedRoutines.length >= 30) {
      setPresetError('You can save up to 30 routines. Delete one to make room.');
      return;
    }
    const routine: SavedRoutine = {
      ...settings,
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`,
      name,
    };
    if (await persistRoutines([...savedRoutines, routine], 'This device could not save the routine. Check storage and try again.')) {
      setRoutineName('');
      setSelectedPreset(routine.id);
    }
  };
  const deleteRoutine = async (routine: SavedRoutine) => {
    const next = savedRoutines.filter(item => item.id !== routine.id);
    if (await persistRoutines(next, 'This device could not delete the routine. Check storage and try again.') && selectedPreset === routine.id) {
      setSelectedPreset('');
    }
  };
  const confirmDeleteRoutine = (routine: SavedRoutine) => {
    const message = `Delete “${routine.name}” from your saved routines?`;
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(message)) void deleteRoutine(routine);
      return;
    }
    Alert.alert('Delete routine?', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { void deleteRoutine(routine); } },
    ]);
  };
  const start = () => {
    const now = Date.now();
    publish({
      phase: 'prepare',
      setIndex: 1,
      remainingMs: PREPARE_SECONDS * 1000,
      deadline: now + PREPARE_SECONDS * 1000,
      running: true,
      settings: { ...settings },
    });
  };
  const pauseOrResume = () => {
    const current = sessionRef.current;
    if (!current || current.phase === 'complete') return;
    if (current.running) {
      const updated = tickSession(current, Date.now());
      if (updated.phase === 'complete') {
        publish(updated);
        return;
      }
      publish({ ...updated, running: false, remainingMs: Math.max(0, updated.deadline - Date.now()) });
    } else {
      publish({ ...current, running: true, deadline: Date.now() + current.remainingMs });
    }
  };
  const skipSet = () => {
    const current = sessionRef.current;
    if (!current || current.phase === 'complete') return;
    const next: Session = current.setIndex >= current.settings.sets
      ? { ...current, phase: 'complete', remainingMs: 0, running: false }
      : {
        ...current,
        phase: 'work',
        setIndex: current.setIndex + 1,
        running: current.running,
        remainingMs: current.settings.work * 1000,
        deadline: Date.now() + current.settings.work * 1000,
      };
    publish(next);
  };
  const endSession = () => publish(null);

  const seconds = session ? Math.ceil(session.remainingMs / 1000) : 0;
  const duration = session
    ? session.phase === 'prepare' ? PREPARE_SECONDS : session.phase === 'work' ? session.settings.work : session.phase === 'rest' ? session.settings.rest : 1
    : 1;
  const progress = session
    ? session.phase === 'complete' ? 1 : Math.max(0, Math.min(1, 1 - session.remainingMs / (duration * 1000)))
    : 0;
  const phaseTitle = session?.phase === 'prepare' ? 'GET READY' : session?.phase === 'work' ? 'GO!' : session?.phase === 'rest' ? 'REST' : 'WELL DONE';

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} testID="interval-timer">
      <View style={styles.cardHeader}>
        <View style={[styles.iconBadge, { backgroundColor: colors.accent }]}>
          <Feather name="clock" size={16} color={colors.accentForeground} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={[styles.kicker, { color: colors.primary }]}>YOUR TRAINING RHYTHM</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Intervals & rest.</Text>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>Find your pace. We’ll watch the clock while you focus on the next rep.</Text>
        </View>
      </View>

      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>A GOOD PLACE TO START</Text>
      <View style={styles.presetList}>
        {PRESETS.map(preset => {
          const selected = selectedPreset === preset.id;
          return (
            <Pressable
              key={preset.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              testID={`preset-${preset.id}`}
              onPress={() => choosePreset(preset)}
              style={({ pressed }) => [
                styles.preset,
                { backgroundColor: selected ? colors.accent : colors.background, borderColor: selected ? colors.accent : colors.border, opacity: pressed ? 0.75 : 1 },
              ]}
            >
              <Text style={[styles.presetName, { color: colors.foreground }]}>{preset.name}</Text>
              <Text style={[styles.presetDetail, { color: colors.mutedForeground }]}>{preset.detail}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.routineSaveRow}>
        <TextInput
          accessibilityLabel="Name your custom routine"
          testID="interval-routine-name"
          value={routineName}
          maxLength={32}
          onChangeText={value => { setRoutineName(sanitizeRoutineName(value)); if (presetStorageReady) setPresetError(''); }}
          placeholder="Name your own routine"
          placeholderTextColor={colors.mutedForeground}
          returnKeyType="done"
          onSubmitEditing={() => { void saveRoutine(); }}
          style={[styles.routineInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
        />
        <Pressable
          accessibilityRole="button"
          testID="save-interval-routine"
          disabled={presetBusy || !presetStorageReady}
          onPress={() => { void saveRoutine(); }}
          style={({ pressed }) => [styles.saveRoutineButton, { backgroundColor: colors.secondary, opacity: presetBusy || !presetStorageReady ? 0.5 : pressed ? 0.75 : 1 }]}
        >
          <Feather name="bookmark" size={14} color={colors.secondaryForeground} />
          <Text style={[styles.saveRoutineText, { color: colors.secondaryForeground }]}>Save</Text>
        </Pressable>
      </View>
      {savedRoutines.length > 0 && <View style={styles.savedRoutines}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>YOUR SAVED ROUTINES</Text>
        {savedRoutines.map(routine => (
          <View key={routine.id} style={[styles.savedRoutine, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Load ${routine.name}`} testID={`load-interval-routine-${routine.id}`} onPress={() => loadRoutine(routine)} style={styles.loadRoutine}>
              <Text numberOfLines={1} style={[styles.savedRoutineName, { color: colors.foreground }]}>{routine.name}</Text>
              <Text style={[styles.savedRoutineDetail, { color: colors.mutedForeground }]}>{routine.sets} sets · {formatTime(routine.work)} / {formatTime(routine.rest)}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${routine.name}`} testID={`delete-interval-routine-${routine.id}`} disabled={presetBusy} onPress={() => confirmDeleteRoutine(routine)} hitSlop={8} style={styles.deleteRoutine}>
              <Feather name="trash-2" size={15} color={colors.destructive} />
            </Pressable>
          </View>
        ))}
      </View>}
      {!!presetError && <Text accessibilityRole="alert" testID="interval-routine-error" style={[styles.presetError, { color: colors.destructive }]}>{presetError}</Text>}

      <View style={styles.steppers}>
        <Stepper label="Sets" value={settings.sets} min={1} max={30} step={1} display={String(settings.sets).padStart(2, '0')} onChange={value => updateSetting('sets', value)} testID="sets" colors={colors} />
        <Stepper label="Work" value={settings.work} min={5} max={3599} step={5} display={formatTime(settings.work)} onChange={value => updateSetting('work', value)} testID="work" colors={colors} />
        <Stepper label="Rest" value={settings.rest} min={0} max={3599} step={5} display={formatTime(settings.rest)} onChange={value => updateSetting('rest', value)} testID="rest" colors={colors} />
      </View>

      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: settings.skipLastRest }}
        testID="switch-skip-last-rest"
        onPress={() => updateSetting('skipLastRest', !settings.skipLastRest)}
        style={styles.toggleRow}
      >
        <View style={styles.toggleCopy}>
          <Text style={[styles.toggleTitle, { color: colors.foreground }]}>Skip the last rest</Text>
          <Text style={[styles.toggleHint, { color: colors.mutedForeground }]}>Finish after your final work set.</Text>
        </View>
        <View style={[styles.switchTrack, { backgroundColor: settings.skipLastRest ? colors.accent : colors.muted }]}>
          <View style={[styles.switchThumb, { backgroundColor: settings.skipLastRest ? colors.accentForeground : colors.card, alignSelf: settings.skipLastRest ? 'flex-end' : 'flex-start' }]} />
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        testID="start-interval"
        onPress={start}
        style={({ pressed }) => [styles.startButton, { backgroundColor: colors.primary, opacity: pressed ? 0.78 : 1 }]}
      >
        <Feather name="play" size={16} color={colors.primaryForeground} />
        <Text style={[styles.startText, { color: colors.primaryForeground }]}>START TIMER</Text>
      </Pressable>
      <Text style={[styles.footerHint, { color: colors.mutedForeground }]}>Includes a five-second get-ready count.</Text>

      <Modal visible={!!session} animationType={reduced?'none':'slide'} presentationStyle="fullScreen" onRequestClose={endSession} statusBarTranslucent>
        <View style={[styles.modalScreen, { backgroundColor: colors.background, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
          {session && <>
            <View style={styles.modalHeader}>
              <View style={styles.modalBrand}>
                <BrandMark size={24} tile={colors.primary} glyph={colors.primaryForeground} />
                <BrandWordmark size={20} color={colors.foreground} />
                <Text style={[styles.brandDivider, { color: colors.mutedForeground }]}>/ Strength</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="End session" testID="end-interval" onPress={endSession} hitSlop={10} style={styles.endButton}>
                <Feather name="x" size={15} color={colors.foreground} />
                <Text style={[styles.endText, { color: colors.foreground }]}>End</Text>
              </Pressable>
            </View>

            <View style={styles.sessionBody}>
              <View style={styles.sessionStatus}>
                <View style={[styles.statusDot, { backgroundColor: session.phase === 'complete' ? colors.accent : colors.primary }]} />
                <Text style={[styles.statusText, { color: colors.mutedForeground }]}>
                  {session.phase === 'complete' ? 'Session complete' : `${session.phase} · Session ${session.running ? 'in progress' : 'paused'}`}
                </Text>
              </View>
              <Text accessibilityLiveRegion="polite" style={[styles.phaseTitle, { color: colors.foreground }]}>
                {session.phase !== 'complete' && !session.running ? 'PAUSED' : phaseTitle}
              </Text>

              <View style={[styles.timerRing, { borderColor: colors.accent }]}>
                <View style={[styles.timerInner, { backgroundColor: colors.card }]}>
                  <Text style={[styles.timerCaption, { color: colors.mutedForeground }]}>
                    {session.phase === 'complete' ? 'ALL DONE' : session.phase === 'prepare' ? 'STARTING IN' : session.phase === 'rest' ? 'BREATHE EASY' : 'KEEP MOVING'}
                  </Text>
                  {session.phase === 'complete'
                    ? <Feather name="check" size={62} color={colors.primary} />
                    : <Text accessibilityLabel={`${Math.floor(seconds / 60)} minutes ${seconds % 60} seconds remaining`} style={[styles.countdown, { color: colors.foreground }]}>{formatTime(seconds)}</Text>}
                  <Text style={[styles.timerSet, { color: colors.mutedForeground }]}>
                    {session.phase === 'complete' ? 'You showed up.' : `Set ${session.setIndex} of ${session.settings.sets}`}
                  </Text>
                </View>
                <View style={[styles.progressArc, { borderTopColor: colors.primary, borderRightColor: progress > 0.25 ? colors.primary : 'transparent', borderBottomColor: progress > 0.5 ? colors.primary : 'transparent', borderLeftColor: progress > 0.75 ? colors.primary : 'transparent', transform: [{ rotate: `${Math.round(progress * 360)}deg` }] }]} />
              </View>

              <Text style={[styles.sessionMessage, { color: colors.mutedForeground }]}>
                {session.phase === 'complete' ? 'Every set counts. Take that good feeling with you.' :
                  !session.running ? 'Take your time. Pick up right where you left off.' :
                    session.phase === 'prepare' ? 'Set your stance. Your first interval is nearly here.' :
                      session.phase === 'work' ? 'One rep at a time. You’ve got this.' : 'Catch your breath. Your next set is coming.'}
              </Text>

              <View style={styles.setProgress}>
                <View style={styles.progressHeader}>
                  <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>YOUR SETS</Text>
                  <Text style={[styles.progressCount, { color: colors.foreground }]}>{Math.min(session.setIndex, session.settings.sets)} / {session.settings.sets}</Text>
                </View>
                <View style={styles.segmentRow}>
                  {Array.from({ length: session.settings.sets }, (_, index) => {
                    const done = session.phase === 'complete' || index < session.setIndex - 1;
                    const current = !done && index === session.setIndex - 1;
                    return <View key={index} style={[styles.segment, { backgroundColor: done ? colors.primary : current ? colors.accent : colors.muted }]} />;
                  })}
                </View>
              </View>

              <View style={styles.actions}>
                {session.phase === 'complete' ? <>
                  <Pressable accessibilityRole="button" testID="again-interval" onPress={start} style={[styles.mainAction, { backgroundColor: colors.primary }]}>
                    <Feather name="play" size={15} color={colors.primaryForeground} />
                    <Text style={[styles.mainActionText, { color: colors.primaryForeground }]}>Go again</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" testID="done-interval" onPress={endSession} style={[styles.secondaryAction, { borderColor: colors.border, backgroundColor: colors.card }]}>
                    <Feather name="check" size={15} color={colors.foreground} />
                    <Text style={[styles.secondaryActionText, { color: colors.foreground }]}>Done</Text>
                  </Pressable>
                </> : <>
                  <Pressable accessibilityRole="button" testID="pause-interval" onPress={pauseOrResume} style={[styles.mainAction, { backgroundColor: colors.primary }]}>
                    <Feather name={session.running ? 'pause' : 'play'} size={15} color={colors.primaryForeground} />
                    <Text style={[styles.mainActionText, { color: colors.primaryForeground }]}>{session.running ? 'Pause' : 'Resume'}</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" testID="skip-interval" onPress={skipSet} style={[styles.secondaryAction, { borderColor: colors.border, backgroundColor: colors.card }]}>
                    <Feather name="skip-forward" size={15} color={colors.foreground} />
                    <Text style={[styles.secondaryActionText, { color: colors.foreground }]}>Skip set</Text>
                  </Pressable>
                </>}
              </View>
            </View>
            <Text style={[styles.modalFooter, { color: colors.mutedForeground }]}>Your pace is enough. Keep going.</Text>
          </>}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 19 },
  iconBadge: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  headerCopy: { flex: 1 },
  kicker: { fontFamily: 'DMSans_700Bold', fontSize: 9, letterSpacing: 1.25, marginBottom: 4 },
  title: { fontFamily: 'DMSans_700Bold', fontSize: 21, lineHeight: 26, letterSpacing: -0.7 },
  description: { fontFamily: 'DMSans_400Regular', fontSize: 11, lineHeight: 16, marginTop: 4 },
  sectionLabel: { fontFamily: 'DMSans_700Bold', fontSize: 9, letterSpacing: 1.15, marginBottom: 8 },
  presetList: { flexDirection: 'row', gap: 6, marginBottom: 14 },
  preset: { flex: 1, minHeight: 60, borderWidth: 1, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 8, justifyContent: 'center' },
  presetName: { fontFamily: 'DMSans_700Bold', fontSize: 10, lineHeight: 13 },
  presetDetail: { fontFamily: 'DMSans_400Regular', fontSize: 8, lineHeight: 12, marginTop: 3 },
  routineSaveRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 11 },
  routineInput: { flex: 1, height: 38, borderWidth: 1, borderRadius: 9, paddingHorizontal: 9, fontFamily: 'DMSans_400Regular', fontSize: 10 },
  saveRoutineButton: { minWidth: 66, height: 38, borderRadius: 9, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 },
  saveRoutineText: { fontFamily: 'DMSans_700Bold', fontSize: 10 },
  savedRoutines: { marginBottom: 13 },
  savedRoutine: { minHeight: 48, borderWidth: 1, borderRadius: 9, flexDirection: 'row', alignItems: 'center', marginBottom: 6, paddingHorizontal: 10 },
  loadRoutine: { flex: 1, paddingVertical: 7 },
  savedRoutineName: { fontFamily: 'DMSans_700Bold', fontSize: 11 },
  savedRoutineDetail: { fontFamily: 'DMSans_400Regular', fontSize: 9, marginTop: 2 },
  deleteRoutine: { width: 34, height: 36, alignItems: 'center', justifyContent: 'center' },
  presetError: { fontFamily: 'DMSans_400Regular', fontSize: 10, lineHeight: 14, marginBottom: 10 },
  steppers: { flexDirection: 'row', gap: 7 },
  stepper: { flex: 1, borderWidth: 1, borderRadius: 11, paddingVertical: 8, paddingHorizontal: 5, alignItems: 'center' },
  stepLabel: { fontFamily: 'DMSans_700Bold', fontSize: 10 },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginTop: 8 },
  stepButton: { width: 28, height: 30, borderRadius: 8, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  stepValue: { fontFamily: 'DMSans_700Bold', fontSize: 13, letterSpacing: -0.3 },
  stepHint: { fontFamily: 'DMSans_400Regular', fontSize: 8, marginTop: 5 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 },
  toggleCopy: { flex: 1 },
  toggleTitle: { fontFamily: 'DMSans_700Bold', fontSize: 11 },
  toggleHint: { fontFamily: 'DMSans_400Regular', fontSize: 9, marginTop: 3 },
  switchTrack: { width: 39, height: 23, borderRadius: 13, justifyContent: 'center', padding: 3, marginLeft: 10 },
  switchThumb: { width: 17, height: 17, borderRadius: 9 },
  startButton: { height: 46, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  startText: { fontFamily: 'DMSans_700Bold', fontSize: 11, letterSpacing: 0.6 },
  footerHint: { fontFamily: 'DMSans_400Regular', textAlign: 'center', fontSize: 9, marginTop: 9 },
  modalScreen: { flex: 1, paddingHorizontal: 18, justifyContent: 'space-between' },
  modalHeader: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalBrand: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  brandDivider: { fontFamily: 'DMSans_400Regular', fontSize: 11 },
  endButton: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 6 },
  endText: { fontFamily: 'DMSans_700Bold', fontSize: 11 },
  sessionBody: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingVertical: 14 },
  sessionStatus: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontFamily: 'DMSans_400Regular', fontSize: 11, textTransform: 'capitalize' },
  phaseTitle: { fontFamily: 'DMSans_700Bold', fontSize: 27, letterSpacing: 1, marginTop: 16, marginBottom: 18 },
  timerRing: { width: 218, height: 218, borderRadius: 110, borderWidth: 5, alignItems: 'center', justifyContent: 'center' },
  timerInner: { width: 198, height: 198, borderRadius: 100, alignItems: 'center', justifyContent: 'center' },
  progressArc: { position: 'absolute', width: 218, height: 218, borderWidth: 5, borderRadius: 110 },
  timerCaption: { fontFamily: 'DMSans_700Bold', fontSize: 9, letterSpacing: 1.2, marginBottom: 5 },
  countdown: { fontFamily: 'DMSans_700Bold', fontSize: 48, letterSpacing: -2.5 },
  timerSet: { fontFamily: 'DMSans_400Regular', fontSize: 11, marginTop: 5 },
  sessionMessage: { fontFamily: 'DMSans_400Regular', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 20, maxWidth: 290 },
  setProgress: { width: '100%', marginTop: 28 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressCount: { fontFamily: 'DMSans_700Bold', fontSize: 11 },
  segmentRow: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 6, borderRadius: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 23 },
  mainAction: { minWidth: 125, height: 43, borderRadius: 10, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  mainActionText: { fontFamily: 'DMSans_700Bold', fontSize: 12 },
  secondaryAction: { minWidth: 105, height: 43, borderWidth: 1, borderRadius: 10, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  secondaryActionText: { fontFamily: 'DMSans_700Bold', fontSize: 11 },
  modalFooter: { fontFamily: 'DMSans_400Regular', fontSize: 10, textAlign: 'center', paddingVertical: 8 },
});