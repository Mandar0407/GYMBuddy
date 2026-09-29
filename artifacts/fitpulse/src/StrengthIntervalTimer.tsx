import { plainText } from './inputSafety';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookmarkPlus, Check, Clock3, Dumbbell, Minus, Pause, Play, Plus, RotateCcw, SkipForward, Trash2, Volume2, VolumeX, X } from 'lucide-react';
import './strength-interval-timer.css';

type Settings = { sets: number; work: number; rest: number; skipLastRest: boolean };
type SavedPreset = Settings & { id: string; name: string };
type Phase = 'prepare' | 'work' | 'rest' | 'complete';
type Session = {
  phase: Phase;
  setIndex: number;
  remainingMs: number;
  deadline: number;
  running: boolean;
  settings: Settings;
};

const STORAGE_KEY = 'fitpulse-strength-interval-presets-v1';
const PREPARE_SECONDS = 5;
const DEFAULT_SETTINGS: Settings = { sets: 4, work: 40, rest: 90, skipLastRest: true };
const BUILT_INS = [
  { id: 'heavy', name: 'Heavy Strength', detail: '3:00 rest', settings: { sets: 5, work: 45, rest: 180, skipLastRest: true } },
  { id: 'hypertrophy', name: 'Hypertrophy', detail: '1:30 rest', settings: { sets: 4, work: 40, rest: 90, skipLastRest: true } },
  { id: 'tabata', name: 'HIIT Tabata', detail: '0:20 / 0:10', settings: { sets: 8, work: 20, rest: 10, skipLastRest: true } },
] as const;

function formatTime(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function validSettings(value: unknown): value is Settings {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<Settings>;
  return Number.isInteger(v.sets) && v.sets! >= 1 && v.sets! <= 30
    && Number.isInteger(v.work) && v.work! >= 5 && v.work! <= 3599
    && Number.isInteger(v.rest) && v.rest! >= 0 && v.rest! <= 3599
    && typeof v.skipLastRest === 'boolean';
}

function readPresets(): SavedPreset[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(data)) return [];
    return data.filter((item): item is SavedPreset =>
      validSettings(item) && typeof (item as Partial<SavedPreset>).id === 'string'
      && typeof (item as Partial<SavedPreset>).name === 'string'
      && plainText((item as SavedPreset).name, 32).length > 0,
    ).slice(0, 30).map((item) => ({ ...item, name: plainText(item.name, 32) }));
  } catch {
    return [];
  }
}

/** Advances against the original deadline so returning from a background tab never stretches a round. */
function advance(session: Session): Session {
  const { settings } = session;
  if (session.phase === 'prepare') return { ...session, phase: 'work', remainingMs: settings.work * 1000, deadline: session.deadline + settings.work * 1000 };
  if (session.phase === 'work' && settings.rest > 0 && (session.setIndex < settings.sets || !settings.skipLastRest)) {
    return { ...session, phase: 'rest', remainingMs: settings.rest * 1000, deadline: session.deadline + settings.rest * 1000 };
  }
  if (session.setIndex < settings.sets) return { ...session, phase: 'work', setIndex: session.setIndex + 1, remainingMs: settings.work * 1000, deadline: session.deadline + settings.work * 1000 };
  return { ...session, phase: 'complete', remainingMs: 0, running: false };
}

function Stepper({ label, value, min, max, step, hint, onChange, testId }: {
  label: string; value: number; min: number; max: number; step: number; hint: string;
  onChange: (value: number) => void; testId: string;
}) {
  return (
    <div className="sit-control" role="group" aria-label={label}>
      <label>{label}</label>
      <div className="sit-control-row">
        <button className="sit-step" type="button" aria-label={`Decrease ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))} data-testid={`button-decrease-${testId}`}><Minus size={13} /></button>
        <output data-testid={`text-${testId}`}>{testId === 'sets' ? String(value).padStart(2, '0') : formatTime(value)}</output>
        <button className="sit-step" type="button" aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))} data-testid={`button-increase-${testId}`}><Plus size={13} /></button>
      </div>
      <small>{hint}</small>
    </div>
  );
}

/**
 * Mount this component in a persistent parent shell (outside route/page switches)
 * if a running session must survive navigation; the active screen portals to body.
 */
export default function StrengthIntervalTimer() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [selected, setSelected] = useState('');
  const [presets, setPresets] = useState<SavedPreset[]>(readPresets);
  const [presetName, setPresetName] = useState('');
  const [error, setError] = useState('');
  const [soundOn, setSoundOn] = useState(true);
  const [view, setView] = useState<Session | null>(null);
  const engineRef = useRef<Session | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const soundRef = useRef(soundOn);
  const lastBeepRef = useRef('');
  const overlayRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  soundRef.current = soundOn;

  const unlockAudio = (force = false) => {
    if (!soundRef.current && !force) return;
    try {
      audioRef.current ??= new AudioContext();
      if (audioRef.current.state === 'suspended') void audioRef.current.resume().catch(() => {});
    } catch {
      // Audio is optional when Web Audio is unavailable.
    }
  };

  const beep = (count: number) => {
    const ctx = audioRef.current;
    if (!ctx || ctx.state !== 'running' || !soundRef.current) return;
    try {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = count === 1 ? 880 : 620;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.13, ctx.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.14);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.15);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    } catch {
      // Do not interrupt a workout if audio is blocked by the browser.
    }
  };

  useEffect(() => {
    const tick = () => {
      const current = engineRef.current;
      if (!current?.running) return;
      const now = Date.now();
      let next = current;
      let transitions = 0;
      while (next.running && now >= next.deadline && transitions++ < 1000) next = advance(next);
      if (next.running) next = { ...next, remainingMs: Math.max(0, next.deadline - now) };
      engineRef.current = next;
      const seconds = Math.ceil(next.remainingMs / 1000);
      if ((next.phase === 'work' || next.phase === 'rest') && seconds >= 1 && seconds <= 3) {
        const key = `${next.setIndex}-${next.phase}-${seconds}`;
        if (lastBeepRef.current !== key) { lastBeepRef.current = key; beep(seconds); }
      }
      setView(next);
    };
    const interval = window.setInterval(tick, 100);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', tick);
      engineRef.current = null;
      if (audioRef.current) void audioRef.current.close().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!view) return;
    const previousOverflow = document.body.style.overflow;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    overlayRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !overlayRef.current) return;
      const items = Array.from(overlayRef.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === overlayRef.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [Boolean(view)]);

  const changeSetting = (key: keyof Settings, value: number | boolean) => {
    setSettings(previous => ({ ...previous, [key]: value }));
    setSelected('');
  };
  const choosePreset = (id: string, next: Settings) => {
    setSettings({ ...next }); setSelected(id); setError('');
  };
  const savePreset = () => {
    const name = plainText(presetName, 32);
    if (!name) { setError('Give your routine a name first.'); return; }
    if (name.length > 32) { setError('Keep the name to 32 characters or fewer.'); return; }
    if (presets.some(item => item.name.toLowerCase() === name.toLowerCase())) { setError('A routine with that name already exists.'); return; }
    if (presets.length >= 30) { setError('You can save up to 30 routines. Delete one to make room.'); return; }
    const item: SavedPreset = { ...settings, id: crypto.randomUUID(), name };
    const next = [...presets, item];
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }
    catch { setError('Could not save this routine on this device.'); return; }
    setPresets(next); setPresetName(''); setSelected(item.id); setError('');
  };
  const deletePreset = (id: string) => {
    const item = presets.find(preset => preset.id === id);
    if (!item || !window.confirm(`Delete “${item.name}” from your saved routines?`)) return;
    const next = presets.filter(preset => preset.id !== id);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }
    catch { setError('Could not delete this routine on this device.'); return; }
    setPresets(next); if (selected === id) setSelected(''); setError('');
  };
  const start = () => {
    unlockAudio();
    lastBeepRef.current = '';
    const next: Session = {
      phase: 'prepare', setIndex: 1, remainingMs: PREPARE_SECONDS * 1000,
      deadline: Date.now() + PREPARE_SECONDS * 1000, running: true, settings: { ...settings },
    };
    engineRef.current = next; setView(next);
  };
  const pauseOrResume = () => {
    const current = engineRef.current;
    if (!current || current.phase === 'complete') return;
    if (current.running) {
      const next = { ...current, running: false, remainingMs: Math.max(0, current.deadline - Date.now()) };
      engineRef.current = next; setView(next);
    } else {
      unlockAudio();
      const next = { ...current, running: true, deadline: Date.now() + current.remainingMs };
      engineRef.current = next; setView(next);
    }
  };
  const skipSet = () => {
    const current = engineRef.current;
    if (!current || current.phase === 'complete') return;
    lastBeepRef.current = '';
    const next: Session = current.setIndex >= current.settings.sets
      ? { ...current, phase: 'complete', remainingMs: 0, running: false }
      : { ...current, phase: 'work', setIndex: current.setIndex + 1, running: current.running,
        remainingMs: current.settings.work * 1000, deadline: Date.now() + current.settings.work * 1000 };
    engineRef.current = next; setView(next);
  };
  const reset = () => {
    engineRef.current = null; lastBeepRef.current = ''; setView(null);
  };

  const seconds = view ? Math.ceil(view.remainingMs / 1000) : 0;
  const phaseDuration = view ? view.phase === 'prepare' ? PREPARE_SECONDS : view.phase === 'work' ? view.settings.work : view.phase === 'rest' ? view.settings.rest : 1 : 1;
  const progress = view ? view.phase === 'complete' ? 100 : Math.max(0, Math.min(100, (1 - view.remainingMs / (phaseDuration * 1000)) * 100)) : 0;
  const phaseHeadline = view?.phase === 'prepare' ? 'GET READY' : view?.phase === 'work' ? 'GO!' : view?.phase === 'rest' ? 'REST' : 'WELL DONE';

  return (
    <section className="sit" aria-label="Interval and rest timer" data-testid="section-strength-interval-timer">
      <div className="sit-card">
        <div className="sit-head">
          <div>
            <p className="sit-kicker"><Clock3 size={13} /> Your training rhythm</p>
            <h2>Intervals & rest.</h2>
            <p>Find your pace. We’ll watch the clock while you focus on the next rep.</p>
          </div>
          <span className="sit-head-mark" aria-hidden="true"><Dumbbell size={19} /></span>
        </div>

        <div className="sit-presets">
          <span className="sit-section-label">A good place to start</span>
          <div className="sit-preset-list" role="group" aria-label="Ready-made routines">
            {BUILT_INS.map(preset => (
              <button key={preset.id} type="button" className={`sit-preset${selected === preset.id ? ' is-selected' : ''}`}
                aria-pressed={selected === preset.id} onClick={() => choosePreset(preset.id, preset.settings)}
                data-testid={`button-preset-${preset.id}`}>
                <strong>{preset.name}</strong><small>{preset.detail}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="sit-controls">
          <Stepper label="Sets" value={settings.sets} min={1} max={30} step={1} hint="up to 30" testId="sets" onChange={value => changeSetting('sets', value)} />
          <Stepper label="Work" value={settings.work} min={5} max={3599} step={5} hint="min : sec" testId="work" onChange={value => changeSetting('work', value)} />
          <Stepper label="Rest" value={settings.rest} min={0} max={3599} step={5} hint="min : sec" testId="rest" onChange={value => changeSetting('rest', value)} />
        </div>

        <button className="sit-option" type="button" role="switch" aria-checked={settings.skipLastRest}
          onClick={() => changeSetting('skipLastRest', !settings.skipLastRest)} data-testid="switch-skip-last-rest">
          <span className="sit-option-copy"><strong>Skip the last rest</strong><small>Finish right after your final work set.</small></span>
          <span className="sit-switch" aria-hidden="true" />
        </button>

        <div className="sit-save">
          <input aria-label="Name your custom routine" maxLength={33} value={presetName}
            onChange={event => { setPresetName(event.target.value); setError(''); }}
            onKeyDown={event => { if (event.key === 'Enter') savePreset(); }}
            placeholder="Name your own routine" data-testid="input-preset-name" />
          <button type="button" onClick={savePreset} data-testid="button-save-preset"><BookmarkPlus size={14} /> Save routine</button>
        </div>
        {error && <p className="sit-error" role="alert" data-testid="status-preset-error">{error}</p>}
        {presets.length > 0 && (
          <div className="sit-custom" role="group" aria-label="Saved routines">
            {presets.map(preset => (
              <div className={`sit-custom-item${selected === preset.id ? ' is-selected' : ''}`} key={preset.id}>
                <button className="sit-custom-load" type="button" aria-pressed={selected === preset.id}
                  onClick={() => choosePreset(preset.id, preset)} title={`Load ${preset.name}`}
                  data-testid={`button-load-preset-${preset.id}`}>{preset.name}</button>
                <button className="sit-custom-delete" type="button" aria-label={`Delete ${preset.name}`}
                  onClick={() => deletePreset(preset.id)} data-testid={`button-delete-preset-${preset.id}`}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        )}
        <div className="sit-footer">
          <button className="sit-start" type="button" onClick={start} data-testid="button-start-interval">
            <Play size={17} fill="currentColor" /> START TIMER
          </button>
          <p>Includes a five-second get-ready count. Audio cues in the last three seconds.</p>
        </div>
      </div>

      {view && createPortal(
        <div ref={overlayRef} tabIndex={-1} className="sit-overlay" data-phase={view.phase}
          role="dialog" aria-modal="true" aria-label="Strength interval timer" data-testid="dialog-interval-timer">
          <div className="sit-overlay-top">
            <div className="sit-overlay-brand"><Dumbbell size={19} /> GYM Buddy <span style={{ color: '#a69b8d', fontWeight: 500 }}> / Strength</span></div>
            <button type="button" onClick={reset} data-testid="button-close-interval"><X size={16} /> End session</button>
          </div>
          <main className="sit-overlay-main">
            <div className="sit-status" data-testid="status-interval-phase" aria-live="polite">
              <span className="sit-status-dot" /> {view.phase === 'complete' ? 'Session complete' : view.running ? `${view.phase} · Session in progress` : `${view.phase} · Session paused`}
            </div>
            <h2 data-testid="text-interval-headline">{view.phase !== 'complete' && !view.running ? 'PAUSED' : phaseHeadline}</h2>
            <div className="sit-dial" style={{ '--sit-progress': `${progress}%` } as CSSProperties}>
              <div className="sit-dial-inner">
                <small>{view.phase === 'complete' ? 'ALL DONE' : view.phase === 'prepare' ? 'STARTING IN' : view.phase === 'rest' ? 'BREATHE EASY' : 'KEEP MOVING'}</small>
                <strong data-testid="text-interval-countdown" aria-label={`${Math.floor(seconds / 60)} minutes ${seconds % 60} seconds remaining`}>
                  {view.phase === 'complete' ? <Check size={73} strokeWidth={2.5} /> : formatTime(seconds)}
                </strong>
                <span>{view.phase === 'complete' ? 'You showed up.' : `Set ${view.setIndex} of ${view.settings.sets}`}</span>
              </div>
            </div>
            <p className="sit-overlay-sub" data-testid="text-interval-message">
              {view.phase === 'complete' ? 'Every set counts. Take that good feeling with you.' :
                !view.running ? 'Take your time. Pick up right where you left off.' :
                view.phase === 'prepare' ? 'Set your stance. Your first interval is nearly here.' :
                view.phase === 'work' ? 'One rep at a time. You’ve got this.' : 'Catch your breath. Your next set is coming.'}
            </p>
            <div className="sit-progress" aria-label={`Set ${view.setIndex} of ${view.settings.sets}`}>
              <div className="sit-progress-top"><strong>YOUR SETS</strong><span data-testid="text-interval-set-progress">{Math.min(view.setIndex, view.settings.sets)} / {view.settings.sets}</span></div>
              <div className="sit-segments" aria-hidden="true">
                {Array.from({ length: view.settings.sets }, (_, index) => (
                  <span key={index} className={`sit-segment${view.phase === 'complete' || index < view.setIndex - 1 ? ' is-done' : index === view.setIndex - 1 ? ' is-current' : ''}`} />
                ))}
              </div>
            </div>
            <div className="sit-overlay-actions">
              {view.phase === 'complete' ? (
                <>
                  <button className="sit-action-main" type="button" onClick={start} data-testid="button-repeat-interval"><Play size={15} /> Go again</button>
                  <button type="button" onClick={reset} data-testid="button-finish-interval"><Check size={15} /> Done</button>
                </>
              ) : (
                <>
                  <button className="sit-action-main" type="button" onClick={pauseOrResume} data-testid={view.running ? 'button-pause-interval' : 'button-resume-interval'}>
                    {view.running ? <><Pause size={15} /> Pause</> : <><Play size={15} /> Resume</>}
                  </button>
                  <button type="button" onClick={skipSet} data-testid="button-skip-interval-set"><SkipForward size={15} /> Skip set</button>
                  <button type="button" onClick={reset} data-testid="button-reset-interval"><RotateCcw size={15} /> Reset</button>
                </>
              )}
              <button type="button" onClick={() => { if (!soundOn) unlockAudio(true); setSoundOn(value => !value); }}
                aria-label={soundOn ? 'Mute countdown beeps' : 'Turn on countdown beeps'}
                aria-pressed={soundOn} data-testid="button-toggle-interval-sound">
                {soundOn ? <Volume2 size={15} /> : <VolumeX size={15} />} {soundOn ? 'Sound on' : 'Sound off'}
              </button>
            </div>
          </main>
          <div className="sit-overlay-foot">Your pace is enough. Keep going.</div>
        </div>,
        document.body,
      )}
    </section>
  );
}