import AsyncStorage from '@react-native-async-storage/async-storage';
import { withJournalStorageLock } from './journalStorageLock';
import {
  applyJournalChanges,
  getJournal,
  type JournalChange,
  type JournalEntity,
  type JournalRecord,
} from '@workspace/api-client-react';
import type {
  CompletedWorkout,
  FitnessProfile,
  FitnessState,
  Meal,
  WorkoutSet,
} from '@/providers/FitnessProvider';

type JournalKey = `${JournalEntity}:${string}`;
type Baseline = { revision: number; fingerprint: string; deleted: boolean };
export type PendingDeletion = { entity: JournalEntity; id: string };
type SyncMetadata = {
  pairFingerprint: string;
  baseline: Record<string, Baseline>;
  tombstones: PendingDeletion[];
  heldLocalKeys: Record<string, string>;
};
type MealTemplate = {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  meal?: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';
};
type LiveWorkoutHistoryEntry = {
  id: string;
  kind: 'outdoor-walk' | 'indoor-walk' | 'strength';
  startedAt: number;
  endedAt: number;
  durationMs: number;
  steps: number;
  date?: string;
  distanceMeters?: number | null;
  activeCalories?: number | null;
  totalCalories?: number | null;
};
type ExternalJournalData = {
  templates: MealTemplate[];
  workoutHistory: LiveWorkoutHistoryEntry[];
  templatesRaw: string | null;
  workoutHistoryRaw: string | null;
  workoutHistoryIdle: boolean;
};

export type FitnessJournalSyncResult = {
  state: FitnessState;
  conflicts: number;
  message: string;
};

const META_PREFIX = '@fitpulse/mobile/journal-sync/v1/';
const LAST_PAIR_KEY = '@fitpulse/mobile/journal-sync/last-pair';
const MEAL_TEMPLATES_KEY = '@fitpulse/mobile/meal-templates/v1';
const LIVE_WORKOUT_HISTORY_KEY = 'fitpulse-workout-sessions';
const LIVE_WORKOUT_DRAFT_KEY = 'fitpulse-active-workout';
const FINGERPRINT_DEFAULT_PROFILE = {
  name: 'Maya Chen', goal: 'Build strength', weight: 68, height: 170,
  calorieTarget: 2200, proteinTarget: 110, carbsTarget: 250, fatTarget: 70,
  stepTarget: 10000,
};

const fingerprint = (value: unknown) => JSON.stringify(value);
const metadataId = (key: string) => {
  // Keep credentials out of storage key names; two independent hashes provide a
  // collision-resistant local namespace without persisting the bearer itself.
  const hash = (seed: number) => {
    let value = seed;
    for (let index = 0; index < key.length; index++) {
      value ^= key.charCodeAt(index);
      value = Math.imul(value, 16777619);
    }
    return (value >>> 0).toString(16).padStart(8, '0');
  };
  return `${hash(2166136261)}${hash(2246822519)}`;
};
const keyOf = (entity: JournalEntity, id: string): JournalKey => `${entity}:${id}`;
const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const isText = (value: unknown, max = 120): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max &&
  !/[\u0000-\u001f\u007f]/.test(value);
const isFiniteNumber = (value: unknown, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const isWholeNumber = (value: unknown, min: number, max: number) =>
  isFiniteNumber(value, min, max) && Number.isInteger(value);
const isDate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(new Date(`${value}T12:00:00Z`).getTime()) &&
  new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;

function normalizeMeal(value: unknown): Meal | null {
  if (!isObject(value) || !isText(value.id, 100) || !isDate(value.date) ||
    typeof value.time !== 'string' || value.time.length > 40 ||
    !isFiniteNumber(value.calories, 0.01, 10000) ||
    !isFiniteNumber(value.protein, 0, 1000) || !isFiniteNumber(value.carbs, 0, 1000) ||
    !isFiniteNumber(value.fat, 0, 1000)) return null;
  const rawMeal = typeof value.meal === 'string' ? value.meal : value.name;
  if (!isText(rawMeal, 120)) return null;
  const mealIsCategory = MEAL_CATEGORY_VALUES.includes(rawMeal as Meal['meal']);
  const name = typeof value.name === 'string' && isText(value.name, 120) ? value.name : rawMeal;
  const provenance = typeof value.provenance === 'string' && value.provenance.length <= 80
    ? value.provenance : undefined;
  return {
    id: value.id,
    date: value.date,
    time: value.time,
    meal: mealIsCategory ? rawMeal as Meal['meal'] : 'Snack',
    name,
    calories: value.calories as number,
    protein: value.protein as number,
    carbs: value.carbs as number,
    fat: value.fat as number,
    ...(!mealIsCategory ? { legacyMealLabel: rawMeal } : {}),
    ...(provenance === undefined ? {} : { provenance }),
  };
}

const MEAL_CATEGORY_VALUES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const;
const SET_TYPE_VALUES = ['warmup', 'working', 'drop', 'failure'] as const;

function normalizeSet(value: unknown): WorkoutSet | null {
  if (!isObject(value) || !isText(value.id, 100) || !isDate(value.date) ||
    !isText(value.exercise) || !isFiniteNumber(value.weight, 0.01, 500) ||
    !isWholeNumber(value.reps, 1, 30) ||
    (value.setType !== undefined && !SET_TYPE_VALUES.includes(value.setType as (typeof SET_TYPE_VALUES)[number])) ||
    (value.loggedAt !== undefined && !(typeof value.loggedAt === 'number' && Number.isFinite(value.loggedAt)) &&
      !(typeof value.loggedAt === 'string' && value.loggedAt.length <= 40))) return null;
  return {
    id: value.id,
    date: value.date,
    exercise: value.exercise,
    weight: value.weight as number,
    reps: value.reps as number,
    setType: value.setType === undefined ? 'working' : value.setType as WorkoutSet['setType'],
    estimatedOneRm: (value.weight as number) * (1 + (value.reps as number) / 30),
    ...(typeof value.loggedAt === 'number' ? { loggedAt: value.loggedAt } : {}),
    ...(typeof value.loggedAt === 'string' ? { legacyLoggedAt: value.loggedAt } : {}),
  };
}

function mealJournalData(meal: Meal): Record<string, unknown> {
  return {
    id: meal.id,
    date: meal.date,
    time: meal.time,
    meal: meal.legacyMealLabel ?? meal.meal,
    name: meal.name,
    calories: meal.calories,
    protein: meal.protein,
    carbs: meal.carbs,
    fat: meal.fat,
    ...(meal.provenance === undefined ? {} : { provenance: meal.provenance }),
  };
}

function setJournalData(set: WorkoutSet): Record<string, unknown> {
  return {
    id: set.id,
    date: set.date,
    exercise: set.exercise,
    weight: set.weight,
    reps: set.reps,
    setType: set.setType,
    estimatedOneRm: set.estimatedOneRm,
    ...(set.loggedAt === undefined ? (set.legacyLoggedAt === undefined ? {} : { loggedAt: set.legacyLoggedAt }) : { loggedAt: set.loggedAt }),
  };
}

function validWorkout(value: unknown): value is CompletedWorkout {
  return isObject(value) && isText(value.id, 100) && isDate(value.date) &&
    isFiniteNumber(value.completedAt, 0, Number.MAX_SAFE_INTEGER) &&
    Array.isArray(value.setIds) && value.setIds.length > 0 &&
    value.setIds.every((id) => isText(id, 100));
}

function validProfile(value: unknown): value is Partial<FitnessProfile> {
  return isObject(value) && isText(value.name, 80) && isText(value.goal, 120) &&
    isFiniteNumber(value.weight, 20, 500) && isFiniteNumber(value.height, 100, 230) &&
    isWholeNumber(value.calorieTarget, 1000, 10000) &&
    isWholeNumber(value.proteinTarget, 1, 1000) && isWholeNumber(value.carbsTarget, 1, 1000) &&
    isWholeNumber(value.fatTarget, 1, 1000) && isWholeNumber(value.stepTarget, 1000, 100000);
}

function dataFor(entity: JournalEntity, value: unknown): Record<string, unknown> | null {
  if (entity === 'meal') {
    const meal = normalizeMeal(value);
    return meal ? mealJournalData(meal) : null;
  }
  if (entity === 'strengthSet') {
    const set = normalizeSet(value);
    return set ? setJournalData(set) : null;
  }
  if (entity === 'completedWorkout' && validWorkout(value)) return value;
  if (entity === 'waterDay' && isObject(value) && isDate(value.date) &&
    isWholeNumber(value.amountMl, 0, 100000)) return value;
  if (entity === 'weightDay' && isObject(value) && isDate(value.date) &&
    isFiniteNumber(value.weightKg, 20, 500)) return value;
  if (entity === 'nutritionGoals' && isObject(value) &&
    isWholeNumber(value.calorieTarget, 1000, 10000) &&
    isWholeNumber(value.proteinTarget, 1, 1000) &&
    isWholeNumber(value.carbsTarget, 1, 1000) &&
    isWholeNumber(value.fatTarget, 1, 1000)) return value;
  if (entity === 'profile' && validProfile(value)) return value;
  if (entity === 'mealTemplate' && validMealTemplate(value)) return normalizeMealTemplate(value);
  if (entity === 'liveWorkoutHistory') return normalizeLiveWorkoutHistory(value);
  if (entity === 'waterGoal' && isObject(value) && isWholeNumber(value.goalMl, 100, 20000)) return value;
  return null;
}

function validMealTemplate(value: unknown): value is MealTemplate {
  return isObject(value) && isText(value.id, 100) && isText(value.name, 60) &&
    isFiniteNumber(value.calories, 0.01, 10000) && isFiniteNumber(value.protein, 0, 1000) &&
    isFiniteNumber(value.carbs, 0, 1000) && isFiniteNumber(value.fat, 0, 1000) &&
    (value.meal === undefined || MEAL_CATEGORY_VALUES.includes(value.meal as NonNullable<MealTemplate['meal']>));
}

function normalizeMealTemplate(value: MealTemplate): MealTemplate {
  return { ...value, meal: value.meal ?? 'Snack' };
}

function validLiveWorkoutHistory(value: unknown, requireDate: boolean): value is LiveWorkoutHistoryEntry {
  if (!isObject(value)) return false;
  const startedAt = value.startedAt as number;
  const endedAt = value.endedAt as number;
  return isText(value.id, 100) &&
    ['outdoor-walk', 'indoor-walk', 'strength'].includes(String(value.kind)) &&
    typeof startedAt === 'number' && Number.isFinite(startedAt) &&
    typeof endedAt === 'number' && Number.isFinite(endedAt) &&
    endedAt >= startedAt &&
    typeof value.durationMs === 'number' && Number.isFinite(value.durationMs) && value.durationMs >= 0 &&
    isWholeNumber(value.steps, 0, Number.MAX_SAFE_INTEGER) &&
    (!requireDate || isDate(value.date)) &&
    (value.date === undefined || isDate(value.date)) &&
    optionalNullableFinite(value.distanceMeters, 0) &&
    optionalNullableFinite(value.activeCalories) &&
    optionalNullableFinite(value.totalCalories);
}

function optionalNullableFinite(value: unknown, min = -Number.MAX_VALUE) {
  return value === undefined || value === null ||
    (typeof value === 'number' && Number.isFinite(value) && value >= min);
}

function normalizeLiveWorkoutHistory(value: unknown): LiveWorkoutHistoryEntry | null {
  if (!validLiveWorkoutHistory(value, false)) return null;
  return {
    ...value,
    distanceMeters: value.distanceMeters ?? null,
    activeCalories: value.activeCalories ?? null,
    totalCalories: value.totalCalories ?? null,
  };
}

function payloadMatchesRecord(record: JournalRecord): boolean {
  const data = record.data;
  if (!data) return false;
  switch (record.entity) {
    case 'meal':
    case 'strengthSet':
    case 'completedWorkout':
      return data.id === record.id;
    case 'waterDay':
    case 'weightDay':
      return data.date === record.id;
    case 'nutritionGoals':
      return record.id === 'nutrition-goals';
    case 'profile':
      return record.id === 'profile';
    case 'waterGoal':
      return record.id === 'water-goal';
    case 'mealTemplate':
    case 'liveWorkoutHistory':
      return data.id === record.id;
    default:
      return true;
  }
}

function stateRecords(
  state: FitnessState,
  external?: ExternalJournalData,
): Array<{ entity: JournalEntity; id: string; data: Record<string, unknown> }> {
  return [
    ...state.meals.map((meal) => ({ entity: 'meal' as const, id: meal.id, data: mealJournalData(meal) })),
    ...state.sets.map((set) => ({ entity: 'strengthSet' as const, id: set.id, data: setJournalData(set) })),
    ...state.completedWorkouts.map((data) => ({ entity: 'completedWorkout' as const, id: data.id, data })),
    ...Object.entries(state.water).map(([date, amountMl]) => ({ entity: 'waterDay' as const, id: date, data: { date, amountMl } })),
    ...state.weights.map(({ date, weight }) => ({ entity: 'weightDay' as const, id: date, data: { date, weightKg: weight } })),
    { entity: 'nutritionGoals', id: 'nutrition-goals', data: {
      calorieTarget: state.profile.calorieTarget,
      proteinTarget: state.profile.proteinTarget,
      carbsTarget: state.profile.carbsTarget,
      fatTarget: state.profile.fatTarget,
    } },
    { entity: 'profile', id: 'profile', data: {
      name: state.profile.name, goal: state.profile.goal, weight: state.profile.weight,
      height: state.profile.height, calorieTarget: state.profile.calorieTarget,
      proteinTarget: state.profile.proteinTarget, carbsTarget: state.profile.carbsTarget,
      fatTarget: state.profile.fatTarget, stepTarget: state.profile.stepTarget,
    } },
    { entity: 'waterGoal', id: 'water-goal', data: { goalMl: state.profile.waterGoalMl } },
    ...(external?.templates.map((data) => ({ entity: 'mealTemplate' as const, id: data.id, data })) ?? []),
    ...(external?.workoutHistory.map((data) => ({ entity: 'liveWorkoutHistory' as const, id: data.id, data })) ?? []),
  ];
}

async function loadExternalJournalData(): Promise<ExternalJournalData> {
  const [templatesRaw, workoutHistoryRaw] = await Promise.all([
    AsyncStorage.getItem(MEAL_TEMPLATES_KEY),
    AsyncStorage.getItem(LIVE_WORKOUT_HISTORY_KEY),
  ]);
  const draftRaw = await AsyncStorage.getItem(LIVE_WORKOUT_DRAFT_KEY);
  try {
    const templatesValue: unknown = templatesRaw === null ? [] : JSON.parse(templatesRaw);
    if (!Array.isArray(templatesValue) || !templatesValue.every(validMealTemplate)) {
      throw new Error('Saved meal templates contain invalid data.');
    }
    const workoutValue: unknown = workoutHistoryRaw === null ? [] : JSON.parse(workoutHistoryRaw);
    if (!Array.isArray(workoutValue) || !workoutValue.every((entry) => validLiveWorkoutHistory(entry, false))) {
      throw new Error('Saved live-workout history contains invalid data.');
    }
    const templateIds = new Set<string>();
    for (const entry of templatesValue as MealTemplate[]) {
      if (templateIds.has(entry.id)) throw new Error('Saved meal templates contain duplicate IDs.');
      templateIds.add(entry.id);
    }
    const workoutIds = new Set<string>();
    for (const entry of workoutValue as LiveWorkoutHistoryEntry[]) {
      if (workoutIds.has(entry.id)) throw new Error('Saved live-workout history contains duplicate IDs.');
      workoutIds.add(entry.id);
    }
    return {
      templates: (templatesValue as MealTemplate[]).map(normalizeMealTemplate),
      workoutHistory: (workoutValue as LiveWorkoutHistoryEntry[]).map((entry) => normalizeLiveWorkoutHistory(entry)!),
      templatesRaw,
      workoutHistoryRaw,
      workoutHistoryIdle: draftRaw === null,
    };
  } catch (error) {
    throw new Error(`Local templates or completed workout history were left untouched. ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function assertExternalJournalDataUnchanged(external: ExternalJournalData): Promise<void> {
  const [templatesRaw, workoutHistoryRaw] = await Promise.all([
    AsyncStorage.getItem(MEAL_TEMPLATES_KEY),
    AsyncStorage.getItem(LIVE_WORKOUT_HISTORY_KEY),
  ]);
  const draftRaw = await AsyncStorage.getItem(LIVE_WORKOUT_DRAFT_KEY);
  if (templatesRaw !== external.templatesRaw || workoutHistoryRaw !== external.workoutHistoryRaw ||
    (draftRaw === null) !== external.workoutHistoryIdle) {
    throw new Error('Meal templates or completed workout history changed during sync. No merge was applied; retry sync.');
  }
}

function applyExternalRecord(external: ExternalJournalData, record: JournalRecord): ExternalJournalData {
  if (record.entity === 'mealTemplate') {
    if (record.deleted) return { ...external, templates: external.templates.filter((item) => item.id !== record.id) };
    const data = dataFor(record.entity, record.data);
    return data
      ? { ...external, templates: [...external.templates.filter((item) => item.id !== record.id), data as unknown as MealTemplate] }
      : external;
  }
  if (record.entity === 'liveWorkoutHistory') {
    if (record.deleted) return { ...external, workoutHistory: external.workoutHistory.filter((item) => item.id !== record.id) };
    const data = dataFor(record.entity, record.data);
    return data
      ? { ...external, workoutHistory: [...external.workoutHistory.filter((item) => item.id !== record.id), data as unknown as LiveWorkoutHistoryEntry] }
      : external;
  }
  return external;
}

function pristineDefault(entity: JournalEntity, data: Record<string, unknown>) {
  if (entity === 'profile') {
    return Object.entries(FINGERPRINT_DEFAULT_PROFILE).every(([field, value]) => data[field] === value);
  }
  if (entity === 'nutritionGoals') {
    return data.calorieTarget === 2200 && data.proteinTarget === 110 &&
      data.carbsTarget === 250 && data.fatTarget === 70;
  }
  return entity === 'waterGoal' && (data.goalMl === 2000 || data.goalMl === 2500);
}

function applyRemote(state: FitnessState, record: JournalRecord): FitnessState {
  if (record.deleted || !record.data) return removeLocalRecord(state, record.entity, record.id);
  const data = dataFor(record.entity, record.data);
  if (!data) return state;
  switch (record.entity) {
    case 'meal': {
      const meal = normalizeMeal(data);
      if (!meal) return state;
      const meals = state.meals.filter((entry) => entry.id !== record.id);
      return { ...state, meals: [...meals, meal] };
    }
    case 'strengthSet': {
      const set = normalizeSet(data);
      if (!set) return state;
      const sets = state.sets.filter((entry) => entry.id !== record.id);
      return { ...state, sets: [...sets, set] };
    }
    case 'completedWorkout': {
      const workout = data as unknown as CompletedWorkout;
      if (workout.setIds.some((id) => !state.sets.some((set) => set.id === id))) return state;
      return { ...state, completedWorkouts: [...state.completedWorkouts.filter((entry) => entry.id !== record.id), workout] };
    }
    case 'waterDay':
      return { ...state, water: { ...state.water, [record.id]: data.amountMl as number } };
    case 'weightDay':
      return { ...state, weights: [...state.weights.filter((entry) => entry.date !== record.id), { date: record.id, weight: data.weightKg as number }].sort((a, b) => a.date.localeCompare(b.date)) };
    case 'nutritionGoals':
      return { ...state, profile: { ...state.profile, ...data } };
    case 'profile':
      return { ...state, profile: { ...state.profile, ...data } };
    case 'waterGoal':
      return { ...state, profile: { ...state.profile, waterGoalMl: data.goalMl as number } };
    default:
      return state;
  }
}

function removeLocalRecord(state: FitnessState, entity: JournalEntity, id: string): FitnessState {
  switch (entity) {
    case 'meal': return { ...state, meals: state.meals.filter((item) => item.id !== id) };
    case 'strengthSet': {
      const sets = state.sets.filter((item) => item.id !== id);
      return { ...state, sets, completedWorkouts: state.completedWorkouts.map((item) => ({
        ...item, setIds: item.setIds.filter((setId) => setId !== id),
      })).filter((item) => item.setIds.length > 0) };
    }
    case 'completedWorkout': return { ...state, completedWorkouts: state.completedWorkouts.filter((item) => item.id !== id) };
    case 'waterDay': {
      const water = { ...state.water }; delete water[id]; return { ...state, water };
    }
    case 'weightDay': return { ...state, weights: state.weights.filter((item) => item.date !== id) };
    default: return state;
  }
}

function metadataValue(value: unknown, pairFingerprint: string): SyncMetadata {
  if (isObject(value) && value.pairFingerprint === pairFingerprint && isObject(value.baseline) && Array.isArray(value.tombstones)) {
    return value as unknown as SyncMetadata;
  }
  return { pairFingerprint, baseline: {}, tombstones: [], heldLocalKeys: {} };
}
export async function deletedFitnessJournalKeys(pairKey:string):Promise<Set<string>>{
  const pairFingerprint=metadataId(pairKey);
  const metadata=metadataValue(JSON.parse((await AsyncStorage.getItem(`${META_PREFIX}${pairFingerprint}`))??'null'),pairFingerprint);
  return new Set([
    ...metadata.tombstones.map(item=>keyOf(item.entity,item.id)),
    ...Object.entries(metadata.baseline).filter(([,value])=>value.deleted).map(([key])=>key),
  ]);
}

export async function persistFitnessJournalTombstones(
  pairKey: string,
  deletedRecords: PendingDeletion[],
): Promise<void> {
  if (!pairKey || deletedRecords.length === 0) return;
  const pairFingerprint = metadataId(pairKey);
  const metadataKey = `${META_PREFIX}${pairFingerprint}`;
  let metadata: SyncMetadata;
  try {
    metadata = metadataValue(JSON.parse((await AsyncStorage.getItem(metadataKey)) ?? 'null'), pairFingerprint);
  } catch {
    throw new Error('Saved journal sync metadata is unreadable; deletion markers could not be saved.');
  }
  const tombstones = new Map(metadata.tombstones.map((item) => [keyOf(item.entity, item.id), item]));
  for (const item of deletedRecords) tombstones.set(keyOf(item.entity, item.id), item);
  metadata.tombstones = [...tombstones.values()];
  await AsyncStorage.setItem(metadataKey, JSON.stringify(metadata));
}

async function syncFitnessJournalUnlocked(
  state: FitnessState,
  pairKey: string,
  deletedRecords: PendingDeletion[] = [],
  persistReconciledState: (nextState: FitnessState) => Promise<void>,
): Promise<FitnessJournalSyncResult> {
  // These keys belong to their existing UI components. Parse both completely
  // before syncing anything so corrupt storage can never be replaced by a merge.
  let external = await loadExternalJournalData();
  const pairFingerprint = metadataId(pairKey);
  const metadataKey = `${META_PREFIX}${pairFingerprint}`;
  let metadata: SyncMetadata;
  try {
    metadata = metadataValue(JSON.parse((await AsyncStorage.getItem(metadataKey)) ?? 'null'), pairFingerprint);
  } catch {
    throw new Error('Saved journal sync metadata is unreadable; local fitness data was not changed.');
  }
  const previousPair = await AsyncStorage.getItem(LAST_PAIR_KEY);
  const initialUploadAllowed = previousPair === null || previousPair === pairFingerprint;
  const originalLocalRecords = stateRecords(state, external);
  if (previousPair !== null && previousPair !== pairFingerprint && Object.keys(metadata.heldLocalKeys ?? {}).length === 0) {
    metadata.heldLocalKeys = Object.fromEntries(originalLocalRecords.map((item) => [
      keyOf(item.entity, item.id), fingerprint(item.data),
    ]));
  }
  const deletedMap = new Map<string, PendingDeletion>(metadata.tombstones.map((item) => [keyOf(item.entity, item.id), item]));
  for (const item of deletedRecords) deletedMap.set(keyOf(item.entity, item.id), item);
  if (previousPair === pairFingerprint) {
    const localKeys = new Set<string>(originalLocalRecords.map((item) => keyOf(item.entity, item.id)));
    for (const [key, baseline] of Object.entries(metadata.baseline)) {
      const isExternalKey = key.startsWith('mealTemplate:') || key.startsWith('liveWorkoutHistory:');
      if (key.startsWith('liveWorkoutHistory:') && !external.workoutHistoryIdle) continue;
      if (isExternalKey && !baseline.deleted && !localKeys.has(key)) {
        const separator = key.indexOf(':');
        deletedMap.set(key, { entity: key.slice(0, separator) as JournalEntity, id: key.slice(separator + 1) });
      }
    }
  }
  metadata.tombstones = [...deletedMap.values()];

  const request = { headers: { Authorization: `Bearer ${pairKey}` } };
  const snapshot = await getJournal(request);
  await assertExternalJournalDataUnchanged(external);
  const remote = new Map(snapshot.records.map((record) => [keyOf(record.entity, record.id), record]));
  const local = new Map(stateRecords(state, external)
    .filter((record) => external.workoutHistoryIdle || record.entity !== 'liveWorkoutHistory')
    .map((record) => [keyOf(record.entity, record.id), record]));
  const conflicts = new Set<string>();
  let nextState = state;

  const tombstoneKeys = new Set(metadata.tombstones.map((item) => keyOf(item.entity, item.id)));
  const orderedRecords = [...snapshot.records].sort((left, right) =>
    (left.entity === 'strengthSet' ? 0 : left.entity === 'profile' ? 1 : left.entity === 'nutritionGoals' ? 2 : left.entity === 'completedWorkout' ? 3 : 1) -
    (right.entity === 'strengthSet' ? 0 : right.entity === 'profile' ? 1 : right.entity === 'nutritionGoals' ? 2 : right.entity === 'completedWorkout' ? 3 : 1));
  for (const record of orderedRecords) {
    if (record.entity === 'liveWorkoutHistory' && !external.workoutHistoryIdle) continue;
    const key = keyOf(record.entity, record.id);
    const currentLocal = local.get(key);
    const baseline = metadata.baseline[key];
    const localChanged = !!currentLocal && !!baseline && fingerprint(currentLocal.data) !== baseline.fingerprint;
    if (tombstoneKeys.has(key)) {
      if (record.deleted) {
        metadata.baseline[key] = { revision: record.revision, fingerprint: '', deleted: true };
        metadata.tombstones = metadata.tombstones.filter((entry) => keyOf(entry.entity, entry.id) !== key);
      } else if (!baseline || record.revision !== baseline.revision) {
        conflicts.add(key);
      }
      continue;
    }
    if (localChanged && record.revision !== baseline?.revision) {
      conflicts.add(key);
      continue;
    }
    if (localChanged) continue;
    const remoteData = record.deleted ? null : dataFor(record.entity, record.data);
    if (!record.deleted && (!payloadMatchesRecord(record) || !remoteData)) {
      conflicts.add(key);
      continue;
    }
    if (currentLocal && !baseline && !record.deleted && !pristineDefault(record.entity, currentLocal.data) &&
      fingerprint(currentLocal.data) !== fingerprint(remoteData)) {
      if (pristineDefault(record.entity, remoteData!)) {
        metadata.baseline[key] = {
          revision: record.revision,
          fingerprint: fingerprint(remoteData),
          deleted: false,
        };
        continue;
      }
      conflicts.add(key);
      continue;
    }
    if (currentLocal && !baseline && record.deleted) {
      conflicts.add(key);
      continue;
    }
    if (record.deleted && currentLocal && localChanged) {
      conflicts.add(key);
      continue;
    }
    if (!record.deleted && record.entity === 'completedWorkout') {
      const workout = remoteData as unknown as CompletedWorkout;
      if (workout.setIds.some((id) => !nextState.sets.some((set) => set.id === id))) {
        conflicts.add(key);
        continue;
      }
    }
    nextState = applyRemote(nextState, record);
    external = applyExternalRecord(external, record);
    metadata.baseline[key] = {
      revision: record.revision,
      fingerprint: record.deleted ? '' : fingerprint(dataFor(record.entity, record.data)),
      deleted: record.deleted,
    };
    if (record.deleted) metadata.tombstones = metadata.tombstones.filter((entry) => keyOf(entry.entity, entry.id) !== key);
  }

  // A local deletion wins over a snapshot record until its tombstone is acknowledged.
  for (const tombstone of metadata.tombstones) {
    if (tombstone.entity === 'liveWorkoutHistory' && !external.workoutHistoryIdle) continue;
    nextState = removeLocalRecord(nextState, tombstone.entity, tombstone.id);
    if (tombstone.entity === 'mealTemplate') {
      external = { ...external, templates: external.templates.filter((item) => item.id !== tombstone.id) };
    } else if (tombstone.entity === 'liveWorkoutHistory') {
      external = { ...external, workoutHistory: external.workoutHistory.filter((item) => item.id !== tombstone.id) };
    }
  }
  metadata.tombstones = metadata.tombstones.filter((item) => remote.has(keyOf(item.entity, item.id)));

  const changes: JournalChange[] = [];
  for (const tombstone of metadata.tombstones) {
    if (tombstone.entity === 'liveWorkoutHistory' && !external.workoutHistoryIdle) continue;
    const key = keyOf(tombstone.entity, tombstone.id);
    const serverRecord = remote.get(key);
    const baseline = metadata.baseline[key];
    if (!serverRecord || serverRecord.deleted || conflicts.has(key)) continue;
    if (!baseline) {
      conflicts.add(key);
      continue;
    }
    changes.push({
      entity: tombstone.entity, id: tombstone.id, baseRevision: baseline.revision,
      mutationId: makeMutationId(), deleted: true, data: null,
    });
  }

  const currentRecords = stateRecords(nextState, external)
    .filter((record) => external.workoutHistoryIdle || record.entity !== 'liveWorkoutHistory');
  for (const item of currentRecords) {
    const key = keyOf(item.entity, item.id);
    if (conflicts.has(key)) continue;
    const serverRecord = remote.get(key);
    const baseline = metadata.baseline[key];
    if (!serverRecord) {
      if (item.entity === 'nutritionGoals' && conflicts.has(keyOf('profile', 'profile'))) {
        conflicts.add(key);
        continue;
      }
      const heldFingerprint = metadata.heldLocalKeys?.[key];
      if (heldFingerprint !== undefined && fingerprint(item.data) === heldFingerprint) continue;
      const isDefaultProfile = item.entity === 'profile' &&
        Object.entries(FINGERPRINT_DEFAULT_PROFILE).every(([field, value]) => item.data[field] === value);
      const isDefaultGoals = item.entity === 'nutritionGoals' &&
        item.data.calorieTarget === 2200 && item.data.proteinTarget === 110 &&
        item.data.carbsTarget === 250 && item.data.fatTarget === 70;
      const isDefaultWaterGoal = item.entity === 'waterGoal' &&
        (item.data.goalMl === 2000 || item.data.goalMl === 2500);
      if ((!initialUploadAllowed && !baseline && heldFingerprint !== undefined) ||
        (initialUploadAllowed && (isDefaultProfile || isDefaultGoals || isDefaultWaterGoal))) continue;
      if (baseline?.deleted) continue;
      changes.push({ entity: item.entity, id: item.id, baseRevision: 0, mutationId: makeMutationId(), deleted: false, data: item.data });
      continue;
    }
    if (serverRecord.deleted || !serverRecord.data) continue;
    const remoteData = dataFor(item.entity, serverRecord.data);
    if (!remoteData) continue;
    if (fingerprint(item.data) === fingerprint(remoteData)) {
      metadata.baseline[key] = { revision: serverRecord.revision, fingerprint: fingerprint(remoteData), deleted: false };
    } else if (baseline && baseline.revision === serverRecord.revision &&
      baseline.fingerprint === fingerprint(remoteData)) {
      changes.push({ entity: item.entity, id: item.id, baseRevision: serverRecord.revision, mutationId: makeMutationId(), deleted: false, data: item.data });
    } else if (!baseline) {
      conflicts.add(key);
    } else {
      conflicts.add(key);
    }
  }

  for (let offset = 0; offset < changes.length; offset += 100) {
    await assertExternalJournalDataUnchanged(external);
    const result = await applyJournalChanges({ changes: changes.slice(offset, offset + 100) }, request);
    for (const record of result.records) {
      const key = keyOf(record.entity, record.id);
      metadata.baseline[key] = {
        revision: record.revision,
        fingerprint: record.deleted ? '' : fingerprint(record.data),
        deleted: record.deleted,
      };
      if (record.deleted) metadata.tombstones = metadata.tombstones.filter((entry) => keyOf(entry.entity, entry.id) !== key);
    }
    for (const conflict of result.conflicts) conflicts.add(keyOf(conflict.entity, conflict.id));
  }

  const templatesChanged = fingerprint(external.templates) !== fingerprint(JSON.parse(external.templatesRaw ?? '[]'));
  const workoutHistoryChanged = external.workoutHistoryIdle &&
    fingerprint(external.workoutHistory) !== fingerprint(JSON.parse(external.workoutHistoryRaw ?? '[]'));
  const externalWrites: [string, string][] = [];
  const latestExternal = await loadExternalJournalData();
  const templatesUnchanged = latestExternal.templatesRaw === external.templatesRaw;
  const historyUnchanged = latestExternal.workoutHistoryRaw === external.workoutHistoryRaw &&
    latestExternal.workoutHistoryIdle === external.workoutHistoryIdle;
  if (templatesChanged && templatesUnchanged) {
    externalWrites.push([MEAL_TEMPLATES_KEY, JSON.stringify(external.templates)]);
  } else if (!templatesUnchanged) {
    conflicts.add('mealTemplate:local-storage-changed-during-sync');
  }
  if (workoutHistoryChanged && historyUnchanged && latestExternal.workoutHistoryIdle) {
    externalWrites.push([LIVE_WORKOUT_HISTORY_KEY, JSON.stringify(external.workoutHistory)]);
  } else if (!historyUnchanged || (workoutHistoryChanged && !latestExternal.workoutHistoryIdle)) {
    conflicts.add('liveWorkoutHistory:local-storage-changed-during-sync');
  }
  if (!templatesUnchanged) {
    const ids = new Set(latestExternal.templates.map((item) => item.id));
    for (const key of Object.keys(metadata.baseline)) {
      if (!key.startsWith('mealTemplate:')) continue;
      const id = key.slice('mealTemplate:'.length);
      if (!ids.has(id) && !metadata.tombstones.some((item) => keyOf(item.entity, item.id) === key)) {
        delete metadata.baseline[key];
      }
    }
  }
  if (!historyUnchanged) {
    const ids = new Set(latestExternal.workoutHistory.map((item) => item.id));
    for (const key of Object.keys(metadata.baseline)) {
      if (!key.startsWith('liveWorkoutHistory:')) continue;
      const id = key.slice('liveWorkoutHistory:'.length);
      if (!ids.has(id) && !metadata.tombstones.some((item) => keyOf(item.entity, item.id) === key)) {
        delete metadata.baseline[key];
      }
    }
  }
  if (externalWrites.length) {
    if (externalWrites.some(([key]) => key === MEAL_TEMPLATES_KEY) && !templatesUnchanged) {
      throw new Error('Meal templates changed during sync. No local merge was applied; retry sync.');
    }
    if (externalWrites.some(([key]) => key === LIVE_WORKOUT_HISTORY_KEY) && !historyUnchanged) {
      throw new Error('Completed workout history changed during sync. No local merge was applied; retry sync.');
    }
    await AsyncStorage.multiSet(externalWrites);
  }

  // A server write may have succeeded already. Persist the reconciled mobile
  // state before acknowledging baselines so a failed local write retries against
  // the server without pretending the old local snapshot was committed.
  await persistReconciledState(nextState);
  await AsyncStorage.multiSet([
    [metadataKey, JSON.stringify(metadata)],
    [LAST_PAIR_KEY, pairFingerprint],
  ]);
  return {
    state: nextState,
    conflicts: conflicts.size,
    message: conflicts.size
      ? `${conflicts.size} journal item${conflicts.size === 1 ? '' : 's'} conflicted; local and web versions were kept unchanged.`
      : 'Journal synced with GYM Buddy.',
  };
}

function makeMutationId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function syncFitnessJournal(
  state: FitnessState,
  pairKey: string,
  deletedRecords: PendingDeletion[] = [],
  persistReconciledState: (nextState: FitnessState) => Promise<void>,
): Promise<FitnessJournalSyncResult> {
  return withJournalStorageLock(() =>
    syncFitnessJournalUnlocked(state, pairKey, deletedRecords, persistReconciledState));
}