import { useEffect, useRef, useState } from 'react';

export type WorkoutKind = 'outdoor-walk' | 'indoor-walk' | 'strength';
export type WorkoutHistoryEntry = {
  id: string;
  kind: WorkoutKind;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  steps: number;
  distanceMeters: number | null;
  activeCalories: number | null;
  totalCalories: number | null;
};
type ActiveWorkout = {
  id: string;
  kind: WorkoutKind;
  startedAt: number;
  elapsedMs: number;
  runningSince: number | null;
  savedAt: number;
  steps: number;
  sensorSeen: boolean;
  strideCm: number;
  weightKg: number;
};
type Countdown = { kind: WorkoutKind; endsAt: number; strideCm: number; weightKg: number };

const HISTORY_KEY = 'fitpulse-workout-sessions';
const DRAFT_KEY = 'fitpulse-active-workout';
const isKind = (kind: unknown): kind is WorkoutKind =>
  kind === 'outdoor-walk' || kind === 'indoor-walk' || kind === 'strength';

function readHistory(): WorkoutHistoryEntry[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is WorkoutHistoryEntry =>
      !!entry && typeof entry.id === 'string' && isKind(entry.kind) &&
      Number.isFinite(entry.startedAt) && Number.isFinite(entry.endedAt) &&
      Number.isFinite(entry.durationMs) && entry.durationMs >= 0 &&
      Number.isSafeInteger(entry.steps) && entry.steps >= 0 &&
      (entry.distanceMeters === null || (Number.isFinite(entry.distanceMeters) && entry.distanceMeters >= 0)) &&
      (entry.activeCalories === null || Number.isFinite(entry.activeCalories)) &&
      (entry.totalCalories === null || Number.isFinite(entry.totalCalories)));
  } catch { return []; }
}

function readDraft(): ActiveWorkout | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
    if (!value || typeof value !== 'object') return null;
    const draft = value as ActiveWorkout;
    if (!isKind(draft.kind) || typeof draft.id !== 'string' ||
      !Number.isFinite(draft.startedAt) || !Number.isFinite(draft.elapsedMs) || draft.elapsedMs < 0 ||
      !Number.isFinite(draft.savedAt) || !Number.isSafeInteger(draft.steps) || draft.steps < 0 ||
      !Number.isFinite(draft.strideCm) || draft.strideCm < 30 || draft.strideCm > 150 ||
      !Number.isFinite(draft.weightKg) || draft.weightKg < 20 || draft.weightKg > 500) return null;
    // Reloading must not quietly count unseen time or claim the motion sensor is connected.
    return {
      ...draft,
      elapsedMs: draft.elapsedMs + (draft.runningSince !== null && Number.isFinite(draft.runningSince)
        ? Math.max(0, draft.savedAt - draft.runningSince) : 0),
      runningSince: null, sensorSeen: draft.sensorSeen === true || draft.steps > 0,
    };
  } catch { return null; }
}

export function workoutMetrics(workout: Pick<ActiveWorkout, 'kind' | 'steps' | 'strideCm' | 'weightKg'>, elapsedMs: number, hasMotionData: boolean) {
  const hours = elapsedMs / 3_600_000;
  if (workout.kind === 'strength') {
    return {
      distanceMeters: null,
      averagePaceSecondsPerKm: null,
      activeCalories: hours * workout.weightKg * 2.5,
      totalCalories: hours * workout.weightKg * 3.5,
    };
  }
  const distanceMeters = hasMotionData || workout.steps > 0 ? workout.steps * workout.strideCm / 100 : null;
  const activeCalories = distanceMeters === null ? null : distanceMeters / 1000 * workout.weightKg * 0.53;
  return {
    distanceMeters,
    averagePaceSecondsPerKm: distanceMeters && distanceMeters > 0 ? elapsedMs / 1000 / (distanceMeters / 1000) : null,
    activeCalories,
    totalCalories: activeCalories === null ? null : activeCalories + hours * workout.weightKg,
  };
}

export function useWorkoutSessions() {
  const [sessions, setSessions] = useState<WorkoutHistoryEntry[]>(readHistory);
  const [active, setActive] = useState<ActiveWorkout | null>(readDraft);
  const activeRef = useRef(active);
  const [countdown, setCountdown] = useState<Countdown | null>(null);
  const [now, setNow] = useState(Date.now);
  const [error, setError] = useState('');

  const updateActive = (next: ActiveWorkout | null) => {
    activeRef.current = next;
    setActive(next);
    try {
      if (next) localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
      else localStorage.removeItem(DRAFT_KEY);
      setError('');
    } catch { setError('This browser could not save your workout. Enable local storage before ending it.'); }
  };

  useEffect(() => {
    // Persist the paused recovery state, not the stale pre-reload running state.
    if (activeRef.current) {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(activeRef.current)); }
      catch { setError('This browser could not save your workout. Enable local storage before ending it.'); }
    }
  }, []);

  useEffect(() => {
    if (!active?.runningSince && !countdown) return;
    const timer = window.setInterval(() => setNow(Date.now()), 50);
    return () => window.clearInterval(timer);
  }, [active?.runningSince, countdown]);

  useEffect(() => {
    if (!active?.runningSince) return;
    const timer = window.setInterval(() => {
      const current = activeRef.current;
      if (!current?.runningSince) return;
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...current, savedAt: Date.now() }));
      } catch { setError('This browser could not save your workout. Enable local storage before ending it.'); }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [active?.runningSince]);

  useEffect(() => {
    if (!countdown) return;
    const timer = window.setTimeout(() => {
      if (document.hidden) { setCountdown(null); return; }
      const startedAt = Date.now();
      updateActive({
        id: crypto.randomUUID(), kind: countdown.kind, startedAt, elapsedMs: 0,
        runningSince: startedAt, savedAt: startedAt, steps: 0, sensorSeen: false,
        strideCm: countdown.strideCm, weightKg: countdown.weightKg,
      });
      setCountdown(null);
    }, Math.max(0, countdown.endsAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [countdown]);

  useEffect(() => {
    const onHidden = () => {
      if (!document.hidden) return;
      setCountdown(null);
      const current = activeRef.current;
      if (current?.runningSince) updateActive({
        ...current, elapsedMs: current.elapsedMs + Math.max(0, Date.now() - current.runningSince),
        runningSince: null, savedAt: Date.now(),
      });
    };
    document.addEventListener('visibilitychange', onHidden);
    return () => document.removeEventListener('visibilitychange', onHidden);
  }, []);

  const start = (kind: WorkoutKind, strideCm: number, weightKg: number) => {
    if (activeRef.current || countdown) return;
    setCountdown({ kind, strideCm, weightKg, endsAt: Date.now() + 3000 });
    setNow(Date.now());
  };
  const pause = () => {
    const current = activeRef.current;
    if (!current?.runningSince) return;
    const stoppedAt = Date.now();
    updateActive({ ...current, elapsedMs: current.elapsedMs + Math.max(0, stoppedAt - current.runningSince),
      runningSince: null, savedAt: stoppedAt });
  };
  const resume = () => {
    const current = activeRef.current;
    if (!current || current.runningSince !== null) return;
    updateActive({ ...current, runningSince: Date.now(), savedAt: Date.now() });
  };
  const recordStep = () => {
    const current = activeRef.current;
    if (!current?.runningSince || current.kind === 'strength') return;
    updateActive({ ...current, steps: current.steps + 1, sensorSeen: true, savedAt: Date.now() });
  };
  const markSensorReady = () => {
    const current = activeRef.current;
    if (current && current.kind !== 'strength' && !current.sensorSeen) {
      updateActive({ ...current, sensorSeen: true, savedAt: Date.now() });
    }
  };
  const elapsedMs = active ? active.elapsedMs + (active.runningSince !== null ? Math.max(0, now - active.runningSince) : 0) : 0;
  const end = () => {
    const current = activeRef.current;
    if (!current) return false;
    const endedAt = Date.now();
    const durationMs = current.elapsedMs +
      (current.runningSince !== null ? Math.max(0, endedAt - current.runningSince) : 0);
    const metrics = workoutMetrics(current, durationMs, current.sensorSeen);
    const completed: WorkoutHistoryEntry = {
      id: current.id, kind: current.kind, startedAt: current.startedAt,
      endedAt, durationMs, steps: current.steps,
      distanceMeters: metrics.distanceMeters,
      activeCalories: metrics.activeCalories, totalCalories: metrics.totalCalories,
    };
    const next = [completed, ...sessions];
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      localStorage.removeItem(DRAFT_KEY);
      setSessions(next);
      activeRef.current = null;
      setActive(null);
      setError('');
      return true;
    } catch {
      setError('Workout could not be saved. Check browser storage and try again.');
      return false;
    }
  };

  return {
    active, sessions, countdown, error, elapsedMs, recordStep, markSensorReady, start, pause, resume, end,
    cancelCountdown: () => setCountdown(null),
    countdownNumber: countdown ? Math.max(1, Math.ceil((countdown.endsAt - now) / 1000)) : 0,
  };
}