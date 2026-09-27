import type { ReactNode } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Droplets, Dumbbell, Footprints, NotebookPen, Sparkles } from 'lucide-react';
import type { WeeklyInsight } from './weeklyInsights';
import './weekly-insights.css';

type Props = {
  insight: WeeklyInsight;
  weekOffset: number;
  onWeekChange: (offset: number) => void;
  onNavigate: (view: 'steps' | 'macros' | 'workout') => void;
};

const number = (value: number) => value.toLocaleString('en-US');

function DetailLink({ children, onClick, testId }: { children: ReactNode; onClick: () => void; testId: string }) {
  return (
    <button className="wi-link" type="button" onClick={onClick} data-testid={testId}>
      {children}<ArrowRight size={15} strokeWidth={1.8} aria-hidden="true" />
    </button>
  );
}

type MiniMetric = 'water' | 'nutrition' | 'strength';

function WeekMicrochart({ days, metric }: { days: WeeklyInsight['days']; metric: MiniMetric }) {
  const config = {
    water: { title: 'Water logged by day', unit: 'ml of water logged', value: (day: WeeklyInsight['days'][number]) => day.waterMl },
    nutrition: { title: 'Food calories logged by day', unit: 'kcal of food logged', value: (day: WeeklyInsight['days'][number]) => day.calories },
    strength: { title: 'Strength sets logged by day', unit: 'sets logged', value: (day: WeeklyInsight['days'][number]) => day.workoutSets },
  }[metric];
  const highest = Math.max(1, ...days.filter((day) => !day.isFuture).map((day) => config.value(day) ?? 0));

  return (
    <div className={`wi-mini wi-mini-${metric}`}>
      <div className="wi-mini-heading">{config.title}<span>MON–SUN</span></div>
      <div className="wi-mini-chart" role="list" aria-label={config.title} data-testid={`chart-weekly-${metric}`}>
        {days.map((day) => {
          const value = config.value(day);
          // Strength supplies a count, not a nullable daily entry: zero means no sets logged,
          // not that the person did no strength work outside the journal.
          const hasLog = !day.isFuture && value !== null && (metric !== 'strength' || value > 0);
          const description = day.isFuture ? 'upcoming' : !hasLog ? 'no log' : `${number(value!)} ${config.unit}`;
          return (
            <div
              className={`wi-mini-day${day.isFuture ? ' is-future' : ''}${!hasLog && !day.isFuture ? ' is-unlogged' : ''}`}
              key={day.key}
              role="listitem"
              aria-label={`${day.label}, ${day.dateLabel}: ${description}`}
              title={`${day.label}, ${day.dateLabel}: ${description}`}
              data-testid={`bar-weekly-${metric}-${day.key}`}
            >
              <div className="wi-mini-plot" aria-hidden="true">
                {hasLog ? <span className={`wi-mini-bar${value === 0 ? ' is-zero' : ''}`} style={{ height: value === 0 ? '3px' : `${Math.max(5, value! / highest * 100)}%` }} /> : !day.isFuture ? <span className="wi-mini-unlogged" /> : null}
              </div>
              <span aria-hidden="true">{day.label.slice(0, 2)}</span>
            </div>
          );
        })}
      </div>
      <div className="wi-mini-key">— no log <span aria-hidden="true">·</span> blank = upcoming{metric !== 'strength' && <> <span aria-hidden="true">·</span> short bar = logged zero</>}</div>
    </div>
  );
}

export default function WeeklyInsightsPage({ insight, weekOffset, onWeekChange, onNavigate }: Props) {
  const chartMax = Math.max(1, insight.targets.steps, ...insight.days.filter((day) => !day.isFuture).map((day) => day.steps ?? 0));
  const goalPosition = insight.targets.steps > 0 ? Math.min(100, insight.targets.steps / chartMax * 100) : 0;

  return (
    <div className="fp-insights" data-testid="page-weekly-insights">
      <header className="wi-header">
        <div>
          <div className="wi-eyebrow"><span className="wi-eyebrow-line" /> THE WEEKLY EDIT</div>
          <h1>A little perspective<span>.</span></h1>
          <p>A quiet look at what you chose to record. Every entry counts.</p>
        </div>
      </header>

      <div className="wi-week-nav" aria-label="Choose a week">
        <button type="button" className="wi-week-arrow" onClick={() => onWeekChange(weekOffset - 1)} aria-label="Previous week" data-testid="button-previous-week">
          <ChevronLeft size={19} aria-hidden="true" />
        </button>
        <div className="wi-week-date" aria-live="polite" data-testid="text-week-range">
          <span>{insight.isCurrentWeek ? 'THIS WEEK' : 'YOUR JOURNAL'}</span>
          <strong>{insight.rangeLabel}</strong>
        </div>
        <button type="button" className="wi-week-arrow" onClick={() => onWeekChange(weekOffset + 1)} disabled={insight.isCurrentWeek} aria-label="Next week" data-testid="button-next-week">
          <ChevronRight size={19} aria-hidden="true" />
        </button>
      </div>

      {!insight.anyEntries ? (
        <section className="wi-empty" data-testid="empty-weekly-insights" aria-labelledby="wi-empty-title">
          <div className="wi-empty-art" aria-hidden="true">
            <span className="wi-empty-orbit wi-empty-orbit-one" />
            <span className="wi-empty-orbit wi-empty-orbit-two" />
            <NotebookPen size={29} strokeWidth={1.45} />
          </div>
          <span className="wi-small-label">A FRESH PAGE</span>
          <h2 id="wi-empty-title">Nothing logged here yet.<br /><em>That’s okay.</em></h2>
          <p>This week has no entries in your journal. That doesn’t mean you weren’t moving, drinking water, eating well, or getting stronger. Start with whichever detail feels useful.</p>
          <div className="wi-empty-actions">
            <button type="button" className="wi-primary-action" onClick={() => onNavigate('steps')} data-testid="button-empty-log-movement">Log movement <ArrowRight size={16} aria-hidden="true" /></button>
            <button type="button" className="wi-secondary-action" onClick={() => onNavigate('macros')} data-testid="button-empty-log-nutrition">Log food or water</button>
            <button type="button" className="wi-secondary-action" onClick={() => onNavigate('workout')} data-testid="button-empty-log-strength">Log strength</button>
          </div>
        </section>
      ) : (
        <>
          <section className="wi-movement" aria-labelledby="wi-movement-heading" data-testid="card-weekly-movement">
            <div className="wi-movement-top">
              <div>
                <div className="wi-light-label"><Footprints size={14} aria-hidden="true" /> MOVEMENT / 01</div>
                <h2 id="wi-movement-heading">The steps you recorded.</h2>
              </div>
              <span className="wi-movement-mark" aria-hidden="true"><Footprints size={23} strokeWidth={1.6} /></span>
            </div>
            <div className="wi-movement-summary">
              <div>
                {insight.stepDaysLogged > 0
                  ? <strong data-testid="text-weekly-steps-total">{number(insight.stepsTotal)}<small> steps logged</small></strong>
                  : <strong className="wi-no-value" data-testid="text-weekly-steps-total">Not logged</strong>}
                <p><span data-testid="text-weekly-step-days">{insight.stepDaysLogged} {insight.stepDaysLogged === 1 ? 'day' : 'days'} with steps recorded</span> <span aria-hidden="true">·</span> <span data-testid="text-weekly-step-goal-days">{insight.stepGoalDays} {insight.stepGoalDays === 1 ? 'day' : 'days'} met your daily goal</span></p>
              </div>
              <DetailLink onClick={() => onNavigate('steps')} testId="button-view-movement">Movement details</DetailLink>
            </div>

            <div className="wi-chart-heading">
              <span>MONDAY — SUNDAY</span>
              {insight.targets.steps > 0 && <span><i className="wi-legend-line" /> Daily goal: {number(insight.targets.steps)}</span>}
            </div>
            <div className="wi-chart" role="list" aria-label={`Daily recorded steps for ${insight.rangeLabel}`} data-testid="chart-weekly-steps">
              {insight.targets.steps > 0 && <div className="wi-goal-rule" style={{ bottom: `calc(53px + 100px * ${goalPosition / 100})` }} aria-hidden="true" />}
              {insight.days.map((day) => {
                const recorded = day.steps !== null && !day.isFuture;
                const chartLabel = day.isFuture ? 'upcoming' : !recorded ? 'not logged' : `${number(day.steps!)} steps recorded${day.steps! === 0 ? ', recorded zero' : ''}`;
                return (
                  <div className={`wi-day${day.isFuture ? ' wi-day-future' : ''}${!recorded && !day.isFuture ? ' wi-day-missing' : ''}`} role="listitem" aria-label={`${day.label}, ${day.dateLabel}: ${chartLabel}`} key={day.key} data-testid={`bar-weekly-steps-${day.key}`}>
                    <div className="wi-day-value" aria-hidden="true">{day.isFuture ? '·' : !recorded ? '—' : day.steps === 0 ? '0' : number(day.steps!)}</div>
                    <div className="wi-bar-area" aria-hidden="true">
                      {recorded ? <span className={`wi-bar${day.steps === 0 ? ' wi-bar-zero' : ''}`} style={{ height: day.steps === 0 ? '3px' : `${Math.max(3, day.steps! / chartMax * 100)}%` }} /> : <span className="wi-bar-unlogged" />}
                    </div>
                    <span className="wi-day-label" aria-hidden="true">{day.label}</span>
                    <small aria-hidden="true">{day.dateLabel}</small>
                  </div>
                );
              })}
            </div>
            <p className="wi-chart-note"><span className="wi-note-dash" aria-hidden="true" /> A dash means no steps were logged; a zero means you recorded zero. Future days are unfilled.</p>
          </section>

          <div className="wi-section-heading">
            <div><span className="wi-small-label">THE REST OF THE STORY</span><h2>More than a step count.</h2></div>
            <span>From your journal only</span>
          </div>

          <div className="wi-detail-grid">
            <section className="wi-detail wi-water" aria-labelledby="wi-water-title" data-testid="card-weekly-water">
              <div className="wi-detail-icon"><Droplets size={19} strokeWidth={1.8} aria-hidden="true" /></div>
              <div className="wi-detail-kicker">HYDRATION / 02</div>
              <h3 id="wi-water-title">A glass at a time.</h3>
              <strong className="wi-detail-number" data-testid="text-weekly-water-days">{insight.waterDaysLogged > 0 ? number(insight.waterDaysLogged) : '—'}<small>{insight.waterDaysLogged > 0 ? 'days logged' : 'not logged'}</small></strong>
              <p>{insight.waterDaysLogged > 0 ? <><span data-testid="text-weekly-water-goal-days">{insight.waterGoalDays} {insight.waterGoalDays === 1 ? 'day' : 'days'}</span> reached your {number(insight.targets.waterMl)} ml daily goal.</> : 'No water entries for this week. This is a log, not a measure of what you drank.'}</p>
              <WeekMicrochart days={insight.days} metric="water" />
              <DetailLink onClick={() => onNavigate('macros')} testId="button-view-hydration">Log water</DetailLink>
            </section>

            <section className="wi-detail wi-nutrition" aria-labelledby="wi-nutrition-title" data-testid="card-weekly-nutrition">
              <div className="wi-detail-icon"><NotebookPen size={19} strokeWidth={1.8} aria-hidden="true" /></div>
              <div className="wi-detail-kicker">NUTRITION / 03</div>
              <h3 id="wi-nutrition-title">What made the log.</h3>
              <strong className="wi-detail-number" data-testid="text-weekly-meals-logged">{insight.mealsLogged > 0 ? number(insight.mealsLogged) : '—'}<small>{insight.mealsLogged > 0 ? (insight.mealsLogged === 1 ? 'meal logged' : 'meals logged') : 'not logged'}</small></strong>
              <p>{insight.mealsLogged > 0 ? <><span data-testid="text-weekly-calories-logged">{number(insight.calorieLoggedTotal)} kcal</span> across <span data-testid="text-weekly-nutrition-days">{insight.nutritionDaysLogged} {insight.nutritionDaysLogged === 1 ? 'day' : 'days'}</span> with entries. Logged food only, not a full-day intake or goal score.</> : 'No meals logged for this week. Your food choices cannot be inferred from an empty journal.'} Older imported meal dates may be approximate.</p>
              <WeekMicrochart days={insight.days} metric="nutrition" />
              <DetailLink onClick={() => onNavigate('macros')} testId="button-view-nutrition">Nutrition log</DetailLink>
            </section>
          </div>

          <section className="wi-strength" aria-labelledby="wi-strength-title" data-testid="card-weekly-strength">
            <div className="wi-strength-icon"><Dumbbell size={21} strokeWidth={1.8} aria-hidden="true" /></div>
            <div className="wi-strength-copy">
              <span className="wi-small-label">STRENGTH / 04</span>
              <h3 id="wi-strength-title">{insight.workoutSets > 0 ? 'The work you put in.' : 'Room for strength, when you’re ready.'}</h3>
              <p>{insight.workoutSets > 0 ? <><span data-testid="text-weekly-workout-sets">{number(insight.workoutSets)} {insight.workoutSets === 1 ? 'set' : 'sets'}</span> logged across <span data-testid="text-weekly-workout-days">{insight.workoutDays} {insight.workoutDays === 1 ? 'day' : 'days'}</span> this week.</> : 'No sets logged this week; that tells us nothing about activity outside this journal.'}</p>
            </div>
            <WeekMicrochart days={insight.days} metric="strength" />
            <DetailLink onClick={() => onNavigate('workout')} testId="button-view-strength">{insight.workoutSets > 0 ? 'View strength' : 'Log a set'}</DetailLink>
          </section>

          {insight.takeaway && (
            <aside className="wi-takeaway" aria-label="Weekly takeaway" data-testid="card-weekly-takeaway">
              <span className="wi-takeaway-icon"><Sparkles size={18} strokeWidth={1.8} aria-hidden="true" /></span>
              <div><span className="wi-small-label">A NOTE TO TAKE WITH YOU</span><p data-testid="text-weekly-takeaway">{insight.takeaway}</p></div>
            </aside>
          )}
          <p className="wi-footer">Your week, as recorded. Not a verdict on your progress.</p>
        </>
      )}
    </div>
  );
}