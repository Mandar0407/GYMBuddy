export type MacroTargets = { calorieTarget: number; proteinTarget: number; carbsTarget: number; fatTarget: number };
export type MealDraft = { name: string; meal: string; calories: number; protein: number; carbs: number; fat: number };
export type RoutineExercise = { name: string; weight: number; reps: number };
export type Routine = { id: string; name: string; exercises: RoutineExercise[] };
export type Recipe = { id: string; name: string; servings: number; ingredients: MealDraft[] };
export type PremiumState = {
  version: 1;
  settings: { appearance: 'system' | 'light' | 'dark'; metrics: string[]; shortcuts: string[]; haptics:boolean; restSeconds:number };
  routines: Routine[];
  favourites: Array<MealDraft & { id: string }>;
  recipes: Recipe[];
  equipment: string[];
  dayMode: 'standard' | 'training' | 'rest';
  dayTargets: { training: MacroTargets; rest: MacroTargets };
  photos: Array<{ id: string; date: string; note: string; key?: string; uri?: string; sourceId?:string; contentHash?:string }>;
  guided: { routine: Routine; index: number; startedAt: number; weight: string; reps: string; setIds?: string[] } | null;
  routineDraft: { editing: string | null; name: string; exercises: RoutineExercise[]; newExercise: string; newWeight: string; newReps: string } | null;
  recipeDraft: { editing: string | null; name: string; servings: string; ingredients: MealDraft[]; ingredientName: string; macros: Record<'calories'|'protein'|'carbs'|'fat', string> } | null;
};
export const PREMIUM_KEY = '@fitpulse/mobile/premium/v1';
export const initialPremium: PremiumState = {
  version: 1, settings: { appearance: 'system', metrics: ['calories','protein','steps','strength'], shortcuts: ['Nutrition','Strength','Movement','Insights','My plan'],haptics:true,restSeconds:90 },
  routines: [], favourites: [], recipes: [], equipment: ['barbell','dumbbells','machines','cables','bodyweight'],
  dayMode: 'standard',
  dayTargets: {
    training: { calorieTarget: 2400, proteinTarget: 150, carbsTarget: 290, fatTarget: 70 },
    rest: { calorieTarget: 2200, proteinTarget: 150, carbsTarget: 240, fatTarget: 70 },
  },
  photos: [], guided: null, routineDraft: null, recipeDraft: null,
};
const finite = (x: unknown, min: number, max: number, integer = false): x is number =>
  typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max && (!integer || Number.isInteger(x));
const dateKey = (value: unknown): value is string => {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const date=new Date(`${value}T12:00:00Z`);return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
};
const isObject=(value:unknown):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const uniqueIds=(values:Array<{id:string}>)=>new Set(values.map(x=>x.id)).size===values.length;
const validExercise=(x:unknown):x is RoutineExercise=>isObject(x)&&typeof x.name==='string'&&!!x.name.trim()&&x.name.length<=120&&finite(x.weight,.01,500)&&finite(x.reps,1,30,true);
const validMeal=(m:unknown, zero=false):m is MealDraft=>isObject(m)&&typeof m.name==='string'&&!!m.name.trim()&&m.name.length<=120&&
  ['Breakfast','Lunch','Dinner','Snack'].includes(m.meal)&&finite(m.calories,zero?0:.01,10000)&&finite(m.protein,0,1000)&&finite(m.carbs,0,1000)&&finite(m.fat,0,1000);
const validRoutine=(r:unknown):r is Routine=>isObject(r)&&idOk(r.id)&&typeof r.name==='string'&&!!r.name.trim()&&r.name.length<=100&&
  Array.isArray(r.exercises)&&r.exercises.length>0&&r.exercises.length<=100&&r.exercises.every(validExercise);
export function validPremium(value: unknown): value is PremiumState {
  if (!isObject(value)) return false;
  const s = value as unknown as PremiumState;
  const targets = (t: MacroTargets) => !!t && finite(t.calorieTarget,1000,10000,true) &&
    finite(t.proteinTarget,1,1000,true) && finite(t.carbsTarget,1,1000,true) && finite(t.fatTarget,1,1000,true);
  const settings=s.settings as any;
  if (s.version !== 1 || !isObject(settings) || !['system','light','dark'].includes(settings.appearance) ||
    !Array.isArray(settings.metrics) || settings.metrics.length>5 || !settings.metrics.every(x=>['protein','steps','strength','water','calories'].includes(x)) || new Set(settings.metrics).size!==settings.metrics.length ||
    !Array.isArray(settings.shortcuts) || settings.shortcuts.length>5 || !settings.shortcuts.every(x=>['Nutrition','Strength','Movement','Insights','My plan'].includes(x)) || new Set(settings.shortcuts).size!==settings.shortcuts.length ||
    typeof settings.haptics!=='boolean'||!finite(settings.restSeconds,30,600,true) ||
    !['standard','training','rest'].includes(s.dayMode) || !isObject(s.dayTargets) || !targets(s.dayTargets.training) || !targets(s.dayTargets.rest) ||
    !Array.isArray(s.routines) || s.routines.length>10000 || !s.routines.every(validRoutine) || !uniqueIds(s.routines) ||
    !Array.isArray(s.favourites) || s.favourites.length>10000 || !s.favourites.every((m:any)=>idOk(m?.id)&&validMeal(m)) || !uniqueIds(s.favourites) ||
    !Array.isArray(s.recipes) || s.recipes.length>10000 || !s.recipes.every((r:any)=>isObject(r)&&idOk(r.id)&&typeof r.name==='string'&&!!r.name.trim()&&r.name.length<=120&&finite(r.servings,.01,1000)&&Array.isArray(r.ingredients)&&r.ingredients.length>0&&r.ingredients.length<=100&&r.ingredients.every(i=>validMeal(i,true))&&validRecipeServing(r as Recipe)) || !uniqueIds(s.recipes) ||
    !Array.isArray(s.equipment) || s.equipment.length>5 || !s.equipment.every(x=>['barbell','dumbbells','machines','cables','bodyweight'].includes(x)) || new Set(s.equipment).size!==s.equipment.length ||
    !Array.isArray(s.photos) || s.photos.length>10000 || !s.photos.every((p:any)=>isObject(p)&&idOk(p.id)&&
      ((typeof p.key==='string'&&p.key.length<=150)||typeof p.uri==='string'&&p.uri.length<=7_000_000&&
        (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(p.uri)||/^file:\/\//.test(p.uri)||/^blob:/.test(p.uri)))&&
      dateKey(p.date)&&typeof p.note==='string'&&p.note.length<=500&&
      (p.sourceId===undefined||idOk(p.sourceId))&&(p.contentHash===undefined||/^[a-f0-9]{8}$/.test(p.contentHash))) || !uniqueIds(s.photos)) return false;
  const shortText=(x:unknown,max=120)=>typeof x==='string'&&x.length<=max;
  const draft=s.routineDraft as any;
  if(draft!==null&&draft!==undefined&&(!isObject(draft)||!(draft.editing===null||idOk(draft.editing))||!shortText(draft.name,100)||!shortText(draft.newExercise)||!shortText(draft.newWeight,30)||!shortText(draft.newReps,30)||!Array.isArray(draft.exercises)||draft.exercises.length>100||!draft.exercises.every(validExercise)))return false;
  const recipeDraft=s.recipeDraft as any;
  if(recipeDraft!==null&&recipeDraft!==undefined&&(!isObject(recipeDraft)||!(recipeDraft.editing===null||idOk(recipeDraft.editing))||!shortText(recipeDraft.name,120)||!shortText(recipeDraft.servings,30)||!shortText(recipeDraft.ingredientName,120)||!isObject(recipeDraft.macros)||!['calories','protein','carbs','fat'].every(k=>shortText(recipeDraft.macros[k],30))||!Array.isArray(recipeDraft.ingredients)||recipeDraft.ingredients.length>100||!recipeDraft.ingredients.every((i:unknown)=>validMeal(i,true))))return false;
  const guided=s.guided as any;
  if(guided!==null&&guided!==undefined&&(!isObject(guided)||!validRoutine(guided.routine)||!finite(guided.index,0,guided.routine.exercises.length-1,true)||!finite(guided.startedAt,0,Number.MAX_SAFE_INTEGER)||!shortText(guided.weight,30)||!shortText(guided.reps,30)||(guided.setIds!==undefined&&(!Array.isArray(guided.setIds)||guided.setIds.length>10000||!guided.setIds.every((x:unknown)=>idOk(x))||new Set(guided.setIds).size!==guided.setIds.length))||(guided.setType!==undefined&&!['warmup','working','drop','failure'].includes(guided.setType))))return false;
  return true;
}
function idOk(id: unknown): id is string { return typeof id==='string' && /^[A-Za-z0-9_-]{1,100}$/.test(id); }
function validRecipeServing(recipe: Recipe): boolean {
  try { serving(recipe); return true; } catch { return false; }
}
export function scaledMeal<T extends MealDraft>(meal: T, multiplier: number): T {
  if (!finite(multiplier,.01,100)) throw new Error('Use a portion between 0.01 and 100.');
  const result = {...meal, calories: round(meal.calories*multiplier), protein: round(meal.protein*multiplier), carbs: round(meal.carbs*multiplier), fat: round(meal.fat*multiplier)};
  if (!validMealRecord(result)) throw new Error('This portion exceeds the supported nutrition range.');
  return result;
}
function round(n:number){return Math.round(n*100)/100;}
export function validMealRecord(m: MealDraft) { return !!m.name?.trim() && ['Breakfast','Lunch','Dinner','Snack'].includes(m.meal) && finite(m.calories,.01,10000) && finite(m.protein,0,1000) && finite(m.carbs,0,1000) && finite(m.fat,0,1000); }
export function serving(recipe: Recipe): MealDraft {
  if (!finite(recipe.servings,.01,1000)||!recipe.ingredients.length) throw new Error('Add valid ingredients and a positive serving count.');
  const out: MealDraft={name:recipe.name,meal:'Lunch',calories:0,protein:0,carbs:0,fat:0};
  for(const i of recipe.ingredients) for(const k of ['calories','protein','carbs','fat'] as const) out[k]=round(out[k]+i[k]/recipe.servings);
  if(!validMealRecord(out))throw new Error('Nutrition per serving is outside the supported range.');
  return out;
}
export function calculatePlates(target:number, bar:number, plates=[25,20,15,10,5,2.5,1.25]) {
  if(!finite(target,0,1000)||!finite(bar,0,100)||target<bar)throw new Error('Target weight must be at least the bar weight.');
  let remaining=(target-bar)/2; const result:{plate:number;count:number}[]=[];
  for(const plate of [...plates].sort((a,b)=>b-a)){const count=Math.floor((remaining+1e-8)/plate);if(count){result.push({plate,count});remaining-=count*plate;}}
  return {plates:result,exact:Math.abs(remaining)<1e-7,loadable:round(target-remaining*2),shortfall:round(remaining*2)};
}
export function mergeById<T extends {id:string}>(current:T[], incoming:T[]) {
  const ids=new Set(current.map(x=>x.id)); return [...current,...incoming.filter(x=>!ids.has(x.id))];
}
function stableValue(value:unknown):string {
  if(Array.isArray(value))return `[${value.map(stableValue).join(',')}]`;
  if(isObject(value))return `{${Object.keys(value).filter(k=>k!=='id'&&k!=='estimatedOneRm').sort().map(k=>`${JSON.stringify(k)}:${stableValue(value[k])}`).join(',')}}`;
  return JSON.stringify(value)??'undefined';
}
export function restoreDeletedId(entity:string,id:string,tombstones:Record<string,unknown>,existingIds:Array<string|{id:string}>,identity?:unknown):string {
  if(!tombstones[`${entity}\u0000${id}`]) return id;
  const source=`${entity}:${id}`;let hash=2166136261;
  for(let i=0;i<source.length;i++)hash=Math.imul(hash^source.charCodeAt(i),16777619);
  const base=`restored-${(hash>>>0).toString(16).padStart(8,'0')}`;
  for(let generation=0;generation<10000;generation++){
    const candidate=`${base}-${generation}`;
    if(tombstones[`${entity}\u0000${candidate}`])continue;
    const existing=existingIds.find(item=>typeof item==='string'?item===candidate:item.id===candidate);
    if(!existing)return candidate;
    if(identity!==undefined&&typeof existing!=='string'&&stableValue(existing)===stableValue(identity))return candidate;
  }
  throw new Error('Could not assign a safe restoration ID.');
}
export function validJournalBackup(journal:unknown):journal is Record<string,unknown> {
  if(!journal||typeof journal!=='object'||Array.isArray(journal))return false;
  const data=journal as Record<string,unknown>;
  const mealRecords=data['fitpulse-macros'];const sets=data['fitpulse-workouts'];
  if(!Array.isArray(mealRecords)||!Array.isArray(sets))return false;
  const numeric=(n:unknown,min:number,max:number)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
  const safeId=(x:unknown)=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
  if(mealRecords.length>100000||!mealRecords.every((x:any)=>isObject(x)&&safeId(x.id)&&typeof x.name==='string'&&!!x.name.trim()&&x.name.length<=120&&['Breakfast','Lunch','Dinner','Snack'].includes(x.meal)&&numeric(x.calories,.01,10000)&&numeric(x.protein,0,1000)&&numeric(x.carbs,0,1000)&&numeric(x.fat,0,1000)&&typeof x.time==='string'&&x.time.length<=40&&dateKey(x.date)&&(x.provenance===undefined||typeof x.provenance==='string'&&x.provenance.length<=80))||new Set(mealRecords.map((x:any)=>x.id)).size!==mealRecords.length)return false;
  if(sets.length>100000||!sets.every((x:any)=>isObject(x)&&safeId(x.id)&&typeof x.exercise==='string'&&!!x.exercise.trim()&&x.exercise.length<=120&&numeric(x.weight,.01,500)&&numeric(x.reps,1,30)&&Number.isInteger(x.reps)&&dateKey(x.date)&&(x.setType===undefined||['warmup','working','drop','failure'].includes(x.setType)))||new Set(sets.map((x:any)=>x.id)).size!==sets.length)return false;
  const profile=data['fitpulse-profile'];
  if(profile!==undefined&&profile!==null&&(!isObject(profile)||typeof profile.name!=='string'||!profile.name.trim()||profile.name.length>80||typeof profile.goal!=='string'||!profile.goal.trim()||profile.goal.length>120||
    !numeric(profile.weight,20,500)||!numeric(profile.height,100,230)||!numeric(profile.calorieTarget,1000,10000)||!Number.isInteger(profile.calorieTarget)||
    !numeric(profile.proteinTarget,1,1000)||!numeric(profile.carbsTarget,1,1000)||!numeric(profile.fatTarget,1,1000)||!numeric(profile.stepTarget,1000,100000)||
    (profile.waterGoalMl!==undefined&&(!numeric(profile.waterGoalMl,100,20000)||!Number.isInteger(profile.waterGoalMl)))||(profile.age!==undefined&&(!numeric(profile.age,14,90)||!Number.isInteger(profile.age)))||
    (profile.sex!==undefined&&!['female','male'].includes(profile.sex))||(profile.activity!==undefined&&!['sedentary','light','moderate','high'].includes(profile.activity))))return false;
  const templates=data['fitpulse-meal-templates'];
  if(templates!==null&&templates!==undefined&&(!Array.isArray(templates)||templates.length>10000||!templates.every((t:any)=>isObject(t)&&safeId(t.id)&&typeof t.name==='string'&&!!t.name.trim()&&t.name.length<=60&&numeric(t.calories,.01,10000)&&numeric(t.protein,0,1000)&&numeric(t.carbs,0,1000)&&numeric(t.fat,0,1000)&&(t.meal===undefined||['Breakfast','Lunch','Dinner','Snack'].includes(t.meal)))||new Set(templates.map((x:any)=>x.id)).size!==templates.length))return false;
  const workoutHistory=data['fitpulse-workout-history'];
  if(workoutHistory!==null&&workoutHistory!==undefined&&(!Array.isArray(workoutHistory)||workoutHistory.length>10000||!workoutHistory.every((w:any)=>isObject(w)&&safeId(w.id)&&['outdoor-walk','indoor-walk','strength'].includes(w.kind)&&numeric(w.startedAt,0,Number.MAX_SAFE_INTEGER)&&Number.isSafeInteger(w.startedAt)&&numeric(w.endedAt,w.startedAt,Number.MAX_SAFE_INTEGER)&&Number.isSafeInteger(w.endedAt)&&numeric(w.durationMs,0,Number.MAX_SAFE_INTEGER)&&Number.isSafeInteger(w.durationMs)&&numeric(w.steps,0,Number.MAX_SAFE_INTEGER)&&Number.isSafeInteger(w.steps)&&(w.distanceMeters===null||numeric(w.distanceMeters,0,Number.MAX_SAFE_INTEGER))&&(w.activeCalories===null||numeric(w.activeCalories,0,Number.MAX_SAFE_INTEGER))&&(w.totalCalories===null||numeric(w.totalCalories,0,Number.MAX_SAFE_INTEGER)))||new Set(workoutHistory.map((x:any)=>x.id)).size!==workoutHistory.length))return false;
  const completed=data['fitpulse-completed-workouts'];
  if(completed!==null&&completed!==undefined&&(!Array.isArray(completed)||completed.length>100000||!completed.every((x:any)=>isObject(x)&&safeId(x.id)&&dateKey(x.date)&&numeric(x.completedAt,0,Number.MAX_SAFE_INTEGER)&&Number.isSafeInteger(x.completedAt)&&Array.isArray(x.setIds)&&x.setIds.length>0&&x.setIds.every((id:unknown)=>safeId(id)&&sets.some((s:any)=>s.id===id)))||new Set(completed.map((x:any)=>x.id)).size!==completed.length))return false;
  if(Array.isArray(completed)){const owned=completed.flatMap((x:any)=>x.setIds);if(new Set(owned).size!==owned.length)return false;}
  for(const key of ['fitpulse-water','fitpulse-weight-history'])if(data[key]!==null&&data[key]!==undefined&&(!data[key]||typeof data[key]!=='object'||Array.isArray(data[key])))return false;
  const water=data['fitpulse-water'] as Record<string,unknown>|undefined; if(water&&Object.entries(water).some(([d,n])=>!dateKey(d)||!numeric(n,0,100000)||!Number.isInteger(n)))return false;
  const weights=data['fitpulse-weight-history'] as Record<string,unknown>|undefined; if(weights&&Object.entries(weights).some(([d,n])=>!dateKey(d)||!numeric(n,20,500)))return false;
  return true;
}