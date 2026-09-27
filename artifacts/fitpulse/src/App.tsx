import { type CSSProperties, type FormEvent, type MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from 'react';
import {
  Activity,
  Apple,
  ArrowRight,
  Award,
  Calculator,
  Check,
  ChevronDown,
  CircleUserRound,
  Dumbbell,
  Footprints,
  Home,
  Info,
  Menu,
  Plus,
  Sparkles,
  ChartNoAxesCombined,
  Target,
  Trash2,
  Utensils,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import PremiumDashboard from './PremiumDashboard';
import MovementPage from './MovementPage';
import WeeklyInsightsPage from './WeeklyInsightsPage';
import AdvancedAnalytics from './AdvancedAnalytics';
import { buildWeeklyInsights } from './weeklyInsights';
import RestTimer from './RestTimer';
import StrengthIntervalTimer from './StrengthIntervalTimer';
import WaterIntakeCard from './WaterIntakeCard';
import MealTemplates from './MealTemplates';
import PRCelebration from './PRCelebration';
import { calculatedOneRm } from './strengthMath';
import { useMotionSteps } from './useMotionSteps';
import { usePairedMovement } from './usePairedMovement';
import { useWorkoutSessions, workoutMetrics, type WorkoutKind } from './useWorkoutSessions';
import { LiveWorkoutOverlay, WorkoutCountdown, WorkoutSelectionCards } from './LiveWorkoutUI';

type View = 'dashboard' | 'macros' | 'workout' | 'steps' | 'insights' | 'plan';
type Profile = { name: string; goal: string; weight: number; height: number; calorieTarget: number; proteinTarget: number; carbsTarget: number; fatTarget: number; stepTarget: number };
type MacroLog = { id: string; meal: string; calories: number; protein: number; carbs: number; fat: number; time: string; date?: string };
type SetType = 'warmup' | 'working' | 'drop' | 'failure';
type WorkoutSet = { id: string; exercise: string; weight: number; reps: number; estimatedOneRm: number; date: string; setType?: SetType };
type CompletedWorkout = { id: string; date: string; completedAt: number; setIds: string[] };
type StepsMap = Record<string, number>;
type HourlyStepsMap = Record<string, number[]>;
type PlanGoal = 'cut' | 'maintain' | 'bulk';
type Sex = 'female' | 'male';
type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'high';
type PlanResult = { calories: number; protein: number; carbs: number; fat: number; bmi: number; bmiLabel: string; goalLabel: string; weight: number; height: number };

const STORAGE = {
  profile: 'fitpulse-profile',
  macros: 'fitpulse-macros',
  workouts: 'fitpulse-workouts',
  completedWorkouts: 'fitpulse-completed-workouts',
  steps: 'fitpulse-steps',
  stepHours: 'fitpulse-step-hours',
  stride: 'fitpulse-stride-cm',
  strideOverride: 'fitpulse-stride-override-cm',
  water: 'fitpulse-water',
  waterGoal: 'fitpulse-water-goal',
  weights: 'fitpulse-weight-history',
};

const defaultProfile: Profile = {
  name: 'Maya Chen',
  goal: 'Build strength',
  weight: 68,
  height: 170,
  calorieTarget: 2200,
  proteinTarget: 110,
  carbsTarget: 250,
  fatTarget: 70,
  stepTarget: 10000,
};

const mealOptions = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
const activityMultipliers: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
};
const navItems: { id: View; label: string; icon: LucideIcon }[] = [
  { id: 'dashboard', label: 'Today', icon: Home },
  { id: 'macros', label: 'Nutrition', icon: Apple },
  { id: 'workout', label: 'Strength', icon: Dumbbell },
  { id: 'steps', label: 'Movement', icon: Footprints },
  { id: 'insights', label: 'Insights', icon: ChartNoAxesCombined },
  { id: 'plan', label: 'My plan', icon: Target },
];

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function todayKey() {
  return dateKey(new Date());
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function readStrideOverride(): number | null {
  const saved = readStorage<unknown>(STORAGE.strideOverride, undefined);
  if (saved === null) return null;
  if (typeof saved === 'number' && Number.isFinite(saved) && saved >= 30 && saved <= 150) return saved;
  // The previous app stored its default 74 cm as though it were a manual setting.
  const legacy = readStorage<unknown>(STORAGE.stride, null);
  return typeof legacy === 'number' && legacy !== 74 && Number.isFinite(legacy) && legacy >= 30 && legacy <= 150 ? legacy : null;
}

function readHourlySteps(): HourlyStepsMap {
  const stored = readStorage<unknown>(STORAGE.stepHours, {});
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
  return Object.fromEntries(Object.entries(stored).filter(([day, hours]) =>
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    Array.isArray(hours) && hours.length === 24 &&
    hours.every((count) => Number.isSafeInteger(count) && count >= 0),
  )) as HourlyStepsMap;
}

function readMeals(): MacroLog[] {
  const stored = readStorage<MacroLog[]>(STORAGE.macros, []);
  if (!Array.isArray(stored)) return [];
  return stored.map((meal) => {
    if (meal.date && /^\d{4}-\d{2}-\d{2}$/.test(meal.date)) return meal;
    const timestamp = /^(?:meal-)?(\d{13})(?:-|$)/.exec(meal.id);
    const loggedAt = timestamp ? new Date(Number(timestamp[1])) : null;
    // Older opaque IDs have no recoverable date; retain those meals on the migration day.
    return { ...meal, date: loggedAt && !Number.isNaN(loggedAt.getTime()) ? dateKey(loggedAt) : todayKey() };
  });
}

function readWeights(): StepsMap {
  const value = readStorage<unknown>(STORAGE.weights, {});
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key, weight]) =>
    /^\d{4}-\d{2}-\d{2}$/.test(key) && typeof weight === 'number' && Number.isFinite(weight) && weight >= 20 && weight <= 500));
}

function readCompletedWorkouts(): CompletedWorkout[] {
  const value = readStorage<unknown>(STORAGE.completedWorkouts, []);
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is CompletedWorkout => Boolean(item) && typeof item.id === 'string' &&
    typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date) &&
    Number.isFinite(item.completedAt) && Array.isArray(item.setIds) && item.setIds.length > 0 &&
    item.setIds.every((id: unknown) => typeof id === 'string'));
}

function initials(name: string) {
  return name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function formatLongDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(date);
}

function shortDate(dateKey: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${dateKey}T12:00:00`));
}

function numberValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatAmount(value: number) {
  return Number(value.toFixed(2)).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function App() {
  const [view, setView] = useState<View>('dashboard');
  const [weekOffset, setWeekOffset] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileTriggerRef = useRef<HTMLButtonElement>(null);
  const [profile, setProfile] = useState<Profile>(() => ({ ...defaultProfile, ...readStorage(STORAGE.profile, defaultProfile) }));
  const [macros, setMacros] = useState<MacroLog[]>(readMeals);
  const [workouts, setWorkouts] = useState<WorkoutSet[]>(() => readStorage(STORAGE.workouts, []));
  const [completedWorkouts, setCompletedWorkouts] = useState<CompletedWorkout[]>(readCompletedWorkouts);
  const [steps, setSteps] = useState<StepsMap>(() => readStorage(STORAGE.steps, {}));
  const [stepHours, setStepHours] = useState<HourlyStepsMap>(readHourlySteps);
  const [waterHistory, setWaterHistory] = useState<StepsMap>(() => readStorage(STORAGE.water, {}));
  const [weightHistory, setWeightHistory] = useState<StepsMap>(readWeights);
  const [waterGoal, setWaterGoal] = useState(() => {
    const saved = readStorage<number>(STORAGE.waterGoal, 2000);
    return Number.isInteger(saved) && saved >= 100 && saved <= 20000 ? saved : 2000;
  });
  const [strideOverrideCm, setStrideOverrideCm] = useState<number | null>(readStrideOverride);
  const strideCm = strideOverrideCm ?? Math.round(profile.height * 0.415);
  const [toast, setToast] = useState('');
  const [restSession, setRestSession] = useState<{ id: string; exercise: string; setType: SetType } | null>(null);
  const [prCelebration, setPrCelebration] = useState<{ set: WorkoutSet; oneRmRecord: boolean; weightRecord: boolean } | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [currentDate, setCurrentDate] = useState(todayKey);
  const paired = usePairedMovement();
  const liveWorkouts = useWorkoutSessions();
  const workoutStartedMotionRef = useRef(false);
  const recordSteps = (amount: number) => {
    const now = new Date();
    const day = dateKey(now);
    setSteps((existing) => ({ ...existing, [day]: amount < 0 ? 0 : (existing[day] ?? 0) + amount }));
    setStepHours((existing) => {
      const hours = [...(existing[day] ?? Array(24).fill(0))];
      if (amount < 0) hours.fill(0);
      else hours[now.getHours()] += amount;
      return { ...existing, [day]: hours };
    });
    setCurrentDate(day);
  };
  const motion = useMotionSteps(() => {
    liveWorkouts.recordStep();
    if (!paired.key) recordSteps(1);
  });
  useEffect(() => {
    if (paired.key && !liveWorkouts.active && !liveWorkouts.countdown) motion.stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paired.key]);
  useEffect(() => {
    if (motion.status === 'active') liveWorkouts.markSensorReady();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motion.status, liveWorkouts.active?.id]);
  useEffect(() => {
    if (!paired.key || !paired.data) return;
    const { goal, weightKg, strideCm: syncedStride } = paired.data;
    setProfile((existing) => existing.stepTarget === goal && existing.weight === weightKg
      ? existing : { ...existing, stepTarget: goal, weight: weightKg });
    setStrideOverrideCm((existing) => {
      const derived = Math.round(profile.height * 0.415);
      const next = syncedStride === derived ? null : syncedStride;
      return existing === next ? existing : next;
    });
  // A changed height can change the automatic stride independently of the paired goal.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paired.key, paired.data, profile.height]);

  useEffect(() => {
    const refreshDate = () => setCurrentDate(todayKey());
    const interval = window.setInterval(refreshDate, 60_000);
    window.addEventListener('focus', refreshDate);
    document.addEventListener('visibilitychange', refreshDate);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshDate);
      document.removeEventListener('visibilitychange', refreshDate);
    };
  }, []);

  const persist = (key: string, value: unknown) => {
    try { window.localStorage.setItem(key, JSON.stringify(value)); }
    catch { setStorageError(true); }
  };
  useEffect(() => { persist(STORAGE.profile, profile); }, [profile]);
  useEffect(() => { persist(STORAGE.macros, macros); }, [macros]);
  useEffect(() => { persist(STORAGE.workouts, workouts); }, [workouts]);
  useEffect(() => { persist(STORAGE.completedWorkouts, completedWorkouts); }, [completedWorkouts]);
  useEffect(() => { persist(STORAGE.steps, steps); }, [steps]);
  useEffect(() => { persist(STORAGE.stepHours, stepHours); }, [stepHours]);
  useEffect(() => { persist(STORAGE.water, waterHistory); }, [waterHistory]);
  useEffect(() => { persist(STORAGE.weights, weightHistory); }, [weightHistory]);
  useEffect(() => { persist(STORAGE.waterGoal, waterGoal); }, [waterGoal]);
  useEffect(() => { persist(STORAGE.strideOverride, strideOverrideCm); }, [strideOverrideCm]);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const navigate = (nextView: View) => {
    setView(nextView);
    setMobileNavOpen(false);
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
  };
  const startWorkout = (kind: WorkoutKind) => {
    if (liveWorkouts.active || liveWorkouts.countdown) return;
    workoutStartedMotionRef.current = kind !== 'strength' && motion.status !== 'active';
    if (workoutStartedMotionRef.current) void motion.start();
    liveWorkouts.start(kind, strideCm, paired.data?.weightKg ?? profile.weight);
  };
  const cancelWorkoutCountdown = () => {
    liveWorkouts.cancelCountdown();
    if (workoutStartedMotionRef.current) motion.stop();
    workoutStartedMotionRef.current = false;
  };
  const pauseWorkout = () => {
    liveWorkouts.pause();
    if (workoutStartedMotionRef.current) motion.stop();
  };
  const resumeWorkout = () => {
    if (liveWorkouts.active?.kind !== 'strength' && motion.status !== 'active') {
      workoutStartedMotionRef.current = true;
      void motion.start();
    }
    liveWorkouts.resume();
  };
  const endWorkout = () => {
    if (!liveWorkouts.end()) return;
    if (workoutStartedMotionRef.current) motion.stop();
    workoutStartedMotionRef.current = false;
    navigate('steps');
    setToast('Workout saved to your Movement history.');
  };

  const todayMacros = macros.filter((meal) => meal.date === currentDate);
  const visibleSteps = paired.key && paired.data ? { ...steps, ...paired.stepTotals } : steps;
  const todaySteps = visibleSteps[currentDate] ?? 0;
  const todayWater = waterHistory[currentDate] ?? 0;
  const calories = todayMacros.reduce((total, item) => total + item.calories, 0);
  const protein = todayMacros.reduce((total, item) => total + item.protein, 0);
  const carbs = todayMacros.reduce((total, item) => total + item.carbs, 0);
  const fat = todayMacros.reduce((total, item) => total + item.fat, 0);
  const workoutCount = workouts.filter((item) => item.date === currentDate).length;
  const weeklyInsight = view === 'insights' ? buildWeeklyInsights({
    todayKey: currentDate, weekOffset, steps: visibleSteps, water: waterHistory, meals: macros, workouts,
    stepGoal: profile.stepTarget, waterGoal, calorieGoal: profile.calorieTarget,
  }) : null;

  const saveProfile = (nextProfile: Profile) => {
    setProfile(nextProfile);
    if (paired.key) void paired.saveSettings(nextProfile.stepTarget,
      strideOverrideCm ?? Math.round(nextProfile.height * 0.415), nextProfile.weight);
    setProfileOpen(false);
    setToast('Profile saved. Your targets are ready.');
  };
  const addMeal = (log: MacroLog) => {
    const loggedDate = todayKey();
    setMacros((existing) => [{ ...log, date: loggedDate }, ...existing]);
    setCurrentDate(loggedDate);
    setToast(`${log.meal} added to today.`);
  };
  const openProfile = (event: ReactMouseEvent<HTMLButtonElement>) => {
    profileTriggerRef.current = event.currentTarget;
    setProfileOpen(true);
  };

  return (
    <div className="fp-premium">
      <div className="fp-layout">
        <aside className="fp-sidebar" aria-label="Primary navigation">
          <Brand />
          <div className="fp-side-caption">YOUR SPACE</div>
          <nav className="fp-nav" aria-label="Main navigation">
            {navItems.map((item) => <NavButton key={item.id} item={item} active={view === item.id} onClick={() => navigate(item.id)} />)}
          </nav>
          <div className="fp-side-note">
            <span className="fp-note-icon"><Sparkles size={15} /></span>
            <p><strong>Progress, not pressure.</strong><br />Your rhythm is yours to make.</p>
          </div>
          <button className="fp-profile" type="button" onClick={openProfile} data-testid="button-open-profile">
            <span className="fp-avatar" data-testid="text-profile-initials">{initials(profile.name)}</span>
            <span className="fp-profile-copy"><strong data-testid="text-profile-name">{profile.name}</strong><span>{profile.goal}</span></span>
            <ChevronDown size={15} />
          </button>
        </aside>

        <main className="fp-main">
          <div className="fp-mobilebar">
            <Brand compact />
            <div className="fp-mobile-actions">
              <button className="fp-menu-toggle" type="button" onClick={() => setMobileNavOpen((open) => !open)} aria-expanded={mobileNavOpen} aria-controls="fitpulse-mobile-navigation" aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'} data-testid="button-mobile-menu">
                {mobileNavOpen ? <X size={19} /> : <Menu size={19} />}
              </button>
            </div>
          </div>
          <nav className="fp-top-tabs" aria-label="Quick navigation" style={{ '--active-tab': Math.max(0, navItems.slice(0, 5).findIndex((item) => item.id === view)) } as CSSProperties}>
            {navItems.slice(0, 5).map((item) => (
              <button
                key={item.id}
                type="button"
                className={`fp-top-tab${view === item.id ? ' is-active' : ''}`}
                onClick={() => navigate(item.id)}
                aria-current={view === item.id ? 'page' : undefined}
                data-testid={`button-top-nav-${item.id}`}
              >{item.label}</button>
            ))}
            <span className={`fp-top-tabs-indicator${view === 'plan' ? ' is-hidden' : ''}`} aria-hidden="true" data-testid="indicator-top-nav" />
          </nav>
          {mobileNavOpen && (
            <nav className="fp-mobile-nav" id="fitpulse-mobile-navigation" aria-label="Mobile navigation">
              {navItems.map((item) => <NavButton key={item.id} item={item} active={view === item.id} onClick={() => navigate(item.id)} />)}
              <button className="fp-nav-item" type="button" onClick={(event) => { openProfile(event); setMobileNavOpen(false); }} data-testid="button-mobile-profile">
                <CircleUserRound size={17} /><span>Profile</span>
              </button>
            </nav>
          )}
          <div className="fp-page">
            {view === 'dashboard' && (
              <PremiumDashboard
                profile={profile}
                calories={calories}
                protein={protein}
                carbs={carbs}
                fat={fat}
                todaySteps={todaySteps}
                workoutCount={workoutCount}
                macros={todayMacros}
                onNavigate={navigate}
                onAddMeal={addMeal}
              />
            )}
            {view === 'macros' && (
              <MacrosPage
                profile={profile}
                logs={todayMacros}
                waterMl={todayWater}
                 waterGoal={waterGoal}
                 onWaterGoalChange={setWaterGoal}
                onWaterChange={(amount) => {
                  const day = todayKey();
                  setWaterHistory((existing) => ({ ...existing, [day]: Math.max(0, (existing[day] ?? 0) + amount) }));
                  setCurrentDate(day);
                }}
                onAdd={addMeal}
                onDelete={(id) => { setMacros((existing) => existing.filter((item) => item.id !== id)); setToast('Meal removed.'); }}
                onSaveTargets={(targets) => {
                  setProfile((existing) => ({ ...existing, ...targets }));
                  setToast('Daily macro targets saved.');
                }}
              />
            )}
            {/* Keep the timer mounted so a running interval survives switching sections. */}
            <div hidden={view !== 'workout'}>
              <WorkoutPage
                showLauncher={view === 'workout'}
                onStartWorkout={startWorkout}
                workoutActive={!!liveWorkouts.active || !!liveWorkouts.countdown}
                workouts={workouts}
                completedWorkouts={completedWorkouts}
                onAdd={(set) => {
                  const previous = workouts.filter((item) => item.exercise.trim().toLowerCase() === set.exercise.trim().toLowerCase());
                  const oneRmRecord = previous.length > 0 && calculatedOneRm(set) > Math.max(...previous.map(calculatedOneRm));
                  const weightRecord = previous.length > 0 && set.weight > Math.max(...previous.map((item) => item.weight));
                  setWorkouts((existing) => [set, ...existing]);
                  if (set.setType === 'working') setRestSession({ id: set.id, exercise: set.exercise, setType: 'working' });
                  if (oneRmRecord || weightRecord) setPrCelebration({ set, oneRmRecord, weightRecord });
                  setToast(oneRmRecord || weightRecord ? 'New personal record!' : set.setType === 'working' ? 'Set logged. Rest timer started.' : 'Set logged.');
                }}
                onFinishWorkout={(setIds) => {
                  setCompletedWorkouts((existing) => [{ id: crypto.randomUUID(), date: todayKey(), completedAt: Date.now(), setIds }, ...existing]);
                  setToast('Workout marked complete.');
                }}
                onDelete={(id) => {
                  setWorkouts((existing) => existing.filter((item) => item.id !== id));
                  setCompletedWorkouts((existing) => existing.map((item) => ({
                    ...item, setIds: item.setIds.filter((setId) => setId !== id),
                  })).filter((item) => item.setIds.length > 0));
                  setToast('Set removed.');
                }}
              />
            </div>
            {view === 'steps' && (
              <MovementPage
                onStartWorkout={startWorkout}
                workoutActive={!!liveWorkouts.active || !!liveWorkouts.countdown}
                workoutSessions={liveWorkouts.sessions}
                steps={visibleSteps}
                hourlySteps={paired.key && paired.data?.days.some((day) => day.date === currentDate)
                  ? paired.nativeDates.has(currentDate) ? paired.hourly[currentDate]
                    : paired.hourly[currentDate].map((value, i) => value + (stepHours[currentDate]?.[i] ?? 0))
                  : stepHours[currentDate] ?? Array(24).fill(0)}
                todaySteps={todaySteps}
                currentDate={currentDate}
                target={paired.data?.goal ?? profile.stepTarget}
                weightKg={paired.data?.weightKg ?? profile.weight}
                heightCm={profile.height}
                strideCm={strideCm}
                strideOverrideCm={strideOverrideCm}
                pairedKey={paired.key}
                pairedError={paired.error}
                pairedBusy={paired.busy || paired.loading}
                onPair={() => paired.pair(profile.stepTarget, strideCm, profile.weight)}
                motionStatus={motion.status}
                storageError={storageError || motion.storageError}
                onStartTracking={motion.start}
                onStopTracking={motion.stop}
                onChange={(amount) => {
                  if (paired.key) {
                    const clearLegacy = amount < 0 && !paired.nativeDates.has(todayKey());
                    void paired.change(amount, todayKey(), new Date().getHours()).then((saved) => {
                      if (saved && clearLegacy) recordSteps(-todaySteps);
                    });
                  } else {
                    recordSteps(amount);
                    setToast(amount < 0 ? 'Steps reset for today.' : `${amount.toLocaleString()} steps added.`);
                  }
                }}
                onSaveSettings={(goal, strideOverride, weight, height) => {
                  setProfile((existing) => ({ ...existing, stepTarget: goal, weight, height }));
                  setStrideOverrideCm(strideOverride);
                  if (paired.key) void paired.saveSettings(goal, strideOverride ?? Math.round(height * 0.415), weight);
                  else setToast('Movement settings saved.');
                }}
              />
            )}
            {view === 'insights' && weeklyInsight && (
              <>
                <WeeklyInsightsPage insight={weeklyInsight} weekOffset={weekOffset}
                  onWeekChange={setWeekOffset}
                  onNavigate={navigate}
                />
                <AdvancedAnalytics currentDate={currentDate} meals={macros} steps={visibleSteps}
                  workouts={workouts} completedWorkouts={[...completedWorkouts, ...liveWorkouts.sessions.map((session) => ({ date: dateKey(new Date(session.endedAt)) }))]} weightHistory={weightHistory} calorieTarget={profile.calorieTarget}
                  proteinTarget={profile.proteinTarget}
                  onLogWeight={(weightKg) => {
                    const next = { ...weightHistory, [todayKey()]: weightKg };
                    window.localStorage.setItem(STORAGE.weights, JSON.stringify(next));
                    setWeightHistory(next);
                    setProfile((existing) => ({ ...existing, weight: weightKg }));
                    if (paired.key) void paired.saveSettings(profile.stepTarget, strideCm, weightKg);
                    setCurrentDate(todayKey());
                  }}
                />
              </>
            )}
            {view === 'plan' && (
              <PlanPage
                profile={profile}
                onApplyPlan={(plan) => {
                  setProfile((existing) => ({
                    ...existing,
                    calorieTarget: plan.calories,
                    proteinTarget: plan.protein,
                    carbsTarget: plan.carbs,
                    fatTarget: plan.fat,
                    weight: plan.weight,
                    height: plan.height,
                    goal: `${plan.goalLabel} focus`,
                  }));
                  setToast(`${plan.goalLabel} targets applied to your profile.`);
                }}
              />
            )}
          </div>
        </main>
      </div>
      {profileOpen && <ProfileModal profile={profile} onClose={() => setProfileOpen(false)} onSave={saveProfile} returnFocusRef={profileTriggerRef} />}
      {restSession && <RestTimer key={restSession.id} exercise={restSession.exercise} setType={restSession.setType} onDismiss={() => setRestSession(null)} />}
      {prCelebration && <PRCelebration exercise={prCelebration.set.exercise} estimatedOneRm={prCelebration.set.estimatedOneRm}
        weight={prCelebration.set.weight} oneRmRecord={prCelebration.oneRmRecord} weightRecord={prCelebration.weightRecord}
        onClose={() => setPrCelebration(null)} />}
      {liveWorkouts.countdown && <WorkoutCountdown kind={liveWorkouts.countdown.kind}
        count={liveWorkouts.countdownNumber} onCancel={cancelWorkoutCountdown} />}
      {liveWorkouts.active && <LiveWorkoutOverlay
        kind={liveWorkouts.active.kind} elapsedMs={liveWorkouts.elapsedMs}
        {...workoutMetrics(liveWorkouts.active, liveWorkouts.elapsedMs, liveWorkouts.active.sensorSeen || motion.status === 'active')}
        steps={liveWorkouts.active.steps} isPaused={liveWorkouts.active.runningSince === null}
        motionNote={liveWorkouts.active.kind === 'strength'
          ? 'Energy is estimated from workout time and your saved body weight; distance and pace do not apply to strength training.'
          : liveWorkouts.active.runningSince === null
            ? 'Workout paused. Tap Resume to reconnect motion tracking and continue.'
            : motion.status === 'active'
              ? paired.key
                ? 'Motion sensor connected. Session steps stay in this browser; paired daily steps come from your phone.'
                : `Motion sensor connected. Distance uses your ${liveWorkouts.active.strideCm} cm stride estimate.`
              : motion.status === 'requesting'
                ? 'Waiting for motion readings. Distance and pace will appear once the sensor connects.'
                : 'Motion data is unavailable. Time is still tracked, but distance and pace cannot be estimated without detected steps.'}
        onPause={pauseWorkout} onResume={resumeWorkout} onEnd={endWorkout} />}
      {liveWorkouts.error && <div className="lw-storage-error" role="alert" data-testid="error-live-workout">{liveWorkouts.error}</div>}
      {toast && <div className={`fp-toast${restSession ? ' fp-toast-with-rest' : ''}`} role="status" data-testid="status-toast"><Check size={16} /> {toast}</div>}
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`fp-brand${compact ? ' fp-brand-compact' : ''}`} data-testid="brand-fitpulse">
      <span className="fp-brand-mark"><Activity size={compact ? 17 : 19} strokeWidth={2.5} /></span>
      <span>fit<span>pulse</span></span>
    </div>
  );
}

function NavButton({ item, active, onClick }: { item: (typeof navItems)[number]; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <button type="button" className={`fp-nav-item${active ? ' is-active' : ''}`} onClick={onClick} aria-current={active ? 'page' : undefined} data-testid={`button-nav-${item.id}`}>
      <Icon size={17} strokeWidth={active ? 2.4 : 1.9} />
      <span>{item.label}</span>
      {active && <span className="fp-nav-active-dot" />}
    </button>
  );
}

function MacroBars({ protein, carbs, fat, targets }: { protein: number; carbs: number; fat: number; targets: Pick<Profile, 'proteinTarget' | 'carbsTarget' | 'fatTarget'> }) {
  const rows = [
    { label: 'Protein', value: protein, target: targets.proteinTarget, className: 'bar-protein' },
    { label: 'Carbs', value: carbs, target: targets.carbsTarget, className: 'bar-carbs' },
    { label: 'Fat', value: fat, target: targets.fatTarget, className: 'bar-fat' },
  ];
  return (
    <div className="macro-bars">
      {rows.map((row) => {
        const percentage = row.target > 0 ? Math.round((row.value / row.target) * 100) : 0;
        const difference = row.target - row.value;
        return (
          <div className="macro-meter" key={row.label}>
            <div className="macro-bar-top">
              <span className="macro-meter-label"><i className={`macro-swatch ${row.className}`} />{row.label}</span>
              <strong>{formatAmount(row.value)}g <span>/ {formatAmount(row.target)}g</span></strong>
            </div>
            <div className="bar-track" data-testid={`progress-${row.label.toLowerCase()}`} role="progressbar" aria-label={`${row.label} progress`} aria-valuemin={0} aria-valuemax={row.target} aria-valuenow={Math.min(row.value, row.target)} aria-valuetext={`${formatAmount(row.value)} of ${formatAmount(row.target)} grams, ${percentage}% of target`}>
              <div className={`bar-fill ${row.className}`} style={{ width: `${Math.min(100, percentage)}%` }} />
            </div>
            <div className="macro-meter-foot"><span data-testid={`text-${row.label.toLowerCase()}-progress`}>{percentage}% of goal</span><span>{difference >= 0 ? `${formatAmount(difference)}g left` : `${formatAmount(Math.abs(difference))}g over`}</span></div>
          </div>
        );
      })}
    </div>
  );
}

function EmptyState({ icon: Icon, title, text, action, onClick }: { icon: LucideIcon; title: string; text: string; action?: string; onClick?: () => void }) {
  return <div className="empty-state" data-testid={`empty-${title.toLowerCase().replace(/ /g, '-')}`}><div><Icon size={22} /><strong>{title}</strong><p>{text}</p>{action && onClick && <button className="button-primary" onClick={onClick} data-testid={`button-empty-${action.toLowerCase().replace(/ /g, '-')}`}>{action} <ArrowRight size={14} /></button>}</div></div>;
}

function MealRow({ meal, onDelete }: { meal: MacroLog; onDelete?: (id: string) => void }) {
  return <div className="log-row" data-testid={`row-meal-${meal.id}`}><span className="log-dot" /><div className="log-copy"><strong>{meal.meal}</strong><span>{meal.protein}g protein · {meal.carbs}g carbs · {meal.fat}g fat</span></div><span className="log-value">{meal.calories} kcal</span>{onDelete && <button className="delete-button" onClick={() => onDelete(meal.id)} aria-label={`Delete ${meal.meal}`} data-testid={`button-delete-meal-${meal.id}`}><Trash2 size={15} /></button>}</div>;
}

function MacrosPage({
  profile,
  logs,
  waterMl,
  waterGoal,
  onWaterGoalChange,
  onWaterChange,
  onAdd,
  onDelete,
  onSaveTargets,
}: {
  profile: Profile;
  logs: MacroLog[];
  waterMl: number;
  waterGoal: number;
  onWaterGoalChange: (goal: number) => void;
  onWaterChange: (amount: number) => void;
  onAdd: (log: MacroLog) => void;
  onDelete: (id: string) => void;
  onSaveTargets: (targets: Pick<Profile, 'calorieTarget' | 'proteinTarget' | 'carbsTarget' | 'fatTarget'>) => void;
}) {
  const [form, setForm] = useState({ meal: 'Breakfast', calories: '', protein: '', carbs: '', fat: '' });
  const [error, setError] = useState('');
  const [targetForm, setTargetForm] = useState({
    calories: String(profile.calorieTarget),
    protein: String(profile.proteinTarget),
    carbs: String(profile.carbsTarget),
    fat: String(profile.fatTarget),
  });
  const [targetError, setTargetError] = useState('');
  useEffect(() => {
    setTargetForm({
      calories: String(profile.calorieTarget),
      protein: String(profile.proteinTarget),
      carbs: String(profile.carbsTarget),
      fat: String(profile.fatTarget),
    });
  }, [profile.calorieTarget, profile.proteinTarget, profile.carbsTarget, profile.fatTarget]);
  const calories = logs.reduce((sum, item) => sum + item.calories, 0);
  const protein = logs.reduce((sum, item) => sum + item.protein, 0);
  const carbs = logs.reduce((sum, item) => sum + item.carbs, 0);
  const fat = logs.reduce((sum, item) => sum + item.fat, 0);
  const saveTargets = (event: FormEvent) => {
    event.preventDefault();
    const targets = {
      calorieTarget: numberValue(targetForm.calories),
      proteinTarget: numberValue(targetForm.protein),
      carbsTarget: numberValue(targetForm.carbs),
      fatTarget: numberValue(targetForm.fat),
    };
    if (targets.calorieTarget < 1000 || targets.proteinTarget <= 0 || targets.carbsTarget <= 0 || targets.fatTarget <= 0) {
      setTargetError('Enter at least 1,000 calories and positive macro targets.');
      return;
    }
    onSaveTargets(targets);
    setTargetError('');
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const values = { calories: numberValue(form.calories), protein: numberValue(form.protein), carbs: numberValue(form.carbs), fat: numberValue(form.fat) };
    if (values.calories <= 0) { setError('Add the calories for this meal to continue.'); return; }
    if ([values.protein, values.carbs, values.fat].some((value) => value < 0)) { setError('Macros cannot be negative.'); return; }
    onAdd({ id: `${Date.now()}`, meal: form.meal, ...values, time: new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date()) });
    setForm({ meal: 'Breakfast', calories: '', protein: '', carbs: '', fat: '' });
    setError('');
  };
  return (
    <>
      <header className="page-header"><div><div className="eyebrow">Fuel log · Today</div><h1>Macros that make sense.</h1><p>Log the meal, then get back to living. No food guilt, no spreadsheet energy.</p></div><div className="header-date"><strong>{formatAmount(calories)} kcal</strong>of {profile.calorieTarget.toLocaleString()} target</div></header>
      <section className="panel targets-panel">
        <div className="panel-header">
          <div>
            <h3>Daily targets</h3>
            <p>Choose your daily goals, then track each meal against them.</p>
          </div>
          <Target size={20} color="hsl(var(--primary))" />
        </div>
        <form onSubmit={saveTargets} noValidate>
          <div className="target-form-grid">
            <Field id="target-calories" label="Calories" suffix="kcal/day" value={targetForm.calories} onChange={(value) => setTargetForm({ ...targetForm, calories: value })} placeholder="2500" />
            <Field id="target-protein" label="Protein" suffix="g/day" value={targetForm.protein} onChange={(value) => setTargetForm({ ...targetForm, protein: value })} placeholder="160" />
            <Field id="target-carbs" label="Carbs" suffix="g/day" value={targetForm.carbs} onChange={(value) => setTargetForm({ ...targetForm, carbs: value })} placeholder="280" />
            <Field id="target-fat" label="Fat" suffix="g/day" value={targetForm.fat} onChange={(value) => setTargetForm({ ...targetForm, fat: value })} placeholder="75" />
          </div>
          {targetError && <p className="error-text" style={{ marginTop: 13 }} data-testid="status-target-error">{targetError}</p>}
          <div className="target-form-footer">
            <span>Current focus: <strong>{profile.goal}</strong></span>
            <button className="button-primary" type="submit" data-testid="button-save-daily-targets"><Check size={15} /> Save daily targets</button>
          </div>
        </form>
      </section>
      <div className="content-grid">
        <section className="panel">
          <div className="panel-header"><div><h3>Log a meal</h3><p>Keep it useful, not perfect.</p></div><Apple size={20} color="hsl(var(--primary))" /></div>
          <form onSubmit={submit} noValidate>
            <div className="form-grid">
              <div className="field full"><label htmlFor="meal-type">Meal</label><select id="meal-type" value={form.meal} onChange={(event) => setForm({ ...form, meal: event.target.value })} data-testid="select-meal-type">{mealOptions.map((meal) => <option key={meal}>{meal}</option>)}</select></div>
              <Field id="meal-calories" label="Calories" suffix="kcal" value={form.calories} onChange={(value) => setForm({ ...form, calories: value })} placeholder="e.g. 540" />
              <Field id="meal-protein" label="Protein" suffix="g" value={form.protein} onChange={(value) => setForm({ ...form, protein: value })} placeholder="e.g. 32" />
              <Field id="meal-carbs" label="Carbs" suffix="g" value={form.carbs} onChange={(value) => setForm({ ...form, carbs: value })} placeholder="e.g. 48" />
              <Field id="meal-fat" label="Fat" suffix="g" value={form.fat} onChange={(value) => setForm({ ...form, fat: value })} placeholder="e.g. 18" />
            </div>
            {error && <p className="error-text" style={{ marginTop: 13 }} data-testid="status-meal-error">{error}</p>}
            <div className="form-actions"><button className="button-primary" type="submit" data-testid="button-submit-meal"><Plus size={15} /> Add meal</button></div>
          </form>
          <MealTemplates onLog={(template) => onAdd({
            id: `meal-${Date.now()}-${crypto.randomUUID()}`, meal: template.name,
            calories: template.calories, protein: template.protein, carbs: template.carbs, fat: template.fat,
            time: new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date()),
          })} />
        </section>
        <section className="panel" data-testid="card-macro-totals">
          <div className="panel-header"><div><h3>Today’s totals</h3><p>{logs.length ? 'A quick read of your fuel.' : 'Ready when you are.'}</p></div><div className="section-label">{Math.min(100, Math.round((calories / profile.calorieTarget) * 100))}% target</div></div>
           <div className="macro-summary"><div className="calorie-ring" data-testid="progress-calories" role="progressbar" aria-label="Calories consumed" aria-valuemin={0} aria-valuemax={profile.calorieTarget} aria-valuenow={Math.min(calories, profile.calorieTarget)} style={{ '--calorie-progress': `${Math.min(100, (calories / profile.calorieTarget) * 100)}%` } as CSSProperties}><div className="calorie-ring-content"><strong>{formatAmount(calories)}</strong><span>kcal in</span></div></div><MacroBars protein={protein} carbs={carbs} fat={fat} targets={profile} /></div>
           <WaterIntakeCard waterMl={waterMl} goalMl={waterGoal} onWaterChange={onWaterChange} onGoalChange={onWaterGoalChange} />
        </section>
      </div>
      <section className="panel" style={{ marginTop: 22 }}><div className="panel-header"><div><h3>Today’s meals</h3><p>Tap the bin if something needs correcting.</p></div><div className="section-label">{logs.length} {logs.length === 1 ? 'entry' : 'entries'}</div></div>{logs.length ? <div className="log-list">{logs.map((meal) => <MealRow key={meal.id} meal={meal} onDelete={onDelete} />)}</div> : <EmptyState icon={Utensils} title="Your meal log is clear" text="Start with whatever is in front of you. The useful habit is noticing." />}</section>
    </>
  );
}

function Field({ id, label, suffix, value, onChange, placeholder }: { id: string; label: string; suffix: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <div className="field"><label htmlFor={id}>{label} <span style={{ color: 'hsl(var(--muted-foreground))', fontWeight: 500 }}>({suffix})</span></label><input id={id} type="number" min="0" step="1" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} data-testid={`input-${id}`} /></div>;
}

function WorkoutPage({ workouts, completedWorkouts, onAdd, onDelete, onFinishWorkout, showLauncher, onStartWorkout, workoutActive }: {
  workouts: WorkoutSet[]; completedWorkouts: CompletedWorkout[];
  onAdd: (set: WorkoutSet) => void; onDelete: (id: string) => void; onFinishWorkout: (setIds: string[]) => void;
  showLauncher: boolean; onStartWorkout: (kind: WorkoutKind) => void; workoutActive: boolean;
}) {
  const [exercise, setExercise] = useState('Back squat');
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [setType, setSetType] = useState<SetType>('working');
  const [error, setError] = useState('');
  const currentDate = todayKey();
  const finishedIds = new Set(completedWorkouts.flatMap((item) => item.setIds));
  const pendingSets = workouts.filter((item) => item.date === currentDate && !finishedIds.has(item.id));
  const completedToday = completedWorkouts.filter((item) => item.date === currentDate).length;
  const sorted = [...workouts].sort((a, b) => `${b.date}${b.id}`.localeCompare(`${a.date}${a.id}`));
  const bestByExercise = new Map<string, { oneRm: number; weight: number }>();
  const prIds = new Set<string>();
  for (const item of [...sorted].reverse()) {
    const key = item.exercise.trim().toLowerCase();
    const previousBest = bestByExercise.get(key);
    if (previousBest && (calculatedOneRm(item) > previousBest.oneRm || item.weight > previousBest.weight)) prIds.add(item.id);
    bestByExercise.set(key, {
      oneRm: Math.max(previousBest?.oneRm ?? 0, calculatedOneRm(item)),
      weight: Math.max(previousBest?.weight ?? 0, item.weight),
    });
  }
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const numericWeight = numberValue(weight);
    const numericReps = numberValue(reps);
    if (!exercise.trim()) { setError('Name the exercise you worked on.'); return; }
    if (numericWeight <= 0 || !Number.isSafeInteger(numericReps) || numericReps < 1 || numericReps > 30) { setError('Use a weight above 0 and between 1–30 whole reps.'); return; }
    const estimatedOneRm = numericWeight * (1 + numericReps / 30);
    onAdd({ id: `${Date.now()}-${crypto.randomUUID()}`, exercise: exercise.trim(), weight: numericWeight, reps: numericReps, estimatedOneRm, date: currentDate, setType });
    setWeight(''); setReps(''); setError('');
  };
  return (
    <>
      <header className="page-header">
        <div>
          <div className="eyebrow">Strength room · Today</div>
          <h1>Show up. Lift well.</h1>
          <p>Record the work while it is fresh. We will keep the math tidy.</p>
        </div>
        <div className="header-date">
          <strong>{workouts.length} total sets</strong>
          Across your training log
        </div>
      </header>
      {showLauncher && <WorkoutSelectionCards compact onStart={onStartWorkout} disabled={workoutActive} />}
      <StrengthIntervalTimer />
      <div className="workout-finish-bar" data-testid="section-complete-workout">
        <div><strong>{pendingSets.length} {pendingSets.length === 1 ? 'set' : 'sets'} in this workout</strong><span>{completedToday > 0 ? `${completedToday} completed ${completedToday === 1 ? 'workout' : 'workouts'} logged today.` : 'Mark a workout complete after logging its sets.'}</span></div>
        <button type="button" className="button-primary" disabled={pendingSets.length === 0} onClick={() => onFinishWorkout(pendingSets.map((item) => item.id))} data-testid="button-complete-workout"><Check size={15} /> Finish workout</button>
      </div>
      <div className="workout-layout">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h3>Log a set</h3>
              <p>Estimated 1RM uses the Epley formula.</p>
            </div>
            <Zap size={20} color="hsl(var(--primary))" />
          </div>
          <form onSubmit={submit} noValidate>
            <div className="form-grid">
              <div className="field full">
                <label htmlFor="exercise-name">Exercise</label>
                <input
                  id="exercise-name"
                  value={exercise}
                  onChange={(event) => setExercise(event.target.value)}
                  placeholder="e.g. Bench press"
                  data-testid="input-exercise"
                />
              </div>
              <Field id="workout-weight" label="Weight" suffix="kg" value={weight} onChange={setWeight} placeholder="e.g. 60" />
              <Field id="workout-reps" label="Reps" suffix="reps" value={reps} onChange={setReps} placeholder="e.g. 8" />
              <div className="field full">
                <span className="field-label" id="set-type-label">Set type</span>
                <div className="set-type-options" role="group" aria-labelledby="set-type-label">
                  {([['warmup', 'Warm-up'], ['working', 'Working set'], ['drop', 'Drop set'], ['failure', 'Failure']] as const).map(([value, label]) => (
                    <button key={value} type="button" className={`set-type-option${setType === value ? ' is-selected' : ''}`} onClick={() => setSetType(value)} aria-pressed={setType === value} data-testid={`button-set-type-${value}`}>{label}</button>
                  ))}
                </div>
              </div>
            </div>
            <p className="field-hint" style={{ marginTop: 13 }}>
              One good set is enough to keep the story moving.
            </p>
            {error && <p className="error-text" style={{ marginTop: 13 }} data-testid="status-workout-error">{error}</p>}
            <div className="form-actions">
              <button className="button-primary" type="submit" data-testid="button-submit-workout">
                <Plus size={15} /> Log set
              </button>
            </div>
          </form>
        </section>
        <section>
          <div className="panel">
            <div className="panel-header">
              <div>
                <h3>Training history</h3>
                <p>Latest sets first, personal bests remembered.</p>
              </div>
              <Award size={20} color="hsl(var(--accent-foreground))" />
            </div>
            {sorted.length ? (
              <div className="history-list">
                <div className="history-row history-head">
                  <span>Exercise</span>
                  <span>Load</span>
                  <span>Reps</span>
                  <span>Est. 1RM / intensity</span>
                  <span className="date-column">Date</span>
                </div>
                {sorted.map((item) => (
                  <div
                    className="history-row"
                    key={item.id}
                    data-testid={`row-workout-${item.id}`}
                  >
                    <div className="history-exercise"><strong>{item.exercise}</strong><small>{item.setType === 'warmup' ? 'Warm-up' : item.setType === 'drop' ? 'Drop set' : item.setType === 'working' ? 'Working set' : item.setType === 'failure' ? 'Failure' : 'Set'}</small>{prIds.has(item.id) && <span className="pr-tag" data-testid={`tag-pr-${item.id}`}><Award size={11} /> PR</span>}</div>
                    <span>{item.weight} kg</span>
                    <span>× {item.reps}</span>
                    <span className="one-rm">{formatAmount(calculatedOneRm(item))} kg<small className="set-intensity" data-testid={`text-set-intensity-${item.id}`}>{Math.round(item.weight / (bestByExercise.get(item.exercise.trim().toLowerCase())?.oneRm || calculatedOneRm(item)) * 100)}% 1RM</small></span>
                    <span className="date-column">{shortDate(item.date)}</span>
                    <button
                      className="delete-button"
                      onClick={() => onDelete(item.id)}
                      aria-label={`Delete ${item.exercise} set`}
                      data-testid={`button-delete-workout-${item.id}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Dumbbell}
                title="No sets logged yet"
                text="Your next set can be the first mark in a very good training log."
              />
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function PlanPage({ profile, onApplyPlan }: { profile: Profile; onApplyPlan: (plan: PlanResult) => void }) {
  const [form, setForm] = useState({
    weight: String(profile.weight),
    height: String(profile.height || 170),
    age: '28',
    sex: 'female' as Sex,
    activity: 'moderate' as ActivityLevel,
    goal: 'maintain' as PlanGoal,
  });
  useEffect(() => {
    setForm((current) => ({ ...current, weight: String(profile.weight), height: String(profile.height || 170) }));
  }, [profile.weight, profile.height]);

  const weight = Math.max(1, numberValue(form.weight));
  const height = Math.max(100, numberValue(form.height) || 170);
  const age = Math.min(90, Math.max(14, numberValue(form.age) || 28));
  const validInputs = Number(form.weight) >= 20 && Number(form.weight) <= 500 &&
    Number(form.height) >= 100 && Number(form.height) <= 230 &&
    Number.isSafeInteger(Number(form.age)) && Number(form.age) >= 14 && Number(form.age) <= 90;
  const heightMeters = height / 100;
  const bmi = weight / (heightMeters * heightMeters);
  const bmiLabel = bmi < 18.5 ? 'Below healthy range' : bmi < 25 ? 'Healthy range' : bmi < 30 ? 'Above healthy range' : 'High range';
  const bmr = form.sex === 'female' ? (10 * weight) + (6.25 * height) - (5 * age) - 161 : (10 * weight) + (6.25 * height) - (5 * age) + 5;
  const maintenanceCalories = Math.round(bmr * activityMultipliers[form.activity]);
  const goalAdjustment = form.goal === 'cut' ? -400 : form.goal === 'bulk' ? 300 : 0;
  const calories = Math.max(1200, maintenanceCalories + goalAdjustment);
  const protein = Math.round(weight * (form.goal === 'cut' ? 2.2 : form.goal === 'bulk' ? 1.8 : 2));
  const fat = Math.round((calories * 0.25) / 9);
  const carbs = Math.max(0, Math.round((calories - (protein * 4) - (fat * 9)) / 4));
  const goalLabel = form.goal === 'cut' ? 'Cut' : form.goal === 'bulk' ? 'Bulk' : 'Maintain';
  const plan: PlanResult = { calories, protein, carbs, fat, bmi, bmiLabel, goalLabel, weight, height };

  return (
    <>
      <header className="page-header">
        <div>
          <div className="eyebrow">Planning desk · Personal targets</div>
          <h1>Know what to aim for.</h1>
          <p>Use your body, activity, and goal to create a starting point you can actually follow.</p>
        </div>
        <div className="header-date"><strong>{goalLabel} plan</strong>{calories.toLocaleString()} kcal starting target</div>
      </header>
      <div className="planner-grid">
        <section className="panel">
          <div className="panel-header">
            <div><h3>Your inputs</h3><p>Change any number and the plan updates instantly.</p></div>
            <Calculator size={20} color="hsl(var(--primary))" />
          </div>
          <div className="form-grid">
            <Field id="plan-weight" label="Body weight" suffix="kg" value={form.weight} onChange={(value) => setForm({ ...form, weight: value })} placeholder="68" />
            <Field id="plan-height" label="Height" suffix="cm" value={form.height} onChange={(value) => setForm({ ...form, height: value })} placeholder="170" />
            <Field id="plan-age" label="Age" suffix="years" value={form.age} onChange={(value) => setForm({ ...form, age: value })} placeholder="28" />
            <div className="field">
              <label htmlFor="plan-sex">Calculation profile</label>
              <select id="plan-sex" value={form.sex} onChange={(event) => setForm({ ...form, sex: event.target.value as Sex })} data-testid="select-plan-sex">
                <option value="female">Female</option>
                <option value="male">Male</option>
              </select>
            </div>
            <div className="field full">
              <label htmlFor="plan-activity">Typical activity</label>
              <select id="plan-activity" value={form.activity} onChange={(event) => setForm({ ...form, activity: event.target.value as ActivityLevel })} data-testid="select-plan-activity">
                <option value="sedentary">Sedentary — mostly sitting</option>
                <option value="light">Light — 1–3 active days/week</option>
                <option value="moderate">Moderate — 3–5 active days/week</option>
                <option value="high">High — hard training most days</option>
              </select>
            </div>
          </div>
          <div className="goal-picker">
            <div className="section-label">Current goal</div>
            <div className="goal-options">
              {(['cut', 'maintain', 'bulk'] as PlanGoal[]).map((goal) => (
                <button
                  key={goal}
                  type="button"
                  className={`goal-option${form.goal === goal ? ' active' : ''}`}
                  onClick={() => setForm({ ...form, goal })}
                  data-testid={`button-goal-${goal}`}
                >
                  <strong>{goal === 'cut' ? 'Cut' : goal === 'bulk' ? 'Bulk' : 'Maintain'}</strong>
                  <span>{goal === 'cut' ? 'Lose fat' : goal === 'bulk' ? 'Build size' : 'Stay steady'}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="helper-note" style={{ marginTop: 20 }}>
            <Info size={16} />
            <span>This is a planning estimate, not medical advice. Track how you feel and adjust over time.</span>
          </div>
        </section>
        <section className="panel">
          <div className="panel-header">
            <div><h3>Your starting targets</h3><p>Built from your current inputs.</p></div>
            <Target size={20} color="hsl(var(--secondary-foreground))" />
          </div>
          <div className="plan-calorie-result">
            <span className="section-label">{goalLabel} calories</span>
            <strong data-testid="text-plan-calories">{calories.toLocaleString()} <small>kcal/day</small></strong>
            <span className="plan-calorie-detail">Maintenance estimate: {maintenanceCalories.toLocaleString()} kcal</span>
          </div>
          <div className="macro-target-list">
            <div><span className="macro-swatch bar-protein" /> <span>Protein</span><strong data-testid="text-plan-protein">{protein}g</strong></div>
            <div><span className="macro-swatch bar-carbs" /> <span>Carbs</span><strong data-testid="text-plan-carbs">{carbs}g</strong></div>
            <div><span className="macro-swatch bar-fat" /> <span>Fat</span><strong data-testid="text-plan-fat">{fat}g</strong></div>
          </div>
          {!validInputs && <p className="error-text plan-validation" role="alert">Enter a weight of 20–500 kg, height of 100–230 cm, and age of 14–90 to apply this plan.</p>}
          <button className="button-primary apply-plan-button" type="button" disabled={!validInputs} onClick={() => onApplyPlan(plan)} data-testid="button-apply-plan"><Check size={15} /> Apply these targets</button>
        </section>
      </div>
      <section className="panel bmi-panel" style={{ marginTop: 22 }}>
        <div className="panel-header">
          <div><h3>BMI calculator</h3><p>A quick height-to-weight screening number, shown with context.</p></div>
          <Activity size={20} color="hsl(var(--primary))" />
        </div>
        <div className="bmi-result-row">
          <div className="bmi-score" data-testid="text-bmi-score">{bmi.toFixed(1)}</div>
          <div><strong>{bmiLabel}</strong><p>BMI is one signal, not a complete picture of health or athleticism.</p></div>
        </div>
        <div className="bmi-scale" aria-label="BMI ranges">
          <span className="bmi-under">Below 18.5</span>
          <span className="bmi-healthy">18.5–24.9</span>
          <span className="bmi-over">25–29.9</span>
          <span className="bmi-high">30+</span>
        </div>
      </section>
    </>
  );
}

function ProfileModal({
  profile,
  onClose,
  onSave,
  returnFocusRef,
}: {
  profile: Profile;
  onClose: () => void;
  onSave: (profile: Profile) => void;
  returnFocusRef: { current: HTMLButtonElement | null };
}) {
  const modalRef = useRef<HTMLElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [form, setForm] = useState({
    name: profile.name,
    goal: profile.goal,
    weight: String(profile.weight),
    height: String(profile.height || 170),
    calorieTarget: String(profile.calorieTarget),
    stepTarget: String(profile.stepTarget),
  });
  const [error, setError] = useState('');
  useEffect(() => {
    nameInputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !modalRef.current) return;
      const focusable = modalRef.current.querySelectorAll<HTMLElement>('button, input, select');
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
      else document.querySelector<HTMLButtonElement>('[data-testid="button-mobile-menu"]')?.focus();
    };
  }, [returnFocusRef]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const weight = numberValue(form.weight);
    const height = numberValue(form.height);
    const calorieTarget = numberValue(form.calorieTarget);
    const stepTarget = numberValue(form.stepTarget);
    if (!form.name.trim()) { setError('Add your name so the ritual feels like yours.'); return; }
    if (weight <= 0 || height < 100 || height > 230 || calorieTarget < 1000 || stepTarget < 1000) { setError('Check your profile numbers — height should be 100–230 cm and targets should be realistic.'); return; }
    onSave({
      name: form.name.trim(),
      goal: form.goal.trim() || 'Build consistency',
      weight,
      height,
      calorieTarget,
      proteinTarget: profile.proteinTarget,
      carbsTarget: profile.carbsTarget,
      fatTarget: profile.fatTarget,
      stepTarget,
    });
  };
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="profile-title" aria-describedby="profile-description">
        <div className="modal-header">
          <div>
            <h2 id="profile-title">Your profile</h2>
            <p id="profile-description">Make the targets fit your actual life.</p>
          </div>
          <button className="button-icon button-quiet" onClick={onClose} aria-label="Close profile settings" data-testid="button-close-profile"><X size={17} /></button>
        </div>
        <form onSubmit={submit} noValidate>
          <div className="form-grid">
            <div className="field full">
              <label htmlFor="profile-name">Name</label>
              <input id="profile-name" ref={nameInputRef} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} data-testid="input-profile-name" />
            </div>
            <div className="field full">
              <label htmlFor="profile-goal">Main focus</label>
              <input id="profile-goal" value={form.goal} onChange={(event) => setForm({ ...form, goal: event.target.value })} placeholder="e.g. Feel stronger" data-testid="input-profile-goal" />
            </div>
            <Field id="profile-weight" label="Body weight" suffix="kg" value={form.weight} onChange={(value) => setForm({ ...form, weight: value })} placeholder="68" />
            <Field id="profile-height" label="Height" suffix="cm" value={form.height} onChange={(value) => setForm({ ...form, height: value })} placeholder="170" />
            <Field id="profile-calories" label="Calorie target" suffix="kcal" value={form.calorieTarget} onChange={(value) => setForm({ ...form, calorieTarget: value })} placeholder="2200" />
            <div className="field full">
              <label htmlFor="profile-steps">Daily step target</label>
              <input id="profile-steps" type="number" min="1000" value={form.stepTarget} onChange={(event) => setForm({ ...form, stepTarget: event.target.value })} data-testid="input-profile-steps" />
            </div>
          </div>
          {error && <p className="error-text" style={{ marginTop: 13 }}>{error}</p>}
          <div className="form-actions">
            <button className="button-quiet" type="button" onClick={onClose} data-testid="button-cancel-profile">Cancel</button>
            <button className="button-primary" type="submit" data-testid="button-save-profile"><Check size={15} /> Save profile</button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default App;