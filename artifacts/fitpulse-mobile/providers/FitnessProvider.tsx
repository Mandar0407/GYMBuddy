import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, Platform } from 'react-native';
import {
  persistFitnessJournalTombstones,
  deletedFitnessJournalKeys,
  syncFitnessJournal,
  type PendingDeletion,
} from './fitnessJournalSync';
import { updateGymBuddyWidget } from '@/widgets/updateGymBuddyWidget';
import { mergeJournalBackup,remapDeletedBackupIds } from '@/lib/premiumLogic';
import { useWidgetTargets } from '@/providers/PremiumProvider';

export type FitnessProfile = {
  name: string;
  goal: string;
  weight: number;
  height: number;
  calorieTarget: number;
  proteinTarget: number;
  carbsTarget: number;
  fatTarget: number;
  waterGoalMl: number;
  stepTarget: number;
  age: number;
  sex: 'female' | 'male';
  activity: 'sedentary' | 'light' | 'moderate' | 'high';
};

export type Meal = {
  id: string;
  date: string;
  time: string;
  meal: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  legacyMealLabel?: string;
  provenance?: string;
};

export type WorkoutSet = {
  id: string;
  date: string;
  loggedAt?: number;
  legacyLoggedAt?: string;
  exercise: string;
  weight: number;
  reps: number;
  setType: 'warmup' | 'working' | 'drop' | 'failure';
  estimatedOneRm: number;
};

export type CompletedWorkout = {
  id: string;
  date: string;
  completedAt: number;
  setIds: string[];
};

export type MovementSummary = {
  steps: number;
  goal: number;
  week: Array<{ date: string; steps: number | null }>;
};

export type FitnessState = {
  profile: FitnessProfile;
  meals: Meal[];
  sets: WorkoutSet[];
  completedWorkouts: CompletedWorkout[];
  water: Record<string, number>;
  weights: Array<{ date: string; weight: number }>;
};

type Targets = Pick<
  FitnessProfile,
  'calorieTarget' | 'proteinTarget' | 'carbsTarget' | 'fatTarget'
>;

type FitnessContextValue = FitnessState & {
  ready: boolean;
  canSave: boolean;
  error: string;
  journalSyncStatus: 'unpaired' | 'syncing' | 'synced' | 'error';
  journalSyncError: string;
  setJournalPairingKey(key: string): Promise<void>;
  setMovementSteps(steps: number | null): void;
  syncJournal(): Promise<void>;
  addMeal(input: Omit<Meal, 'id' | 'date' | 'time'>): Promise<boolean>;
  removeMeal(id: string): Promise<boolean>;
  editMeal(id: string, input: Omit<Meal, 'id' | 'date' | 'time'>): Promise<boolean>;
  undoAvailable: boolean;
  undoLastDeletion(): Promise<boolean>;
  importBackup(value: unknown, restoreProfile?: boolean): Promise<boolean>;
  getSnapshot():FitnessState;
  addSet(input: Pick<WorkoutSet, 'exercise' | 'weight' | 'reps' | 'setType'>): Promise<boolean>;
  removeSet(id: string): Promise<boolean>;
  finishWorkout(options?: { since?: number; sessionId?: string }): Promise<boolean>;
  saveTargets(targets: Targets): Promise<boolean>;
  applyPlan(update: Partial<FitnessProfile>): Promise<boolean>;
  addWater(amount: number): Promise<boolean>;
  removeWater(amount: number): Promise<boolean>;
  setWaterGoal(goalMl: number): Promise<boolean>;
  logWeight(weight: number): Promise<boolean>;
};

const STORAGE_KEY = '@fitpulse/mobile/fitness-state/v1';
const PAIR_KEY = 'fitpulsePairKey';
const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const;
const SET_TYPES = ['warmup', 'working', 'drop', 'failure'] as const;
const SEXES = ['female', 'male'] as const;
const ACTIVITIES = ['sedentary', 'light', 'moderate', 'high'] as const;

const DEFAULT_PROFILE: FitnessProfile = {
  name: 'Maya Chen',
  goal: 'Build strength',
  weight: 68,
  height: 170,
  calorieTarget: 2200,
  proteinTarget: 110,
  carbsTarget: 250,
  fatTarget: 70,
  waterGoalMl: 2000,
  stepTarget: 10000,
  age: 28,
  sex: 'female',
  activity: 'moderate',
};

const EMPTY_STATE: FitnessState = {
  profile: DEFAULT_PROFILE,
  meals: [],
  sets: [],
  completedWorkouts: [],
  water: {},
  weights: [],
};

const FitnessContext = createContext<FitnessContextValue | null>(null);

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const todayKey = () => dateKey(new Date());
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const isNumber = (value: unknown, min: number, max: number, integer = false): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value));
const cleanText = (value: unknown, maxLength: number): string =>
  typeof value === 'string' ? value.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maxLength) : '';
const isDateKey = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
const errorDetails = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

type MutationResult = { state: FitnessState } | { error: string };

function validTargets(value: Partial<Targets>): value is Targets {
  return isNumber(value.calorieTarget, 1000, 10000, true) &&
    isNumber(value.proteinTarget, 1, 1000, true) &&
    isNumber(value.carbsTarget, 1, 1000, true) &&
    isNumber(value.fatTarget, 1, 1000, true);
}

function validateState(value: unknown): { state: FitnessState; hadInvalidData: boolean } {
  if (!isRecord(value) || value.version !== 1) {
    return { state: EMPTY_STATE, hadInvalidData: true };
  }

  let hadInvalidData = false;
  let profile = DEFAULT_PROFILE;
  if (isRecord(value.profile)) {
    const saved = value.profile;
    const chooseNumber = (key: keyof FitnessProfile, min: number, max: number, integer = false) => {
      if (isNumber(saved[key], min, max, integer)) return saved[key] as number;
      hadInvalidData = true;
      return DEFAULT_PROFILE[key] as number;
    };
    const name = cleanText(saved.name, 80);
    const goal = cleanText(saved.goal, 120);
    const waterGoalMl = saved.waterGoalMl === undefined
      ? DEFAULT_PROFILE.waterGoalMl
      : chooseNumber('waterGoalMl', 100, 20000, true);
    if (!name || !goal ||
      !isNumber(saved.weight, 20, 500) ||
      !isNumber(saved.height, 100, 230) ||
      !isNumber(saved.calorieTarget, 1000, 10000, true) ||
      !isNumber(saved.proteinTarget, 1, 1000, true) ||
      !isNumber(saved.carbsTarget, 1, 1000, true) ||
      !isNumber(saved.fatTarget, 1, 1000, true) ||
      !isNumber(saved.stepTarget, 1000, 100000, true) ||
      !isNumber(saved.age, 14, 90, true) ||
      !SEXES.includes(saved.sex as (typeof SEXES)[number]) ||
      !ACTIVITIES.includes(saved.activity as (typeof ACTIVITIES)[number])) {
      hadInvalidData = true;
    }
    profile = {
      name: name || DEFAULT_PROFILE.name,
      goal: goal || DEFAULT_PROFILE.goal,
      weight: chooseNumber('weight', 20, 500),
      height: chooseNumber('height', 100, 230),
      calorieTarget: chooseNumber('calorieTarget', 1000, 10000, true),
      proteinTarget: chooseNumber('proteinTarget', 1, 1000, true),
      carbsTarget: chooseNumber('carbsTarget', 1, 1000, true),
      fatTarget: chooseNumber('fatTarget', 1, 1000, true),
      waterGoalMl,
      stepTarget: chooseNumber('stepTarget', 1000, 100000, true),
      age: chooseNumber('age', 14, 90, true),
      sex: SEXES.includes(saved.sex as (typeof SEXES)[number]) ? saved.sex as FitnessProfile['sex'] : DEFAULT_PROFILE.sex,
      activity: ACTIVITIES.includes(saved.activity as (typeof ACTIVITIES)[number]) ? saved.activity as FitnessProfile['activity'] : DEFAULT_PROFILE.activity,
    };
  } else {
    hadInvalidData = true;
  }

  const meals: Meal[] = [];
  if (Array.isArray(value.meals)) {
    for (const item of value.meals) {
      if (isRecord(item) &&
        typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 100 &&
        isDateKey(item.date) &&
        typeof item.time === 'string' && item.time.length <= 40 &&
        MEAL_TYPES.includes(item.meal as (typeof MEAL_TYPES)[number]) &&
        !!cleanText(item.name, 120) &&
        isNumber(item.calories, 0.01, 10000) &&
        isNumber(item.protein, 0, 1000) &&
        isNumber(item.carbs, 0, 1000) &&
        isNumber(item.fat, 0, 1000)) {
        meals.push({
          id: item.id,
          date: item.date,
          time: item.time,
          meal: item.meal as Meal['meal'],
          name: cleanText(item.name, 120),
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat,
          ...(typeof item.legacyMealLabel === 'string' ? { legacyMealLabel: cleanText(item.legacyMealLabel, 120) } : {}),
          ...(typeof item.provenance === 'string' ? { provenance: cleanText(item.provenance, 80) } : {}),
        });
      } else {
        hadInvalidData = true;
      }
    }
  } else {
    hadInvalidData = true;
  }

  const sets: WorkoutSet[] = [];
  if (Array.isArray(value.sets)) {
    for (const item of value.sets) {
      if (isRecord(item) &&
        typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 100 &&
        isDateKey(item.date) && !!cleanText(item.exercise, 120) &&
        isNumber(item.weight, 0.01, 500) &&
        isNumber(item.reps, 1, 30, true) &&
        (item.setType === undefined || SET_TYPES.includes(item.setType as (typeof SET_TYPES)[number])) &&
        (item.legacyLoggedAt === undefined || (typeof item.legacyLoggedAt === 'string' && item.legacyLoggedAt.length <= 40))) {
        sets.push({
          id: item.id,
          date: item.date,
          ...(typeof item.loggedAt === 'number' && Number.isFinite(item.loggedAt) ? { loggedAt: item.loggedAt } : {}),
          ...(typeof item.legacyLoggedAt === 'string' ? { legacyLoggedAt: item.legacyLoggedAt } : {}),
          exercise: cleanText(item.exercise, 120),
          weight: item.weight,
          reps: item.reps,
          setType: SET_TYPES.includes(item.setType as (typeof SET_TYPES)[number]) ? item.setType as WorkoutSet['setType'] : 'working',
          estimatedOneRm: item.weight * (1 + item.reps / 30),
        });
      } else {
        hadInvalidData = true;
      }
    }
  } else {
    hadInvalidData = true;
  }

  const setIds = new Set(sets.map((set) => set.id));
  const completedWorkouts: CompletedWorkout[] = [];
  if (Array.isArray(value.completedWorkouts)) {
    for (const item of value.completedWorkouts) {
      if (isRecord(item) &&
        typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 100 &&
        isDateKey(item.date) && isNumber(item.completedAt, 0, Number.MAX_SAFE_INTEGER) &&
        Array.isArray(item.setIds) &&
        item.setIds.every((id) => typeof id === 'string' && setIds.has(id))) {
        const uniqueIds = [...new Set(item.setIds as string[])];
        if (uniqueIds.length) {
          completedWorkouts.push({
            id: item.id,
            date: item.date,
            completedAt: item.completedAt,
            setIds: uniqueIds,
          });
        }
      } else {
        hadInvalidData = true;
      }
    }
  } else {
    hadInvalidData = true;
  }

  const water: Record<string, number> = {};
  if (isRecord(value.water)) {
    for (const [date, amount] of Object.entries(value.water)) {
      if (isDateKey(date) && isNumber(amount, 0, Number.MAX_SAFE_INTEGER)) water[date] = amount;
      else hadInvalidData = true;
    }
  } else {
    hadInvalidData = true;
  }

  const weights: Array<{ date: string; weight: number }> = [];
  if (Array.isArray(value.weights)) {
    for (const item of value.weights) {
      if (isRecord(item) && isDateKey(item.date) && isNumber(item.weight, 20, 500)) {
        weights.push({ date: item.date, weight: item.weight });
      } else {
        hadInvalidData = true;
      }
    }
  } else {
    hadInvalidData = true;
  }

  if (hadInvalidData) {
    // Invalid persisted records are discarded, but never replaced with fabricated logs.
  }
  return {
    state: { profile, meals, sets, completedWorkouts, water, weights },
    hadInvalidData,
  };
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
}

export function validateFitnessBackup(value: unknown): FitnessState {
  const parsed = validateState(value);
  if (parsed.hadInvalidData) throw new Error('The journal backup contains invalid records. Nothing was imported.');
  for (const collection of [parsed.state.meals, parsed.state.sets, parsed.state.completedWorkouts]) {
    if (new Set(collection.map(x => x.id)).size !== collection.length) throw new Error('The journal backup has duplicate identifiers.');
  }
  const original=value as {completedWorkouts:unknown[]};
  if(original.completedWorkouts.length!==parsed.state.completedWorkouts.length)throw new Error('Backup contains an empty or invalid completed workout.');
  const members=parsed.state.completedWorkouts.flatMap(w=>w.setIds);
  if(new Set(members).size!==members.length)throw new Error('A set belongs to multiple completed workouts in this backup.');
  if(new Set(parsed.state.weights.map(w=>w.date)).size!==parsed.state.weights.length)throw new Error('The backup contains conflicting weights for the same date.');
  return parsed.state;
}

export function FitnessProvider({ children }: { children: ReactNode }) {
  const widgetTargets=useWidgetTargets();
  const [state, setState] = useState<FitnessState>(EMPTY_STATE);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const stateRef = useRef<FitnessState>(EMPTY_STATE);
  const hydratedRef = useRef(false);
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pairKeyRef = useRef('');
  const movementStepsRef = useRef<number | null>(null);
  const [journalSyncStatus, setJournalSyncStatus] = useState<FitnessContextValue['journalSyncStatus']>('unpaired');
  const [journalSyncError, setJournalSyncError] = useState('');
  const [undoAvailable, setUndoAvailable] = useState(false);
  const undoRef = useRef<{ meal?: Meal; set?: WorkoutSet; workouts?: CompletedWorkout[] } | null>(null);
  const undoInFlight=useRef(false);

  const runJournalSync = useCallback((pairKey: string, deletedRecords: PendingDeletion[] = []) => {
    if (!pairKey || !hydratedRef.current) return Promise.resolve();
    const operation = persistQueueRef.current.then(async () => {
      if (pairKeyRef.current !== pairKey || !hydratedRef.current) return;
      setJournalSyncStatus('syncing');
      setJournalSyncError('');
      try {
        const sourceState = stateRef.current;
        const result = await syncFitnessJournal(sourceState, pairKey, deletedRecords, async (nextState) => {
          if (stateRef.current !== sourceState) {
            throw new Error('Fitness data changed during journal reconciliation; nothing was acknowledged.');
          }
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ...nextState }));
          stateRef.current = nextState;
          setState(nextState);
        });
        if (pairKeyRef.current !== pairKey || stateRef.current !== result.state) return;
        setJournalSyncStatus('synced');
        setJournalSyncError(result.conflicts ? result.message : '');
      } catch (syncError) {
        setJournalSyncStatus('error');
        setJournalSyncError(`Journal sync could not complete. Your local records were kept. ${errorDetails(syncError)}`);
      }
    });
    persistQueueRef.current = operation.then(() => undefined, () => undefined);
    return operation;
  }, []);

  const setJournalPairingKey = useCallback(async (key: string) => {
    const normalized = key.trim().toLowerCase();
    pairKeyRef.current = normalized;
    if (!normalized) {
      setJournalSyncStatus('unpaired');
      setJournalSyncError('');
      return;
    }
    await runJournalSync(normalized);
  }, [runJournalSync]);

  const syncJournal = useCallback(async () => {
    if (pairKeyRef.current) await runJournalSync(pairKeyRef.current);
  }, [runJournalSync]);

  const setMovementSteps = useCallback((steps: number | null) => {
    movementStepsRef.current = typeof steps === 'number' && Number.isFinite(steps) ? steps : null;
    if (ready && hydratedRef.current) {
      void updateGymBuddyWidget({
        meals: stateRef.current.meals,
        sets: stateRef.current.sets,
        water: stateRef.current.water,
        profile: {...stateRef.current.profile,...widgetTargets},
        movementSteps: movementStepsRef.current,
      });
    }
  }, [ready,widgetTargets]);

  useEffect(() => {
    if (!ready || !hydratedRef.current) return;
    void updateGymBuddyWidget({
      meals: state.meals,
      sets: state.sets,
      water: state.water,
      profile: {...state.profile,...widgetTargets},
      movementSteps: movementStepsRef.current,
    });
  }, [ready, state,widgetTargets]);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (!mounted) return;
      if (stored) {
        try {
          const parsed: unknown = JSON.parse(stored);
          const result = validateState(parsed);
          stateRef.current = result.state;
          setState(result.state);
          if (result.hadInvalidData) {
            setError('Some saved fitness data was invalid and has been discarded.');
          }
        } catch (readError) {
          setError(`Saved fitness data could not be read. Your existing data was left untouched. ${errorDetails(readError)}`);
          setReady(true);
          return;
        }
      }
      hydratedRef.current = true;
      setReady(true);
      const readPair = Platform.OS === 'web'
        ? AsyncStorage.getItem(PAIR_KEY)
        : SecureStore.getItemAsync(PAIR_KEY);
      void readPair.then((key) => {
        if (key) {
          pairKeyRef.current = key;
          void runJournalSync(key);
        }
      }).catch(() => {
        setJournalSyncStatus('error');
        setJournalSyncError('The saved pairing key could not be read, so journal sync is paused.');
      });
    }).catch((readError: unknown) => {
      if (!mounted) return;
      setError(`Fitness data could not be loaded. Changes will not overwrite storage until it can be read. ${errorDetails(readError)}`);
      setReady(true);
    });
    return () => {
      mounted = false;
    };
  }, [runJournalSync]);

  useEffect(() => {
    const listener = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && pairKeyRef.current) void runJournalSync(pairKeyRef.current);
    });
    return () => listener.remove();
  }, [runJournalSync]);

  const commit = useCallback((update: (current: FitnessState) => MutationResult|Promise<MutationResult>): Promise<boolean> => {
    if (!hydratedRef.current) {
      setError('Fitness data is not ready to save yet; existing storage has not been changed.');
      return Promise.resolve(false);
    }

    const operation = persistQueueRef.current.then(async () => {
      try {
        const current = stateRef.current;
        const result = await update(current);
        if ('error' in result) {
          setError(result.error);
          return false;
        }

        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ...result.state }));
        stateRef.current = result.state;
        setState(result.state);
        setError('');
        const removed: PendingDeletion[] = [
          ...current.meals.filter((item) => !result.state.meals.some((next) => next.id === item.id))
            .map((item) => ({ entity: 'meal' as const, id: item.id })),
          ...current.sets.filter((item) => !result.state.sets.some((next) => next.id === item.id))
            .map((item) => ({ entity: 'strengthSet' as const, id: item.id })),
          ...current.completedWorkouts.filter((item) => !result.state.completedWorkouts.some((next) => next.id === item.id))
            .map((item) => ({ entity: 'completedWorkout' as const, id: item.id })),
          ...Object.keys(current.water).filter((date) => !(date in result.state.water))
            .map((id) => ({ entity: 'waterDay' as const, id })),
          ...current.weights.filter((item) => !result.state.weights.some((next) => next.date === item.date))
            .map((item) => ({ entity: 'weightDay' as const, id: item.date })),
        ];
        if (pairKeyRef.current && removed.length) {
          try {
            await persistFitnessJournalTombstones(pairKeyRef.current, removed);
          } catch (tombstoneError) {
            setJournalSyncStatus('error');
            setJournalSyncError(`A deletion was saved locally, but its sync marker could not be saved. ${errorDetails(tombstoneError)}`);
          }
        }
        if (pairKeyRef.current) void runJournalSync(pairKeyRef.current, removed);
        return true;
      } catch (writeError) {
        setError(`Fitness data could not be saved. ${errorDetails(writeError)}`);
        return false;
      }
    });

    persistQueueRef.current = operation.then(() => undefined, () => undefined);
    return operation;
  }, [runJournalSync]);

  const reject = useCallback((message: string): Promise<boolean> => {
    setError(message);
    return Promise.resolve(false);
  }, []);

  const addMeal = useCallback((input: Omit<Meal, 'id' | 'date' | 'time'>): Promise<boolean> => {
    const name = cleanText(input.name, 120);
    if (!name || !MEAL_TYPES.includes(input.meal) ||
      !isNumber(input.calories, 0.01, 10000) ||
      !isNumber(input.protein, 0, 1000) ||
      !isNumber(input.carbs, 0, 1000) ||
      !isNumber(input.fat, 0, 1000)) {
      return reject('Enter a meal name, calories above 0 up to 10,000, and macros from 0 to 1,000 g.');
    }
    const now = new Date();
    const meal: Meal = {
      id: makeId(),
      date: dateKey(now),
      time: formatTime(now),
      meal: input.meal,
      name,
      calories: input.calories,
      protein: input.protein,
      carbs: input.carbs,
      fat: input.fat,
    };
    return commit((current) => ({ state: { ...current, meals: [meal, ...current.meals] } }));
  }, [commit, reject]);

  const removeMeal = useCallback((id: string): Promise<boolean> => {
    if (typeof id !== 'string' || !id) {
      return reject('A valid meal entry is required to remove it.');
    }
    const removed = stateRef.current.meals.find(x => x.id === id);
    return commit((current) => ({
      state: { ...current, meals: current.meals.filter((meal) => meal.id !== id) },
    })).then(ok => { if (ok && removed) { undoRef.current = { meal: removed }; setUndoAvailable(true); } return ok; });
  }, [commit, reject]);

  const editMeal = useCallback((id: string, input: Omit<Meal, 'id' | 'date' | 'time'>): Promise<boolean> => {
    const name = cleanText(input.name, 120);
    if (!name || !MEAL_TYPES.includes(input.meal) || !isNumber(input.calories, .01, 10000) ||
      !['protein','carbs','fat'].every(k => isNumber(input[k as 'protein'], 0, 1000))) return reject('Enter valid meal nutrition before saving.');
    return commit(current => {
      if (!current.meals.some(m => m.id === id)) return { error: 'This meal no longer exists.' };
      return { state: { ...current, meals: current.meals.map(m => m.id === id ? { ...m, ...input, name } : m) } };
    });
  }, [commit, reject]);

  const addSet = useCallback((input: Pick<WorkoutSet, 'exercise' | 'weight' | 'reps' | 'setType'>): Promise<boolean> => {
    const exercise = cleanText(input.exercise, 120);
    if (!exercise || !isNumber(input.weight, 0.01, 500) ||
      !isNumber(input.reps, 1, 30, true) ||
      !SET_TYPES.includes(input.setType)) {
      return reject('Enter an exercise, a weight above 0 up to 500 kg, and 1–30 whole reps.');
    }
    const set: WorkoutSet = {
      id: makeId(),
      date: todayKey(),
      loggedAt: Date.now(),
      exercise,
      weight: input.weight,
      reps: input.reps,
      setType: input.setType,
      estimatedOneRm: input.weight * (1 + input.reps / 30),
    };
    return commit((current) => ({ state: { ...current, sets: [set, ...current.sets] } }));
  }, [commit, reject]);

  const removeSet = useCallback((id: string): Promise<boolean> => {
    if (typeof id !== 'string' || !id) {
      return reject('A valid strength set is required to remove it.');
    }
    const removed = stateRef.current.sets.find(x => x.id === id);
    const workouts = stateRef.current.completedWorkouts.filter(w => w.setIds.includes(id));
    return commit((current) => ({
      state: {
        ...current,
        sets: current.sets.filter((set) => set.id !== id),
        completedWorkouts: current.completedWorkouts
          .map((workout) => ({ ...workout, setIds: workout.setIds.filter((setId) => setId !== id) }))
          .filter((workout) => workout.setIds.length > 0),
      },
    })).then(ok => { if (ok && removed) { undoRef.current = { set: removed, workouts }; setUndoAvailable(true); } return ok; });
  }, [commit, reject]);

  const undoLastDeletion = useCallback(async () => {
    const undo = undoRef.current;
    if (!undo) return reject('There is no deletion to undo.');
    if(undoInFlight.current)return Promise.resolve(false);
    undoInFlight.current=true;
    const restoredId = makeId(); // Fresh IDs avoid resurrecting a synced deletion tombstone.
    const ok = await commit(current => {
      if (undo.meal) return { state: { ...current, meals: [{ ...undo.meal, id: restoredId }, ...current.meals] } };
      if (!undo.set) return { error: 'Nothing to restore.' };
      const completedWorkouts = [...current.completedWorkouts];
      for (const old of undo.workouts ?? []) {
        const index = completedWorkouts.findIndex(w => w.id === old.id);
        if (index >= 0) completedWorkouts[index] = { ...completedWorkouts[index], setIds: [...new Set([...completedWorkouts[index].setIds, restoredId])] };
        else completedWorkouts.push({ ...old, id: makeId(), setIds: [restoredId, ...old.setIds.filter(id => current.sets.some(s => s.id === id))] });
      }
      return { state: { ...current, sets: [{ ...undo.set, id: restoredId }, ...current.sets], completedWorkouts } };
    });
    if (ok && undoRef.current === undo) { undoRef.current = null; setUndoAvailable(false); }
    undoInFlight.current=false;
    return ok;
  }, [commit, reject]);

  const importBackup = useCallback((value: unknown, restoreProfile = false): Promise<boolean> => {
    let incoming: FitnessState;
    try { incoming = validateFitnessBackup(value); } catch (e) { return reject(errorDetails(e)); }
    return commit(async current => {
      const safe=pairKeyRef.current?remapDeletedBackupIds(incoming,await deletedFitnessJournalKeys(pairKeyRef.current)):incoming;
      return {state:mergeJournalBackup(current,safe,restoreProfile)};
    });
  }, [commit, reject]);

  const finishWorkout = useCallback((options?: { since?: number; sessionId?: string }): Promise<boolean> => {
    const today = todayKey();
    const id = options?.sessionId ?? makeId();
    const completedAt = Date.now();
    return commit((current) => {
      const completedIds = new Set(current.completedWorkouts.flatMap((workout) => workout.setIds));
      const pending = current.sets.filter((set) =>
        !completedIds.has(set.id) &&
        (options?.since === undefined
          ? set.date === today
          : set.loggedAt !== undefined && set.loggedAt >= options.since && set.loggedAt <= completedAt));
      if (pending.length === 0) return { error: 'There are no pending sets from today to finish.' };
      return {
        state: {
          ...current,
          completedWorkouts: [{
            id,
            date: today,
            completedAt,
            setIds: pending.map((set) => set.id),
          }, ...current.completedWorkouts],
        },
      };
    });
  }, [commit]);

  const saveTargets = useCallback((targets: Targets): Promise<boolean> => {
    if (!validTargets(targets)) {
      return reject('Use 1,000–10,000 calories and 1–1,000 g for each macro.');
    }
    return commit((current) => ({
      state: { ...current, profile: { ...current.profile, ...targets } },
    }));
  }, [commit, reject]);

  const applyPlan = useCallback((update: Partial<FitnessProfile>): Promise<boolean> => {
    if (!isRecord(update)) {
      return reject('The plan update is invalid; no profile or nutrition goals were changed.');
    }
    return commit((current) => {
      const candidate = { ...current.profile, ...update };
      const cleanName = cleanText(candidate.name, 80);
      const cleanGoal = cleanText(candidate.goal, 120);
      if (!cleanName || !cleanGoal ||
        !isNumber(candidate.weight, 20, 500) ||
        !isNumber(candidate.height, 100, 230) ||
        !validTargets(candidate) ||
         !isNumber(candidate.waterGoalMl, 100, 20000, true) ||
        !isNumber(candidate.stepTarget, 1000, 100000, true) ||
        !isNumber(candidate.age, 14, 90, true) ||
        !SEXES.includes(candidate.sex) ||
        !ACTIVITIES.includes(candidate.activity)) {
        return { error: 'The plan contains invalid profile details or nutrition goals; nothing was changed.' };
      }
      return { state: { ...current, profile: { ...candidate, name: cleanName, goal: cleanGoal } } };
    });
  }, [commit, reject]);

  const addWater = useCallback((amount: number): Promise<boolean> => {
    if (!isNumber(amount, Number.MIN_VALUE, Number.MAX_SAFE_INTEGER)) {
      return reject('Water amount must be a positive number.');
    }
    const date = todayKey();
    return commit((current) => {
      const total = (current.water[date] ?? 0) + amount;
      if (!Number.isFinite(total) || total > Number.MAX_SAFE_INTEGER) {
        return { error: 'That water amount is too large to record.' };
      }
      return { state: { ...current, water: { ...current.water, [date]: total } } };
    });
  }, [commit, reject]);

  const removeWater = useCallback((amount: number): Promise<boolean> => {
    if (!isNumber(amount, Number.MIN_VALUE, Number.MAX_SAFE_INTEGER)) {
      return reject('Water amount to remove must be a positive number.');
    }
    const date = todayKey();
    return commit((current) => {
      const remaining = Math.max(0, (current.water[date] ?? 0) - amount);
      return { state: { ...current, water: { ...current.water, [date]: remaining } } };
    });
  }, [commit, reject]);

  const setWaterGoal = useCallback((goalMl: number): Promise<boolean> => {
    if (!isNumber(goalMl, 100, 20000, true)) {
      return reject('Water goal must be a whole number from 100 to 20,000 ml.');
    }
    return commit((current) => ({
      state: { ...current, profile: { ...current.profile, waterGoalMl: goalMl } },
    }));
  }, [commit, reject]);

  const logWeight = useCallback((weight: number): Promise<boolean> => {
    if (!isNumber(weight, 20, 500)) {
      return reject('Weight must be between 20 and 500 kg.');
    }
    const date = todayKey();
    return commit((current) => ({
      state: {
        ...current,
        weights: [...current.weights.filter((entry) => entry.date !== date), { date, weight }]
          .sort((a, b) => a.date.localeCompare(b.date)),
      },
    }));
  }, [commit, reject]);

  const value = useMemo<FitnessContextValue>(() => ({
    ...state,
    ready,
    canSave:hydratedRef.current,
    error,
    journalSyncStatus,
    journalSyncError,
    setJournalPairingKey,
    setMovementSteps,
    syncJournal,
    addMeal,
    removeMeal,
    editMeal,
    undoAvailable,
    undoLastDeletion,
    importBackup,
    getSnapshot:()=>{if(!hydratedRef.current)throw new Error('Journal data is not ready to export.');return stateRef.current;},
    addSet,
    removeSet,
    finishWorkout,
    saveTargets,
    applyPlan,
    addWater,
    removeWater,
    setWaterGoal,
    logWeight,
  }), [
    state,
    ready,
    error,
    journalSyncStatus,
    journalSyncError,
    setJournalPairingKey,
    setMovementSteps,
    syncJournal,
    addMeal,
    removeMeal,
    editMeal,
    undoAvailable,
    undoLastDeletion,
    importBackup,
    addSet,
    removeSet,
    finishWorkout,
    saveTargets,
    applyPlan,
    addWater,
    removeWater,
    setWaterGoal,
    logWeight,
  ]);

  return <FitnessContext.Provider value={value}>{children}</FitnessContext.Provider>;
}

export function useFitness(): FitnessContextValue {
  const context = useContext(FitnessContext);
  if (!context) throw new Error('useFitness must be used within a FitnessProvider.');
  return context;
}