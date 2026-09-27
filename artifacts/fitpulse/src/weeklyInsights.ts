export type WeeklyDay = {
  key: string;
  label: string;
  dateLabel: string;
  isFuture: boolean;
  steps: number | null;
  waterMl: number | null;
  calories: number | null;
  mealCount: number;
  workoutSets: number;
};

export type WeeklyInsight = {
  days: WeeklyDay[];
  rangeLabel: string;
  isCurrentWeek: boolean;
  stepsTotal: number;
  stepDaysLogged: number;
  stepGoalDays: number;
  waterDaysLogged: number;
  waterGoalDays: number;
  mealsLogged: number;
  calorieLoggedTotal: number;
  nutritionDaysLogged: number;
  workoutSets: number;
  workoutDays: number;
  takeaway: string;
  anyEntries: boolean;
  targets: { steps: number; waterMl: number; calories: number };
};

type WeeklyInputs = {
  todayKey: string;
  weekOffset: number;
  steps: Record<string, number>;
  water: Record<string, number>;
  meals: { date?: string; calories: number }[];
  workouts: { date: string }[];
  stepGoal: number;
  waterGoal: number;
  calorieGoal: number;
};

function localKey(day: Date) {
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
}

export function buildWeeklyInsights({
  todayKey, weekOffset, steps, water, meals, workouts, stepGoal, waterGoal, calorieGoal,
}: WeeklyInputs): WeeklyInsight {
  // Noon local time keeps the chosen calendar day stable across daylight-saving changes.
  const monday = new Date(`${todayKey}T12:00:00`);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + Math.min(0, weekOffset) * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const monthDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
  const rangeLabel = `${monthDay.format(monday)} – ${monthDay.format(sunday)}, ${sunday.getFullYear()}`;

  const mealsByDate = new Map<string, { count: number; calories: number }>();
  for (const meal of meals) {
    if (!meal.date) continue;
    const existing = mealsByDate.get(meal.date) ?? { count: 0, calories: 0 };
    mealsByDate.set(meal.date, {
      count: existing.count + 1,
      calories: existing.calories + (Number.isFinite(meal.calories) ? meal.calories : 0),
    });
  }
  const workoutsByDate = new Map<string, number>();
  for (const workout of workouts) workoutsByDate.set(workout.date, (workoutsByDate.get(workout.date) ?? 0) + 1);

  const days: WeeklyDay[] = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const key = localKey(date);
    const meal = mealsByDate.get(key);
    return {
      key,
      label: new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date),
      dateLabel: monthDay.format(date),
      isFuture: key > todayKey,
      steps: Object.hasOwn(steps, key) && Number.isFinite(steps[key]) ? Math.max(0, steps[key]) : null,
      waterMl: Object.hasOwn(water, key) && Number.isFinite(water[key]) ? Math.max(0, water[key]) : null,
      calories: meal ? meal.calories : null,
      mealCount: meal?.count ?? 0,
      workoutSets: workoutsByDate.get(key) ?? 0,
    };
  });
  const recorded = days.filter((day) => !day.isFuture);
  const stepDays = recorded.filter((day) => day.steps !== null);
  const waterDays = recorded.filter((day) => day.waterMl !== null);
  const nutritionDays = recorded.filter((day) => day.mealCount > 0);
  const trainingDays = recorded.filter((day) => day.workoutSets > 0);
  const stepsTotal = stepDays.reduce((sum, day) => sum + day.steps!, 0);
  const calorieLoggedTotal = nutritionDays.reduce((sum, day) => sum + day.calories!, 0);
  const mealsLogged = nutritionDays.reduce((sum, day) => sum + day.mealCount, 0);
  const workoutSets = trainingDays.reduce((sum, day) => sum + day.workoutSets, 0);
  const bestStepDay = stepDays.reduce<WeeklyDay | null>((best, day) => !best || day.steps! > best.steps! ? day : best, null);
  const withWorkout = stepDays.filter((day) => day.workoutSets > 0);
  const withoutWorkout = stepDays.filter((day) => day.workoutSets === 0);
  let takeaway = '';
  if (withWorkout.length >= 2 && withoutWorkout.length >= 2) {
    const trainingAverage = Math.round(withWorkout.reduce((sum, day) => sum + day.steps!, 0) / withWorkout.length);
    const otherAverage = Math.round(withoutWorkout.reduce((sum, day) => sum + day.steps!, 0) / withoutWorkout.length);
    takeaway = `On days with a logged strength set, you recorded an average of ${trainingAverage.toLocaleString()} steps; on other days with step entries, ${otherAverage.toLocaleString()}. This describes your logs, not a cause-and-effect relationship.`;
  } else if (bestStepDay && bestStepDay.steps! > 0) {
    takeaway = `${bestStepDay.label} was your most active logged day, with ${bestStepDay.steps!.toLocaleString()} steps.`;
  } else if (workoutSets > 0) {
    takeaway = `You logged ${workoutSets} strength ${workoutSets === 1 ? 'set' : 'sets'} across ${trainingDays.length} ${trainingDays.length === 1 ? 'day' : 'days'} this week.`;
  } else if (waterDays.length > 0) {
    takeaway = `You recorded water on ${waterDays.length} ${waterDays.length === 1 ? 'day' : 'days'} this week.`;
  } else if (mealsLogged > 0) {
    takeaway = `You logged ${mealsLogged} ${mealsLogged === 1 ? 'meal' : 'meals'} this week. Older imported meal dates may be approximate.`;
  }
  return {
    days, rangeLabel, isCurrentWeek: weekOffset >= 0,
    stepsTotal, stepDaysLogged: stepDays.length,
    stepGoalDays: stepDays.filter((day) => day.steps! >= stepGoal).length,
    waterDaysLogged: waterDays.length,
    waterGoalDays: waterDays.filter((day) => day.waterMl! >= waterGoal).length,
    mealsLogged, calorieLoggedTotal, nutritionDaysLogged: nutritionDays.length,
    workoutSets, workoutDays: trainingDays.length, takeaway,
    anyEntries: stepDays.length > 0 || waterDays.length > 0 || mealsLogged > 0 || workoutSets > 0,
    targets: { steps: stepGoal, waterMl: waterGoal, calories: calorieGoal },
  };
}