import { type FormEvent, useEffect, useState } from 'react';
import { Droplets, Minus, Plus, Settings2 } from 'lucide-react';

type Props = {
  waterMl: number;
  goalMl: number;
  onWaterChange: (amount: number) => void;
  onGoalChange: (goal: number) => void;
};

const quickAmounts = [250, 330, 500, 750];
const segments = 8;

export default function WaterIntakeCard({ waterMl, goalMl, onWaterChange, onGoalChange }: Props) {
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState(String(goalMl));
  const [goalError, setGoalError] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [amountError, setAmountError] = useState('');

  useEffect(() => { setGoalDraft(String(goalMl)); }, [goalMl]);

  const saveGoal = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = Number(goalDraft);
    if (!Number.isInteger(next) || next < 100 || next > 20000) {
      setGoalError('Enter a whole number from 100 to 20,000 ml.');
      return;
    }
    onGoalChange(next);
    setGoalError('');
    setEditingGoal(false);
  };

  const addCustomAmount = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amount = Number(customAmount);
    if (!Number.isInteger(amount) || amount < 1 || amount > 10000) {
      setAmountError('Enter a whole number from 1 to 10,000 ml.');
      return;
    }
    onWaterChange(amount);
    setCustomAmount('');
    setAmountError('');
  };

  const filledSegments = Math.min(segments, Math.ceil(waterMl / goalMl * segments));
  const percentage = Math.round(waterMl / goalMl * 100);

  return (
    <div className="water-widget" data-testid="card-water-intake">
      <div className="water-widget-heading">
        <span className="water-widget-icon"><Droplets size={18} /></span>
        <div className="water-widget-title"><strong>Water intake</strong><small>Build the habit, one glass at a time.</small></div>
        <button
          type="button"
          className="water-goal-toggle"
          onClick={() => { setGoalDraft(String(goalMl)); setGoalError(''); setEditingGoal((open) => !open); }}
          aria-expanded={editingGoal}
          aria-controls="water-goal-form"
          aria-label={editingGoal ? 'Close water goal editor' : 'Edit daily water goal'}
          title="Edit goal"
          data-testid="button-edit-water-goal"
        ><Settings2 size={17} /></button>
      </div>

      {editingGoal && (
        <form id="water-goal-form" className="water-goal-form" onSubmit={saveGoal} noValidate>
          <label htmlFor="water-goal-input">Daily goal (ml)</label>
          <div className="water-entry-row">
            <input id="water-goal-input" type="number" inputMode="numeric" min="100" max="20000" step="1" value={goalDraft} onChange={(event) => { setGoalDraft(event.target.value); setGoalError(''); }} data-testid="input-water-goal" />
            <button type="submit" className="water-entry-button" data-testid="button-save-water-goal">Save goal</button>
          </div>
          {goalError && <p className="water-error" role="alert" data-testid="status-water-goal-error">{goalError}</p>}
        </form>
      )}

      <div className="water-progress-copy">
        <span className="water-widget-total" data-testid="text-water-intake">{waterMl.toLocaleString()} <small>ml</small></span>
        <span data-testid="text-water-goal">{percentage}% of {goalMl.toLocaleString()} ml goal</span>
      </div>
      <div className="water-segments" role="progressbar" aria-label="Water intake" aria-valuemin={0} aria-valuemax={goalMl} aria-valuenow={Math.min(waterMl, goalMl)} aria-valuetext={`${waterMl.toLocaleString()} of ${goalMl.toLocaleString()} milliliters`}>
        {Array.from({ length: segments }, (_, index) => <i key={index} className={index < filledSegments ? 'is-filled' : ''} />)}
      </div>

      <div className="water-quick-add" aria-label="Quick add water">
        {quickAmounts.map((amount) => (
          <button key={amount} type="button" onClick={() => { onWaterChange(amount); setAmountError(''); }} data-testid={amount === 250 ? 'button-add-water' : `button-add-water-${amount}`}><Plus size={14} /> {amount} ml</button>
        ))}
      </div>
      <form className="water-custom-form" onSubmit={addCustomAmount} noValidate>
        <label htmlFor="water-custom-amount">Custom amount (ml)</label>
        <div className="water-entry-row">
          <input id="water-custom-amount" type="number" inputMode="numeric" min="1" max="10000" step="1" placeholder="Enter ml" value={customAmount} onChange={(event) => { setCustomAmount(event.target.value); setAmountError(''); }} data-testid="input-water-custom" />
          <button type="submit" className="water-entry-button" data-testid="button-add-water-custom">Log water</button>
        </div>
        {amountError && <p className="water-error" role="alert" data-testid="status-water-amount-error">{amountError}</p>}
      </form>
      <button type="button" className="water-undo" onClick={() => onWaterChange(-250)} disabled={waterMl === 0} aria-label="Remove 250 milliliters of water" data-testid="button-remove-water"><Minus size={14} /> Remove 250 ml</button>
    </div>
  );
}