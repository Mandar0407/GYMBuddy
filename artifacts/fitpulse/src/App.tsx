import { type CSSProperties, type FormEvent, useEffect, useRef, useState } from 'react';
import {
  Activity,
  Apple,
  ArrowRight,
  Award,
  BarChart3,
  Calculator,
  Check,
  CircleUserRound,
  Dumbbell,
  Flame,
  Footprints,
  Home,
  Info,
  Menu,
  Plus,
  RotateCcw,
  Settings2,
  Target,
  Trash2,
  Utensils,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';

type View = 'dashboard' | 'macros' | 'workout' | 'steps' | 'plan';
type Profile = { name: string; goal: string; weight: number; height: number; calorieTarget: number; proteinTarget: number; carbsTarget: number; fatTarget: number; stepTarget: number };
type MacroLog = { id: string; meal: string; calories: number; protein: number; carbs: number; fat: number; time: string };
type WorkoutSet = { id: string; exercise: string; weight: number; reps: number; estimatedOneRm: number; date: string };
type StepsMap = Record<string, number>;
type MotionStatus = 'idle' | 'requesting' | 'active' | 'denied' | 'unsupported';
type PlanGoal = 'cut' | 'maintain' | 'bulk';
type Sex = 'female' | 'male';
type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'high';
type PlanResult = { calories: number; protein: number; carbs: number; fat: number; bmi: number; bmiLabel: string; goalLabel: string };

const STORAGE = {
  profile: 'fitpulse-profile',
  macros: 'fitpulse-macros',
  workouts: 'fitpulse-workouts',
  steps: 'fitpulse-steps',
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
  stepTarget: 9000,
};

const mealOptions = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
const activityMultipliers: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
};
const navItems: { id: View; label: string; icon: LucideIcon }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: Home },
  { id: 'macros', label: 'Macros', icon: Apple },
  { id: 'workout', label: 'Workout', icon: Dumbbell },
  { id: 'steps', label: 'Steps', icon: Footprints },
  { id: 'plan', label: 'Plan', icon: Calculator },
];

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
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

function App() {
  const [view, setView] = useState<View>('dashboard');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profile, setProfile] = useState<Profile>(() => ({ ...defaultProfile, ...readStorage(STORAGE.profile, defaultProfile) }));
  const [macros, setMacros] = useState<MacroLog[]>(() => readStorage(STORAGE.macros, []));
  const [workouts, setWorkouts] = useState<WorkoutSet[]>(() => readStorage(STORAGE.workouts, []));
  const [steps, setSteps] = useState<StepsMap>(() => readStorage(STORAGE.steps, {}));
  const [toast, setToast] = useState('');
  const currentDate = todayKey();

  useEffect(() => { window.localStorage.setItem(STORAGE.profile, JSON.stringify(profile)); }, [profile]);
  useEffect(() => { window.localStorage.setItem(STORAGE.macros, JSON.stringify(macros)); }, [macros]);
  useEffect(() => { window.localStorage.setItem(STORAGE.workouts, JSON.stringify(workouts)); }, [workouts]);
  useEffect(() => { window.localStorage.setItem(STORAGE.steps, JSON.stringify(steps)); }, [steps]);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const navigate = (nextView: View) => {
    setView(nextView);
    setMobileNavOpen(false);
    window.setTimeout(() => document.querySelector('.main-inner')?.scrollTo({ top: 0, behavior: 'smooth' }), 0);
  };

  const todayMacros = macros;
  const todaySteps = steps[currentDate] ?? 0;
  const calories = todayMacros.reduce((total, item) => total + item.calories, 0);
  const protein = todayMacros.reduce((total, item) => total + item.protein, 0);
  const carbs = todayMacros.reduce((total, item) => total + item.carbs, 0);
  const fat = todayMacros.reduce((total, item) => total + item.fat, 0);
  const workoutCount = workouts.filter((item) => item.date === currentDate).length;

  const saveProfile = (nextProfile: Profile) => {
    setProfile(nextProfile);
    setProfileOpen(false);
    setToast('Profile saved. Your targets are ready.');
  };

  return (
    <div className="fitpulse-app">
      <div className="fitpulse-shell">
        <aside className="sidebar" aria-label="Primary navigation">
          <Brand />
          <div className="eyebrow">Your daily ritual</div>
          <nav className="nav-stack">
            {navItems.map((item) => (
              <NavButton key={item.id} item={item} active={view === item.id} onClick={() => navigate(item.id)} />
            ))}
          </nav>
          <div className="sidebar-spacer" />
          <button className="profile-chip" onClick={() => setProfileOpen(true)} data-testid="button-open-profile">
            <span className="avatar" data-testid="text-profile-initials">{initials(profile.name)}</span>
            <span className="profile-copy">
              <strong data-testid="text-profile-name">{profile.name}</strong>
              <span>{profile.goal}</span>
            </span>
            <Settings2 size={16} />
          </button>
        </aside>

        <main className="main-area">
          <div className="mobile-topbar">
            <Brand compact />
            <button className="mobile-menu" onClick={() => setMobileNavOpen((open) => !open)} aria-label="Open navigation" data-testid="button-mobile-menu">
              <Menu size={20} />
            </button>
          </div>
          {mobileNavOpen && (
            <div className="mobile-nav-panel" style={{ padding: '0 17px 10px', display: 'grid', gap: 4 }}>
              {navItems.map((item) => (
                <NavButton key={item.id} item={item} active={view === item.id} onClick={() => navigate(item.id)} />
              ))}
              <button className="nav-button" onClick={() => { setProfileOpen(true); setMobileNavOpen(false); }} data-testid="button-mobile-profile">
                <CircleUserRound size={18} /> Profile settings
              </button>
            </div>
          )}
          <div className="main-inner">
            {view === 'dashboard' && (
              <Dashboard
                profile={profile}
                calories={calories}
                protein={protein}
                carbs={carbs}
                fat={fat}
                todaySteps={todaySteps}
                workoutCount={workoutCount}
                macros={todayMacros}
                onNavigate={navigate}
              />
            )}
            {view === 'macros' && (
              <MacrosPage
                profile={profile}
                logs={todayMacros}
                onAdd={(log) => { setMacros((existing) => [log, ...existing]); setToast(`${log.meal} added to today.`); }}
                onDelete={(id) => { setMacros((existing) => existing.filter((item) => item.id !== id)); setToast('Meal removed.'); }}
                onSaveTargets={(targets) => {
                  setProfile((existing) => ({ ...existing, ...targets }));
                  setToast('Daily macro targets saved.');
                }}
              />
            )}
            {view === 'workout' && (
              <WorkoutPage
                workouts={workouts}
                onAdd={(set) => {
                  const previousBest = Math.max(0, ...workouts.filter((item) => item.exercise.toLowerCase() === set.exercise.toLowerCase()).map((item) => item.estimatedOneRm));
                  setWorkouts((existing) => [set, ...existing]);
                  setToast(set.estimatedOneRm > previousBest ? `New ${set.exercise} PR — ${set.estimatedOneRm} kg estimated 1RM.` : 'Set logged. Keep the momentum.');
                }}
                onDelete={(id) => { setWorkouts((existing) => existing.filter((item) => item.id !== id)); setToast('Set removed.'); }}
              />
            )}
            {view === 'steps' && (
              <StepsPage
                steps={steps}
                todaySteps={todaySteps}
                profile={profile}
                target={profile.stepTarget}
                onChange={(amount) => {
                  setSteps((existing) => ({ ...existing, [currentDate]: Math.max(0, (existing[currentDate] ?? 0) + amount) }));
                  setToast(amount < 0 ? 'Steps reset for today.' : `${amount.toLocaleString()} steps added.`);
                }}
                onAutoStep={(amount) => {
                  setSteps((existing) => ({ ...existing, [currentDate]: Math.max(0, (existing[currentDate] ?? 0) + amount) }));
                }}
              />
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
                    goal: `${plan.goalLabel} focus`,
                  }));
                  setToast(`${plan.goalLabel} targets applied to your profile.`);
                }}
              />
            )}
          </div>
        </main>
      </div>
      {profileOpen && <ProfileModal profile={profile} onClose={() => setProfileOpen(false)} onSave={saveProfile} />}
      {toast && <div className="toast" role="status" data-testid="status-toast"><Check size={16} /> {toast}</div>}
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand-lockup" data-testid="brand-fitpulse">
      <span className="brand-mark"><Activity size={compact ? 17 : 19} strokeWidth={2.7} /></span>
      <span className="brand-name">fit<span>pulse</span></span>
    </div>
  );
}

function NavButton({ item, active, onClick }: { item: (typeof navItems)[number]; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <button className={`nav-button${active ? ' active' : ''}`} onClick={onClick} data-testid={`button-nav-${item.id}`}>
      <Icon size={18} strokeWidth={active ? 2.5 : 2} />
      {item.label}
    </button>
  );
}

type DashboardProps = {
  profile: Profile;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  todaySteps: number;
  workoutCount: number;
  macros: MacroLog[];
  onNavigate: (view: View) => void;
};

function Dashboard({ profile, calories, protein, carbs, fat, todaySteps, workoutCount, macros, onNavigate }: DashboardProps) {
  const calorieProgress = Math.min(100, Math.round((calories / profile.calorieTarget) * 100));
  return (
    <>
      <header className="page-header">
        <div>
          <div className="eyebrow">Today · {formatLongDate()}</div>
          <h1>Make today count, {profile.name.split(' ')[0]}.</h1>
          <p>A clear look at the habits that make you feel strong.</p>
        </div>
        <div className="header-date"><strong data-testid="text-today-date">{formatLongDate()}</strong>Your rhythm, one day at a time</div>
      </header>
      <section className="hero-card" data-testid="card-daily-ritual">
        <div className="hero-content">
          <div className="eyebrow">Daily ritual</div>
          <h2>Small inputs. Noticeable change.</h2>
          <p>You do not need a perfect day. Just give the next choice your full attention.</p>
        </div>
        <div className="hero-streak"><strong>{workoutCount + (todaySteps > 0 ? 1 : 0)}</strong><span>signals today</span></div>
      </section>
      <div className="metric-grid">
        <MetricCard icon={Flame} label="Calories" value={calories.toLocaleString()} suffix={`/ ${profile.calorieTarget.toLocaleString()} kcal`} note={`${calorieProgress}% of target`} />
        <MetricCard icon={Dumbbell} label="Strength work" value={String(workoutCount)} suffix="sets" note={workoutCount ? 'Good work is logged' : 'A blank slate today'} />
        <MetricCard icon={Footprints} label="Steps" value={todaySteps.toLocaleString()} suffix={`/ ${profile.stepTarget.toLocaleString()}`} note={`${Math.min(100, Math.round((todaySteps / profile.stepTarget) * 100))}% of daily goal`} />
         <MetricCard icon={Target} label="Protein" value={`${Math.round(protein)}g`} suffix={`/ ${profile.proteinTarget}g`} note="Fuel your training" />
      </div>
      <div className="content-grid">
        <section className="panel" data-testid="card-dashboard-macros">
          <div className="panel-header">
            <div><h3>Nutrition, at a glance</h3><p>Today’s fuel in three simple numbers.</p></div>
            <button className="button-quiet" onClick={() => onNavigate('macros')} data-testid="button-view-macros">Open macros <ArrowRight size={14} /></button>
          </div>
          <div className="macro-summary">
            <div className="calorie-ring" style={{ '--calorie-progress': `${calorieProgress}%` } as CSSProperties}>
              <div className="calorie-ring-content"><strong data-testid="text-calorie-total">{calories.toLocaleString()}</strong><span>of {profile.calorieTarget.toLocaleString()} kcal</span></div>
            </div>
             <MacroBars protein={protein} carbs={carbs} fat={fat} targets={profile} />
           </div>
         </section>
         <section className="panel" data-testid="card-recent-meals">
          <div className="panel-header">
            <div><h3>Recent meals</h3><p>{macros.length ? `${macros.length} logged today` : 'Your plate starts here.'}</p></div>
            <button className="button-icon button-quiet" onClick={() => onNavigate('macros')} aria-label="Add a meal" data-testid="button-dashboard-add-meal"><Plus size={17} /></button>
          </div>
          {macros.length ? <div className="log-list">{macros.slice(0, 4).map((meal) => <MealRow key={meal.id} meal={meal} />)}</div> : <EmptyState icon={Utensils} title="No meals logged yet" text="Track your first bite and build a clearer picture of today." action="Log a meal" onClick={() => onNavigate('macros')} />}
        </section>
      </div>
    </>
  );
}

function MetricCard({ icon: Icon, label, value, suffix, note }: { icon: LucideIcon; label: string; value: string; suffix: string; note: string }) {
  return (
    <article className="metric-card" data-testid={`card-metric-${label.toLowerCase().replace(' ', '-')}`}>
      <div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon size={15} /></span></div>
      <strong data-testid={`text-metric-${label.toLowerCase().replace(' ', '-')}`}>{value} <span>{suffix}</span></strong>
      <small>{note}</small>
    </article>
  );
}

function MacroBars({ protein, carbs, fat, targets }: { protein: number; carbs: number; fat: number; targets: Pick<Profile, 'proteinTarget' | 'carbsTarget' | 'fatTarget'> }) {
  const rows = [
    { label: 'Protein', value: Math.round(protein), target: targets.proteinTarget, className: 'bar-protein' },
    { label: 'Carbs', value: Math.round(carbs), target: targets.carbsTarget, className: 'bar-carbs' },
    { label: 'Fat', value: Math.round(fat), target: targets.fatTarget, className: 'bar-fat' },
  ];
  return <div className="macro-bars">{rows.map((row) => <div key={row.label}><div className="macro-bar-top"><span>{row.label}</span><strong>{row.value}g <span>/ {row.target}g</span></strong></div><div className="bar-track"><div className={`bar-fill ${row.className}`} style={{ width: `${Math.min(100, (row.value / row.target) * 100)}%` }} /></div></div>)}</div>;
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
  onAdd,
  onDelete,
  onSaveTargets,
}: {
  profile: Profile;
  logs: MacroLog[];
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
      <header className="page-header"><div><div className="eyebrow">Fuel log · Today</div><h1>Macros that make sense.</h1><p>Log the meal, then get back to living. No food guilt, no spreadsheet energy.</p></div><div className="header-date"><strong>{calories.toLocaleString()} kcal</strong>of {profile.calorieTarget.toLocaleString()} target</div></header>
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
        </section>
        <section className="panel">
          <div className="panel-header"><div><h3>Today’s totals</h3><p>{logs.length ? 'A quick read of your fuel.' : 'Ready when you are.'}</p></div><div className="section-label">{Math.min(100, Math.round((calories / profile.calorieTarget) * 100))}% target</div></div>
           <div className="macro-summary"><div className="calorie-ring" style={{ '--calorie-progress': `${Math.min(100, (calories / profile.calorieTarget) * 100)}%` } as CSSProperties}><div className="calorie-ring-content"><strong>{calories.toLocaleString()}</strong><span>kcal in</span></div></div><MacroBars protein={protein} carbs={carbs} fat={fat} targets={profile} /></div>
        </section>
      </div>
      <section className="panel" style={{ marginTop: 22 }}><div className="panel-header"><div><h3>Today’s meals</h3><p>Tap the bin if something needs correcting.</p></div><div className="section-label">{logs.length} {logs.length === 1 ? 'entry' : 'entries'}</div></div>{logs.length ? <div className="log-list">{logs.map((meal) => <MealRow key={meal.id} meal={meal} onDelete={onDelete} />)}</div> : <EmptyState icon={Utensils} title="Your meal log is clear" text="Start with whatever is in front of you. The useful habit is noticing." />}</section>
    </>
  );
}

function Field({ id, label, suffix, value, onChange, placeholder }: { id: string; label: string; suffix: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <div className="field"><label htmlFor={id}>{label} <span style={{ color: 'hsl(var(--muted-foreground))', fontWeight: 500 }}>({suffix})</span></label><input id={id} type="number" min="0" step="1" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} data-testid={`input-${id}`} /></div>;
}

function WorkoutPage({ workouts, onAdd, onDelete }: { workouts: WorkoutSet[]; onAdd: (set: WorkoutSet) => void; onDelete: (id: string) => void }) {
  const [exercise, setExercise] = useState('Back squat');
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [error, setError] = useState('');
  const currentDate = todayKey();
  const sorted = [...workouts].sort((a, b) => `${b.date}${b.id}`.localeCompare(`${a.date}${a.id}`));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const numericWeight = numberValue(weight);
    const numericReps = numberValue(reps);
    if (!exercise.trim()) { setError('Name the exercise you worked on.'); return; }
    if (numericWeight <= 0 || numericReps <= 0 || numericReps > 30) { setError('Use a weight above 0 and between 1–30 reps.'); return; }
    const estimatedOneRm = Math.round(numericWeight * (1 + numericReps / 30));
    onAdd({ id: `${Date.now()}`, exercise: exercise.trim(), weight: numericWeight, reps: numericReps, estimatedOneRm, date: currentDate });
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
          {sorted.length > 0 && <PRBanner workouts={workouts} />}
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
                  <span>Est. 1RM</span>
                  <span className="date-column">Date</span>
                </div>
                {sorted.map((item) => (
                  <div
                    className="history-row"
                    key={item.id}
                    data-testid={`row-workout-${item.id}`}
                  >
                    <strong>{item.exercise}</strong>
                    <span>{item.weight} kg</span>
                    <span>× {item.reps}</span>
                    <span className="one-rm">{item.estimatedOneRm} kg</span>
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

function PRBanner({ workouts }: { workouts: WorkoutSet[] }) {
  const latest = workouts[0];
  const bestBefore = Math.max(0, ...workouts.filter((item) => item.id !== latest.id && item.exercise.toLowerCase() === latest.exercise.toLowerCase()).map((item) => item.estimatedOneRm));
  if (!latest || latest.estimatedOneRm <= bestBefore) return null;
  return <div className="pr-banner" data-testid="status-new-pr"><Award size={22} /><div><strong>New personal best</strong><span>{latest.exercise} is moving in the right direction.</span></div><span className="pr-value">{latest.estimatedOneRm} kg</span></div>;
}

function StepsPage({
  steps,
  todaySteps,
  profile,
  target,
  onChange,
  onAutoStep,
}: {
  steps: StepsMap;
  todaySteps: number;
  profile: Profile;
  target: number;
  onChange: (amount: number) => void;
  onAutoStep: (amount: number) => void;
}) {
  const [tracking, setTracking] = useState(false);
  const [motionStatus, setMotionStatus] = useState<MotionStatus>('idle');
  const onAutoStepRef = useRef(onAutoStep);
  const motionRef = useRef({ lastDynamicAcceleration: 0, lastStepAt: 0 });

  useEffect(() => {
    onAutoStepRef.current = onAutoStep;
  }, [onAutoStep]);

  useEffect(() => {
    if (!tracking) return undefined;

    const handleMotion = (event: DeviceMotionEvent) => {
      const acceleration = event.accelerationIncludingGravity;
      if (!acceleration) return;

      const x = acceleration.x ?? 0;
      const y = acceleration.y ?? 0;
      const z = acceleration.z ?? 0;
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      const dynamicAcceleration = Math.abs(magnitude - 9.81);
      const now = performance.now();
      const crossedPeak = dynamicAcceleration > 1.35 && motionRef.current.lastDynamicAcceleration <= 1.35;
      const enoughTimeSinceLastStep = now - motionRef.current.lastStepAt > 300;

      motionRef.current.lastDynamicAcceleration = dynamicAcceleration;
      if (crossedPeak && enoughTimeSinceLastStep) {
        motionRef.current.lastStepAt = now;
        onAutoStepRef.current(1);
      }
    };

    window.addEventListener('devicemotion', handleMotion);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, [tracking]);

  const startTracking = async () => {
    if (!('DeviceMotionEvent' in window)) {
      setMotionStatus('unsupported');
      return;
    }

    setMotionStatus('requesting');
    const motionEvent = window.DeviceMotionEvent as typeof DeviceMotionEvent & {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };

    try {
      if (motionEvent.requestPermission) {
        const permission = await motionEvent.requestPermission();
        if (permission !== 'granted') {
          setMotionStatus('denied');
          return;
        }
      }
      motionRef.current = { lastDynamicAcceleration: 0, lastStepAt: performance.now() };
      setTracking(true);
      setMotionStatus('active');
    } catch {
      setMotionStatus('denied');
    }
  };

  const stopTracking = () => {
    setTracking(false);
    setMotionStatus('idle');
  };

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return { key, label: new Intl.DateTimeFormat('en-US', { weekday: 'narrow' }).format(date), value: steps[key] ?? 0 };
  });
  const progress = Math.min(100, Math.round((todaySteps / target) * 100));
  const strideLengthMeters = ((profile.height || 170) * 0.413) / 100;
  const distanceKm = (todaySteps * strideLengthMeters) / 1000;
  const distanceLabel = distanceKm < 10 ? distanceKm.toFixed(2) : distanceKm.toFixed(1);
  const motionCopy = {
    idle: 'Start live tracking to count steps from movement.',
    requesting: 'Waiting for motion sensor access…',
    active: 'Live motion tracking is on.',
    denied: 'Motion access was blocked. You can still add steps manually.',
    unsupported: 'Motion sensors are unavailable in this browser. Use manual add.',
  }[motionStatus];

  return (
    <>
      <header className="page-header"><div><div className="eyebrow">Movement · Today</div><h1>Take the long way.</h1><p>Steps are not a score. They are a gentle vote for more energy.</p></div><div className="header-date"><strong>{progress}% of goal</strong>{target.toLocaleString()} steps planned</div></header>
      <section className="panel steps-hero">
        <div>
          <div className="section-label">Today’s movement</div>
          <div className="steps-number" data-testid="text-step-total" aria-live="polite">{todaySteps.toLocaleString()} <span>steps</span></div>
          <div className="steps-track"><div className="steps-fill" style={{ width: `${progress}%` }} /></div>
          <div className="steps-goal-copy"><span>0</span><span>{target.toLocaleString()} goal</span></div>
          <div className="movement-stats">
            <div><strong>{distanceLabel} km</strong><span>estimated distance</span></div>
            <div><strong>{Math.round(strideLengthMeters * 100)} cm</strong><span>estimated stride</span></div>
          </div>
        </div>
        <div><div className="section-label">Quick add</div><div className="step-actions" style={{ marginTop: 14 }}><button className="button-quiet" onClick={() => onChange(500)} data-testid="button-add-500-steps"><Plus size={16} /> 500 <span>steps</span></button><button className="button-quiet" onClick={() => onChange(1000)} data-testid="button-add-1000-steps"><Plus size={16} /> 1,000 <span>steps</span></button><button className="button-quiet" onClick={() => onChange(2500)} data-testid="button-add-2500-steps"><Plus size={16} /> 2,500 <span>steps</span></button><button className="button-danger" onClick={() => onChange(-todaySteps)} disabled={!todaySteps} data-testid="button-reset-steps"><RotateCcw size={15} /> Reset <span>today</span></button></div></div>
      </section>
      <section className="panel motion-panel" style={{ marginTop: 22 }}>
        <div className="motion-copy">
          <div className={`motion-indicator${motionStatus === 'active' ? ' active' : ''}`}><Activity size={17} /><span>{motionStatus === 'active' ? 'Live' : 'Motion sensor'}</span></div>
          <h3>Count steps as you move</h3>
          <p>{motionCopy}</p>
          <small>Keep FitPulse open while you walk. Your browser may ask for motion permission once.</small>
        </div>
        {tracking ? (
          <button className="button-danger" onClick={stopTracking} data-testid="button-stop-live-tracking"><Activity size={16} /> Stop tracking</button>
        ) : (
          <button className="button-primary" onClick={startTracking} disabled={motionStatus === 'requesting'} data-testid="button-start-live-tracking"><Activity size={16} /> {motionStatus === 'requesting' ? 'Connecting…' : 'Start live tracking'}</button>
        )}
      </section>
      <section className="panel" style={{ marginTop: 22 }}><div className="panel-header"><div><h3>Your week in motion</h3><p>A little visual proof that the days add up.</p></div><BarChart3 size={20} color="hsl(var(--secondary-foreground))" /></div><div className="weekly-bars">{days.map((day) => <div className={`day-column${day.key === todayKey() ? ' today' : ''}`} key={day.key} data-testid={`bar-steps-${day.key}`}><div className="day-bar-area"><div className="day-bar" style={{ height: `${Math.max(4, Math.min(100, (day.value / target) * 100))}%` }} /></div><span>{day.label}</span></div>)}</div><div className="helper-note" style={{ marginTop: 20 }}><Info size={16} /> <span>Tip: add a walk to your day in one tap, then leave your phone alone. The goal is a rhythm you can return to.</span></div></section>
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

  const weight = Math.max(1, numberValue(form.weight));
  const height = Math.max(100, numberValue(form.height) || 170);
  const age = Math.min(90, Math.max(14, numberValue(form.age) || 28));
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
  const plan: PlanResult = { calories, protein, carbs, fat, bmi, bmiLabel, goalLabel };

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
          <button className="button-primary apply-plan-button" onClick={() => onApplyPlan(plan)} data-testid="button-apply-plan"><Check size={15} /> Apply these targets</button>
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

function ProfileModal({ profile, onClose, onSave }: { profile: Profile; onClose: () => void; onSave: (profile: Profile) => void }) {
  const [form, setForm] = useState({
    name: profile.name,
    goal: profile.goal,
    weight: String(profile.weight),
    height: String(profile.height || 170),
    calorieTarget: String(profile.calorieTarget),
    stepTarget: String(profile.stepTarget),
  });
  const [error, setError] = useState('');
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
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <div className="modal-header">
          <div>
            <h2 id="profile-title">Your profile</h2>
            <p>Make the targets fit your actual life.</p>
          </div>
          <button className="button-icon button-quiet" onClick={onClose} aria-label="Close profile settings" data-testid="button-close-profile"><X size={17} /></button>
        </div>
        <form onSubmit={submit} noValidate>
          <div className="form-grid">
            <div className="field full">
              <label htmlFor="profile-name">Name</label>
              <input id="profile-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} data-testid="input-profile-name" />
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