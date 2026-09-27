import { useEffect, useRef } from 'react';
import { Award, X } from 'lucide-react';
import './pr-celebration.css';

export default function PRCelebration({
  exercise, estimatedOneRm, weight, oneRmRecord, weightRecord, onClose,
}: {
  exercise: string;
  estimatedOneRm: number;
  weight: number;
  oneRmRecord: boolean;
  weightRecord: boolean;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const closeHandler = useRef(onClose);
  closeHandler.current = onClose;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeHandler.current();
      // The only focusable control is the close button.
      if (event.key === 'Tab') { event.preventDefault(); closeRef.current?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, []);

  return (
    <div className="modal-backdrop pr-celebration-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal pr-celebration" role="dialog" aria-modal="true" aria-labelledby="pr-celebration-heading" aria-describedby="pr-celebration-description" data-testid="dialog-new-pr">
        <div className="pr-celebration-emblem"><Award size={27} aria-hidden="true" /></div>
        <div className="section-label">Strength milestone</div>
        <h2 id="pr-celebration-heading">New Personal Record!</h2>
        <p id="pr-celebration-description">{exercise} — you moved your previous best forward.</p>
        <div className="pr-celebration-records">
          {oneRmRecord && <span data-testid="text-pr-one-rm">Estimated 1RM · {Number(estimatedOneRm.toFixed(1))} kg</span>}
          {weightRecord && <span data-testid="text-pr-weight">Heaviest load · {weight} kg</span>}
        </div>
        <button ref={closeRef} className="button-primary" type="button" onClick={onClose} data-testid="button-close-pr-celebration"><X size={15} /> Keep going</button>
      </section>
    </div>
  );
}