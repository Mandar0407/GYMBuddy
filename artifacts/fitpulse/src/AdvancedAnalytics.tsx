import { useEffect, useState, type FormEvent } from 'react';
import { Dumbbell, Footprints, Utensils } from 'lucide-react';
import { buildAdvancedAnalytics, type AdvancedAnalyticsInputs, type AnalyticsDay } from './advancedAnalytics';
import './advanced-analytics.css';

type Props = AdvancedAnalyticsInputs & { onLogWeight: (weightKg: number) => void };

const quantity = (value: number, digits = 0) =>
  value.toLocaleString('en-US', { maximumFractionDigits: digits });

function percentLabel(rate: number) {
  if (!Number.isFinite(rate)) return '—';
  return rate > 999 ? '999%+' : `${Math.round(rate)}%`;
}

function NutritionMeter({ day, metric, target }: {
  day: AnalyticsDay; metric: 'cal' | 'pro'; target: number;
}) {
  const value = metric === 'cal' ? day.calories : day.protein;
  const unit = metric === 'cal' ? 'kcal' : 'g';
  const name = metric === 'cal' ? 'Calories' : 'Protein';
  const validTarget = Number.isFinite(target) && target > 0;
  const met = value !== null && validTarget && value >= target;
  const spoken = value === null
    ? `${name}: no meal entry`
    : `${name}: ${quantity(value, 1)} ${unit} logged${validTarget ? `, daily target ${quantity(target, 1)} ${unit}, ${Math.round(value / target * 100)} percent of target` : ', target not set'}`;
  return (
    <div className={`aa-metric aa-metric-${metric}${met ? ' is-met' : ''}`}
      role="listitem" aria-label={spoken} data-testid={`bar-advanced-${metric}-${day.key}`}>
      <span className="aa-metric-name" aria-hidden="true">{metric === 'cal' ? 'CAL' : 'PRO'}</span>
      {value === null
        ? <span className="aa-missing" aria-hidden="true">No meal log</span>
        : <div className="aa-track" aria-hidden="true">
          <span className="aa-fill" style={{ width: validTarget ? `${Math.min(100, Math.max(0, value / target * 100))}%` : '0%' }} />
        </div>}
      <span className="aa-metric-value" aria-hidden="true">
        {value === null ? '—' : `${quantity(value, 1)} / ${validTarget ? quantity(target, 1) : '—'} ${unit}`}
      </span>
    </div>
  );
}

function WeightChart({ days }: { days: AnalyticsDay[] }) {
  const measured = days.map((day, index) => ({ ...day, index })).filter((day) => day.weight !== null);
  const allValues = measured.flatMap((day) => day.weightAverage === null
    ? [day.weight!] : [day.weight!, day.weightAverage]);
  const low = Math.min(...allValues);
  const high = Math.max(...allValues);
  const padding = Math.max(.35, (high - low) * .28);
  const min = low - padding;
  const max = high + padding;
  const x = (index: number) => 26 + index * 48;
  const y = (value: number) => 108 - (value - min) / (max - min) * 80;

  // Segments have observed readings at both endpoints; dotted spans signal missing dates.
  const averages = measured.filter((point) => point.weightAverage !== null);

  return (
    <div className="aa-weight-chart" data-testid="chart-advanced-weight">
      <svg viewBox="0 0 340 143" role="img" aria-labelledby="aa-chart-title aa-chart-desc">
        <title id="aa-chart-title">Logged weight over the last seven days</title>
        <desc id="aa-chart-desc">
          {measured.map((day) => `${day.dateLabel}: ${quantity(day.weight!, 1)} kilograms${day.weightAverage !== null ? `, trailing average ${quantity(day.weightAverage, 1)} kilograms` : ''}`).join('. ')}. Dotted spans bridge missing days; no values are estimated for those days.
        </desc>
        {[38, 78, 108].map((level) => <line key={level} x1="26" x2="314" y1={level} y2={level} className="aa-chart-grid" aria-hidden="true" />)}
        {measured.slice(1).map((point, index) => {
          const previous = measured[index];
          return <line key={`weight-${point.key}`} x1={x(previous.index)} y1={y(previous.weight!)} x2={x(point.index)} y2={y(point.weight!)} className={`aa-chart-line${point.index - previous.index > 1 ? ' aa-chart-gap' : ''}`} aria-hidden="true" />;
        })}
        {averages.slice(1).map((point, index) => {
          const previous = averages[index];
          return <line key={`average-${point.key}`} x1={x(previous.index)} y1={y(previous.weightAverage!)} x2={x(point.index)} y2={y(point.weightAverage!)} className={`aa-chart-average${point.index - previous.index > 1 ? ' aa-chart-gap' : ''}`} aria-hidden="true" />;
        })}
        {measured.map((day) => <g key={day.key} aria-hidden="true">
          {day.weightAverage !== null && <circle cx={x(day.index)} cy={y(day.weightAverage)} r="3" className="aa-chart-avg-dot" />}
          <circle cx={x(day.index)} cy={y(day.weight!)} r="4.5" className="aa-chart-dot" />
          <text className="aa-point-label" x={x(day.index)} y={Math.max(12, y(day.weight!) - 10)} textAnchor="middle">{quantity(day.weight!, 1)}</text>
        </g>)}
        {days.map((day, index) => <text key={day.key} className="aa-axis-label" x={x(index)} y="135" textAnchor="middle" aria-hidden="true">{day.weekday.slice(0, 2)}</text>)}
      </svg>
      <div className="aa-weight-key" aria-hidden="true"><span><i /> Readings</span><span><i /> Last 3 logged readings, from the second</span></div>
    </div>
  );
}

export default function AdvancedAnalytics({
  currentDate, meals, steps, workouts, completedWorkouts, weightHistory, calorieTarget, proteinTarget, onLogWeight,
}: Props) {
  const result = buildAdvancedAnalytics({ currentDate, meals, steps, workouts, completedWorkouts, weightHistory, calorieTarget, proteinTarget });
  const [weightInput, setWeightInput] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const todayWeight = result.days[6].weight;
  const measured = result.days.filter((day) => day.weight !== null);

  useEffect(() => { setWeightInput(''); setError(''); setSaved(false); }, [currentDate]);

  const submitWeight = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = weightInput.trim();
    const value = Number(trimmed);
    if (!trimmed || !Number.isFinite(value) || value < 20 || value > 500) {
      setError('Enter a weight between 20 and 500 kg.');
      setSaved(false);
      return;
    }
    try {
      onLogWeight(value);
      setWeightInput('');
      setError('');
      setSaved(true);
    } catch {
      setError('Could not save your weight. Please try again.');
      setSaved(false);
    }
  };

  return (
    <section className="aa" aria-label="Advanced analytics" data-testid="section-advanced-analytics">
      <header className="aa-header">
        <span className="aa-kicker">LAST 7 DAYS / YOUR JOURNAL</span>
        <h2>The fuller <em>picture.</em></h2>
        <p>Only what you recorded. Nothing filled in between.</p>
      </header>

      <section className="aa-panel aa-food" aria-labelledby="aa-food-heading" data-testid="card-advanced-nutrition">
        <div className="aa-heading-row">
          <div>
            <span className="aa-kicker">01 / NUTRITION</span>
            <h3 id="aa-food-heading">Food, day by day.</h3>
            <p className="aa-panel-sub">Logged meals against your daily targets.</p>
          </div>
          <span className="aa-range" data-testid="text-advanced-range">{result.rangeLabel}</span>
        </div>
        <div className="aa-legend" aria-label="Chart legend">
          <span><i className="aa-swatch aa-swatch-cal" aria-hidden="true" /> Calories</span>
          <span><i className="aa-swatch aa-swatch-pro" aria-hidden="true" /> Protein</span>
          <span className="aa-key-note">Darker = target met; end of track = target</span>
        </div>
        <div className="aa-food-list" role="list" aria-label="Daily logged calories and protein">
          {result.days.map((day) => (
            <div className="aa-food-day" key={day.key} role="listitem" data-testid={`row-advanced-nutrition-${day.key}`}>
              <div className="aa-day-label"><strong>{day.weekday}</strong><small>{day.dateLabel}</small></div>
              <div className="aa-metrics" role="list" aria-label={`${day.weekday}, ${day.dateLabel}`}>
                <NutritionMeter day={day} metric="cal" target={calorieTarget} />
                <NutritionMeter day={day} metric="pro" target={proteinTarget} />
              </div>
            </div>
          ))}
        </div>
        <p className="aa-footnote">A blank day means no meals were logged, not zero food eaten. Totals may be partial. Older imported meal dates may be approximate.</p>
      </section>

      <section className="aa-panel aa-weight" aria-labelledby="aa-weight-heading" data-testid="card-advanced-weight">
        <span className="aa-kicker">02 / WEIGHT</span>
        <h3 id="aa-weight-heading">A trend, not a verdict.</h3>
        <p className="aa-panel-sub">Measured readings only · kilograms</p>
        {measured.length >= 2 ? <WeightChart days={result.days} /> : (
          <div className="aa-weight-empty" data-testid="empty-advanced-weight">
            <strong>{measured.length === 1 ? `${quantity(measured[0].weight!, 1)} kg on ${measured[0].dateLabel}` : 'No readings in this window.'}</strong>
            <span>{measured.length === 1 ? 'One reading is a start. Log another day to see a measured trend and trailing average.' : 'Log a weight when it feels useful. Your chart will only show days with an actual reading.'}</span>
          </div>
        )}
        <form className="aa-weight-form" onSubmit={submitWeight} noValidate>
          <label htmlFor="aa-weight-input">{todayWeight !== null ? `Today's reading: ${quantity(todayWeight, 1)} kg` : 'Log today’s weight'}</label>
          <div className="aa-weight-controls">
            <input id="aa-weight-input" type="number" inputMode="decimal" step="any" min="20" max="500" placeholder="e.g. 68.4"
              value={weightInput} onChange={(event) => { setWeightInput(event.target.value); setError(''); setSaved(false); }}
              aria-invalid={Boolean(error)} aria-describedby={error ? 'aa-weight-error' : 'aa-weight-hint'}
              data-testid="input-advanced-weight" />
            <button type="submit" data-testid="button-log-advanced-weight">{todayWeight !== null ? 'Replace today' : 'Save reading'}</button>
          </div>
          {error ? <p id="aa-weight-error" className="aa-form-error" role="alert" data-testid="error-advanced-weight">{error}</p>
            : <p id="aa-weight-hint" className="aa-form-hint" data-testid="status-advanced-weight">{saved ? 'Reading sent to your journal.' : '20–500 kg · another entry today replaces the previous one.'}</p>}
        </form>
      </section>

      <section className="aa-highlights" aria-labelledby="aa-highlights-heading" data-testid="section-advanced-highlights">
        <span className="aa-kicker">03 / WEEKLY HIGHLIGHTS</span>
        <h3 id="aa-highlights-heading">What the logs say.</h3>
        <div className="aa-highlights-list">
          <div className="aa-highlight" data-testid="card-advanced-steps">
            <span className="aa-highlight-icon"><Footprints size={17} aria-hidden="true" /></span>
            <div className="aa-highlight-copy"><strong>Average recorded steps</strong><span>{result.stepDays} {result.stepDays === 1 ? 'day' : 'days'} with step entries</span></div>
            <span className="aa-highlight-value" data-testid="text-advanced-average-steps">{result.averageSteps === null ? '—' : quantity(Math.round(result.averageSteps))}</span>
          </div>
          <div className="aa-highlight" data-testid="card-advanced-strength">
            <span className="aa-highlight-icon"><Dumbbell size={17} aria-hidden="true" /></span>
            <div className="aa-highlight-copy"><strong>Workouts completed</strong><span>Marked complete in Strength · {result.workoutDays} {result.workoutDays === 1 ? 'day' : 'days'} with sets</span></div>
            <span className="aa-highlight-value" data-testid="text-advanced-workouts-completed">{result.completedWorkoutCount}</span>
          </div>
          <div className="aa-highlight" data-testid="card-advanced-protein">
            <span className="aa-highlight-icon"><Utensils size={17} aria-hidden="true" /></span>
            <div className="aa-highlight-copy"><strong>Daily protein target rate</strong><span>Average of {result.mealDays} {result.mealDays === 1 ? 'day' : 'days'} with meal entries</span></div>
            <span className="aa-highlight-value" data-testid="text-advanced-protein-rate">{result.averageProteinTargetRate === null ? '—' : percentLabel(result.averageProteinTargetRate)}</span>
          </div>
        </div>
        <p className="aa-disclaimer">These are journal highlights, not a complete record of eating or activity. Missing entries are never counted as zero. Older imported meal dates may be approximate.</p>
      </section>
    </section>
  );
}