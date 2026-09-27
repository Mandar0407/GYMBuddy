import { type CSSProperties, type FormEvent, useState } from 'react';
import {
  Activity,
  Apple,
  ArrowDownRight,
  ArrowRight,
  Check,
  ChevronDown,
  Clock3,
  Dumbbell,
  Flame,
  Footprints,
  Home,
  Menu,
  Plus,
  Sparkles,
  Target,
  Utensils,
  X,
  type LucideIcon,
} from 'lucide-react';
import './_premium.css';

type View = 'dashboard' | 'macros' | 'workout' | 'steps' | 'plan';
type MacroLog = {
  id: string;
  meal: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  time: string;
};

const profile = {
  name: 'Maya Chen',
  goal: 'Build strength',
  calorieTarget: 2500,
  proteinTarget: 160,
  carbsTarget: 280,
  fatTarget: 75,
  stepTarget: 9000,
};

const initialMeals: MacroLog[] = [
  { id: 'lunch', meal: 'Lunch', calories: 1020, protein: 74, carbs: 114, fat: 28, time: '1:15 PM' },
  { id: 'breakfast', meal: 'Breakfast', calories: 620, protein: 38, carbs: 72, fat: 20, time: '8:30 AM' },
];

const navItems: { id: View; label: string; icon: LucideIcon }[] = [
  { id: 'dashboard', label: 'Today', icon: Home },
  { id: 'macros', label: 'Nutrition', icon: Apple },
  { id: 'workout', label: 'Strength', icon: Dumbbell },
  { id: 'steps', label: 'Movement', icon: Footprints },
  { id: 'plan', label: 'My plan', icon: Target },
];

function dateLabel() {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
}

function initials(name: string) {
  return name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

export function Premium() {
  const [meals, setMeals] = useState(initialMeals);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeView, setActiveView] = useState<View>('dashboard');
  const [mealDialogOpen, setMealDialogOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [mealForm, setMealForm] = useState({ meal: 'Snack', calories: '', protein: '', carbs: '', fat: '' });

  const totals = meals.reduce(
    (sum, meal) => ({
      calories: sum.calories + meal.calories,
      protein: sum.protein + meal.protein,
      carbs: sum.carbs + meal.carbs,
      fat: sum.fat + meal.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
  const calorieProgress = Math.min(100, Math.round((totals.calories / profile.calorieTarget) * 100));
  const stepsProgress = Math.min(100, Math.round((6500 / profile.stepTarget) * 100));
  const caloriesRemaining = profile.calorieTarget - totals.calories;
  const proteinRemaining = profile.proteinTarget - totals.protein;
  const stepsRemaining = profile.stepTarget - 6500;
  const today = dateLabel();

  const navigate = (view: View) => {
    setActiveView(view);
    setMobileMenuOpen(false);
    const targetId: Record<View, string> = {
      dashboard: 'premium-top',
      macros: 'premium-nutrition',
      workout: 'premium-strength',
      steps: 'premium-movement',
      plan: 'premium-focus',
    };
    document.getElementById(targetId[view])?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const addMeal = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const calories = Number(mealForm.calories);
    if (!Number.isFinite(calories) || calories <= 0) return;
    const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date());
    setMeals((current) => [
      {
        id: `${Date.now()}`,
        meal: mealForm.meal,
        calories,
        protein: Number(mealForm.protein) || 0,
        carbs: Number(mealForm.carbs) || 0,
        fat: Number(mealForm.fat) || 0,
        time,
      },
      ...current,
    ]);
    setMealForm({ meal: 'Snack', calories: '', protein: '', carbs: '', fat: '' });
    setMealDialogOpen(false);
    setNotice('Added to today’s food log.');
    window.setTimeout(() => setNotice(''), 2600);
  };

  return (
    <div className="fp-premium">
      <div className="fp-layout">
        <aside className="fp-sidebar" aria-label="Primary navigation">
          <Brand />
          <div className="fp-side-caption">YOUR SPACE</div>
          <nav className="fp-nav">
            {navItems.map((item) => (
              <NavItem key={item.id} item={item} active={activeView === item.id} onClick={() => navigate(item.id)} />
            ))}
          </nav>
          <div className="fp-side-note">
            <span className="fp-note-icon"><Sparkles size={15} /></span>
            <p><strong>Progress, not pressure.</strong><br />Your rhythm is yours to make.</p>
          </div>
          <button className="fp-profile" type="button" onClick={() => setNotice('Your profile is ready for a refresh.')}>
            <span className="fp-avatar">{initials(profile.name)}</span>
            <span className="fp-profile-copy"><strong>{profile.name}</strong><span>{profile.goal}</span></span>
            <ChevronDown size={15} />
          </button>
        </aside>

        <main className="fp-main">
          <div className="fp-mobilebar">
            <Brand compact />
            <button className="fp-menu-toggle" type="button" onClick={() => setMobileMenuOpen((open) => !open)} aria-label={mobileMenuOpen ? 'Close navigation' : 'Open navigation'}>
              {mobileMenuOpen ? <X size={19} /> : <Menu size={19} />}
            </button>
          </div>
          {mobileMenuOpen && (
            <nav className="fp-mobile-nav" aria-label="Mobile navigation">
              {navItems.map((item) => (
                <NavItem key={item.id} item={item} active={activeView === item.id} onClick={() => navigate(item.id)} />
              ))}
            </nav>
          )}

          <div className="fp-page" id="premium-top">
            <header className="fp-heading">
              <div>
                <div className="fp-date-kicker"><span className="fp-live-dot" /> TODAY, {today.toUpperCase()}</div>
                <h1>A good day<br className="fp-mobile-break" /> is in motion, Maya.</h1>
                <p>Here’s what you’ve already made time for.</p>
              </div>
              <div className="fp-date-stamp"><span>YOUR DAILY CHECK-IN</span><strong>{today}</strong></div>
            </header>

            <section className="fp-coach-card" id="premium-focus">
              <div className="fp-coach-copy">
                <div className="fp-coach-kicker"><span className="fp-coach-spark"><Sparkles size={13} /></span> A NOTE FOR TODAY</div>
                <h2>Keep showing up<br />for the strong version of you.</h2>
                <p>Three sets are in. A little more fuel and a short walk can round out the day.</p>
                <button className="fp-coach-link" type="button" onClick={() => navigate('workout')}>
                  See your strength work <ArrowRight size={15} />
                </button>
              </div>
              <div className="fp-coach-orbit" aria-hidden="true">
                <div className="fp-orbit-ring fp-orbit-ring-a" />
                <div className="fp-orbit-ring fp-orbit-ring-b" />
                <div className="fp-orbit-center"><Activity size={31} strokeWidth={1.7} /></div>
                <div className="fp-orbit-label"><strong>3</strong><span>sets today</span></div>
              </div>
              <span className="fp-coach-index">01 <i /> DAILY MOMENTUM</span>
            </section>

            <div className="fp-section-intro">
              <div><span className="fp-overline">THE DAILY PICTURE</span><h2>Small wins, adding up.</h2></div>
              <span className="fp-gentle-tag"><span /> No perfect days required</span>
            </div>

            <section className="fp-stat-strip" aria-label="Today's progress">
              <article className="fp-stat fp-stat-calories">
                <div className="fp-stat-top"><span className="fp-stat-icon"><Flame size={16} /></span><span>FOOD</span></div>
                <strong>{totals.calories.toLocaleString()}<small> kcal</small></strong>
                <div className="fp-stat-foot"><span>{calorieProgress}% of daily target</span><span>{caloriesRemaining >= 0 ? `${caloriesRemaining.toLocaleString()} left` : `${Math.abs(caloriesRemaining).toLocaleString()} over`}</span></div>
                <div className="fp-mini-track"><i style={{ width: `${calorieProgress}%` }} /></div>
              </article>
              <article className="fp-stat fp-stat-protein">
                <div className="fp-stat-top"><span className="fp-stat-icon"><Target size={16} /></span><span>PROTEIN</span></div>
                <strong>{totals.protein}<small> g</small></strong>
                <div className="fp-stat-foot"><span>Fuel for strength</span><span>{proteinRemaining >= 0 ? `${proteinRemaining}g left` : `${Math.abs(proteinRemaining)}g over`}</span></div>
                <div className="fp-mini-track"><i style={{ width: `${Math.min(100, (totals.protein / profile.proteinTarget) * 100)}%` }} /></div>
              </article>
              <article className="fp-stat fp-stat-steps" id="premium-movement">
                <div className="fp-stat-top"><span className="fp-stat-icon"><Footprints size={16} /></span><span>MOVEMENT</span></div>
                <strong>{(6500).toLocaleString()}<small> steps</small></strong>
                <div className="fp-stat-foot"><span>{stepsProgress}% of daily goal</span><span>{stepsRemaining >= 0 ? `${stepsRemaining.toLocaleString()} to go` : `${Math.abs(stepsRemaining).toLocaleString()} over`}</span></div>
                <div className="fp-mini-track"><i style={{ width: `${stepsProgress}%` }} /></div>
              </article>
            </section>

            <div className="fp-dashboard-grid">
              <section className="fp-panel fp-nutrition-panel" id="premium-nutrition">
                <div className="fp-panel-heading">
                  <div><span className="fp-overline">EAT WELL, YOUR WAY</span><h3>Today’s nourishment</h3><p>There’s room for what your body needs next.</p></div>
                  <button className="fp-text-action" type="button" onClick={() => navigate('macros')}>Nutrition details <ArrowRight size={14} /></button>
                </div>
                <div className="fp-nutrition-body">
                  <div className="fp-calorie-meter" style={{ '--meter-progress': `${calorieProgress}%` } as CSSProperties}>
                    <div className="fp-meter-center">
                      <span>CONSUMED</span>
                      <strong>{totals.calories.toLocaleString()}</strong>
                      <small>of {profile.calorieTarget.toLocaleString()} kcal</small>
                    </div>
                  </div>
                  <div className="fp-macro-list">
                    <MacroLine label="Protein" value={totals.protein} target={profile.proteinTarget} color="protein" />
                    <MacroLine label="Carbs" value={totals.carbs} target={profile.carbsTarget} color="carbs" />
                    <MacroLine label="Fat" value={totals.fat} target={profile.fatTarget} color="fat" />
                  </div>
                </div>
                <div className="fp-remaining">
                  <div className="fp-remaining-mark"><ArrowDownRight size={17} /></div>
                  <div><span>YOUR DAILY PLAN</span><strong>{caloriesRemaining >= 0 ? `${caloriesRemaining.toLocaleString()} kcal left` : `${Math.abs(caloriesRemaining).toLocaleString()} kcal over`} <i>·</i> {proteinRemaining >= 0 ? `${proteinRemaining}g protein left` : `${Math.abs(proteinRemaining)}g protein over`}</strong></div>
                  <button type="button" onClick={() => setMealDialogOpen(true)}>Log food <Plus size={15} /></button>
                </div>
              </section>

              <section className="fp-panel fp-meals-panel">
                <div className="fp-panel-heading fp-meals-heading">
                  <div><span className="fp-overline">ON YOUR PLATE</span><h3>Meals today</h3><p>{meals.length} thoughtful check-ins</p></div>
                  <button className="fp-round-add" type="button" onClick={() => setMealDialogOpen(true)} aria-label="Log a meal"><Plus size={18} /></button>
                </div>
                {meals.length > 0 ? (
                  <div className="fp-meal-list">
                    {meals.slice(0, 4).map((meal, index) => (
                      <div className="fp-meal-row" key={meal.id}>
                        <span className={`fp-meal-marker fp-meal-marker-${index % 2}`}><Utensils size={15} /></span>
                        <span className="fp-meal-copy"><strong>{meal.meal}</strong><small><Clock3 size={11} /> {meal.time} <i>·</i> P {meal.protein}g <i>·</i> C {meal.carbs}g <i>·</i> F {meal.fat}g</small></span>
                        <strong className="fp-meal-kcal">{meal.calories.toLocaleString()} <small>kcal</small></strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="fp-meals-empty">
                    <span className="fp-empty-plate"><Utensils size={21} /></span>
                    <strong>A clear plate, a fresh start.</strong>
                    <p>Log a meal whenever you’re ready. It all counts.</p>
                    <button type="button" onClick={() => setMealDialogOpen(true)}>Add your first meal <ArrowRight size={14} /></button>
                  </div>
                )}
                <button className="fp-meal-footer" type="button" onClick={() => setMealDialogOpen(true)}>
                  <span><Plus size={14} /> Add to today’s log</span><ArrowRight size={14} />
                </button>
              </section>
            </div>

            <section className="fp-strength-card" id="premium-strength">
              <div className="fp-strength-icon"><Dumbbell size={19} /></div>
              <div className="fp-strength-copy"><span className="fp-overline">STRENGTH SESSION</span><h3>Three sets in the bank.</h3><p>Each one is a promise you kept to yourself.</p></div>
              <div className="fp-strength-count"><strong>03</strong><span>SETS LOGGED</span></div>
              <button type="button" onClick={() => navigate('workout')}>View workout <ArrowRight size={15} /></button>
            </section>

            <footer className="fp-footer"><span><Activity size={14} /> FitPulse</span><span>Built around your life, not the other way around.</span></footer>
          </div>
        </main>
      </div>

      {mealDialogOpen && (
        <div className="fp-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setMealDialogOpen(false); }}>
          <section className="fp-dialog" role="dialog" aria-modal="true" aria-labelledby="fp-dialog-title">
            <div className="fp-dialog-heading">
              <span className="fp-dialog-icon"><Apple size={18} /></span>
              <button type="button" className="fp-dialog-close" onClick={() => setMealDialogOpen(false)} aria-label="Close meal form"><X size={18} /></button>
              <span className="fp-overline">A MOMENT TO NOTICE</span>
              <h2 id="fp-dialog-title">Log a meal</h2>
              <p>Useful is better than perfect. Add what you know.</p>
            </div>
            <form className="fp-meal-form" onSubmit={addMeal}>
              <label className="fp-form-field fp-form-full">Meal
                <select value={mealForm.meal} onChange={(event) => setMealForm({ ...mealForm, meal: event.target.value })}>
                  {['Breakfast', 'Lunch', 'Dinner', 'Snack'].map((meal) => <option key={meal}>{meal}</option>)}
                </select>
              </label>
              {([
                ['calories', 'Calories', 'kcal'],
                ['protein', 'Protein', 'g'],
                ['carbs', 'Carbs', 'g'],
                ['fat', 'Fat', 'g'],
              ] as const).map(([key, label, unit]) => (
                <label className="fp-form-field" key={key}>{label}<span className="fp-input-wrap"><input required={key === 'calories'} type="number" min="0" step="1" placeholder="0" value={mealForm[key]} onChange={(event) => setMealForm({ ...mealForm, [key]: event.target.value })} /><small>{unit}</small></span></label>
              ))}
              <button className="fp-submit-meal" type="submit"><Check size={16} /> Add to today</button>
            </form>
          </section>
        </div>
      )}
      {notice && <div className="fp-toast" role="status"><Check size={15} />{notice}</div>}
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`fp-brand${compact ? ' fp-brand-compact' : ''}`}><span className="fp-brand-mark"><Activity size={compact ? 17 : 19} strokeWidth={2.5} /></span><span>fit<span>pulse</span></span></div>;
}

function NavItem({ item, active, onClick }: { item: (typeof navItems)[number]; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return <button type="button" className={`fp-nav-item${active ? ' is-active' : ''}`} onClick={onClick}><Icon size={17} strokeWidth={active ? 2.4 : 1.9} /><span>{item.label}</span>{active && <span className="fp-nav-active-dot" />}</button>;
}

function MacroLine({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  const progress = Math.min(100, Math.round((value / target) * 100));
  const remaining = target - value;
  return <div className={`fp-macro-line fp-macro-${color}${remaining < 0 ? ' is-over' : ''}`}><div className="fp-macro-line-top"><span>{label}</span><strong>{value}<small> / {target}g</small></strong></div><div className="fp-macro-track"><i style={{ width: `${progress}%` }} /></div><small className="fp-macro-remaining">{remaining >= 0 ? `${remaining}g remaining` : `${Math.abs(remaining)}g over target`}</small></div>;
}