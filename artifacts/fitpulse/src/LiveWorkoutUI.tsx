import { useEffect, useRef, useState } from 'react';
import { Activity, ArrowRight, Dumbbell, Footprints, MapPin, Pause, Play, Square, X } from 'lucide-react';
import type { WorkoutHistoryEntry, WorkoutKind } from './useWorkoutSessions';
import './live-workout.css';

const labels: Record<WorkoutKind, string> = {
  'outdoor-walk': 'Outdoor Walk',
  'indoor-walk': 'Indoor Walk',
  strength: 'Traditional Strength Training',
};
const icons = { 'outdoor-walk': MapPin, 'indoor-walk': Footprints, strength: Dumbbell };
const compactNumber = (n: number) => Math.round(n).toLocaleString('en-US');

function formatWorkoutTime(milliseconds: number) {
  const hundredths = Math.floor(Math.max(0, milliseconds) / 10);
  const hours = Math.floor(hundredths / 360000);
  const minutes = Math.floor(hundredths / 6000) % 60;
  const seconds = Math.floor(hundredths / 100) % 60;
  return `${hours ? `${String(hours).padStart(2, '0')}:` : ''}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths % 100).padStart(2, '0')}`;
}
function distanceLabel(meters: number | null) {
  return meters === null ? { value: '—', unit: 'm' }
    : meters < 1000 ? { value: compactNumber(meters), unit: 'm' }
      : { value: (meters / 1000).toFixed(2), unit: 'km' };
}
function paceLabel(seconds: number | null) {
  if (!seconds || !Number.isFinite(seconds)) return '—';
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}′${String(rounded % 60).padStart(2, '0')}″`;
}
function useWorkoutDialogFocus(open: boolean) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    first.current?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const dialog = first.current?.closest('[role="dialog"]');
      const focusArea = dialog?.querySelector('[role="alertdialog"]') ?? dialog;
      const controls = Array.from(focusArea?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
      if (!controls.length) return;
      const currentIndex = controls.indexOf(document.activeElement as HTMLButtonElement);
      if (event.shiftKey && (currentIndex <= 0)) {
        event.preventDefault();
        controls[controls.length - 1].focus();
      } else if (!event.shiftKey && currentIndex === controls.length - 1) {
        event.preventDefault();
        controls[0].focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', trap);
      previous?.focus();
    };
  }, [open]);
  return first;
}

export function WorkoutSelectionCards({ onStart, disabled = false, compact = false }: {
  onStart: (type: WorkoutKind) => void; disabled?: boolean; compact?: boolean;
}) {
  return (
    <section className={`lw-launch${compact ? ' lw-launch-compact' : ''}`} aria-labelledby={compact ? 'lw-strength-title' : 'lw-movement-title'} data-testid={`section-workout-selection-${compact ? 'strength' : 'movement'}`}>
      <div className="lw-launch-heading">
        <div><span className="lw-eyebrow">LIVE WORKOUTS / ON YOUR TERMS</span><h2 id={compact ? 'lw-strength-title' : 'lw-movement-title'}>Make this one count.</h2></div>
        <span className="lw-launch-caption"><Activity size={14} /> Real time, your pace</span>
      </div>
      <div className="lw-card-grid">
        {(['outdoor-walk', 'indoor-walk', 'strength'] as WorkoutKind[]).map((kind, index) => {
          const Icon = icons[kind];
          return <article className={`lw-card lw-card-${index}`} key={kind} data-testid={`card-workout-${kind}`}>
            <div className="lw-card-top"><span className="lw-card-icon"><Icon size={25} strokeWidth={1.8} /></span><span className="lw-card-index">0{index + 1} / 03</span></div>
            <div className="lw-card-copy"><span>{kind === 'strength' ? 'TRAIN YOUR WAY' : kind === 'indoor-walk' ? 'KEEP MOVING INDOORS' : 'FIND YOUR ROUTE'}</span><h3>{labels[kind]}</h3><p>{kind === 'strength' ? 'Time and estimated energy, no step sensor needed.' : 'Steps, distance, pace and energy when your device provides motion data.'}</p></div>
            <button type="button" className="lw-play" onClick={() => onStart(kind)} disabled={disabled} aria-label={`Start ${labels[kind]} workout`} data-testid={`button-start-workout-${kind}`}><Play size={18} fill="currentColor" /> <span>Start workout</span><ArrowRight size={17} /></button>
          </article>;
        })}
      </div>
    </section>
  );
}

export function WorkoutCountdown({ kind, count, onCancel }: {
  kind: WorkoutKind; count: number; onCancel: () => void;
}) {
  const cancelRef = useWorkoutDialogFocus(true);
  const cancelHandler = useRef(onCancel);
  cancelHandler.current = onCancel;
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') cancelHandler.current(); };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, []);
  return <div className="lw-overlay lw-countdown-overlay" role="dialog" aria-modal="true" aria-label={`${labels[kind]} starting in ${count}`} data-testid="modal-workout-countdown">
    <div className="lw-overlay-glow" aria-hidden="true" />
    <div className="lw-countdown-header"><span className="lw-overlay-brand">fit<span>pulse</span> <i /> LIVE</span><button ref={cancelRef} type="button" className="lw-icon-button" onClick={onCancel} aria-label="Cancel workout countdown" data-testid="button-cancel-workout-countdown"><X size={21} /></button></div>
    <div className="lw-countdown-center">
      <span className="lw-eyebrow">GET READY / {labels[kind].toUpperCase()}</span>
      <div className="lw-countdown-ring" key={count}>
        <svg viewBox="0 0 220 220" aria-hidden="true"><circle cx="110" cy="110" r="96" /><circle className="lw-ring-progress" cx="110" cy="110" r="96" /></svg>
        <strong aria-live="polite" aria-atomic="true" data-testid="text-workout-countdown">{count}</strong>
      </div>
      <h2>Your workout begins now.</h2>
      <p>{kind === 'strength' ? 'Focus on your effort. We’ll keep the clock.' : 'Keep your phone with you for step-based distance and pace.'}</p>
    </div>
    <span className="lw-countdown-foot">BREATHE IN · LET’S MOVE</span>
  </div>;
}

export function LiveWorkoutOverlay({ kind, elapsedMs, distanceMeters, averagePaceSecondsPerKm, activeCalories, totalCalories, steps, motionNote, isPaused, onPause, onResume, onEnd }: {
  kind: WorkoutKind; elapsedMs: number; distanceMeters: number | null; averagePaceSecondsPerKm: number | null;
  activeCalories: number | null; totalCalories: number | null; steps: number; motionNote: string; isPaused: boolean;
  onPause: () => void; onResume: () => void; onEnd: () => void;
}) {
  const [confirmEnd, setConfirmEnd] = useState(false);
  const firstRef = useWorkoutDialogFocus(true);
  const distance = distanceLabel(distanceMeters);
  useEffect(() => {
    if (confirmEnd) document.querySelector<HTMLButtonElement>('[data-testid="button-cancel-end-workout"]')?.focus();
  }, [confirmEnd]);
  useEffect(() => {
    if (!confirmEnd) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setConfirmEnd(false); };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [confirmEnd]);
  return <div className="lw-overlay lw-live" role="dialog" aria-modal="true" aria-labelledby="lw-live-title" data-testid="screen-live-workout">
    <div className="lw-live-inner">
      <header className="lw-live-header"><span className="lw-overlay-brand">fit<span>pulse</span> <i /> LIVE</span><span className={`lw-live-badge${isPaused ? ' is-paused' : ''}`} data-testid="status-live-workout">{isPaused ? 'PAUSED' : 'RECORDING'}</span></header>
      <div className="lw-live-title"><span className="lw-eyebrow">IN SESSION / NO PRESSURE, JUST PROGRESS</span><h1 id="lw-live-title">{labels[kind]}</h1><p>{kind === 'strength' ? 'Strong moments are built one minute at a time.' : 'One step at a time. Keep this tab visible while moving.'}</p></div>
      <div className="lw-live-metrics">
        <div className="lw-primary-metric"><span className="lw-metric-label">{kind === 'strength' ? 'DISTANCE · NOT TRACKED' : 'DISTANCE · STRIDE ESTIMATE'}</span><div><strong data-testid="text-live-distance">{distance.value}</strong><span>{distance.unit}</span></div></div>
        <div className="lw-secondary-metrics">
          <div className="lw-metric"><span className="lw-metric-label">AVERAGE PACE</span><strong data-testid="text-live-pace">{paceLabel(averagePaceSecondsPerKm)}</strong><small>min / km</small></div>
          <div className="lw-metric"><span className="lw-metric-label">DETECTED STEPS</span><strong data-testid="text-live-steps">{compactNumber(steps)}</strong><small>{kind === 'strength' ? 'not tracked' : 'this workout'}</small></div>
          <div className="lw-metric lw-calorie"><span className="lw-metric-label">ACTIVE CALORIES</span><strong data-testid="text-live-active-calories">{activeCalories === null ? '—' : compactNumber(activeCalories)}</strong><small>kcal · estimate</small></div>
          <div className="lw-metric lw-calorie"><span className="lw-metric-label">TOTAL CALORIES</span><strong data-testid="text-live-total-calories">{totalCalories === null ? '—' : compactNumber(totalCalories)}</strong><small>kcal · estimate</small></div>
        </div>
      </div>
      <p className="lw-sensor-note" role="status" data-testid="status-live-sensor"><Activity size={15} />{motionNote}</p>
    </div>
    <div className="lw-control-wrap"><div className="lw-control-bar">
      <div className="lw-elapsed"><span>ELAPSED TIME</span><strong data-testid="text-live-elapsed">{formatWorkoutTime(elapsedMs)}</strong></div>
      <div className="lw-control-actions">
        <button ref={firstRef} type="button" className="lw-pause" onClick={isPaused ? onResume : onPause} data-testid="button-pause-resume-workout">{isPaused ? <Play size={18} fill="currentColor" /> : <Pause size={18} fill="currentColor" />}{isPaused ? 'Resume' : 'Pause'}</button>
        <button type="button" className="lw-end" onClick={() => setConfirmEnd(true)} data-testid="button-end-workout"><Square size={15} fill="currentColor" /> End workout</button>
      </div>
    </div></div>
    {confirmEnd && <div className="lw-end-scrim"><div className="lw-end-dialog" role="alertdialog" aria-modal="true" aria-labelledby="lw-end-heading" aria-describedby="lw-end-desc">
      <span className="lw-eyebrow">ONE LAST THING</span><h2 id="lw-end-heading">Finish this workout?</h2><p id="lw-end-desc">Your elapsed time and recorded metrics will be saved to Movement history.</p>
      <div><button type="button" onClick={() => setConfirmEnd(false)} data-testid="button-cancel-end-workout">Keep going</button><button type="button" onClick={() => { onEnd(); setConfirmEnd(false); }} data-testid="button-confirm-end-workout">Save &amp; end</button></div>
    </div></div>}
  </div>;
}

export function WorkoutSessionHistory({ sessions }: { sessions: WorkoutHistoryEntry[] }) {
  const recent = [...sessions].sort((a, b) => b.endedAt - a.endedAt);
  return <section className="lw-history" aria-labelledby="lw-history-title" data-testid="section-workout-session-history">
    <div className="lw-history-heading"><div><span className="lw-eyebrow">YOUR MOVEMENT JOURNAL</span><h2 id="lw-history-title">Completed sessions.</h2></div><span>{recent.length} SAVED</span></div>
    {recent.length === 0 ? <p className="lw-history-empty">Your finished workouts will appear here. Start with a walk or a strength session above.</p>
      : <div className="lw-history-list">{recent.map((session) => {
        const Icon = icons[session.kind];
        const day = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(session.endedAt));
        return <article className="lw-history-row" key={session.id} data-testid={`row-workout-session-${session.id}`}>
          <span className="lw-history-icon"><Icon size={21} /></span><div><strong>{labels[session.kind]}</strong><span>{day} · {formatWorkoutTime(session.durationMs)}</span></div>
          <div className="lw-history-detail"><strong>{session.distanceMeters === null ? '—' : distanceLabel(session.distanceMeters).value + ' ' + distanceLabel(session.distanceMeters).unit}</strong><span>{session.activeCalories === null ? 'No step estimate' : `${compactNumber(session.activeCalories)} active kcal · est.`}</span></div>
        </article>;
      })}</div>}
  </section>;
}