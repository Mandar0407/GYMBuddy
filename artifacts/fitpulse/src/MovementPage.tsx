import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Activity, BarChart3, Check, Info, Plus, RotateCcw, Settings2, X } from 'lucide-react';
import type { MotionStatus } from './useMotionSteps';
import { WorkoutSelectionCards, WorkoutSessionHistory } from './LiveWorkoutUI';
import type { WorkoutHistoryEntry, WorkoutKind } from './useWorkoutSessions';

type Props = {
  onStartWorkout: (kind: WorkoutKind) => void;
  workoutActive: boolean;
  workoutSessions: WorkoutHistoryEntry[];
  steps: Record<string, number>;
  hourlySteps: number[];
  todaySteps: number;
  currentDate: string;
  target: number;
  weightKg: number;
  heightCm: number;
  strideCm: number;
  strideOverrideCm: number | null;
  motionStatus: MotionStatus;
  storageError: boolean;
  pairedKey: string;
  pairedError: string;
  pairedBusy: boolean;
  onPair: () => void;
  onStartTracking: () => void;
  onStopTracking: () => void;
  onChange: (amount: number) => void;
  onSaveSettings: (goal: number, strideOverride: number | null, weight: number, height: number) => void;
};

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function weekInMotion(currentDate: string, steps: Record<string, number>) {
  const monday = new Date(`${currentDate}T12:00:00`);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const key = dateKey(date);
    return {
      key,
      label: new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date),
      dateLabel: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date),
      value: Math.max(0, steps[key] ?? 0),
      future: key > currentDate,
    };
  });
}

function compactSteps(value: number) {
  return value >= 1000 ? `${Number((value / 1000).toFixed(1))}k` : value.toLocaleString();
}

function hourLabel(hour: number) {
  return `${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}`;
}

export default function MovementPage({
  onStartWorkout, workoutActive, workoutSessions,
  steps, hourlySteps, todaySteps, currentDate, target, weightKg, heightCm, strideCm, strideOverrideCm,
  motionStatus, storageError, pairedKey, pairedError, pairedBusy, onPair, onStartTracking, onStopTracking, onChange, onSaveSettings,
}: Props) {
  const [customSteps, setCustomSteps] = useState('');
  const [customError, setCustomError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const progress = Math.round((todaySteps / target) * 100);
  const distanceKm = todaySteps * strideCm / 100000;
  // Net walking energy: about 0.53 active kcal per kg of body weight per km.
  const activeCalories = distanceKm * weightKg * 0.53;
  const calorieLabel = activeCalories === 0 ? '0' : activeCalories < 10 ? activeCalories.toFixed(1) : Math.round(activeCalories).toLocaleString();
  const days = weekInMotion(currentDate, steps);
  const hourlyTotal = hourlySteps.reduce((sum, count) => sum + count, 0);
  const unassignedSteps = Math.max(0, todaySteps - hourlyTotal);
  const hourCeiling = Math.max(1, ...hourlySteps) * 1.1;
  const chartCeiling = Math.max(target, ...days.map((day) => day.value), 1) * 1.12;
  const goalLineTop = 100 - target / chartCeiling * 100;
  const motionCopy: Record<MotionStatus, string> = {
    idle: 'Start live tracking to count steps from your phone’s movement.',
    requesting: 'Waiting for motion permission and the first sensor reading…',
    active: 'Live tracking is on. Steps update as walking peaks are detected.',
    paused: 'Tracking was paused by a refresh or a hidden tab. Tap Resume to continue.',
    denied: 'Motion access was denied. Allow it in your browser settings or add steps manually.',
    unsupported: 'No usable motion sensor readings were found. You can still add steps manually.',
  };

  const addCustomSteps = (event: FormEvent) => {
    event.preventDefault();
    const amount = Number(customSteps);
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 100000) {
      setCustomError('Enter a whole number between 1 and 100,000.');
      return;
    }
    onChange(amount);
    setCustomSteps('');
    setCustomError('');
  };

  return (
    <>
      <header className="page-header">
        <div><div className="eyebrow">Movement · Today</div><h1>Take the long way.</h1><p>Steps are not a score. They are a gentle vote for more energy.</p></div>
        <div className="header-date"><strong data-testid="text-step-progress">{progress}% of goal</strong>{target.toLocaleString()} steps planned</div>
      </header>
      {storageError && <p className="movement-storage-error" role="alert">This browser is blocking local storage. Your changes will not survive a refresh until storage is enabled.</p>}
      <WorkoutSelectionCards onStart={onStartWorkout} disabled={workoutActive} />
      <WorkoutSessionHistory sessions={workoutSessions} />
      <section className="panel" style={{ marginBottom: 22, padding: 22 }}>
        <div className="section-label">GYM Buddy mobile</div>
        <h3>Keep your steps together</h3>
        <p>On iPhone, the companion reads device step history when opened, including walks while the screen was locked. Android locked-screen history is not available in this version.</p>
        {pairedKey ? (
          <>
            <p>Enter this private pairing key in GYM Buddy Mobile. It is saved in this browser and visible to anyone with access to its browser storage. Anyone with the key can see and change your movement data; use a trusted device.</p>
            <code style={{ overflowWrap: 'anywhere', display: 'block', padding: 12, background: 'hsl(var(--muted))', borderRadius: 10 }} data-testid="movement-pairing-key">{pairedKey}</code>
            <p>When phone data arrives, it replaces older browser-estimated steps for the same day to avoid double-counting. Manual steps added after pairing are kept separately. Previous browser entries for that day cannot be identified as manual and are not carried into the paired total.</p>
          </>
        ) : <button type="button" className="button-primary" onClick={onPair} disabled={pairedBusy} data-testid="button-pair-mobile">Create pairing key</button>}
        {pairedError && <p role="alert" className="error-text">{pairedError}</p>}
      </section>

      <section className="panel steps-hero">
        <div className="steps-overview">
          <div className="section-label">Today’s movement</div>
          <div className="steps-number" data-testid="text-step-total" aria-live="polite">{todaySteps.toLocaleString()} <span>steps</span></div>
          <div className="steps-track" role="progressbar" aria-label="Daily step goal" aria-valuenow={Math.min(todaySteps, target)} aria-valuemin={0} aria-valuemax={target} aria-valuetext={`${todaySteps.toLocaleString()} steps, ${progress}% of goal`}><div className="steps-fill" style={{ width: `${Math.min(100, progress)}%` }} /></div>
          <div className="steps-goal-copy"><span>0</span><span data-testid="text-step-goal">{target.toLocaleString()} goal</span></div>
          <div className="movement-stats">
            <div className="movement-stat"><strong data-testid="text-metric-steps">{todaySteps.toLocaleString()}</strong><span>Total steps</span></div>
            <div className="movement-stat"><strong data-testid="text-estimated-distance">{distanceKm.toFixed(2)} <small>km</small></strong><span>Estimated distance</span></div>
            <div className="movement-stat movement-stat-calories"><strong data-testid="text-active-calories">{calorieLabel} <small>kcal</small></strong><span>Estimated calories burned</span></div>
          </div>
          <p className="movement-estimate-note">Estimates use a {strideCm} cm stride and {weightKg} kg body weight.</p>
        </div>

        <div className="steps-controls">
          <div className="steps-controls-heading">
            <div className="section-label">Quick add</div>
            <button type="button" className="movement-settings-link" ref={settingsButtonRef} onClick={() => setSettingsOpen(true)} data-testid="button-edit-movement-goal"><Settings2 size={15} /> Edit goal &amp; estimates</button>
          </div>
          <div className="step-actions">
            {[500, 1000, 2500].map((amount) => (
              <button className="button-quiet" type="button" key={amount} onClick={() => onChange(amount)} data-testid={`button-add-${amount}-steps`}>
                <Plus size={16} /> {amount.toLocaleString()} <span>steps</span>
              </button>
            ))}
            <button className="button-danger" type="button" onClick={() => onChange(-todaySteps)} disabled={!todaySteps || pairedBusy} data-testid="button-reset-steps"><RotateCcw size={15} /> {pairedKey ? 'Clear manual' : 'Reset'} <span>today</span></button>
          </div>
          <form className="custom-steps-form" onSubmit={addCustomSteps} noValidate>
            <label htmlFor="custom-step-count">Or enter a custom step count</label>
            <div className="custom-steps-row">
              <input id="custom-step-count" type="number" inputMode="numeric" min="1" max="100000" step="1" placeholder="e.g. 750" value={customSteps} onChange={(event) => { setCustomSteps(event.target.value); setCustomError(''); }} aria-invalid={!!customError} aria-describedby={customError ? 'custom-steps-error' : undefined} data-testid="input-custom-steps" />
              <button className="button-primary" type="submit" disabled={pairedBusy} data-testid="button-add-custom-steps"><Plus size={16} /> Add steps</button>
            </div>
            {customError && <p className="error-text" id="custom-steps-error" role="alert">{customError}</p>}
          </form>
        </div>
      </section>

      {!pairedKey && <section className="panel motion-panel" style={{ marginTop: 22 }}>
        <div className="motion-copy">
          <div className={`motion-indicator${motionStatus === 'active' ? ' active' : ''}`} data-testid="status-motion-tracking"><Activity size={17} /><span>{motionStatus === 'active' ? 'Active Motion Sensor' : motionStatus === 'paused' ? 'Sensor paused' : 'Motion sensor'}</span></div>
          <h3>Count steps as you move</h3>
          <p aria-live="polite">{motionCopy[motionStatus]}</p>
          <small>Keep this tab visible while you walk. Motion estimates can vary by phone and placement.</small>
        </div>
        <div className="motion-actions">
          {motionStatus === 'active' ? (
            <button className="button-danger motion-button-live" type="button" onClick={onStopTracking} aria-label="Stop live tracking" data-testid="button-stop-live-tracking"><span className="motion-live-dot" aria-hidden="true" /> Live · Stop tracking</button>
          ) : (
            <>
              <button className="button-primary" type="button" onClick={onStartTracking} disabled={motionStatus === 'requesting'} data-testid="button-start-live-tracking"><Activity size={16} /> {motionStatus === 'requesting' ? 'Connecting…' : motionStatus === 'paused' ? 'Resume Live Step Tracking' : 'Enable Live Step Tracking'}</button>
              {(motionStatus === 'paused' || motionStatus === 'requesting') && <button className="button-quiet" type="button" onClick={onStopTracking} data-testid="button-cancel-live-tracking">Stop</button>}
            </>
          )}
        </div>
      </section>}

      <section className="panel movement-hourly-panel" style={{ marginTop: 22 }} aria-labelledby="movement-hourly-heading">
        <div className="panel-header">
          <div><div className="section-label">Daily activity</div><h3 id="movement-hourly-heading">Steps by hour</h3><p>See when your movement happened today.</p></div>
          <div className="hourly-count"><strong data-testid="text-hourly-steps">{hourlyTotal.toLocaleString()}</strong><span>timed steps</span></div>
        </div>
        <div className="hourly-chart" role="list" aria-label={`Hourly step activity for ${currentDate}`} data-testid="chart-hourly-steps">
          <div className="hourly-grid" aria-hidden="true" />
          {hourlySteps.map((count, hour) => (
            <div className={`hourly-column${hour === new Date().getHours() && currentDate === dateKey(new Date()) ? ' is-current' : ''}`}
              key={hour} role="listitem" aria-label={`${hourLabel(hour)}: ${count.toLocaleString()} steps`}
              title={`${hourLabel(hour)} · ${count.toLocaleString()} steps`} data-testid={`bar-hour-${hour}`}>
              <span className="hourly-bar" style={{ height: count > 0 ? `${Math.max(3, count / hourCeiling * 100)}%` : 0 }} />
            </div>
          ))}
          {hourlyTotal === 0 && <p className="hourly-empty" aria-hidden="true">Your first steps will show up here.</p>}
        </div>
        <div className="hourly-axis" aria-hidden="true"><span>12 AM</span><span>6 AM</span><span>12 PM</span><span>6 PM</span></div>
        {unassignedSteps > 0 && <p className="hourly-unassigned" data-testid="text-unassigned-steps">{unassignedSteps.toLocaleString()} earlier steps count toward today’s total but have no saved hour.</p>}
        <p className="hourly-note">{pairedKey ? 'iPhone steps are read by hour when you open the companion. Manual additions are recorded in the hour added.' : 'Live and manually added steps are recorded in the hour they’re added. Estimates depend on your phone’s motion sensor.'}</p>
      </section>

      <section className="panel movement-week-panel" style={{ marginTop: 22 }}>
        <div className="panel-header"><div><h3>Your week in motion</h3><p>Monday–Sunday steps against your {target.toLocaleString()} daily goal.</p></div><BarChart3 size={20} aria-hidden="true" color="hsl(var(--secondary-foreground))" /></div>
        <div className="weekly-legend"><span className="weekly-legend-today" /> Today <span className="weekly-legend-goal" /> Daily goal</div>
        <div className="weekly-bars" role="group" aria-label="Steps for Monday through Sunday">
          <div className="weekly-goal-rule" style={{ top: `${goalLineTop * 1.7}px` }} aria-hidden="true" />
          {days.map((day) => (
            <div className={`day-column${day.key === currentDate ? ' today' : ''}${day.future ? ' future' : ''}`} key={day.key} title={`${day.label}, ${day.dateLabel}: ${day.future ? 'not yet' : `${day.value.toLocaleString()} steps`} / ${target.toLocaleString()} goal`} aria-label={`${day.label}, ${day.dateLabel}: ${day.future ? 'upcoming' : `${day.value.toLocaleString()} steps`} of ${target.toLocaleString()} goal`} aria-current={day.key === currentDate ? 'date' : undefined} data-testid={`bar-steps-${day.key}`}>
              <div className="day-bar-area">
                <strong className="day-value">{day.future ? '—' : compactSteps(day.value)}</strong>
                <div className="day-bar" style={{ height: `${day.value > 0 ? Math.max(2, day.value / chartCeiling * 100) : 0}%` }} />
              </div>
              <span>{day.label}</span><small>{day.dateLabel.split(' ')[1]}</small>
            </div>
          ))}
        </div>
        <div className="helper-note" style={{ marginTop: 20 }}><Info size={16} /> <span>{pairedKey ? 'Paired movement syncs with your phone when it is opened and online. Earlier unpaired history stays in this browser.' : "Today's bar updates from quick adds, custom entries, and live tracking. History stays saved on this device."}</span></div>
      </section>
      {settingsOpen && <MovementSettingsModal target={target} heightCm={heightCm} strideOverrideCm={strideOverrideCm} weightKg={weightKg} onClose={() => setSettingsOpen(false)} onSave={(goal, strideOverride, weight, height) => { onSaveSettings(goal, strideOverride, weight, height); setSettingsOpen(false); }} returnFocusRef={settingsButtonRef} />}
    </>
  );
}

function MovementSettingsModal({
  target, heightCm, strideOverrideCm, weightKg, onClose, onSave, returnFocusRef,
}: {
  target: number;
  heightCm: number;
  strideOverrideCm: number | null;
  weightKg: number;
  onClose: () => void;
  onSave: (goal: number, strideOverride: number | null, weight: number, height: number) => void;
  returnFocusRef: { current: HTMLButtonElement | null };
}) {
  const [goal, setGoal] = useState(String(target));
  const [height, setHeight] = useState(String(heightCm));
  const [strideOverride, setStrideOverride] = useState<string | null>(strideOverrideCm === null ? null : String(strideOverrideCm));
  const [weight, setWeight] = useState(String(weightKg));
  const heightValue = Number(height);
  const autoStride = height !== '' && Number.isFinite(heightValue) && heightValue >= 100 && heightValue <= 230
    ? Math.round(heightValue * 0.415) : null;
  const stride = strideOverride ?? (autoStride === null ? '' : String(autoStride));
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLElement>(null);
  const goalRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    goalRef.current?.focus();
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onCloseRef.current(); return; }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>('button, input');
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keyDown);
    return () => {
      document.removeEventListener('keydown', keyDown);
      returnFocusRef.current?.focus();
    };
  }, [returnFocusRef]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const goalValue = Number(goal);
    const strideValue = Number(stride);
    const weightValue = Number(weight);
    const heightValue = Number(height);
    if (!Number.isSafeInteger(goalValue) || goalValue < 1000 || goalValue > 100000 ||
      stride === '' || !Number.isFinite(strideValue) || strideValue < 30 || strideValue > 150 ||
      height === '' || !Number.isFinite(heightValue) || heightValue < 100 || heightValue > 230 ||
      !Number.isFinite(weightValue) || weightValue < 20 || weightValue > 500) {
      setError('Use a goal of 1,000–100,000 steps, a height of 100–230 cm, a stride of 30–150 cm, and a weight of 20–500 kg.');
      return;
    }
    onSave(goalValue, strideOverride === null ? null : strideValue, weightValue, heightValue);
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal movement-modal" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="movement-settings-title" aria-describedby="movement-settings-description">
        <div className="modal-header">
          <div><h2 id="movement-settings-title">Movement settings</h2><p id="movement-settings-description">Set your daily goal and personalize distance and calorie estimates.</p></div>
          <button className="button-icon button-quiet" type="button" onClick={onClose} aria-label="Close movement settings" data-testid="button-close-movement-settings"><X size={17} /></button>
        </div>
        <form onSubmit={submit} noValidate>
          <div className="form-grid">
            <div className="field full"><label htmlFor="movement-daily-goal">Daily step goal</label><input id="movement-daily-goal" ref={goalRef} type="number" min="1000" max="100000" step="1" value={goal} onChange={(event) => { setGoal(event.target.value); setError(''); }} data-testid="input-movement-goal" /></div>
            <div className="field"><label htmlFor="movement-height">Height (cm)</label><input id="movement-height" type="number" min="100" max="230" step="0.1" value={height} onChange={(event) => { setHeight(event.target.value); setError(''); }} data-testid="input-movement-height" /></div>
            <div className="field"><label htmlFor="movement-weight">Body weight (kg)</label><input id="movement-weight" type="number" min="20" max="500" step="0.1" value={weight} onChange={(event) => { setWeight(event.target.value); setError(''); }} data-testid="input-movement-weight" /></div>
            <div className="field full">
              <label htmlFor="movement-stride">Stride length (cm)</label>
              <div className="movement-stride-row">
                <input id="movement-stride" type="number" min="30" max="150" step="0.1" value={stride} onChange={(event) => { setStrideOverride(event.target.value); setError(''); }} aria-describedby="movement-stride-hint" data-testid="input-movement-stride" />
                <button className="button-quiet" type="button" onClick={() => { setStrideOverride(null); setError(''); }} data-testid="button-reset-stride-auto">Reset to Auto</button>
              </div>
              <small className="field-hint" id="movement-stride-hint">Auto-calculated based on height (Height × 0.415). You can override this value manually.</small>
            </div>
          </div>
          <p className="field-hint movement-form-hint">Active calories use an approximate 0.53 kcal per kg per km. Height and weight also update your profile.</p>
          {error && <p className="error-text" style={{ marginTop: 13 }} role="alert">{error}</p>}
          <div className="form-actions"><button className="button-quiet" type="button" onClick={onClose} data-testid="button-cancel-movement-settings">Cancel</button><button className="button-primary" type="submit" data-testid="button-save-movement-settings"><Check size={15} /> Save settings</button></div>
        </form>
      </section>
    </div>
  );
}