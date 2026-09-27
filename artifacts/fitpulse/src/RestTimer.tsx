import { type CSSProperties, useEffect, useState } from 'react';
import { Check, Clock3, Pause, Play, X } from 'lucide-react';

const REST_SECONDS = 90;

export default function RestTimer({
  exercise, setType, onDismiss,
}: {
  exercise: string;
  setType: 'warmup' | 'working' | 'drop' | 'failure';
  onDismiss: () => void;
}) {
  const [endsAt, setEndsAt] = useState(() => Date.now() + REST_SECONDS * 1000);
  const [remaining, setRemaining] = useState(REST_SECONDS);
  const [running, setRunning] = useState(true);

  useEffect(() => {
    if (!running) return undefined;
    const update = () => {
      const seconds = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setRemaining(seconds);
      if (seconds === 0) setRunning(false);
    };
    update();
    const interval = window.setInterval(update, 250);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [endsAt, running]);

  const pause = () => {
    setRemaining(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    setRunning(false);
  };
  const resume = () => {
    setEndsAt(Date.now() + remaining * 1000);
    setRunning(true);
  };
  const clock = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
  const setLabel = setType === 'warmup' ? 'Warm-up' : setType === 'drop' ? 'Drop set' : setType === 'failure' ? 'Failure set' : 'Working set';

  return (
    <aside className={`rest-timer${remaining === 0 ? ' is-complete' : ''}`} role="dialog" aria-modal="false" aria-label="Rest timer" data-testid="dialog-rest-timer">
      <div className="rest-timer-top">
        <div className="rest-timer-label"><Clock3 size={16} /><span>{remaining === 0 ? 'REST COMPLETE' : 'REST BETWEEN SETS'}</span></div>
        <button className="rest-timer-close" type="button" onClick={onDismiss} aria-label="Close rest timer" data-testid="button-close-rest-timer"><X size={17} /></button>
      </div>
      <div className="rest-timer-main">
        <div className="rest-timer-dial" style={{ '--rest-progress': `${((REST_SECONDS - remaining) / REST_SECONDS) * 100}%` } as CSSProperties}>
          <strong data-testid="text-rest-time">{clock}</strong>
        </div>
        <div className="rest-timer-copy">
          <strong>{remaining === 0 ? 'Ready for your next set.' : running ? 'Take a breath.' : 'Timer paused.'}</strong>
          <span>{setLabel} · {exercise}</span>
          <div className="rest-timer-actions">
            {remaining === 0 ? (
              <button type="button" onClick={onDismiss} data-testid="button-finish-rest"><Check size={14} /> Done</button>
            ) : (
              <>
                <button type="button" onClick={running ? pause : resume} data-testid={running ? 'button-pause-rest' : 'button-resume-rest'}>{running ? <Pause size={14} /> : <Play size={14} />}{running ? 'Pause' : 'Resume'}</button>
                <button type="button" onClick={onDismiss} data-testid="button-skip-rest">Skip</button>
              </>
            )}
          </div>
        </div>
      </div>
      {remaining === 0 && <span className="sr-only" role="status">Rest complete</span>}
    </aside>
  );
}