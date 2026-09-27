import { type CSSProperties, useState } from 'react';
import {
  Activity,
  Apple,
  ArrowRight,
  CircleUserRound,
  Calculator,
  Dumbbell,
  Flame,
  Footprints,
  Home,
  Menu,
  Plus,
  Settings2,
  Target,
  Trash2,
  Utensils,
  type LucideIcon,
} from 'lucide-react';
import './_group.css';

type View = 'dashboard' | 'macros' | 'workout' | 'steps' | 'plan';
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

const profile: Profile = {
  name: 'Maya Chen',
  goal: 'Build strength',
  calorieTarget: 2500,
  proteinTarget: 160,
  carbsTarget: 280,
  fatTarget: 75,
  stepTarget: 9000,
};

const macros: MacroLog[] = [
  { id: 'lunch', meal: 'Lunch', calories: 1020, protein: 74, carbs: 114, fat: 28, time: '1:15 PM' },
  { id: 'breakfast', meal: 'Breakfast', calories: 620, protein: 38, carbs: 72, fat: 20, time: '8:30 AM' },
];

const navItems: { id: View; label: string; icon: LucideIcon }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: Home },
  { id: 'macros', label: 'Macros', icon: Apple },
  { id: 'workout', label: 'Workout', icon: Dumbbell },
  { id: 'steps', label: 'Steps', icon: Footprints },
  { id: 'plan', label: 'Plan', icon: Calculator },
];

function initials(name: string) {
  return name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function formatLongDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(date);
}

export function Current() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const calories = 1640;
  const protein = 112;
  const carbs = 186;
  const fat = 48;
  const todaySteps = 6500;
  const workoutCount = 3;

  const navigate = (_view: View) => setMobileNavOpen(false);

  return (
    <div className="fitpulse-app">
      <div className="fitpulse-shell">
        <aside className="sidebar" aria-label="Primary navigation">
          <Brand />
          <div className="eyebrow">Your daily ritual</div>
          <nav className="nav-stack">
            {navItems.map((item) => (
              <NavButton key={item.id} item={item} active={item.id === 'dashboard'} onClick={() => navigate(item.id)} />
            ))}
          </nav>
          <div className="sidebar-spacer" />
          <button className="profile-chip" type="button" data-testid="button-open-profile">
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
            <button
              className="mobile-menu"
              type="button"
              onClick={() => setMobileNavOpen((open) => !open)}
              aria-label="Open navigation"
              data-testid="button-mobile-menu"
            >
              <Menu size={20} />
            </button>
          </div>
          {mobileNavOpen && (
            <div className="mobile-nav-panel" style={{ padding: '0 17px 10px', display: 'grid', gap: 4 }}>
              {navItems.map((item) => (
                <NavButton key={item.id} item={item} active={item.id === 'dashboard'} onClick={() => navigate(item.id)} />
              ))}
              <button className="nav-button" type="button" onClick={() => setMobileNavOpen(false)} data-testid="button-mobile-profile">
                <CircleUserRound size={18} /> Profile settings
              </button>
            </div>
          )}
          <div className="main-inner">
            <Dashboard
              profile={profile}
              calories={calories}
              protein={protein}
              carbs={carbs}
              fat={fat}
              todaySteps={todaySteps}
              workoutCount={workoutCount}
              macros={macros}
              onNavigate={navigate}
            />
          </div>
        </main>
      </div>
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
    <button className={`nav-button${active ? ' active' : ''}`} type="button" onClick={onClick} data-testid={`button-nav-${item.id}`}>
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
            <button className="button-quiet" type="button" onClick={() => onNavigate('macros')} data-testid="button-view-macros">Open macros <ArrowRight size={14} /></button>
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
            <button className="button-icon button-quiet" type="button" onClick={() => onNavigate('macros')} aria-label="Add a meal" data-testid="button-dashboard-add-meal"><Plus size={17} /></button>
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
  return <div className="empty-state" data-testid={`empty-${title.toLowerCase().replace(/ /g, '-')}`}><div><Icon size={22} /><strong>{title}</strong><p>{text}</p>{action && onClick && <button className="button-primary" type="button" onClick={onClick} data-testid={`button-empty-${action.toLowerCase().replace(/ /g, '-')}`}>{action} <ArrowRight size={14} /></button>}</div></div>;
}

function MealRow({ meal, onDelete }: { meal: MacroLog; onDelete?: (id: string) => void }) {
  return <div className="log-row" data-testid={`row-meal-${meal.id}`}><span className="log-dot" /><div className="log-copy"><strong>{meal.meal}</strong><span>{meal.protein}g protein · {meal.carbs}g carbs · {meal.fat}g fat</span></div><span className="log-value">{meal.calories} kcal</span>{onDelete && <button className="delete-button" type="button" onClick={() => onDelete(meal.id)} aria-label={`Delete ${meal.meal}`} data-testid={`button-delete-meal-${meal.id}`}><Trash2 size={15} /></button>}</div>;
}