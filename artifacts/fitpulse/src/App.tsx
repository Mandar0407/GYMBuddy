import { type CSSProperties, type FormEvent, useEffect, useState } from 'react';
import {
  Activity,
  Apple,
  ArrowRight,
  Award,
  BarChart3,
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

type View = 'dashboard' | 'macros' | 'workout' | 'steps';
type Profile = { name: string; goal: string; weight: number; calorieTarget: number; stepTarget: number };
type MacroLog = { id: string; meal: string; calories: number; protein: number; carbs: number; fat: number; time: string };
type WorkoutSet = { id: string; exercise: string; weight: number; reps: number; estimatedOneRm: number; date: string };
type StepsMap = Record<string, number>;

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
  calorieTarget: 2200,
  stepTarget: 9000,
};

const mealOptions = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
const navItems: { id: View; label: string; icon: LucideIcon }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: Home },
  { id: 'macros', label: 'Macros', icon: Apple },
  { id: 'workout', label: 'Workout', icon: Dumbbell },
  { id: 'steps', label: 'Steps', icon: Footprints },
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
  const [profile, setProfile] = useState<Profile>(() => readStorage(STORAGE.profile, defaultProfile));
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
                target={profile.stepTarget}
                onChange={(amount) => {
                  setSteps((existing) => ({ ...existing, [currentDate]: Math.max(0, (existing[currentDate] ?? 0) + amount) }));
                  setToast(amount < 0 ? 'Steps reset for today.' : `${amount.toLocaleString()} steps added.`);
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
        <MetricCard icon={Target} label="Protein" value={`${Math.round(protein)}g`} suffix={`/ ${Math.round(profile.weight * 1.6)}g`} note="Fuel your training" />
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
             <MacroBars protein={protein} carbs={carbs} fat={fat} />
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

function MacroBars({ protein, carbs, fat }: { protein: number; carbs: number; fat: number }) {
  const rows = [
    { label: 'Protein', value: Math.round(protein), target: 110, className: 'bar-protein' },
    { label: 'Carbs', value: Math.round(carbs), target: 250, className: 'bar-carbs' },
    { label: 'Fat', value: Math.round(fat), target: 70, className: 'bar-fat' },
  ];
  return <div className="macro-bars">{rows.map((row) => <div key={row.label}><div className="macro-bar-top"><span>{row.label}</span><strong>{row.value}g <span>/ {row.target}g</span></strong></div><div className="bar-track"><div className={`bar-fill ${row.className}`} style={{ width: `${Math.min(100, (row.value / row.target) * 100)}%` }} /></div></div>)}</div>;
}

function EmptyState({ icon: Icon, title, text, action, onClick }: { icon: LucideIcon; title: string; text: string; action?: string; onClick?: () => void }) {
  return <div className="empty-state" data-testid={`empty-${title.toLowerCase().replace(/ /g, '-')}`}><div><Icon size={22} /><strong>{title}</strong><p>{text}</p>{action && onClick && <button className="button-primary" onClick={onClick} data-testid={`button-empty-${action.toLowerCase().replace(/ /g, '-')}`}>{action} <ArrowRight size={14} /></button>}</div></div>;
}

function MealRow({ meal, onDelete }: { meal: MacroLog; onDelete?: (id: string) => void }) {
  return <div className="log-row" data-testid={`row-meal-${meal.id}`}><span className="log-dot" /><div className="log-copy"><strong>{meal.meal}</strong><span>{meal.protein}g protein · {meal.carbs}g carbs · {meal.fat}g fat</span></div><span className="log-value">{meal.calories} kcal</span>{onDelete && <button className="delete-button" onClick={() => onDelete(meal.id)} aria-label={`Delete ${meal.meal}`} data-testid={`button-delete-meal-${meal.id}`}><Trash2 size={15} /></button>}</div>;
}

function MacrosPage({ profile, logs, onAdd, onDelete }: { profile: Profile; logs: MacroLog[]; onAdd: (log: MacroLog) => void; onDelete: (id: string) => void }) {
  const [form, setForm] = useState({ meal: 'Breakfast', calories: '', protein: '', carbs: '', fat: '' });
  const [error, setError] = useState('');
  const calories = logs.reduce((sum, item) => sum + item.calories, 0);
  const protein = logs.reduce((sum, item) => sum + item.protein, 0);
  const carbs = logs.reduce((sum, item) => sum + item.carbs, 0);
  const fat = logs.reduce((sum, item) => sum + item.fat, 0);
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
          <div className="macro-summary"><div className="calorie-ring" style={{ '--calorie-progress': `${Math.min(100, (calories / profile.calorieTarget) * 100)}%` } as CSSProperties}><div className="calorie-ring-content"><strong>{calories.toLocaleString()}</strong><span>kcal in</span></div></div><MacroBars protein={protein} carbs={carbs} fat={fat} /></div>
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

function StepsPage({ steps, todaySteps, target, onChange }: { steps: StepsMap; todaySteps: number; target: number; onChange: (amount: number) => void }) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return { key, label: new Intl.DateTimeFormat('en-US', { weekday: 'narrow' }).format(date), value: steps[key] ?? 0 };
  });
  const progress = Math.min(100, Math.round((todaySteps / target) * 100));
  return (
    <>
      <header className="page-header"><div><div className="eyebrow">Movement · Today</div><h1>Take the long way.</h1><p>Steps are not a score. They are a gentle vote for more energy.</p></div><div className="header-date"><strong>{progress}% of goal</strong>{target.toLocaleString()} steps planned</div></header>
      <section className="panel steps-hero">
        <div><div className="section-label">Today’s movement</div><div className="steps-number" data-testid="text-step-total">{todaySteps.toLocaleString()} <span>steps</span></div><div className="steps-track"><div className="steps-fill" style={{ width: `${progress}%` }} /></div><div className="steps-goal-copy"><span>0</span><span>{target.toLocaleString()} goal</span></div></div>
        <div><div className="section-label">Quick add</div><div className="step-actions" style={{ marginTop: 14 }}><button className="button-quiet" onClick={() => onChange(500)} data-testid="button-add-500-steps"><Plus size={16} /> 500 <span>steps</span></button><button className="button-quiet" onClick={() => onChange(1000)} data-testid="button-add-1000-steps"><Plus size={16} /> 1,000 <span>steps</span></button><button className="button-quiet" onClick={() => onChange(2500)} data-testid="button-add-2500-steps"><Plus size={16} /> 2,500 <span>steps</span></button><button className="button-danger" onClick={() => onChange(-todaySteps)} disabled={!todaySteps} data-testid="button-reset-steps"><RotateCcw size={15} /> Reset <span>today</span></button></div></div>
      </section>
      <section className="panel" style={{ marginTop: 22 }}><div className="panel-header"><div><h3>Your week in motion</h3><p>A little visual proof that the days add up.</p></div><BarChart3 size={20} color="hsl(var(--secondary-foreground))" /></div><div className="weekly-bars">{days.map((day) => <div className={`day-column${day.key === todayKey() ? ' today' : ''}`} key={day.key} data-testid={`bar-steps-${day.key}`}><div className="day-bar-area"><div className="day-bar" style={{ height: `${Math.max(4, Math.min(100, (day.value / target) * 100))}%` }} /></div><span>{day.label}</span></div>)}</div><div className="helper-note" style={{ marginTop: 20 }}><Info size={16} /> <span>Tip: add a walk to your day in one tap, then leave your phone alone. The goal is a rhythm you can return to.</span></div></section>
    </>
  );
}

function ProfileModal({ profile, onClose, onSave }: { profile: Profile; onClose: () => void; onSave: (profile: Profile) => void }) {
  const [form, setForm] = useState({ name: profile.name, goal: profile.goal, weight: String(profile.weight), calorieTarget: String(profile.calorieTarget), stepTarget: String(profile.stepTarget) });
  const [error, setError] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const weight = numberValue(form.weight);
    const calorieTarget = numberValue(form.calorieTarget);
    const stepTarget = numberValue(form.stepTarget);
    if (!form.name.trim()) { setError('Add your name so the ritual feels like yours.'); return; }
    if (weight <= 0 || calorieTarget < 1000 || stepTarget < 1000) { setError('Check your targets — they should be realistic numbers above zero.'); return; }
    onSave({ name: form.name.trim(), goal: form.goal.trim() || 'Build consistency', weight, calorieTarget, stepTarget });
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="profile-title"><div className="modal-header"><div><h2 id="profile-title">Your profile</h2><p>Make the targets fit your actual life.</p></div><button className="button-icon button-quiet" onClick={onClose} aria-label="Close profile settings" data-testid="button-close-profile"><X size={17} /></button></div><form onSubmit={submit} noValidate><div className="form-grid"><div className="field full"><label htmlFor="profile-name">Name</label><input id="profile-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} data-testid="input-profile-name" /></div><div className="field full"><label htmlFor="profile-goal">Main focus</label><input id="profile-goal" value={form.goal} onChange={(event) => setForm({ ...form, goal: event.target.value })} placeholder="e.g. Feel stronger" data-testid="input-profile-goal" /></div><Field id="profile-weight" label="Body weight" suffix="kg" value={form.weight} onChange={(value) => setForm({ ...form, weight: value })} placeholder="68" /><Field id="profile-calories" label="Calorie target" suffix="kcal" value={form.calorieTarget} onChange={(value) => setForm({ ...form, calorieTarget: value })} placeholder="2200" /><div className="field full"><label htmlFor="profile-steps">Daily step target</label><input id="profile-steps" type="number" min="1000" value={form.stepTarget} onChange={(event) => setForm({ ...form, stepTarget: event.target.value })} data-testid="input-profile-steps" /></div></div>{error && <p className="error-text" style={{ marginTop: 13 }}>{error}</p>}<div className="form-actions"><button className="button-quiet" type="button" onClick={onClose} data-testid="button-cancel-profile">Cancel</button><button className="button-primary" type="submit" data-testid="button-save-profile"><Check size={15} /> Save profile</button></div></form></section></div>;
}

export default App;