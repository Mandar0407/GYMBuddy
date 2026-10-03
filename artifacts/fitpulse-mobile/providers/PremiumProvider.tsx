import React, { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type MealDraft, type MacroTargets, type Routine, type Recipe, type ProgressPhoto, type RoutineDraft, type RecipeDraft, validMeal, validTargets, finite, recipeServing, mergeById } from '@/lib/premiumLogic';
export type { MealDraft } from '@/lib/premiumLogic';

export type PremiumState = {
  version: 1;
  settings: { appearance: 'system' | 'light' | 'dark'; metrics: string[]; shortcuts: string[]; haptics: boolean; restSeconds: number };
  routines: Routine[];
  favourites: Array<MealDraft & { id: string }>;
  recipes: Recipe[];
  photos: ProgressPhoto[];
  equipment: string[];
  dayMode: 'standard' | 'training' | 'rest';
  dayTargets: { training: MacroTargets; rest: MacroTargets };
  guided: { routine: Routine; index: number; startedAt: number; weight: string; reps: string; setType?:'warmup'|'working'|'drop'|'failure' } | null;
  routineDraft: RoutineDraft|null;
  recipeDraft: RecipeDraft|null;
};
export const PREMIUM_KEY = '@fitpulse/mobile/premium/v1';
const initial: PremiumState = {
  version: 1, settings: { appearance: 'system', metrics: ['protein', 'steps', 'strength'], shortcuts: ['Nutrition', 'Strength', 'Movement', 'Insights', 'My plan'], haptics: true, restSeconds: 90 },
  routines: [], favourites: [], recipes: [], photos: [], equipment: ['barbell', 'dumbbells', 'machines', 'cables', 'bodyweight'],
  dayMode: 'standard',
  guided: null,
  routineDraft: null,
  recipeDraft: null,
  dayTargets: { training: { calorieTarget: 2400, proteinTarget: 150, carbsTarget: 290, fatTarget: 70 }, rest: { calorieTarget: 2200, proteinTarget: 150, carbsTarget: 240, fatTarget: 70 } },
};
export function validatePremium(value: unknown): PremiumState {
  const source=value as PremiumState;
  const v=source&&{...source,settings:source.settings&&{...source.settings,restSeconds:source.settings.restSeconds===undefined?90:source.settings.restSeconds},
    guided:source.guided===undefined?null:source.guided,routineDraft:source.routineDraft===undefined?null:source.routineDraft,recipeDraft:source.recipeDraft===undefined?null:source.recipeDraft};
  if (!v || v.version !== 1 || !v.settings ||
    !['system', 'light', 'dark'].includes(v.settings.appearance) || typeof v.settings.haptics !== 'boolean' || !finite(v.settings.restSeconds,30,600,true) ||
    !Array.isArray(v.settings.metrics) || !v.settings.metrics.every(x => ['protein','steps','strength','water','calories'].includes(x)) ||
    !Array.isArray(v.settings.shortcuts) || !v.settings.shortcuts.every(x => ['Nutrition','Strength','Movement','Insights','My plan'].includes(x)) ||
    !['standard','training','rest'].includes(v.dayMode) || !validTargets(v.dayTargets?.training) || !validTargets(v.dayTargets?.rest) ||
    !Array.isArray(v.equipment) || !v.equipment.every(x => ['barbell','dumbbells','machines','cables','bodyweight'].includes(x)) ||
    !Array.isArray(v.routines) || !v.routines.every(r => typeof r.id === 'string' && !!r.id && typeof r.name === 'string' && !!r.name.trim() && r.name.length <= 100 &&
      Array.isArray(r.exercises) && r.exercises.length > 0 && r.exercises.length <= 100 && r.exercises.every(e => typeof e.name === 'string' && !!e.name.trim() && e.name.length <= 120 && finite(e.weight, .01, 500) && finite(e.reps, 1, 30, true))) ||
    !Array.isArray(v.favourites) || !v.favourites.every(m => typeof m.id === 'string' && !!m.id && validMeal(m)) ||
    !Array.isArray(v.recipes) || !v.recipes.every(r => typeof r.id === 'string' && !!r.id && typeof r.name === 'string' && !!r.name.trim() && r.name.length <= 120 &&
      finite(r.servings, .01, 1000) && Array.isArray(r.ingredients) && r.ingredients.length > 0 && r.ingredients.length <= 100 && r.ingredients.every(i=>validMeal(i,true))) ||
    !Array.isArray(v.photos) || !v.photos.every(p => typeof p.id === 'string' && !!p.id && typeof p.uri === 'string' && /^(file:|data:image\/|blob:)/.test(p.uri) &&
      /^\d{4}-\d{2}-\d{2}$/.test(p.date) && typeof p.note === 'string' && p.note.length <= 500)) {
    throw new Error('The advanced-feature data is invalid. Nothing was replaced.');
  }
  for (const recipe of v.recipes) recipeServing(recipe);
  const shortText=(x:unknown)=>typeof x==='string'&&x.length<=120;
  if(v.routineDraft!==null){
    const d=v.routineDraft;
    if(!d||![d.name,d.newExercise,d.newWeight,d.newReps].every(shortText)||(d.editing!==null&&!shortText(d.editing))||
      !Array.isArray(d.exercises)||d.exercises.length>100||!d.exercises.every(e=>shortText(e.name)&&!!e.name.trim()&&finite(e.weight,.01,500)&&finite(e.reps,1,30,true)))throw new Error('Invalid routine draft.');
  }
  if(v.recipeDraft!==null){
    const d=v.recipeDraft;
    if(!d||![d.name,d.servings,d.ingredientName].every(shortText)||(d.editing!==null&&!shortText(d.editing))||!d.macros||
      !['calories','protein','carbs','fat'].every(k=>shortText(d.macros[k as 'calories']))||!Array.isArray(d.ingredients)||d.ingredients.length>100||!d.ingredients.every(i=>validMeal(i,true)))throw new Error('Invalid recipe draft.');
  }
  if(v.guided!==null){
    const g=v.guided;
    if(!g||!g.routine||typeof g.routine.id!=='string'||typeof g.routine.name!=='string'||!g.routine.name.trim()||
      !Array.isArray(g.routine.exercises)||!g.routine.exercises.length||!g.routine.exercises.every(e=>typeof e.name==='string'&&!!e.name.trim()&&finite(e.weight,.01,500)&&finite(e.reps,1,30,true))||
      !finite(g.index,0,g.routine.exercises.length-1,true)||!finite(g.startedAt,0,Number.MAX_SAFE_INTEGER)||
      typeof g.weight!=='string'||g.weight.length>30||typeof g.reps!=='string'||g.reps.length>30||
      (g.setType!==undefined&&!['warmup','working','drop','failure'].includes(g.setType)))throw new Error('Invalid guided session draft.');
  }
  for (const collection of [v.routines, v.favourites, v.recipes, v.photos]) {
    if (!collection.every(x=>/^[A-Za-z0-9_-]{1,100}$/.test(x.id))) throw new Error('Invalid library identifier.');
    if (new Set(collection.map(x => x.id)).size !== collection.length) throw new Error('Duplicate identifiers in advanced-feature data.');
    if (collection.length > 10000) throw new Error('The backup is too large.');
  }
  return v;
}
type Context = PremiumState & {
  ready: boolean; canSave:boolean; error: string; saved: boolean;
  update(change: (state: PremiumState) => PremiumState): Promise<boolean>;
  getSnapshot():PremiumState;
  mergeBackup(value: PremiumState, restorePreferences?: boolean): Promise<boolean>;
};
const PremiumContext = createContext<Context | null>(null);
export function PremiumProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(initial);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const ref = useRef(state);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const usable = useRef(false);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(PREMIUM_KEY).then(raw => {
      if (!alive) return;
      if (raw) ref.current = validatePremium(JSON.parse(raw));
      setState(ref.current); usable.current = true;
    }).catch(e => { if (alive) setError(`Advanced features could not load. Your stored data was kept. ${e.message}`); })
      .finally(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, []);
  const update: Context['update'] = change => {
    const operation = queue.current.then(async () => {
      if (!usable.current) { setError('Advanced data is not ready. Reopen the app to retry loading.'); return false; }
      try {
        setSaved(false);
        const next = validatePremium(change(ref.current));
        await AsyncStorage.setItem(PREMIUM_KEY, JSON.stringify(next));
        ref.current = next; setState(next); setError(''); setSaved(true); return true;
      } catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Your entries were kept.'); return false; }
    });
    queue.current = operation.catch(() => undefined);
    return operation;
  };
  const mergeBackup: Context['mergeBackup'] = (incoming,restorePreferences=false) => update(current => ({
    ...current,
    ...(restorePreferences?{settings:incoming.settings,equipment:incoming.equipment,dayMode:incoming.dayMode,dayTargets:incoming.dayTargets}:{}),
    routines: mergeById(current.routines, incoming.routines).result,
    favourites: mergeById(current.favourites, incoming.favourites).result,
    recipes: mergeById(current.recipes, incoming.recipes).result,
    photos: mergeById(current.photos, incoming.photos).result,
    guided: current.guided ?? incoming.guided,
    routineDraft: current.routineDraft ?? incoming.routineDraft,
    recipeDraft: current.recipeDraft ?? incoming.recipeDraft,
  }));
  return <PremiumContext.Provider value={{ ...state, ready, canSave:usable.current, error, saved, update, mergeBackup,
    getSnapshot:()=>{if(!usable.current)throw new Error('Advanced data is not ready to export.');return ref.current;}
  }}>{children}</PremiumContext.Provider>;
}
export function usePremium() {
  const context = useContext(PremiumContext);
  if (!context) throw new Error('PremiumProvider is missing.');
  return context;
}
export function useAppearancePreference() {
  return useContext(PremiumContext)?.settings.appearance ?? 'system';
}
export function useWidgetTargets() {
  const p=useContext(PremiumContext);
  return p&&p.dayMode!=='standard'?p.dayTargets[p.dayMode]:null;
}