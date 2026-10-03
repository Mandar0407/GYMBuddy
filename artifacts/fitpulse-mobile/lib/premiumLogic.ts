import type { Meal, FitnessProfile, FitnessState } from '@/providers/FitnessProvider';

export type MealDraft = Omit<Meal, 'id' | 'date' | 'time'>;
export type MacroTargets = Pick<FitnessProfile, 'calorieTarget' | 'proteinTarget' | 'carbsTarget' | 'fatTarget'>;
export type RoutineExercise = { name: string; weight: number; reps: number };
export type Routine = { id: string; name: string; exercises: RoutineExercise[] };
export type Recipe = { id: string; name: string; servings: number; ingredients: MealDraft[] };
export type ProgressPhoto = { id: string; date: string; uri: string; note: string };
export type RoutineDraft = { editing: string|null; name:string; exercises:RoutineExercise[]; newExercise:string; newWeight:string; newReps:string };
export type RecipeDraft = { editing:string|null; name:string; servings:string; ingredients:MealDraft[]; ingredientName:string; macros:Record<'calories'|'protein'|'carbs'|'fat',string> };
export const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
export const targetKeys = ['calorieTarget', 'proteinTarget', 'carbsTarget', 'fatTarget'] as const;
export const macroKeys = ['calories', 'protein', 'carbs', 'fat'] as const;
export function finite(value: unknown, min: number, max: number, integer = false): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value));
}
export function validMeal(value: unknown, allowZero=false): value is MealDraft {
  if (!value || typeof value !== 'object') return false;
  const m = value as MealDraft;
  return typeof m.name === 'string' && !!m.name.trim() && m.name.length <= 120 &&
    ['Breakfast', 'Lunch', 'Dinner', 'Snack'].includes(m.meal) &&
    finite(m.calories, allowZero?0:.01, 10000) && ['protein', 'carbs', 'fat'].every(k => finite(m[k as keyof MealDraft], 0, 1000));
}
export function validTargets(value: unknown): value is MacroTargets {
  if (!value || typeof value !== 'object') return false;
  const t = value as MacroTargets;
  return finite(t.calorieTarget, 1000, 10000, true) &&
    targetKeys.slice(1).every(k => finite(t[k], 1, 1000, true));
}
export function portion(meal: MealDraft, multiplier: number): MealDraft {
  if (!finite(multiplier, .01, 100)) throw new Error('Use a portion between 0.01 and 100.');
  const result = { ...meal };
  for (const k of macroKeys) result[k] = Math.round(meal[k] * multiplier * 100) / 100;
  if (!validMeal(result)) throw new Error('This portion exceeds the supported calorie or macro range.');
  return result;
}
export function recipeServing(recipe: Recipe): MealDraft {
  if (!finite(recipe.servings, .01, 1000) || !recipe.ingredients.length || !recipe.ingredients.every(i=>validMeal(i,true))) {
    throw new Error('Add valid ingredients and a positive serving count.');
  }
  const total: MealDraft = { name: recipe.name, meal: 'Lunch', calories: 0, protein: 0, carbs: 0, fat: 0 };
  for (const ingredient of recipe.ingredients) for (const k of macroKeys) total[k] += ingredient[k] / recipe.servings;
  for (const k of macroKeys) total[k] = Math.round(total[k] * 100) / 100;
  if (!validMeal(total)) throw new Error('Nutrition per serving is outside the supported range.');
  return total;
}
export function calculatePlates(target: number, bar: number, plates = [25, 20, 15, 10, 5, 2.5, 1.25]) {
  if (!finite(target, 0, 1000) || !finite(bar, 0, 100) || target < bar) {
    throw new Error('Target weight must be at least the bar weight.');
  }
  let remaining = (target - bar) / 2;
  const result: { plate: number; count: number }[] = [];
  for (const plate of [...plates].filter(p => finite(p, .01, 100)).sort((a, b) => b - a)) {
    const count = Math.floor((remaining + 1e-8) / plate);
    if (count) { result.push({ plate, count }); remaining -= count * plate; }
  }
  const loadable = Math.round((target - remaining * 2) * 100) / 100;
  return { plates: result, exact: Math.abs(remaining) < 1e-7, loadable, shortfall: Math.round(remaining * 200) / 100 };
}
export const exerciseLibrary = [
  { name: 'Barbell squat', group: 'legs', equipment: 'barbell' },
  { name: 'Goblet squat', group: 'legs', equipment: 'dumbbells' },
  { name: 'Bodyweight squat', group: 'legs', equipment: 'bodyweight' },
  { name: 'Leg press', group: 'legs', equipment: 'machines' },
  { name: 'Bench press', group: 'chest', equipment: 'barbell' },
  { name: 'Dumbbell press', group: 'chest', equipment: 'dumbbells' },
  { name: 'Push-up', group: 'chest', equipment: 'bodyweight' },
  { name: 'Cable chest press', group: 'chest', equipment: 'cables' },
  { name: 'Barbell row', group: 'back', equipment: 'barbell' },
  { name: 'Dumbbell row', group: 'back', equipment: 'dumbbells' },
  { name: 'Lat pulldown', group: 'back', equipment: 'machines' },
  { name: 'Cable row', group: 'back', equipment: 'cables' },
  { name: 'Overhead press', group: 'shoulders', equipment: 'barbell' },
  { name: 'Dumbbell shoulder press', group: 'shoulders', equipment: 'dumbbells' },
  { name: 'Pike push-up', group: 'shoulders', equipment: 'bodyweight' },
  { name: 'Romanian deadlift', group: 'hinge', equipment: 'barbell' },
  { name: 'Dumbbell Romanian deadlift', group: 'hinge', equipment: 'dumbbells' },
  { name: 'Hip bridge', group: 'hinge', equipment: 'bodyweight' },
];
export function substitutions(exercise: string, equipment: string[]) {
  const original = exerciseLibrary.find(x => x.name.toLowerCase() === exercise.toLowerCase());
  return original ? exerciseLibrary.filter(x => x.group === original.group && x.name !== original.name && equipment.includes(x.equipment)) : [];
}
export function mergeById<T extends { id: string }>(current: T[], incoming: T[]) {
  const result = [...current];
  let skipped = 0;
  for (const item of incoming) {
    const existing = result.find(x => x.id === item.id);
    if (existing) { if (JSON.stringify(existing) !== JSON.stringify(item)) skipped++; continue; }
    result.push(item);
  }
  return { result, skipped };
}
export function mergeJournalBackup(current:FitnessState,incoming:FitnessState,restoreProfile=false):FitnessState {
  const conflictedSets=new Set(incoming.sets.filter(s=>{
    const local=current.sets.find(x=>x.id===s.id);
    return local&&JSON.stringify(local)!==JSON.stringify(s);
  }).map(s=>s.id));
  const claimed=new Set(current.completedWorkouts.flatMap(w=>w.setIds));
  const safeWorkouts=incoming.completedWorkouts.filter(w=>
    !current.completedWorkouts.some(x=>x.id===w.id)&&
    w.setIds.every(id=>!claimed.has(id)&&!conflictedSets.has(id)));
  return {
    profile:restoreProfile?incoming.profile:current.profile,
    meals:mergeById(current.meals,incoming.meals).result.sort((a,b)=>b.date.localeCompare(a.date)),
    sets:mergeById(current.sets,incoming.sets).result.sort((a,b)=>b.date.localeCompare(a.date)||(b.loggedAt??0)-(a.loggedAt??0)),
    completedWorkouts:[...current.completedWorkouts,...safeWorkouts].sort((a,b)=>b.completedAt-a.completedAt),
    water:{...incoming.water,...current.water},
    weights:[...incoming.weights.filter(w=>!current.weights.some(x=>x.date===w.date)),...current.weights].sort((a,b)=>a.date.localeCompare(b.date)),
  };
}
export function remapDeletedBackupIds(incoming:FitnessState,deleted:Set<string>):FitnessState{
  const restoreId=(entity:string,id:string)=>{
    if(!deleted.has(`${entity}:${id}`))return id;
    const key=`${entity}:${id}`;
    const hash=(seed:number)=>{let h=seed;for(let i=0;i<key.length;i++)h=Math.imul(h^key.charCodeAt(i),16777619);return(h>>>0).toString(16).padStart(8,'0');};
    const base=`restored-${hash(2166136261)}${hash(2246822519)}`;
    let generation=0;while(deleted.has(`${entity}:${base}-${generation}`))generation++;
    return `${base}-${generation}`;
  };
  const ids=new Map(incoming.sets.map(s=>[s.id,restoreId('strengthSet',s.id)]));
  return {...incoming,
    meals:incoming.meals.map(m=>({...m,id:restoreId('meal',m.id)})),
    sets:incoming.sets.map(s=>({...s,id:ids.get(s.id)!})),
    completedWorkouts:incoming.completedWorkouts.map(w=>({...w,id:restoreId('completedWorkout',w.id),setIds:w.setIds.map(id=>ids.get(id)!)})),
  };
}