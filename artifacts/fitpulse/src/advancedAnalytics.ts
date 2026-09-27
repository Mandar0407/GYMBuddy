export type AdvancedAnalyticsInputs = {
  currentDate: string;
  meals: { date?: string; calories: number; protein: number }[];
  steps: Record<string, number>;
  workouts: { date: string }[];
  completedWorkouts: { date: string }[];
  weightHistory: Record<string, number>;
  calorieTarget: number;
  proteinTarget: number;
};

export type AnalyticsDay = {
  key: string;
  weekday: string;
  dateLabel: string;
  mealCount: number;
  calories: number | null;
  protein: number | null;
  steps: number | null;
  workoutSets: number;
  weight: number | null;
  weightAverage: number | null;
};

export type AdvancedAnalyticsResult = {
  days: AnalyticsDay[];
  rangeLabel: string;
  averageSteps: number | null;
  stepDays: number;
  workoutDays: number;
  completedWorkoutCount: number;
  averageProteinTargetRate: number | null;
  mealDays: number;
  calorieTarget: number;
  proteinTarget: number;
};

const keyFor = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** A calendar date at local noon, rather than a UTC timestamp, to survive DST boundaries. */
function parseLocalDay(key: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new RangeError('Expected a local YYYY-MM-DD date');
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12);
  if (keyFor(date) !== key) throw new RangeError('Invalid local calendar date');
  return date;
}

/**
 * The seven local calendar dates ending at currentDate, inclusive. Missing entries
 * remain null. Weight averages use the last up-to-three *logged measurements* and
 * are attached only to measurement dates, beginning with the second reading.
 */
export function buildAdvancedAnalytics({
  currentDate, meals, steps, workouts, completedWorkouts, weightHistory, calorieTarget, proteinTarget,
}: AdvancedAnalyticsInputs): AdvancedAnalyticsResult {
  const end = parseLocalDay(currentDate);
  const mealTotals = new Map<string, { count: number; calories: number; protein: number }>();
  for (const meal of meals) {
    if (!meal.date || !/^\d{4}-\d{2}-\d{2}$/.test(meal.date)) continue;
    const previous = mealTotals.get(meal.date) ?? { count: 0, calories: 0, protein: 0 };
    mealTotals.set(meal.date, {
      count: previous.count + 1,
      calories: previous.calories + (Number.isFinite(meal.calories) ? meal.calories : 0),
      protein: previous.protein + (Number.isFinite(meal.protein) ? meal.protein : 0),
    });
  }
  const workoutDates = new Map<string, number>();
  for (const workout of workouts) {
    if (!workout.date) continue;
    workoutDates.set(workout.date, (workoutDates.get(workout.date) ?? 0) + 1);
  }
  const recentWeights: number[] = [];
  const days: AnalyticsDay[] = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(end);
    date.setDate(end.getDate() - 6 + index);
    const key = keyFor(date);
    const meal = mealTotals.get(key);
    const step = Object.hasOwn(steps, key) && Number.isFinite(steps[key]) && steps[key] >= 0 ? steps[key] : null;
    const weight = Object.hasOwn(weightHistory, key) && Number.isFinite(weightHistory[key]) && weightHistory[key] >= 20 && weightHistory[key] <= 500 ? weightHistory[key] : null;
    if (weight !== null) recentWeights.push(weight);
    return {
      key,
      weekday: new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date),
      dateLabel: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date),
      mealCount: meal?.count ?? 0,
      calories: meal ? meal.calories : null,
      protein: meal ? meal.protein : null,
      steps: step,
      workoutSets: workoutDates.get(key) ?? 0,
      weight,
      weightAverage: weight !== null && recentWeights.length >= 2
        ? recentWeights.slice(-3).reduce((sum, item) => sum + item, 0) / Math.min(3, recentWeights.length)
        : null,
    };
  });
  const stepDays = days.filter((day) => day.steps !== null);
  const mealDays = days.filter((day) => day.mealCount > 0);
  const monthDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
  const start = parseLocalDay(days[0].key);
  return {
    days,
    rangeLabel: `${monthDay.format(start)} – ${monthDay.format(end)}, ${end.getFullYear()}`,
    averageSteps: stepDays.length ? stepDays.reduce((sum, day) => sum + day.steps!, 0) / stepDays.length : null,
    stepDays: stepDays.length,
    workoutDays: days.filter((day) => day.workoutSets > 0).length,
    completedWorkoutCount: completedWorkouts.filter((item) => days.some((day) => day.key === item.date)).length,
    // Average daily rates, not the ratio of weekly sums; never treat missing days as zero.
    averageProteinTargetRate: mealDays.length && Number.isFinite(proteinTarget) && proteinTarget > 0
      ? mealDays.reduce((sum, day) => sum + day.protein! / proteinTarget * 100, 0) / mealDays.length
      : null,
    mealDays: mealDays.length,
    calorieTarget,
    proteinTarget,
  };
}