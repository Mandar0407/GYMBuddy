import { type CSSProperties, type FormEvent, type MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from 'react';
import {
  Activity,
  Apple,
  ArrowDownRight,
  ArrowRight,
  Check,
  Clock3,
  Dumbbell,
  Flame,
  Footprints,
  Plus,
  Sparkles,
  Target,
  Utensils,
  X,
} from 'lucide-react';
import './premium.css';

type Profile = {
  name: string;
  goal: string;
  calorieTarget: number;
  proteinTarget: number;
  carbsTarget: number;
  fatTarget: number;
  stepTarget: number;
};

type MacroLog = {
  id: string;
  meal: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  time: string;
};

type PremiumDashboardProps = {
  profile: Profile;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  todaySteps: number;
  workoutCount: number;
  macros: MacroLog[];
  onNavigate: (view: 'dashboard' | 'macros' | 'workout' | 'steps' | 'plan') => void;
  onAddMeal: (meal: MacroLog) => void;
};

const mealOptions = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

function formatLongDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(date);
}

function roundedAmount(value: number) {
  return Number(value.toFixed(2));
}

function formatAmount(value: number) {
  return roundedAmount(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export default function PremiumDashboard({
  profile,
  calories,
  protein,
  carbs,
  fat,
  todaySteps,
  workoutCount,
  macros,
  onNavigate,
  onAddMeal,
}: PremiumDashboardProps) {
  const [mealDialogOpen, setMealDialogOpen] = useState(false);
  const [mealForm, setMealForm] = useState({ meal: '', calories: '', protein: '', carbs: '', fat: '' });
  const [mealError, setMealError] = useState('');
  const dialogRef = useRef<HTMLElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);
  const calorieProgress = profile.calorieTarget > 0 ? Math.min(100, Math.round((calories / profile.calorieTarget) * 100)) : 0;
  const caloriesRemaining = roundedAmount(profile.calorieTarget - calories);
  const proteinRemaining = roundedAmount(profile.proteinTarget - protein);
  const stepsRemaining = profile.stepTarget - todaySteps;
  const stepsProgress = profile.stepTarget > 0 ? Math.min(100, Math.round((todaySteps / profile.stepTarget) * 100)) : 0;
  const today = formatLongDate();

  useEffect(() => {
    if (!mealDialogOpen) return undefined;
    firstFieldRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMealDialogOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>('button, input, select');
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
      lastFocusRef.current?.focus();
    };
  }, [mealDialogOpen]);

  const openMealDialog = (event: ReactMouseEvent<HTMLButtonElement>) => {
    lastFocusRef.current = event.currentTarget;
    setMealError('');
    setMealDialogOpen(true);
  };

  const addMeal = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = {
      calories: Number(mealForm.calories),
      protein: Number(mealForm.protein),
      carbs: Number(mealForm.carbs),
      fat: Number(mealForm.fat),
    };
    if (!mealForm.meal.trim()) {
      setMealError('Enter a meal name to continue.');
      return;
    }
    if (!Number.isFinite(values.calories) || values.calories <= 0) {
      setMealError('Calories must be a positive number.');
      return;
    }
    if ([values.protein, values.carbs, values.fat].some((value) => !Number.isFinite(value) || value < 0)) {
      setMealError('Protein, carbs, and fat must be nonnegative numbers.');
      return;
    }
    const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date());
    const id = `meal-${Date.now()}-${crypto.randomUUID()}`;
    onAddMeal({ id, meal: mealForm.meal.trim(), ...values, time });
    setMealForm({ meal: '', calories: '', protein: '', carbs: '', fat: '' });
    setMealError('');
    setMealDialogOpen(false);
  };

  const workoutCopy = workoutCount === 0
    ? 'No strength sets are logged yet. Your next set can be the first.'
    : `${workoutCount} ${workoutCount === 1 ? 'set is' : 'sets are'} logged today.`;
  const coachTitle = workoutCount > 0
    ? 'Keep showing up for the strong version of you.'
    : 'Make room for one small win today.';

  return (
    <>
      <div className="fp-dashboard" id="premium-top">
        <header className="fp-heading">
          <div>
            <div className="fp-date-kicker"><span className="fp-live-dot" /> TODAY, {today.toUpperCase()}</div>
            <h1>A good day<br className="fp-mobile-break" /> is in motion, {profile.name.split(' ')[0]}.</h1>
            <p>Here’s what you’ve already made time for.</p>
          </div>
          <div className="fp-date-stamp"><span>YOUR DAILY CHECK-IN</span><strong data-testid="text-today-date">{today}</strong></div>
        </header>

        <section className="fp-coach-card" id="premium-focus" data-testid="card-daily-ritual">
          <div className="fp-coach-copy">
            <div className="fp-coach-kicker"><span className="fp-coach-spark"><Sparkles size={13} /></span> A NOTE FOR TODAY</div>
            <h2>{coachTitle}</h2>
            <p>{workoutCopy} {stepsRemaining > 0 ? `${stepsRemaining.toLocaleString()} steps remain in your movement goal.` : 'You have reached your movement goal today.'}</p>
            <button className="fp-coach-link" type="button" onClick={() => onNavigate('workout')} data-testid="button-view-workout">
              See your strength work <ArrowRight size={15} />
            </button>
          </div>
          <div className="fp-coach-orbit" aria-hidden="true">
            <div className="fp-orbit-ring fp-orbit-ring-a" />
            <div className="fp-orbit-ring fp-orbit-ring-b" />
            <div className="fp-orbit-center"><Activity size={31} strokeWidth={1.7} /></div>
            <div className="fp-orbit-label"><strong>{workoutCount}</strong><span>{workoutCount === 1 ? 'set today' : 'sets today'}</span></div>
          </div>
          <span className="fp-coach-index">01 <i /> DAILY MOMENTUM</span>
        </section>

        <div className="fp-section-intro">
          <div><span className="fp-overline">THE DAILY PICTURE</span><h2>Small wins, adding up.</h2></div>
          <span className="fp-gentle-tag"><span /> No perfect days required</span>
        </div>

        <section className="fp-stat-strip" aria-label="Today's progress">
          <article className="fp-stat fp-stat-calories" data-testid="card-metric-calories">
            <div className="fp-stat-top"><span className="fp-stat-icon"><Flame size={16} /></span><span>FOOD</span></div>
            <strong data-testid="text-metric-calories">{formatAmount(calories)}<small> kcal</small></strong>
            <div className="fp-stat-foot"><span>{calorieProgress}% of daily target</span><span>{caloriesRemaining >= 0 ? `${formatAmount(caloriesRemaining)} left` : `${formatAmount(Math.abs(caloriesRemaining))} over`}</span></div>
            <div className="fp-mini-track"><i style={{ width: `${calorieProgress}%` }} /></div>
          </article>
          <article className="fp-stat fp-stat-protein" data-testid="card-metric-protein">
            <div className="fp-stat-top"><span className="fp-stat-icon"><Target size={16} /></span><span>PROTEIN</span></div>
            <strong data-testid="text-metric-protein">{formatAmount(protein)}<small> g</small></strong>
            <div className="fp-stat-foot"><span>Fuel for strength</span><span>{proteinRemaining >= 0 ? `${formatAmount(proteinRemaining)}g left` : `${formatAmount(Math.abs(proteinRemaining))}g over`}</span></div>
            <div className="fp-mini-track"><i style={{ width: `${profile.proteinTarget > 0 ? Math.min(100, (protein / profile.proteinTarget) * 100) : 0}%` }} /></div>
          </article>
          <article className="fp-stat fp-stat-steps" id="premium-movement" data-testid="card-metric-steps">
            <div className="fp-stat-top"><span className="fp-stat-icon"><Footprints size={16} /></span><span>MOVEMENT</span></div>
            <strong data-testid="text-metric-steps">{todaySteps.toLocaleString()}<small> steps</small></strong>
            <div className="fp-stat-foot"><span>{stepsProgress}% of daily goal</span><span>{stepsRemaining >= 0 ? `${stepsRemaining.toLocaleString()} to go` : `${Math.abs(stepsRemaining).toLocaleString()} over`}</span></div>
            <div className="fp-mini-track"><i style={{ width: `${stepsProgress}%` }} /></div>
          </article>
        </section>

        <div className="fp-dashboard-grid">
          <section className="fp-panel fp-nutrition-panel" id="premium-nutrition" data-testid="card-dashboard-macros">
            <div className="fp-panel-heading">
              <div><span className="fp-overline">EAT WELL, YOUR WAY</span><h3>Today’s nourishment</h3><p>There’s room for what your body needs next.</p></div>
              <button className="fp-text-action" type="button" onClick={() => onNavigate('macros')} data-testid="button-view-macros">Nutrition details <ArrowRight size={14} /></button>
            </div>
            <div className="fp-nutrition-body">
              <div className="fp-calorie-meter" style={{ '--meter-progress': `${calorieProgress}%` } as CSSProperties}>
                <div className="fp-meter-center">
                  <span>CONSUMED</span>
                  <strong data-testid="text-calorie-total">{formatAmount(calories)}</strong>
                  <small>of {profile.calorieTarget.toLocaleString()} kcal</small>
                </div>
              </div>
              <div className="fp-macro-list">
                <MacroLine label="Protein" value={protein} target={profile.proteinTarget} color="protein" />
                <MacroLine label="Carbs" value={carbs} target={profile.carbsTarget} color="carbs" />
                <MacroLine label="Fat" value={fat} target={profile.fatTarget} color="fat" />
              </div>
            </div>
            <div className="fp-remaining">
              <div className="fp-remaining-mark"><ArrowDownRight size={17} /></div>
              <div><span>YOUR DAILY PLAN</span><strong>{caloriesRemaining >= 0 ? `${formatAmount(caloriesRemaining)} kcal left` : `${formatAmount(Math.abs(caloriesRemaining))} kcal over`} <i>·</i> {proteinRemaining >= 0 ? `${formatAmount(proteinRemaining)}g protein left` : `${formatAmount(Math.abs(proteinRemaining))}g protein over`}</strong></div>
              <button type="button" onClick={openMealDialog} data-testid="button-dashboard-add-meal">Log food <Plus size={15} /></button>
            </div>
          </section>

          <section className="fp-panel fp-meals-panel" data-testid="card-recent-meals">
            <div className="fp-panel-heading fp-meals-heading">
              <div><span className="fp-overline">ON YOUR PLATE</span><h3>Meals today</h3><p>{macros.length} {macros.length === 1 ? 'meal logged' : 'meals logged'}</p></div>
              <button className="fp-round-add" type="button" onClick={openMealDialog} aria-label="Log a meal" data-testid="button-open-quick-meal"><Plus size={18} /></button>
            </div>
            {macros.length > 0 ? (
              <div className="fp-meal-list">
                {macros.slice(0, 4).map((meal, index) => (
                  <div className="fp-meal-row" key={meal.id} data-testid={`row-meal-${meal.id}`}>
                    <span className={`fp-meal-marker fp-meal-marker-${index % 2}`}><Utensils size={15} /></span>
                    <span className="fp-meal-copy"><strong>{meal.meal}</strong><small><Clock3 size={11} /> {meal.time} <i>·</i> P {formatAmount(meal.protein)}g <i>·</i> C {formatAmount(meal.carbs)}g <i>·</i> F {formatAmount(meal.fat)}g</small></span>
                    <strong className="fp-meal-kcal">{formatAmount(meal.calories)} <small>kcal</small></strong>
                  </div>
                ))}
              </div>
            ) : (
              <div className="fp-meals-empty" data-testid="empty-no-meals-logged-yet">
                <span className="fp-empty-plate"><Utensils size={21} /></span>
                <strong>No meals logged yet</strong>
                <p>Track your first bite and build a clearer picture of today.</p>
                <button type="button" onClick={openMealDialog} data-testid="button-empty-log-a-meal">Log a meal <ArrowRight size={14} /></button>
              </div>
            )}
            <button className="fp-meal-footer" type="button" onClick={openMealDialog}>
              <span><Plus size={14} /> Add to today’s log</span><ArrowRight size={14} />
            </button>
          </section>
        </div>

        <section className="fp-strength-card" id="premium-strength" data-testid="card-metric-strength-work">
          <div className="fp-strength-icon"><Dumbbell size={19} /></div>
          <div className="fp-strength-copy"><span className="fp-overline">STRENGTH SESSION</span><h3>{workoutCount ? 'Strength work, captured.' : 'A fresh start for strength.'}</h3><p>{workoutCopy}</p></div>
          <div className="fp-strength-count"><strong data-testid="text-metric-strength-work">{workoutCount}</strong><span>{workoutCount === 1 ? 'SET LOGGED' : 'SETS LOGGED'}</span></div>
          <button type="button" onClick={() => onNavigate('workout')} data-testid="button-view-workout-details">View workout <ArrowRight size={15} /></button>
        </section>

        <footer className="fp-footer"><span><Activity size={14} /> FitPulse</span><span>Built around your life, not the other way around.</span></footer>
      </div>

      {mealDialogOpen && (
        <div className="fp-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setMealDialogOpen(false); }}>
          <section className="fp-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="fp-dialog-title" aria-describedby="fp-dialog-description">
            <div className="fp-dialog-heading">
              <span className="fp-dialog-icon"><Apple size={18} /></span>
              <button type="button" className="fp-dialog-close" onClick={() => setMealDialogOpen(false)} aria-label="Close meal form" data-testid="button-close-quick-meal"><X size={18} /></button>
              <span className="fp-overline">A MOMENT TO NOTICE</span>
              <h2 id="fp-dialog-title">Log a meal</h2>
              <p id="fp-dialog-description">Useful is better than perfect. Add what you know.</p>
            </div>
            <form className="fp-meal-form" onSubmit={addMeal} noValidate>
              <label className="fp-form-field fp-form-full" htmlFor="quick-meal-name">Meal name
                <input ref={firstFieldRef} id="quick-meal-name" type="text" value={mealForm.meal} onChange={(event) => setMealForm({ ...mealForm, meal: event.target.value })} placeholder="e.g. Oatmeal and fruit" data-testid="input-quick-meal-name" />
              </label>
              {([
                ['calories', 'Calories', 'kcal'],
                ['protein', 'Protein', 'g'],
                ['carbs', 'Carbs', 'g'],
                ['fat', 'Fat', 'g'],
              ] as const).map(([key, label, unit], index) => (
                <label className="fp-form-field" key={key} htmlFor={`quick-meal-${key}`}>{label}<span className="fp-input-wrap"><input id={`quick-meal-${key}`} required={key === 'calories'} type="number" min={key === 'calories' ? '0.01' : '0'} step="any" placeholder="0" value={mealForm[key]} onChange={(event) => setMealForm({ ...mealForm, [key]: event.target.value })} data-testid={`input-quick-meal-${key}`} /><small>{unit}</small></span></label>
              ))}
              {mealError && <p className="fp-meal-error" role="alert" aria-live="assertive" data-testid="status-quick-meal-error">{mealError}</p>}
              <button className="fp-submit-meal" type="submit" data-testid="button-submit-quick-meal"><Check size={16} /> Add to today</button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}

function MacroLine({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  const progress = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : value > 0 ? 100 : 0;
  const remaining = roundedAmount(target - value);
  return (
    <div className={`fp-macro-line fp-macro-${color}${remaining < 0 ? ' is-over' : ''}`}>
      <div className="fp-macro-line-top"><span>{label}</span><strong>{formatAmount(value)}<small> / {formatAmount(target)}g</small></strong></div>
      <div className="fp-macro-track"><i style={{ width: `${progress}%` }} /></div>
      <small className="fp-macro-remaining">{remaining >= 0 ? `${formatAmount(remaining)}g remaining` : `${formatAmount(Math.abs(remaining))}g over target`}</small>
    </div>
  );
}