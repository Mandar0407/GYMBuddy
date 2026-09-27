import { type CSSProperties, type FormEvent, useEffect, useState } from 'react';
import { ArrowRight, Clock3, Moon, Sun } from 'lucide-react';
import './fasting-card.css';

const STORAGE_KEY = 'fitpulse-fasting-session';
const HOUR_MS = 60 * 60 * 1000;

type Session = { startedAt: number; duration: number };
type Plan = '16:8' | '18:6' | 'custom';

function validSession(value: unknown): value is Session {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.startedAt === 'number'
    && Number.isFinite(record.startedAt)
    && record.startedAt > 0
    && record.startedAt <= Date.now()
    && typeof record.duration === 'number'
    && Number.isInteger(record.duration)
    && record.duration >= 1
    && record.duration <= 23;
}

function readSession(): Session | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    const parsed: unknown = JSON.parse(saved);
    if (validSession(parsed)) return { startedAt: parsed.startedAt, duration: parsed.duration };
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Inaccessible or corrupted storage should never prevent the card from rendering.
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* Storage may be unavailable. */ }
  }
  return null;
}

function clockTime(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [hours, minutes, remainder].map((part) => String(part).padStart(2, '0')).join(':');
}

function dateTime(timestamp: number) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(timestamp));
}

export default function FastingCard() {
  const [session, setSession] = useState<Session | null>(readSession);
  const [plan, setPlan] = useState<Plan>('16:8');
  const [customHours, setCustomHours] = useState('14');
  const [now, setNow] = useState(Date.now);
  const [error, setError] = useState('');

  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const interval = window.setInterval(refresh, 1000);
    const onVisibility = () => { if (!document.hidden) refresh(); };
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) {
        setSession(readSession());
        refresh();
      }
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('storage', onStorage);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const customNumber = Number(customHours);
  const customValid = /^\d+$/.test(customHours) && Number.isInteger(customNumber) && customNumber >= 1 && customNumber <= 23;
  const selectedHours = plan === '16:8' ? 16 : plan === '18:6' ? 18 : customNumber;
  const endsAt = session ? session.startedAt + session.duration * HOUR_MS : 0;
  const remaining = session ? Math.max(0, endsAt - now) : 0;
  const complete = !!session && remaining === 0;
  const progress = session ? Math.min(100, Math.max(0, ((now - session.startedAt) / (session.duration * HOUR_MS)) * 100)) : 0;

  function selectPlan(next: Plan) {
    setPlan(next);
    setError('');
  }

  function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (plan === 'custom' && !customValid) {
      setError('Enter a whole number of fasting hours from 1 to 23.');
      return;
    }
    const next = { startedAt: Date.now(), duration: selectedHours };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      setError('This browser could not save your session. Enable storage and try again.');
      return;
    }
    setSession(next);
    setNow(next.startedAt);
    setError('');
  }

  function reset() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      setError('This browser could not clear the saved session. Try again.');
      return;
    }
    setSession(null);
    setNow(Date.now());
    setError('');
  }

  return (
    <section className="fp-fasting" aria-labelledby="fp-fasting-heading" data-testid="card-intermittent-fasting">
      <div className="fp-fasting__top">
        <div>
          <span className="fp-fasting__eyebrow"><Clock3 size={13} aria-hidden="true" /> YOUR OWN RHYTHM</span>
          <h2 id="fp-fasting-heading">Intermittent fasting</h2>
        </div>
        <span className={`fp-fasting__status${complete ? ' is-complete' : session ? ' is-active' : ''}`} role="status" aria-live="polite" data-testid="status-fasting">
          {complete ? 'Window open' : session ? 'In progress' : 'Not started'}
        </span>
      </div>
      <p className="fp-fasting__intro">
        {complete
          ? 'Your planned fasting window has ended. Eat when it works for you.'
          : session
            ? 'Your eating window opens when this countdown reaches zero.'
            : 'A simple timer if you choose to use one. Nothing is running yet.'}
      </p>

      <div className="fp-fasting__body">
        <div
          className="fp-fasting__visual"
          style={{ '--fast-progress': `${progress}%` } as CSSProperties}
          role={session ? 'progressbar' : undefined}
          aria-label={session ? 'Fasting window progress' : undefined}
          aria-valuemin={session ? 0 : undefined}
          aria-valuemax={session ? 100 : undefined}
          aria-valuenow={session ? Math.round(progress) : undefined}
        >
          <div className="fp-fasting__dial-copy">
            {complete ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
            <strong role="timer" data-testid="text-fasting-countdown">
              {session ? complete ? '00:00:00' : clockTime(remaining) : '— —'}
            </strong>
            <span>{complete ? 'Window open' : session ? 'Until eating window' : 'Ready when you are'}</span>
          </div>
        </div>
        <div className="fp-fasting__detail">
          <span className="fp-fasting__detail-label">{session ? 'YOUR WINDOW' : 'A GENTLE START'}</span>
          <h3 data-testid="text-fasting-window">
            {session ? `${session.duration} hours fasting · ${24 - session.duration} hours eating` : 'Set your own pace.'}
          </h3>
          <p>
            {session
              ? complete ? 'This session is finished. Reset whenever you want to plan another.' : 'The timer follows real time, even if you close this tab.'
              : 'Pick a window below, then start it when you’re ready. There’s no need to begin.'}
          </p>
          {session && (
            <dl className="fp-fasting__times">
              <div><dt>Started</dt><dd data-testid="text-fasting-started">{dateTime(session.startedAt)}</dd></div>
              <div><dt>Eating window</dt><dd data-testid="text-fasting-ends">{dateTime(endsAt)}</dd></div>
            </dl>
          )}
        </div>
      </div>

      {session ? (
        <div className="fp-fasting__session-footer">
          <span>{complete ? 'Your timer will stay here until you reset it.' : 'You can stop this session at any time.'}</span>
          <button type="button" className="fp-fasting__reset" onClick={reset} data-testid="button-reset-fast">
            {complete ? 'Reset timer' : 'Stop & reset'}
          </button>
          {error && <p className="fp-fasting__error" role="alert" data-testid="status-fasting-error">{error}</p>}
        </div>
      ) : (
        <form className="fp-fasting__setup" onSubmit={start} noValidate>
          <span className="fp-fasting__setup-title">Choose a fasting / eating window</span>
          <div className="fp-fasting__options" role="group" aria-label="Fasting window">
            <button type="button" className="fp-fasting__option" aria-pressed={plan === '16:8'} onClick={() => selectPlan('16:8')} data-testid="button-fast-preset-16-8">
              <strong>16:8</strong><small>16h fast · 8h eat</small>
            </button>
            <button type="button" className="fp-fasting__option" aria-pressed={plan === '18:6'} onClick={() => selectPlan('18:6')} data-testid="button-fast-preset-18-6">
              <strong>18:6</strong><small>18h fast · 6h eat</small>
            </button>
            <button type="button" className="fp-fasting__option" aria-pressed={plan === 'custom'} onClick={() => selectPlan('custom')} data-testid="button-fast-custom">
              <strong>Custom</strong><small>Your hours</small>
            </button>
          </div>
          {plan === 'custom' && (
            <div className="fp-fasting__custom">
              <label className="fp-fasting__field" htmlFor="fp-custom-fast-hours">
                Fasting hours (1–23)
                <input
                  id="fp-custom-fast-hours"
                  type="number"
                  min="1"
                  max="23"
                  step="1"
                  inputMode="numeric"
                  value={customHours}
                  onChange={(event) => { setCustomHours(event.target.value); setError(''); }}
                  aria-invalid={!!error}
                  aria-describedby={error ? 'fp-fasting-error' : undefined}
                  data-testid="input-custom-fasting-hours"
                />
              </label>
              <span className="fp-fasting__custom-output" data-testid="text-custom-eating-hours">
                Eating window: <strong>{customValid ? `${24 - customNumber} hours` : '—'}</strong>
              </span>
            </div>
          )}
          {error && <p className="fp-fasting__error" id="fp-fasting-error" role="alert" data-testid="status-fasting-error">{error}</p>}
          <div className="fp-fasting__action-row">
            <button type="submit" className="fp-fasting__primary" data-testid="button-start-fast">
              Start fast now <ArrowRight size={15} aria-hidden="true" />
            </button>
            <span className="fp-fasting__action-note">Starts only when you choose.</span>
          </div>
        </form>
      )}
    </section>
  );
}