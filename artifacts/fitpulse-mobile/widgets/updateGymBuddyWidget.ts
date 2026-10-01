import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import type { FitnessProfile, Meal, WorkoutSet } from '@/providers/FitnessProvider';

type WidgetFitnessSource = {
  meals: Meal[];
  sets: WorkoutSet[];
  water: Record<string, number>;
  profile: Pick<FitnessProfile, 'calorieTarget' | 'waterGoalMl' | 'stepTarget'>;
  /** Current phone/native step count, when available; leave null if not read. */
  movementSteps?: number | null;
};

export type GymBuddyWidgetSyncResult =
  | { status: 'updated' }
  | { status: 'skipped'; reason: 'unsupported-platform' | 'expo-go' }
  | { status: 'error'; error: string };

const localDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/**
 * Pushes the actual current-day FitnessProvider records to the iOS home-screen
 * widget. Safe to call from web and Expo Go: neither loads the native widget
 * module. Call again after provider data or the native step count changes.
 */
export async function updateGymBuddyWidget(
  source: WidgetFitnessSource,
): Promise<GymBuddyWidgetSyncResult> {
  if (Platform.OS !== 'ios') {
    return { status: 'skipped', reason: 'unsupported-platform' };
  }
  // Replit's native previews and Expo Go do not include our widget extension.
  // Do not even import its native module in that host.
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return { status: 'skipped', reason: 'expo-go' };
  }

  const today = localDateKey(new Date());
  const todayMeals = source.meals.filter((meal) => meal.date === today);
  const todaySets = source.sets.filter((set) => set.date === today);
  const calories = todayMeals.reduce((total, meal) => total + meal.calories, 0);
  const waterMl = source.water[today] ?? 0;
  const tomorrow = new Date();
  tomorrow.setHours(24, 0, 0, 0);

  try {
    const { default: widget } = await import('./GymBuddyTodayWidget');
    widget.updateTimeline([
      {
        date: new Date(),
        props: {
          initialized: true,
          asOfDate: today,
          calories,
          calorieGoal: source.profile.calorieTarget,
          waterMl,
          waterGoalMl: source.profile.waterGoalMl,
          sets: todaySets.length,
          steps: typeof source.movementSteps === 'number' ? source.movementSteps : null,
          stepGoal: source.profile.stepTarget,
        },
      },
      {
        // At local midnight, blank stale metrics even if the user hasn't
        // reopened the app. The date stamp above is a second safety net if
        // WidgetKit delays processing this timeline entry.
        date: tomorrow,
        props: {
          initialized: false,
          asOfDate: localDateKey(tomorrow),
          calories: 0,
          calorieGoal: source.profile.calorieTarget,
          waterMl: 0,
          waterGoalMl: source.profile.waterGoalMl,
          sets: 0,
          steps: null,
          stepGoal: source.profile.stepTarget,
        },
      },
    ]);
    return { status: 'updated' };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}