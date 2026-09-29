import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useFitness } from '@/providers/FitnessProvider';
import { withJournalStorageLock } from '@/providers/journalStorageLock';

type WorkoutKind = 'outdoor-walk' | 'indoor-walk' | 'strength';
type WorkoutHistoryEntry = {
  id: string;
  kind: WorkoutKind;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  steps: number;
};
type ActiveWorkout = {
  id: string;
  kind: WorkoutKind;
  startedAt: number;
  elapsedMs: number;
  runningSince: number | null;
  savedAt: number;
  stepsByDate: { date: string; steps: number }[];
  lastObservation: { date: string; steps: number } | null;
};
type Countdown = { kind: WorkoutKind; endsAt: number };

const HISTORY_KEY = 'fitpulse-workout-sessions';
const DRAFT_KEY = 'fitpulse-active-workout';
const labels: Record<WorkoutKind, string> = {
  'outdoor-walk': 'Outdoor Walk',
  'indoor-walk': 'Indoor Walk',
  strength: 'Traditional Strength Training',
};
const cardDetails: Record<WorkoutKind, { eyebrow: string; detail: string; icon: keyof typeof Feather.glyphMap }> = {
  'outdoor-walk': { eyebrow: 'FIND YOUR ROUTE', detail: 'Best-effort steps observed in your daily movement summary.', icon: 'map-pin' },
  'indoor-walk': { eyebrow: 'KEEP MOVING INDOORS', detail: 'Best-effort steps observed in your daily movement summary.', icon: 'navigation' },
  strength: { eyebrow: 'TRAIN YOUR WAY', detail: 'A focused timer for strength training.', icon: 'activity' },
};
const isKind = (kind: unknown): kind is WorkoutKind =>
  kind === 'outdoor-walk' || kind === 'indoor-walk' || kind === 'strength';
const isDateKey = (date: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  try { return new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) === date; }
  catch { return false; }
};
const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
const compact = (n: number) => Math.max(0, Math.floor(n)).toLocaleString('en-US');
const localDateKey = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function formatTime(milliseconds: number) {
  const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const seconds = totalSeconds % 60;
  return `${hours ? `${String(hours).padStart(2, '0')}:` : ''}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function parseHistory(text: string | null): WorkoutHistoryEntry[] {
  if (text === null) return [];
  const value: unknown = JSON.parse(text);
  if (!Array.isArray(value)) throw new Error('Workout history is not a list.');
  const entries: WorkoutHistoryEntry[] = [];
  const ids = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== 'object') throw new Error('Workout history contains an invalid entry.');
    const entry = item as WorkoutHistoryEntry;
    if (typeof entry.id !== 'string' || !entry.id || ids.has(entry.id) || !isKind(entry.kind) ||
      !Number.isFinite(entry.startedAt) || !Number.isFinite(entry.endedAt) ||
      entry.endedAt < entry.startedAt || !Number.isFinite(entry.durationMs) || entry.durationMs < 0 ||
      !Number.isSafeInteger(entry.steps) || entry.steps < 0) {
      throw new Error('Workout history contains an invalid entry.');
    }
    ids.add(entry.id);
    entries.push(entry);
  }
  return entries;
}

function parseDraft(text: string | null): ActiveWorkout | null {
  if (text === null) return null;
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object') throw new Error('Active workout draft is invalid.');
  const draft = value as ActiveWorkout;
  if (!isKind(draft.kind) || typeof draft.id !== 'string' || !draft.id ||
    !Number.isFinite(draft.startedAt) || !Number.isFinite(draft.elapsedMs) ||
    draft.elapsedMs < 0 || !Number.isFinite(draft.savedAt) ||
    (draft.runningSince !== null && !Number.isFinite(draft.runningSince)) ||
    !Array.isArray(draft.stepsByDate) ||
    (draft.lastObservation !== null && (!draft.lastObservation || typeof draft.lastObservation.date !== 'string' ||
      !isDateKey(draft.lastObservation.date) || !Number.isSafeInteger(draft.lastObservation.steps) || draft.lastObservation.steps < 0))) {
    throw new Error('Active workout draft is invalid.');
  }
  const savedDates = new Set<string>();
  let totalSteps = 0;
  for (const item of draft.stepsByDate) {
    if (!item || typeof item.date !== 'string' || !isDateKey(item.date) ||
      !Number.isSafeInteger(item.steps) || item.steps < 0 || savedDates.has(item.date)) {
      throw new Error('Active workout draft is invalid.');
    }
    savedDates.add(item.date);
    totalSteps += item.steps;
    if (!Number.isSafeInteger(totalSteps)) throw new Error('Active workout draft is invalid.');
  }
  // Recover the most recently persisted elapsed time, then pause after a reload.
  return {
    ...draft,
    elapsedMs: draft.elapsedMs + (draft.runningSince !== null && Number.isFinite(draft.runningSince)
      ? Math.max(0, draft.savedAt - draft.runningSince) : 0),
    runningSince: null,
  };
}

function observeSteps(workout: ActiveWorkout, steps: number, date: string, countDelta = workout.runningSince !== null): ActiveWorkout {
  if (workout.kind === 'strength' || !Number.isSafeInteger(steps) || steps < 0 || !isDateKey(date)) return workout;
  const last = workout.lastObservation;
  let delta = 0;
  if (countDelta) {
    if (!last || date > last.date) delta = steps;
    else if (date === last.date && steps > last.steps) delta = steps - last.steps;
  }
  if (!delta && last?.date === date && steps <= last.steps) return workout;
  const day = workout.stepsByDate.find(item => item.date === date);
  const stepsByDate = day
    ? workout.stepsByDate.map(item => item.date === date ? { ...item, steps: item.steps + delta } : item)
    : delta ? [...workout.stepsByDate, { date, steps: delta }] : workout.stepsByDate;
  const lastObservation = !last || date >= last.date
    ? { date, steps: last?.date === date ? Math.max(last.steps, steps) : steps }
    : last;
  return { ...workout, stepsByDate, lastObservation };
}

function workoutSteps(workout: ActiveWorkout) {
  return workout.stepsByDate.reduce((total, item) => total + item.steps, 0);
}
const isValidObservation = (steps: number, date: string) =>
  Number.isSafeInteger(steps) && steps >= 0 && isDateKey(date);

export default function LiveWorkout({ steps, stepDate: providedStepDate, onComplete }: {
  steps: number;
  stepDate?: string;
  onComplete?: (kind: WorkoutKind, startedAt: number, sessionId: string) => void;
}) {
  const stepDate = providedStepDate ?? localDateKey();
  const colors = useColors();
  const fit = useFitness();
  const insets = useSafeAreaInsets();
  const [exercise, setExercise] = useState('');
  const [load, setLoad] = useState('');
  const [reps, setReps] = useState('');
  const [setType, setSetType] = useState<'working' | 'warmup' | 'drop' | 'failure'>('working');
  const [setFeedback, setSetFeedback] = useState('');
  const [restUntil, setRestUntil] = useState(0);
  const [history, setHistory] = useState<WorkoutHistoryEntry[]>([]);
  const [active, setActive] = useState<ActiveWorkout | null>(null);
  const activeRef = useRef<ActiveWorkout | null>(null);
  const [countdown, setCountdown] = useState<Countdown | null>(null);
  const [now, setNow] = useState(Date.now);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [storageHealthy, setStorageHealthy] = useState(false);
  const storageHealthyRef = useRef(false);
  const endingRef = useRef(false);
  const historyRef = useRef<WorkoutHistoryEntry[]>([]);
  const storageQueue = useRef<Promise<void>>(Promise.resolve());

  const setCurrent = useCallback((next: ActiveWorkout | null) => {
    activeRef.current = next;
    setActive(next);
  }, []);
  const persistDraft = useCallback((draft: ActiveWorkout | null) => {
    if (!storageHealthyRef.current) return Promise.reject(new Error('Workout storage needs recovery.'));
    if (endingRef.current) return Promise.reject(new Error('Workout is being saved.'));
    const task = storageQueue.current.then(async () => {
      if (endingRef.current && draft !== null) return;
      if (draft) await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      else await AsyncStorage.removeItem(DRAFT_KEY);
    });
    storageQueue.current = task.catch(() => undefined);
    return task;
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [historyText, draftText] = await Promise.all([
          AsyncStorage.getItem(HISTORY_KEY),
          AsyncStorage.getItem(DRAFT_KEY),
        ]);
        const loadedHistory = parseHistory(historyText);
        const recovered = parseDraft(draftText);
        if (!mounted) return;
        historyRef.current = loadedHistory;
        setHistory(loadedHistory);
        if (recovered && loadedHistory.some(entry => entry.id === recovered.id)) {
          await AsyncStorage.removeItem(DRAFT_KEY);
        } else if (recovered) {
          setCurrent(recovered);
          // Persist the recovered paused state so a second reload stays paused.
          await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(recovered));
        }
        storageHealthyRef.current = true;
        setStorageHealthy(true);
      } catch {
        storageHealthyRef.current = false;
        if (mounted) {
          setStorageHealthy(false);
          setError('Workout storage needs recovery. Saved data could not be read safely, so changes are blocked to protect it.');
        }
      } finally {
        if (mounted) setReady(true);
      }
    };
    void load();
    return () => { mounted = false; };
  }, [setCurrent]);

  // Journal sync can add sessions from the website while this screen stays mounted.
  // Never replace an active draft or race a local save with a history refresh.
  useEffect(() => {
    if (fit.journalSyncStatus !== 'synced' || !ready || !storageHealthy ||
      activeRef.current || endingRef.current) return;
    let mounted = true;
    void storageQueue.current.then(async () => {
      const saved = parseHistory(await AsyncStorage.getItem(HISTORY_KEY));
      if (!mounted || activeRef.current || endingRef.current) return;
      historyRef.current = saved;
      setHistory(saved);
    }).catch(() => {
      if (mounted) setError('Completed session history could not be refreshed; existing entries were kept.');
    });
    return () => { mounted = false; };
  }, [fit.journalSyncStatus, ready, storageHealthy]);

  useEffect(() => {
    if (!active?.runningSince && !countdown && restUntil <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [active?.runningSince, countdown, restUntil]);

  const logLiveSet = async () => {
    if (!active || active.kind !== 'strength' || saving) return;
    const weight = Number(load.trim());
    const count = Number(reps.trim());
    if (!exercise.trim() || !load.trim() || !reps.trim() ||
      !Number.isFinite(weight) || weight <= 0 || weight > 500 ||
      !Number.isInteger(count) || count < 1 || count > 30) {
      setSetFeedback('Enter an exercise, weight above 0 up to 500 kg, and 1–30 whole reps.');
      return;
    }
    const previousBest = Math.max(0, ...fit.sets.filter(item =>
      item.exercise.trim().toLowerCase() === exercise.trim().toLowerCase())
      .map(item => item.estimatedOneRm));
    const saved = await fit.addSet({ exercise, weight, reps: count, setType });
    if (!saved) { setSetFeedback('Set could not be saved. Check the message in the strength log.'); return; }
    const personalBest = weight * (1 + count / 30) > previousBest;
    setSetFeedback(personalBest ? 'New personal best. Set saved.' : 'Set saved to this workout.');
    setReps('');
    if (setType === 'working') setRestUntil(Date.now() + 90_000);
    if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  useEffect(() => {
    if (!countdown) return;
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, [countdown]);

  useEffect(() => {
    if (!countdown || now < countdown.endsAt) return;
    const startedAt = Date.now();
    const draft: ActiveWorkout = {
      id: newId(),
      kind: countdown.kind,
      startedAt,
      elapsedMs: 0,
      runningSince: startedAt,
      savedAt: startedAt,
      stepsByDate: [],
      lastObservation: countdown.kind === 'strength' ? null : { date: stepDate, steps: Math.max(0, Math.floor(steps)) },
    };
    setCountdown(null);
    setSaving(true);
    void persistDraft(draft).then(() => {
      setCurrent(draft);
      setError('');
    }).catch(() => {
      setError('Workout could not be saved on this device. Check storage and try starting again.');
    }).finally(() => setSaving(false));
  }, [countdown, now, persistDraft, setCurrent, stepDate, steps]);

  useEffect(() => {
    if (!active?.runningSince) return;
    const timer = setInterval(() => {
      const current = activeRef.current;
      if (!current?.runningSince) return;
      const savedAt = Date.now();
      const draft = {
        ...current,
        elapsedMs: current.elapsedMs + Math.max(0, savedAt - current.runningSince),
        runningSince: savedAt,
        savedAt,
      };
      if (endingRef.current || !storageHealthyRef.current) return;
      void persistDraft(draft).catch(() => {
        setError('Workout changes could not be saved. Check device storage before ending.');
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [active?.runningSince, persistDraft]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') return;
      setNow(Date.now());
      void (async () => {
        try {
          await storageQueue.current;
          const [historyText, draftText] = await Promise.all([
            AsyncStorage.getItem(HISTORY_KEY),
            AsyncStorage.getItem(DRAFT_KEY),
          ]);
          const loadedHistory = parseHistory(historyText);
          parseDraft(draftText);
          historyRef.current = loadedHistory;
          setHistory(loadedHistory);
        } catch {
          storageHealthyRef.current = false;
          setStorageHealthy(false);
          setError('Workout storage needs recovery. Saved data could not be read safely, so changes are blocked to protect it.');
        }
      })();
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const current = activeRef.current;
    if (!current || current.kind === 'strength') return;
    const observed = observeSteps(current, steps, stepDate);
    if (observed === current) return;
    setCurrent(observed);
    void persistDraft(observed).catch(() => {
      setError('Observed steps could not be saved. Check device storage before ending.');
    });
  }, [steps, stepDate, active?.id, persistDraft, setCurrent]);

  const elapsedMs = active
    ? active.elapsedMs + (active.runningSince !== null ? Math.max(0, now - active.runningSince) : 0)
    : 0;
  const observedActive = active && active.kind !== 'strength' ? observeSteps(active, steps, stepDate) : active;
  const stepsGained = observedActive && observedActive.kind !== 'strength' ? workoutSteps(observedActive) : 0;

  const start = (kind: WorkoutKind) => {
    if (!ready || !storageHealthyRef.current || activeRef.current || countdown || saving) return;
    if (kind !== 'strength' && !isValidObservation(steps, stepDate)) {
      setError('The daily movement summary is unavailable, so this walk cannot record observed steps yet.');
      return;
    }
    setError('');
    setNow(Date.now());
    setCountdown({ kind, endsAt: Date.now() + 4000 });
  };

  const togglePause = async () => {
    const existing = activeRef.current;
    if (!existing || saving || !storageHealthyRef.current) return;
    const timestamp = Date.now();
    const current = observeSteps(existing, steps, stepDate, existing.runningSince !== null);
    const next: ActiveWorkout = current.runningSince !== null
      ? { ...current, elapsedMs: current.elapsedMs + Math.max(0, timestamp - current.runningSince), runningSince: null, savedAt: timestamp }
      : { ...current, runningSince: timestamp, savedAt: timestamp };
    setSaving(true);
    try {
      await persistDraft(next);
      setCurrent(next);
      setNow(timestamp);
      setError('');
    } catch {
      setError('Pause state could not be saved. Please check device storage and try again.');
    } finally {
      setSaving(false);
    }
  };

  const endWorkout = async () => {
    const existing = activeRef.current;
    if (!existing || saving || !storageHealthyRef.current) return;
    const current = observeSteps(existing, steps, stepDate);
    const endedAt = Date.now();
    const durationMs = current.elapsedMs + (current.runningSince !== null ? Math.max(0, endedAt - current.runningSince) : 0);
    const completed: WorkoutHistoryEntry = {
      id: current.id,
      kind: current.kind,
      startedAt: current.startedAt,
      endedAt,
      durationMs,
      steps: current.kind === 'strength' ? 0 : workoutSteps(current),
    };
    endingRef.current = true;
    setSaving(true);
    try {
      const transaction = storageQueue.current.then(() => withJournalStorageLock(async () => {
        let storedHistory: WorkoutHistoryEntry[];
        try {
          storedHistory = parseHistory(await AsyncStorage.getItem(HISTORY_KEY));
        } catch {
          storageHealthyRef.current = false;
          setStorageHealthy(false);
          setError('Workout storage needs recovery. Saved data could not be read safely, so changes are blocked to protect it.');
          throw new Error('History storage requires recovery.');
        }
        const nextHistory = [completed, ...storedHistory.filter(entry => entry.id !== completed.id)];
        await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
        historyRef.current = nextHistory;
        setHistory(nextHistory);
        await AsyncStorage.removeItem(DRAFT_KEY);
        return nextHistory;
      }));
      storageQueue.current = transaction.then(() => undefined, () => undefined);
      const nextHistory = await transaction;
      setHistory(nextHistory);
      setCurrent(null);
      setConfirmEnd(false);
      setError('');
      setRestUntil(0);
      onComplete?.(completed.kind, completed.startedAt, completed.id);
      void fit.syncJournal();
    } catch {
      setError(storageHealthyRef.current
        ? 'Workout could not be saved. Your session is still open; check storage and try again.'
        : 'Workout storage needs recovery. Saved data could not be read safely, so changes are blocked to protect it.');
    } finally {
      endingRef.current = false;
      setSaving(false);
    }
  };

  const renderCard = (kind: WorkoutKind) => {
    const detail = cardDetails[kind];
    return (
      <View key={kind} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} testID={`card-workout-${kind}`}>
        <View style={[styles.cardIcon, { backgroundColor: colors.secondary }]}>
          <Feather name={detail.icon} size={19} color={colors.secondaryForeground} />
        </View>
        <View style={styles.cardCopy}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>{detail.eyebrow}</Text>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>{labels[kind]}</Text>
          <Text style={[styles.detail, { color: colors.mutedForeground }]}>{detail.detail}</Text>
        </View>
        <Pressable
          testID={`button-start-workout-${kind}`}
          accessibilityRole="button"
          accessibilityLabel={`Start ${labels[kind]}`}
          disabled={!ready || !storageHealthy || !!active || !!countdown || saving}
          onPress={() => start(kind)}
          style={({ pressed }) => [styles.startButton, { backgroundColor: colors.primary, opacity: pressed ? 0.75 : 1 }, (!ready || !storageHealthy || !!active || !!countdown || saving) && styles.disabled]}
        >
          <Feather name="play" size={15} color={colors.primaryForeground} />
          <Text style={[styles.startText, { color: colors.primaryForeground }]}>Start workout</Text>
          <Feather name="arrow-right" size={16} color={colors.primaryForeground} />
        </Pressable>
      </View>
    );
  };

  return (
    <View style={styles.container} testID="live-workout">
      <View style={styles.sectionHeading}>
        <View style={styles.headingCopy}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>LIVE WORKOUTS / ON YOUR TERMS</Text>
          <Text style={[styles.heading, { color: colors.foreground }]}>Make this one count.</Text>
        </View>
        <Feather name="activity" size={18} color={colors.secondaryForeground} />
      </View>
      {(['outdoor-walk', 'indoor-walk', 'strength'] as WorkoutKind[]).map(renderCard)}

      <View style={styles.historyHeading}>
        <View>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>YOUR MOVEMENT JOURNAL</Text>
          <Text style={[styles.heading, { color: colors.foreground }]}>Completed sessions.</Text>
        </View>
        <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>{history.length} SAVED</Text>
      </View>
      {!history.length ? (
        <Text style={[styles.empty, { color: colors.mutedForeground }]}>Finished workouts will appear here.</Text>
      ) : history.map(entry => (
        <View key={entry.id} style={[styles.historyRow, { borderBottomColor: colors.border }]} testID={`row-workout-session-${entry.id}`}>
          <View style={[styles.historyIcon, { backgroundColor: colors.secondary }]}>
            <Feather name={cardDetails[entry.kind].icon} size={17} color={colors.secondaryForeground} />
          </View>
          <View style={styles.historyCopy}>
            <Text style={[styles.historyTitle, { color: colors.foreground }]}>{labels[entry.kind]}</Text>
            <Text style={[styles.detail, { color: colors.mutedForeground }]}>
              {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(entry.endedAt)} · {formatTime(entry.durationMs)}
            </Text>
            {entry.kind === 'strength' && fit.completedWorkouts.some(workout => workout.id === entry.id) && (
              <Text style={[styles.detail, { color: colors.mutedForeground }]}>
                {fit.completedWorkouts.find(workout => workout.id === entry.id)?.setIds.length ?? 0} strength sets saved
              </Text>
            )}
          </View>
          {entry.kind !== 'strength' && <Text style={[styles.historySteps, { color: colors.secondaryForeground }]}>{compact(entry.steps)} steps</Text>}
        </View>
      ))}

      {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]} testID="status-workout-storage-error">{error}</Text> : null}

      <Modal visible={!!countdown || !!active} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => {
        if (countdown) setCountdown(null);
        else if (!confirmEnd) setConfirmEnd(true);
      }}>
        <View style={[styles.modal, { backgroundColor: colors.background, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 14 }]}>
          {countdown ? (
            <View style={styles.countdownScreen} testID="modal-workout-countdown">
              <View style={styles.modalTop}>
                <Text style={[styles.brand, { color: colors.foreground }]}>fit<Text style={{ color: colors.primary }}>pulse</Text> <Text style={{ color: colors.secondaryForeground }}>· LIVE</Text></Text>
                <Pressable testID="button-cancel-workout-countdown" accessibilityRole="button" accessibilityLabel="Cancel workout countdown" onPress={() => setCountdown(null)} hitSlop={12}>
                  <Feather name="x" size={24} color={colors.foreground} />
                </Pressable>
              </View>
              <View style={styles.countdownContent}>
                <Text style={[styles.eyebrow, { color: colors.primary }]}>GET READY / {labels[countdown.kind].toUpperCase()}</Text>
                <View style={[styles.countdownRing, { borderColor: colors.primary }]}>
                  <Text style={[styles.countdownNumber, { color: colors.foreground }]} testID="text-workout-countdown">{Math.max(1, Math.ceil((countdown.endsAt - now) / 1000))}</Text>
                </View>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Your workout begins now.</Text>
                <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>Get comfortable. You can cancel any time before the timer ends.</Text>
              </View>
              <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>BREATHE IN · LET’S MOVE</Text>
            </View>
          ) : active ? (
            <View style={styles.activeScreen} testID="screen-live-workout">
              <View style={styles.modalTop}>
                <Text style={[styles.brand, { color: colors.foreground }]}>fit<Text style={{ color: colors.primary }}>pulse</Text> <Text style={{ color: colors.secondaryForeground }}>· LIVE</Text></Text>
                <View style={[styles.liveBadge, { backgroundColor: active.runningSince === null ? colors.muted : colors.secondary }]}>
                  <Text style={[styles.eyebrow, { color: active.runningSince === null ? colors.mutedForeground : colors.secondaryForeground }]} testID="status-live-workout">
                    {active.runningSince === null ? 'PAUSED' : 'RECORDING'}
                  </Text>
                </View>
              </View>
              <ScrollView contentContainerStyle={styles.liveContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Text style={[styles.eyebrow, { color: colors.primary }]}>IN SESSION / NO PRESSURE, JUST PROGRESS</Text>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>{labels[active.kind]}</Text>
                <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>
                  {active.kind === 'strength' ? 'Strong moments are built one minute at a time.' : 'Best-effort observed steps from your daily summary; background motion may be missed.'}
                </Text>
                <View style={[styles.timerPanel, { backgroundColor: colors.foreground }]}>
                  <Text style={[styles.eyebrow, { color: colors.accent }]}>ELAPSED TIME</Text>
                  <Text style={[styles.timer, { color: colors.card }]} testID="text-live-elapsed">{formatTime(elapsedMs)}</Text>
                  <Text style={[styles.timerHint, { color: colors.muted }]}>Your pace, your progress.</Text>
                </View>
                {active.kind !== 'strength' && (
                  <View style={[styles.stepsPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Feather name="navigation" size={20} color={colors.primary} />
                    <View style={styles.historyCopy}>
                      <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>BEST-EFFORT OBSERVED STEPS</Text>
                      <Text style={[styles.stepsNumber, { color: colors.foreground }]} testID="text-live-steps">{compact(stepsGained)}</Text>
                    </View>
                    <Text style={[styles.detail, { color: colors.mutedForeground }]}>daily summary only</Text>
                  </View>
                )}
                {active.kind === 'strength' && (
                  <View style={[styles.setPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.historyTitle, { color: colors.foreground }]}>Sets in this session</Text>
                    {fit.sets.filter(item => item.loggedAt !== undefined && item.loggedAt >= active.startedAt).length ? (
                      fit.sets.filter(item => item.loggedAt !== undefined && item.loggedAt >= active.startedAt)
                        .map(item => <Text key={item.id} style={[styles.detail, { color: colors.mutedForeground }]}>
                          {item.exercise} · {item.weight.toLocaleString('en-US', { maximumFractionDigits: 1 })} kg × {item.reps} · {item.setType}
                        </Text>)
                    ) : <Text style={[styles.detail, { color: colors.mutedForeground }]}>Your first set is ready when you are.</Text>}
                    <TextInput testID="live-set-exercise" accessibilityLabel="Exercise" value={exercise} onChangeText={setExercise}
                      placeholder="Exercise" placeholderTextColor={colors.mutedForeground}
                      style={[styles.setInput, { borderColor: colors.border, color: colors.foreground }]} />
                    <View style={styles.setFields}>
                      <TextInput testID="live-set-weight" accessibilityLabel="Weight in kilograms" value={load} onChangeText={setLoad}
                        keyboardType="decimal-pad" placeholder="Weight (kg)" placeholderTextColor={colors.mutedForeground}
                        style={[styles.setInput, styles.setField, { borderColor: colors.border, color: colors.foreground }]} />
                      <TextInput testID="live-set-reps" accessibilityLabel="Repetitions" value={reps} onChangeText={setReps}
                        keyboardType="number-pad" placeholder="Reps" placeholderTextColor={colors.mutedForeground}
                        style={[styles.setInput, styles.setField, { borderColor: colors.border, color: colors.foreground }]} />
                    </View>
                    <View style={styles.setFields}>
                      {(['working', 'warmup', 'drop', 'failure'] as const).map(kind => (
                        <Pressable key={kind} onPress={() => setSetType(kind)}
                          style={[styles.setKind, { backgroundColor: setType === kind ? colors.secondary : colors.background, borderColor: colors.border }]}>
                          <Text style={[styles.detail, { color: colors.foreground }]}>{kind}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <Pressable testID="live-log-set" accessibilityRole="button" onPress={() => void logLiveSet()}
                      style={[styles.controlButton, { backgroundColor: colors.primary }]}>
                      <Text style={[styles.controlText, { color: colors.primaryForeground }]}>Save set</Text>
                    </Pressable>
                    {restUntil > now && <Pressable testID="live-rest-skip" onPress={() => setRestUntil(0)}>
                      <Text style={[styles.detail, { color: colors.secondaryForeground }]}>Rest {Math.ceil((restUntil - now) / 1000)}s · Tap to skip</Text>
                    </Pressable>}
                    {!!setFeedback && <Text accessibilityRole="alert" style={[styles.detail, { color: colors.secondaryForeground }]}>{setFeedback}</Text>}
                  </View>
                )}
              </ScrollView>
              <View style={[styles.controls, { borderTopColor: colors.border }]}>
                <Pressable testID="button-pause-resume-workout" accessibilityRole="button" disabled={saving} onPress={() => void togglePause()}
                  style={[styles.controlButton, { backgroundColor: colors.secondary, opacity: saving ? 0.5 : 1 }]}>
                  <Feather name={active.runningSince === null ? 'play' : 'pause'} size={17} color={colors.secondaryForeground} />
                  <Text style={[styles.controlText, { color: colors.secondaryForeground }]}>{active.runningSince === null ? 'Resume' : 'Pause'}</Text>
                </Pressable>
                <Pressable testID="button-end-workout" accessibilityRole="button" disabled={saving} onPress={() => setConfirmEnd(true)}
                  style={[styles.controlButton, { backgroundColor: colors.primary, opacity: saving ? 0.5 : 1 }]}>
                  <Feather name="square" size={15} color={colors.primaryForeground} />
                  <Text style={[styles.controlText, { color: colors.primaryForeground }]}>End workout</Text>
                </Pressable>
              </View>
              {error ? <Text accessibilityRole="alert" style={[styles.modalError, { color: colors.destructive }]} testID="status-workout-storage-error">{error}</Text> : null}
              {confirmEnd && (
                <View style={[styles.confirmScrim, { backgroundColor: 'rgba(0,0,0,0.5)' }]} testID="dialog-confirm-end">
                  <View style={[styles.confirmCard, { backgroundColor: colors.card }]}>
                    <Text style={[styles.eyebrow, { color: colors.primary }]}>ONE LAST THING</Text>
                    <Text style={[styles.confirmTitle, { color: colors.foreground }]}>Finish this workout?</Text>
                    <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>Your elapsed time and best-effort observed steps will be saved to your movement history.</Text>
                    <View style={styles.confirmActions}>
                      <Pressable testID="button-cancel-end-workout" accessibilityRole="button" onPress={() => setConfirmEnd(false)} style={[styles.confirmButton, { backgroundColor: colors.secondary }]}>
                        <Text style={[styles.controlText, { color: colors.secondaryForeground }]}>Keep going</Text>
                      </Pressable>
                      <Pressable testID="button-confirm-end-workout" accessibilityRole="button" disabled={saving} onPress={() => void endWorkout()} style={[styles.confirmButton, { backgroundColor: colors.primary, opacity: saving ? 0.5 : 1 }]}>
                        <Text style={[styles.controlText, { color: colors.primaryForeground }]}>{saving ? 'Saving…' : 'Save & end'}</Text>
                      </Pressable>
                    </View>
                    {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
                  </View>
                </View>
              )}
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  headingCopy: { flex: 1 },
  eyebrow: { fontFamily: 'DMSans_700Bold', fontSize: 10, letterSpacing: 1.1 },
  heading: { fontFamily: 'DMSans_700Bold', fontSize: 22, lineHeight: 28, marginTop: 4 },
  card: { borderWidth: 1, borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  cardIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  cardCopy: { flex: 1, minWidth: 0 },
  cardTitle: { fontFamily: 'DMSans_700Bold', fontSize: 15, lineHeight: 20, marginTop: 4 },
  detail: { fontFamily: 'DMSans_400Regular', fontSize: 12, lineHeight: 17, marginTop: 3 },
  startButton: { borderRadius: 13, minHeight: 42, paddingHorizontal: 10, marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'stretch' },
  startText: { fontFamily: 'DMSans_700Bold', fontSize: 11 },
  disabled: { opacity: 0.45 },
  historyHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  empty: { fontFamily: 'DMSans_400Regular', fontSize: 13, paddingVertical: 12 },
  historyRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 11, gap: 10 },
  historyIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  historyCopy: { flex: 1 },
  historyTitle: { fontFamily: 'DMSans_700Bold', fontSize: 13 },
  historySteps: { fontFamily: 'DMSans_700Bold', fontSize: 11 },
  error: { fontFamily: 'DMSans_400Regular', fontSize: 12, lineHeight: 17 },
  modal: { flex: 1 },
  countdownScreen: { flex: 1, alignItems: 'center', justifyContent: 'space-between' },
  activeScreen: { flex: 1 },
  modalTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, minHeight: 42 },
  brand: { fontFamily: 'DMSans_700Bold', fontSize: 16, letterSpacing: 0.3 },
  countdownContent: { alignItems: 'center', justifyContent: 'center', flex: 1, paddingHorizontal: 28 },
  countdownRing: { width: 174, height: 174, borderRadius: 87, borderWidth: 5, alignItems: 'center', justifyContent: 'center', marginVertical: 28 },
  countdownNumber: { fontFamily: 'DMSans_700Bold', fontSize: 68 },
  modalTitle: { fontFamily: 'DMSans_700Bold', fontSize: 28, lineHeight: 35, marginTop: 12 },
  modalSub: { fontFamily: 'DMSans_400Regular', fontSize: 14, lineHeight: 21, marginTop: 8 },
  liveBadge: { borderRadius: 20, paddingHorizontal: 11, paddingVertical: 7 },
  liveContent: { paddingHorizontal: 22, paddingTop: 30, paddingBottom: 20 },
  timerPanel: { borderRadius: 24, marginTop: 28, paddingHorizontal: 22, paddingVertical: 25, alignItems: 'center' },
  timer: { fontFamily: 'DMSans_700Bold', fontSize: 56, lineHeight: 66, marginTop: 8 },
  timerHint: { fontFamily: 'DMSans_400Regular', fontSize: 12, marginTop: 4 },
  stepsPanel: { borderRadius: 18, borderWidth: 1, marginTop: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  setPanel: { borderWidth: 1, borderRadius: 18, marginTop: 14, padding: 16, gap: 11 },
  setInput: { borderWidth: 1, borderRadius: 10, minHeight: 42, paddingHorizontal: 12, fontSize: 14 },
  setFields: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  setField: { flex: 1, minWidth: 98 },
  setKind: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7 },
  stepsNumber: { fontFamily: 'DMSans_700Bold', fontSize: 24, marginTop: 2 },
  controls: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, paddingTop: 14, flexDirection: 'row', gap: 10 },
  controlButton: { flex: 1, borderRadius: 15, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  controlText: { fontFamily: 'DMSans_700Bold', fontSize: 13 },
  modalError: { fontFamily: 'DMSans_400Regular', fontSize: 12, lineHeight: 17, paddingHorizontal: 20, paddingTop: 8 },
  confirmScrim: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 20 },
  confirmCard: { width: '100%', maxWidth: 360, borderRadius: 22, padding: 22 },
  confirmTitle: { fontFamily: 'DMSans_700Bold', fontSize: 23, marginTop: 10 },
  confirmActions: { flexDirection: 'row', gap: 9, marginTop: 20 },
  confirmButton: { flex: 1, minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
});