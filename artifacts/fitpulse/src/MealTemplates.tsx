import { type FormEvent, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import './meal-templates.css';

type Template = { id: string; name: string; calories: number; protein: number; carbs: number; fat: number };
const KEY = 'fitpulse-meal-templates';

function validTemplate(value: unknown): value is Template {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<Template>;
  return typeof item.id === 'string' && typeof item.name === 'string' && item.name.trim().length > 0 &&
    typeof item.calories === 'number' && Number.isFinite(item.calories) && item.calories > 0 &&
    (['protein', 'carbs', 'fat'] as const).every((key) => typeof item[key] === 'number' && Number.isFinite(item[key]) && item[key]! >= 0);
}

function readTemplates(): Template[] {
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(saved) ? saved.filter(validTemplate) : [];
  } catch { return []; }
}

export default function MealTemplates({ onLog }: { onLog: (template: Template) => void }) {
  const [templates, setTemplates] = useState<Template[]>(readTemplates);
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  const save = (event: FormEvent) => {
    event.preventDefault();
    const values = [calories, protein, carbs, fat].map(Number);
    if (!name.trim() || name.trim().length > 60 || [calories, protein, carbs, fat].some((value) => value.trim() === '') ||
      !Number.isFinite(values[0]) || values[0] <= 0 || values[0] > 10000 ||
      values.slice(1).some((value) => !Number.isFinite(value) || value < 0 || value > 1000)) {
      setError('Add a name (up to 60 characters), 1–10,000 kcal, and macros between 0–1,000 g.');
      return;
    }
    const next = [...templates, {
      id: crypto.randomUUID(), name: name.trim(), calories: values[0],
      protein: values[1], carbs: values[2], fat: values[3],
    }];
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
      setTemplates(next);
      setName(''); setCalories(''); setProtein(''); setCarbs(''); setFat('');
      setError('');
      setShowForm(false);
    } catch { setError('This browser cannot save meal templates. Check storage permissions and try again.'); }
  };

  const remove = (id: string) => {
    if (!window.confirm('Delete this saved meal template? Your meal log will not be changed.')) return;
    const next = templates.filter((item) => item.id !== id);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
      setTemplates(next);
      setError('');
    } catch { setError('Could not delete the template because browser storage is unavailable.'); }
  };

  return (
    <div className="meal-templates" data-testid="section-meal-templates">
      <div className="meal-template-heading"><div><strong>Saved meals &amp; smoothies</strong><small>Keep your regulars ready to log.</small></div>
        <button type="button" className="button-quiet" onClick={() => { setShowForm((open) => !open); setError(''); }} data-testid="button-create-meal-template">{showForm ? 'Cancel' : 'Save a meal'}</button>
      </div>
      {templates.length > 0 && <div className="meal-template-list">{templates.map((item) => (
        <div className="meal-template-card" key={item.id} data-testid={`card-meal-template-${item.id}`}>
          <div><strong>{item.name}</strong><span>{item.calories.toLocaleString()} kcal · P {item.protein}g · C {item.carbs}g · F {item.fat}g</span></div>
          <div className="meal-template-actions">
            <button type="button" className="button-primary" onClick={() => onLog(item)} aria-label={`Log ${item.name}`} data-testid={`button-log-template-${item.id}`}><Plus size={14} /> Log</button>
            <button type="button" className="button-quiet" onClick={() => remove(item.id)} aria-label={`Delete template ${item.name}`} data-testid={`button-delete-template-${item.id}`}><Trash2 size={14} /></button>
          </div>
        </div>
      ))}</div>}
      {!templates.length && !showForm && <p className="meal-template-empty">Save a favorite once, then log it with one tap.</p>}
      {showForm && <form className="meal-template-form" onSubmit={save} noValidate>
        <label>Meal or smoothie name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Morning smoothie" maxLength={60} data-testid="input-template-name" /></label>
        <div className="meal-template-fields">
          {([['Calories', calories, setCalories, 'kcal'], ['Protein', protein, setProtein, 'g'], ['Carbs', carbs, setCarbs, 'g'], ['Fat', fat, setFat, 'g']] as const).map(([label, value, setter, unit]) => (
            <label key={label}>{label} ({unit})<input type="number" min="0" step="0.1" value={value} onChange={(event) => setter(event.target.value)} inputMode="decimal" data-testid={`input-template-${label.toLowerCase()}`} /></label>
          ))}
        </div>
        <button className="button-primary" type="submit" data-testid="button-save-meal-template">Save template</button>
      </form>}
      {error && <p className="error-text" role="alert" data-testid="status-meal-template-error">{error}</p>}
    </div>
  );
}