import { useEffect, useMemo, useRef, useState } from 'react';
import { getFoodBarcode } from '@workspace/api-client-react';
import {
  type PremiumState, type MealDraft, type MacroTargets, type Routine, type RoutineExercise,
  PREMIUM_KEY, validPremium, validJournalBackup, restoreDeletedId, scaledMeal, serving, calculatePlates, mergeById,
} from './premiumState';
import './premium-tools.css';
import { adaptLegacyWebMealToJournal, adaptJournalMealToWeb } from './journalSyncCore';

type Meal = MealDraft & { id: string; date: string; time: string; provenance?: string };
type SetRecord = { id: string; exercise: string; weight: number; reps: number; date: string; setType?: 'warmup'|'working'|'drop'|'failure' };
type Completed = { id: string; date: string; completedAt: number; setIds: string[] };
type Profile = MacroTargets & { name: string; goal: string; weight: number; height: number; stepTarget: number; waterGoalMl?:number; age?:number; sex?:string; activity?:string };
type Props = {
  profile: Profile; meals: Meal[]; sets: SetRecord[]; completed: Completed[];
  water: Record<string,number>; weights: Record<string,number>; steps: Record<string,number>;
  today: string; onAddMeal:(meal: MealDraft)=>void; onUpdateMeal:(id:string, meal:MealDraft)=>void; onDeleteMeal:(id:string)=>void;
  onAddSet:(set:{id:string;exercise:string;weight:number;reps:number;date:string;setType:'warmup'|'working'|'drop'|'failure'})=>void;
  onFinish:(setIds:string[])=>void; onUndoDelete:()=>void; canUndoDelete:boolean; onApplyTargets:(targets:MacroTargets)=>void;
  onNavigate:(view:'dashboard'|'macros'|'workout'|'steps'|'insights'|'plan')=>void;
  premium:PremiumState; onPremiumChange:(change:PremiumState|((state:PremiumState)=>PremiumState))=>void; onRestoreProfile:(profile:Profile)=>void;
  onJournalRestore:(records:{meals:Meal[];sets:SetRecord[];completed:Completed[];water:Record<string,number>;weights:Record<string,number>})=>void;
  sessions:unknown[]; onSessionsRestore:(sessions:unknown[])=>void; onDraftRestore:(draft:unknown)=>void;
};
const mealsOfDay=['Breakfast','Lunch','Dinner','Snack'];
const macroNames=['calories','protein','carbs','fat'] as const;
const uid=()=>`${Date.now()}-${crypto.randomUUID()}`;
const dayKey=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const validDateString=(d:unknown)=>{if(typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d))return false;const parsed=new Date(`${d}T12:00:00Z`);return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===d;};
const validWorkoutRecord=(w:any)=>w&&typeof w==='object'&&!Array.isArray(w)&&/^[A-Za-z0-9_-]{1,100}$/.test(w.id)&&['outdoor-walk','indoor-walk','strength'].includes(w.kind)&&Number.isSafeInteger(w.startedAt)&&w.startedAt>=0&&Number.isSafeInteger(w.endedAt)&&w.endedAt>=w.startedAt&&Number.isSafeInteger(w.durationMs)&&w.durationMs>=0&&Number.isSafeInteger(w.steps)&&w.steps>=0&&(w.distanceMeters===null||typeof w.distanceMeters==='number'&&Number.isFinite(w.distanceMeters)&&w.distanceMeters>=0)&&(w.activeCalories===null||typeof w.activeCalories==='number'&&Number.isFinite(w.activeCalories)&&w.activeCalories>=0)&&(w.totalCalories===null||typeof w.totalCalories==='number'&&Number.isFinite(w.totalCalories)&&w.totalCalories>=0);
const validWorkoutDraftBackup=(x:any)=>{
  if(!x||typeof x!=='object'||Array.isArray(x)||typeof x.id!=='string'||x.id.length<1||x.id.length>100||!['outdoor-walk','indoor-walk','strength'].includes(x.kind)||!Number.isFinite(x.startedAt)||!Number.isFinite(x.elapsedMs)||x.elapsedMs<0||!(x.runningSince===null||Number.isFinite(x.runningSince))||!Number.isFinite(x.savedAt))return false;
  if(Array.isArray(x.stepsByDate))return x.stepsByDate.length<=3660&&x.stepsByDate.every((v:any)=>v&&validDateString(v.date)&&Number.isSafeInteger(v.steps)&&v.steps>=0)&&new Set(x.stepsByDate.map((v:any)=>v.date)).size===x.stepsByDate.length&&
    (x.lastObservation===null||x.lastObservation&&validDateString(x.lastObservation.date)&&Number.isSafeInteger(x.lastObservation.steps)&&x.lastObservation.steps>=0);
  return Number.isSafeInteger(x.steps)&&x.steps>=0&&typeof x.sensorSeen==='boolean'&&Number.isFinite(x.strideCm)&&x.strideCm>=30&&x.strideCm<=150&&Number.isFinite(x.weightKg)&&x.weightKg>=20&&x.weightKg<=500;
};
function dbOpen():Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{const request=indexedDB.open('gym-buddy-private-photos',1);request.onupgradeneeded=()=>request.result.createObjectStore('photos');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
}
async function photoWrite(key:string, blob:Blob) {
  const db=await dbOpen(); await new Promise<void>((resolve,reject)=>{const tx=db.transaction('photos','readwrite');tx.objectStore('photos').put(blob,key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});db.close();
}
async function photoWriteMany(entries:Array<{key:string;blob:Blob}>) {
  if(!entries.length)return;const db=await dbOpen();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('photos','readwrite');for(const entry of entries)tx.objectStore('photos').put(entry.blob,entry.key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??new Error('Photo restore transaction was aborted.'));});}finally{db.close();}
}
async function photoRead(key:string):Promise<Blob|null> {
  const db=await dbOpen(); const value=await new Promise<Blob|null>((resolve,reject)=>{const req=db.transaction('photos').objectStore('photos').get(key);req.onsuccess=()=>resolve(req.result??null);req.onerror=()=>reject(req.error);});db.close();return value;
}
async function photoDelete(key:string) {
  const db=await dbOpen();await new Promise<void>((resolve,reject)=>{const tx=db.transaction('photos','readwrite');tx.objectStore('photos').delete(key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});db.close();
}
async function photoHash(blob:Blob) {
  const bytes=new Uint8Array(await blob.arrayBuffer());let hash=2166136261;for(const byte of bytes)hash=Math.imul(hash^byte,16777619);return (hash>>>0).toString(16).padStart(8,'0');
}
function photoIdHash(value:string) {let hash=2166136261;for(let i=0;i<value.length;i++)hash=Math.imul(hash^value.charCodeAt(i),16777619);return(hash>>>0).toString(16).padStart(8,'0');}
function mealDraft(meal:Meal):MealDraft { return {name:meal.name,meal:meal.meal,calories:meal.calories,protein:meal.protein,carbs:meal.carbs,fat:meal.fat}; }
function normalizeBackup(value:any) {
  if (!value || !['GYMBuddy','gym-buddy-backup-v1'].includes(value.format)) throw new Error('Choose a GYM Buddy backup file.');
  if (value.format==='GYMBuddy' && value.version!==1) throw new Error('Unsupported GYM Buddy backup version.');
  const advanced=value.advanced;
  let journal=value.journal;
  if(value.format==='GYMBuddy') {
    if(!journal||journal.version!==1) throw new Error('Journal backup version is invalid.');
    if(!Array.isArray(journal.weights)||journal.weights.length>100000||journal.weights.some((w:any)=>!w||typeof w!=='object'||typeof w.date!=='string'||!Number.isFinite(w.weight)||w.weight<20||w.weight>500)||new Set(journal.weights.map((w:any)=>w.date)).size!==journal.weights.length)throw new Error('Weight history failed validation.');
    const allowed=['fitpulse-workout-sessions','fitpulse-active-workout','@fitpulse/mobile/fasting-session/v1','@fitpulse/mobile/interval-presets/v1','@fitpulse/mobile/meal-templates/v1','@fitpulse/mobile/form-drafts/v1','@fitpulse/mobile/rest/free','@fitpulse/mobile/rest/guided'];
    if(!value.localSessions||typeof value.localSessions!=='object'||Array.isArray(value.localSessions))throw new Error('Invalid local session backup.');
    for(const [key,raw] of Object.entries(value.localSessions)){if(!allowed.includes(key)||typeof raw!=='string'||raw.length>2_000_000)throw new Error('Invalid local session backup key or size.');const parsed=JSON.parse(raw);if(!parsed||typeof parsed!=='object')throw new Error('Invalid local session data.');
      if(key==='fitpulse-workout-sessions'&&(!Array.isArray(parsed)||parsed.length>10000||!parsed.every(validWorkoutRecord)||new Set(parsed.map((x:any)=>x.id)).size!==parsed.length))throw new Error('Workout session backup failed validation.');
      if(key==='@fitpulse/mobile/meal-templates/v1'&&!Array.isArray(parsed))throw new Error('Meal template backup failed validation.');
      if(key==='fitpulse-active-workout'&&!validWorkoutDraftBackup(parsed))throw new Error('Active workout backup failed validation.');
    }
    journal={
      'fitpulse-profile':journal.profile,
      'fitpulse-macros':journal.meals,
      'fitpulse-workouts':journal.sets,
      'fitpulse-completed-workouts':journal.completedWorkouts,
      'fitpulse-water':journal.water,
      'fitpulse-weight-history':Object.fromEntries(journal.weights.map((w:any)=>[w.date,w.weight])),
      'fitpulse-meal-templates':value.localSessions?.['@fitpulse/mobile/meal-templates/v1']?JSON.parse(value.localSessions['@fitpulse/mobile/meal-templates/v1']):null,
    };
  }
  if(!validPremium(advanced)||!validJournalBackup(journal)) throw new Error('Backup validation failed. No saved records were changed.');
  return {format:'gym-buddy-backup-v1',journal,advanced,localSessions:value.localSessions??{},restorePreferences:false};
}

export default function PremiumTools(props:Props) {
  const state=props.premium; const setState=props.onPremiumChange;
  const [section,setSection]=useState('Food library');
  const [message,setMessage]=useState('');
  const [mealName,setMealName]=useState(''); const [mealType,setMealType]=useState('Snack');
  const [nutri,setNutri]=useState({calories:'',protein:'',carbs:'',fat:''});
  const [ingredientNutri,setIngredientNutri]=useState(()=>state.recipeDraft?.macros??{calories:'',protein:'',carbs:'',fat:''});
  const [multiplier,setMultiplier]=useState('1'); const [editingMeal,setEditingMeal]=useState<string|null>(null);
  const [recipeName,setRecipeName]=useState(()=>state.recipeDraft?.name??''); const [servings,setServings]=useState(()=>state.recipeDraft?.servings??'1'); const [ingredients,setIngredients]=useState<MealDraft[]>(()=>state.recipeDraft?.ingredients??[]);
  const [ingredientName,setIngredientName]=useState(()=>state.recipeDraft?.ingredientName??''); const [routineName,setRoutineName]=useState(()=>state.routineDraft?.name??''); const [exerciseName,setExerciseName]=useState(()=>state.routineDraft?.newExercise??'');
  const [exerciseWeight,setExerciseWeight]=useState(()=>state.routineDraft?.newWeight??''); const [exerciseReps,setExerciseReps]=useState(()=>state.routineDraft?.newReps??''); const [routineExercises,setRoutineExercises]=useState<RoutineExercise[]>(()=>state.routineDraft?.exercises??[]);
  const [routineEdit,setRoutineEdit]=useState<string|null>(()=>state.routineDraft?.editing??null); const [recipeEdit,setRecipeEdit]=useState<string|null>(()=>state.recipeDraft?.editing??null); const [active,setActive]=useState<PremiumState['guided']>(()=>state.guided);
  const [guidedWeight,setGuidedWeight]=useState(()=>state.guided?.weight??''); const [guidedReps,setGuidedReps]=useState(()=>state.guided?.reps??''); const [guidedSetType,setGuidedSetType]=useState<'warmup'|'working'|'drop'|'failure'>('working'); const [platesWeight,setPlatesWeight]=useState('100'); const [barWeight,setBarWeight]=useState('20');
  const [calendarMonth,setCalendarMonth]=useState(()=>new Date()); const [selectedDay,setSelectedDay]=useState(props.today);
  const [targets,setTargets]=useState<MacroTargets|null>(null); const [targetKind,setTargetKind]=useState<'training'|'rest'>('training'); const [photoUrls,setPhotoUrls]=useState<Record<string,string>>({});
  const photoUrlMap=useRef<Record<string,string>>({});
  const [photoNote,setPhotoNote]=useState(''); const [incoming,setIncoming]=useState<any>(null); const [restoreProfile,setRestoreProfile]=useState(false);
  const cameraRef=useRef<HTMLVideoElement>(null); const streamRef=useRef<MediaStream|null>(null);
  const [barcode,setBarcode]=useState(''); const [barcodeOpen,setBarcodeOpen]=useState(false);
  const [scanMessage,setScanMessage]=useState('');
  const [barcodeBusy,setBarcodeBusy]=useState(false); const [product,setProduct]=useState<MealDraft|null>(null); const [grams,setGrams]=useState('100');
  const lookupBarcode=async(code:string)=>{const clean=code.trim();if(!/^\d{8,14}$/.test(clean)){setScanMessage('Enter an 8–14 digit product barcode.');return;}setBarcode(clean);setProduct(null);setBarcodeBusy(true);setScanMessage('');
    try{const food=await getFoodBarcode(clean);setProduct({name:food.name,meal:'Snack',calories:food.calories,protein:food.protein,carbs:food.carbs,fat:food.fat});}
    catch(error){setScanMessage(`Could not retrieve complete nutrition. ${error instanceof Error?error.message:'Lookup failed'}. Check the package label and enter nutrition manually.`);}
    finally{setBarcodeBusy(false);}
  };
  const premiumWritable=useRef((()=>{try{const raw=localStorage.getItem(PREMIUM_KEY);return raw===null||validPremium(JSON.parse(raw));}catch{return false;}})());
  const warnedPremium=useRef(false);
  useEffect(()=>{if(!premiumWritable.current){if(!warnedPremium.current){warnedPremium.current=true;setMessage('Saved advanced data failed validation and was preserved. Import a valid backup before changing these settings.');}return;}try{localStorage.setItem(PREMIUM_KEY,JSON.stringify(state));}catch{setMessage('Advanced tools could not save. Existing device data was retained.');}},[state]);
  useEffect(()=>{const routineDraft={editing:routineEdit,name:routineName,exercises:routineExercises,newExercise:exerciseName,newWeight:exerciseWeight,newReps:exerciseReps};const recipeDraft={editing:recipeEdit,name:recipeName,servings,ingredients,ingredientName,macros:{...ingredientNutri}};setState(s=>JSON.stringify(s.routineDraft)===JSON.stringify(routineDraft)&&JSON.stringify(s.recipeDraft)===JSON.stringify(recipeDraft)?s:{...s,routineDraft,recipeDraft});},[routineEdit,recipeEdit,routineName,routineExercises,exerciseName,exerciseWeight,exerciseReps,recipeName,servings,ingredients,ingredientName,ingredientNutri]);
  useEffect(()=>{if(!active)return;const guided={...active,weight:guidedWeight,reps:guidedReps};setActive(guided);setState(s=>JSON.stringify(s.guided)===JSON.stringify(guided)?s:{...s,guided});},[guidedWeight,guidedReps]);
  useEffect(()=>{const root=document.documentElement;const media=window.matchMedia('(prefers-color-scheme: dark)');const setTheme=()=>root.classList.toggle('dark',state.settings.appearance==='dark'||(state.settings.appearance==='system'&&media.matches));setTheme();media.addEventListener('change',setTheme);return()=>media.removeEventListener('change',setTheme);},[state.settings.appearance]);
  useEffect(()=>{let active=true;const load=async()=>{for(const photo of state.photos){if(!photo.key||photoUrlMap.current[photo.id])continue;try{const blob=await photoRead(photo.key);if(blob&&active)photoUrlMap.current[photo.id]=URL.createObjectURL(blob);}catch{if(active)setMessage('A saved private photo could not be opened; other records are unchanged.');}}if(active)setPhotoUrls({...photoUrlMap.current});};void load();return()=>{active=false;Object.values(photoUrlMap.current).forEach(URL.revokeObjectURL);photoUrlMap.current={};};},[state.photos]);
  useEffect(()=>{if(!barcodeOpen)return;let stream:MediaStream|null=null;let raf=0;let stop=false;
    const start=async()=>{try{if(!('BarcodeDetector'in window)){setScanMessage('Live barcode recognition is not available in this browser. Enter the barcode manually below.');return;}
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});streamRef.current=stream;if(cameraRef.current)cameraRef.current.srcObject=stream;
      const Detector=(window as any).BarcodeDetector;const detector=new Detector({formats:['ean_13','ean_8','upc_a','upc_e']});
      const scan=async()=>{if(stop||!cameraRef.current)return;try{const hits=await detector.detect(cameraRef.current);if(hits[0]){setBarcode(hits[0].rawValue);closeCamera();void lookupBarcode(hits[0].rawValue);return;}}catch{/* keep scan loop alive */}raf=requestAnimationFrame(()=>void scan());};void scan();
    }catch{setScanMessage('Camera access was unavailable. Enter the barcode manually below.');}};
    void start();return()=>{stop=true;cancelAnimationFrame(raf);stream?.getTracks().forEach(t=>t.stop());streamRef.current=null;};
  },[barcodeOpen]);
  const closeCamera=()=>{streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null;};
  const shownTargets=state.dayMode==='standard'?props.profile:state.dayTargets[state.dayMode];
  const recent=useMemo(()=>props.meals.filter((m,i,a)=>a.findIndex(x=>x.name.toLowerCase()===m.name.toLowerCase())===i).slice(0,10),[props.meals]);
  const setTab=(name:string)=>{setSection(name);setMessage('');};
  const scaled=(meal:MealDraft,factor=Number(multiplier))=>{try{props.onAddMeal(scaledMeal(meal,factor));setMessage(`${meal.name} logged at ${factor}× portion.`);}catch(e){setMessage((e as Error).message);}};
  const saveFavorite=(m:MealDraft)=>setState(s=>s.favourites.some(x=>x.name.toLowerCase()===m.name.toLowerCase()&&x.calories===m.calories)?s:{...s,favourites:[...s.favourites,{...m,id:uid()}]});
  const submitMeal=(event:React.FormEvent)=>{event.preventDefault();const values=Object.fromEntries(macroNames.map(k=>[k,Number(nutri[k])])) as unknown as Pick<MealDraft,'calories'|'protein'|'carbs'|'fat'>;const clean=mealName.trim();
    if(!clean||clean.length>120||!Number.isFinite(values.calories)||values.calories<=0||values.calories>10000||[values.protein,values.carbs,values.fat].some(v=>!Number.isFinite(v)||v<0||v>1000)){setMessage('Enter a name and valid calories and macros.');return;}
    const meal={name:clean,meal:mealType,...values};if(editingMeal)props.onUpdateMeal(editingMeal,meal);else props.onAddMeal(meal);setEditingMeal(null);setMealName('');setNutri({calories:'',protein:'',carbs:'',fat:''});setMessage(editingMeal?'Meal updated.':'Meal logged.');
  };
  const beginEdit=(m:Meal)=>{setEditingMeal(m.id);setMealName(m.name);setMealType(m.meal);setNutri({calories:String(m.calories),protein:String(m.protein),carbs:String(m.carbs),fat:String(m.fat)});setSection('Food library');window.scrollTo({top:0,behavior:'smooth'});};
  const pendingIngredient=():MealDraft=>{
    const m={name:ingredientName.trim(),meal:'Lunch',calories:Number(ingredientNutri.calories),protein:Number(ingredientNutri.protein),carbs:Number(ingredientNutri.carbs),fat:Number(ingredientNutri.fat)};
    if(!m.name||m.name.length>120||!ingredientNutri.calories.trim()||!Number.isFinite(m.calories)||m.calories<0||m.calories>10000||[m.protein,m.carbs,m.fat].some(x=>!Number.isFinite(x)||x<0||x>1000))throw new Error('Enter an ingredient name and nutrition within 0–10,000 kcal and 0–1,000 g per macro.');
    return m;
  };
  const clearIngredient=()=>{setIngredientName('');setIngredientNutri({calories:'',protein:'',carbs:'',fat:''});};
  const addIngredient=()=>{try{if(ingredients.length>=100)throw new Error('Use at most 100 ingredients per recipe.');const ingredient=pendingIngredient();setIngredients(a=>[...a,ingredient]);clearIngredient();setMessage('Ingredient added to recipe.');}catch(e){setMessage((e as Error).message);}};
  const saveRecipe=()=>{try{
    const recipeIngredients=ingredientName.trim()||Object.values(ingredientNutri).some(x=>x.trim())?[...ingredients,pendingIngredient()]:ingredients;
    const servingsN=Number(servings);if(!recipeName.trim()||recipeName.trim().length>120||!Number.isFinite(servingsN)||servingsN<.01||servingsN>1000||!recipeIngredients.length||recipeIngredients.length>100)throw new Error('Add a recipe name, 0.01–1,000 servings and at least one ingredient.');
    const r={id:recipeEdit??uid(),name:recipeName.trim(),servings:servingsN,ingredients:recipeIngredients};serving(r);setState(s=>({...s,recipes:[...s.recipes.filter(x=>x.id!==r.id),r]}));setRecipeName('');setIngredients([]);clearIngredient();setServings('1');setRecipeEdit(null);setMessage('Recipe saved on this device.');
  }catch(e){setMessage((e as Error).message);}};
  const addExercise=()=>{const w=Number(exerciseWeight),r=Number(exerciseReps);if(!exerciseName.trim()||!Number.isFinite(w)||w<=0||w>500||!Number.isInteger(r)||r<1||r>30){setMessage('Enter an exercise, 0.01–500 kg and 1–30 whole reps.');return;}setRoutineExercises(xs=>[...xs,{name:exerciseName.trim(),weight:w,reps:r}]);setExerciseName('');setExerciseWeight('');setExerciseReps('');};
  const saveRoutine=()=>{if(!routineName.trim()||!routineExercises.length){setMessage('Add a routine name and at least one exercise.');return;}const r={id:routineEdit??uid(),name:routineName.trim(),exercises:routineExercises};setState(s=>({...s,routines:[...s.routines.filter(x=>x.id!==r.id),r],routineDraft:null}));setRoutineName('');setRoutineExercises([]);setRoutineEdit(null);setMessage('Routine saved.');};
  const startRoutine=(routine:Routine)=>{if(!routine.exercises.length)return;const g={routine,index:0,startedAt:Date.now(),weight:String(routine.exercises[0].weight),reps:String(routine.exercises[0].reps),setIds:[] as string[]};setActive(g);setGuidedWeight(g.weight);setGuidedReps(g.reps);setState(s=>({...s,guided:g}));};
  const logGuided=()=>{if(!active)return;const w=Number(guidedWeight),r=Number(guidedReps),exercise=active.routine.exercises[active.index];if(!Number.isFinite(w)||w<=0||w>500||!Number.isInteger(r)||r<1||r>30){setMessage('Enter valid working weight and reps.');return;}const id=uid();props.onAddSet({id,exercise:exercise.name,weight:w,reps:r,date:props.today,setType:guidedSetType});const next={...active,setIds:[...(active.setIds??[]),id]};setActive(next);setState(s=>({...s,guided:next}));setMessage('Set saved to your strength journal.');};
  const advance=(delta:number)=>{if(!active)return;const index=Math.max(0,Math.min(active.routine.exercises.length-1,active.index+delta));const next={...active,index,weight:String(active.routine.exercises[index].weight),reps:String(active.routine.exercises[index].reps)};setActive(next);setGuidedWeight(next.weight);setGuidedReps(next.reps);setState(s=>({...s,guided:next}));};
  const finishGuided=()=>{if(!active)return;const ids=active.setIds??[];if(!ids.length){setMessage('Log at least one set before finishing.');return;}props.onFinish(ids);setActive(null);setState(s=>({...s,guided:null}));setMessage('Guided session marked complete.');};
  const days=()=>{const y=calendarMonth.getFullYear(),m=calendarMonth.getMonth(),first=new Date(y,m,1).getDay(),count=new Date(y,m+1,0).getDate();return [...Array(first).fill(null),...Array.from({length:count},(_,i)=>dayKey(new Date(y,m,i+1,12)))];};
  const dateHasRecords=(day:string)=>props.meals.some(x=>x.date===day)||props.sets.some(x=>x.date===day)||!!props.water[day]||props.weights[day]!==undefined;
  const importBackup=(file:unknown)=>{if(!file||typeof file!=='object')throw new Error('Backup file is not a valid object.');const incoming=file as any;if(incoming.format!=='gym-buddy-backup-v1'||!validPremium(incoming.advanced)||!validJournalBackup(incoming.journal))throw new Error('Backup validation failed. No records were changed.');const journal=incoming.journal;
    const syncState=(()=>{const raw=localStorage.getItem('fitpulse-journal-sync-state');return raw===null?null:JSON.parse(raw);})();
    if(syncState!==null&&(!syncState||typeof syncState!=='object'||!syncState.tombstones||typeof syncState.tombstones!=='object'||Array.isArray(syncState.tombstones)))throw new Error('Paired deletion markers failed validation. No backup data was changed.');
    const tomb=syncState?.tombstones??{};
    const currentMeals=JSON.parse(localStorage.getItem('fitpulse-macros')||'[]').map(adaptLegacyWebMealToJournal);const currentSets=JSON.parse(localStorage.getItem('fitpulse-workouts')||'[]');const currentCompleted=JSON.parse(localStorage.getItem('fitpulse-completed-workouts')||'[]');
    const incomingMeals=journal['fitpulse-macros'];const incomingSets=journal['fitpulse-workouts'];
    const mealIds=new Map<string,string>(incomingMeals.map((m:any)=>[m.id,restoreDeletedId('meal',m.id,tomb,currentMeals,m)]));
    const setIds=new Map<string,string>(incomingSets.map((s:any)=>[s.id,restoreDeletedId('strengthSet',s.id,tomb,currentSets,s)]));
    const nextMeals=mergeById<Meal>(currentMeals as Meal[],incomingMeals.map((m:any)=>({...m,id:mealIds.get(m.id)!} as Meal)));
    const nextSets=mergeById<SetRecord>(currentSets as SetRecord[],incomingSets.map((s:any)=>({...s,id:setIds.get(s.id)!} as SetRecord)));
    const candidateCompleted=Array.isArray(journal['fitpulse-completed-workouts'])?journal['fitpulse-completed-workouts'].map((w:any)=>({
      ...w,id:restoreDeletedId('completedWorkout',w.id,tomb,currentCompleted,{...w,setIds:w.setIds.map((id:string)=>setIds.get(id)??id)}),
      setIds:w.setIds.map((id:string)=>setIds.get(id)??id),
    })):[];
    const conflictedSetIds=new Set(incomingSets.filter((set:any)=>{const prior=currentSets.find((x:any)=>x.id===set.id);return prior&&JSON.stringify(prior)!==JSON.stringify(set);}).map((set:any)=>setIds.get(set.id)??set.id));
    const claimedSetIds=new Set<string>(currentCompleted.flatMap((w:any)=>w.setIds));
    const safeCompleted=candidateCompleted.filter((workout:any)=>!currentCompleted.some((x:any)=>x.id===workout.id)&&
      workout.setIds.every((id:string)=>!claimedSetIds.has(id)&&!conflictedSetIds.has(id))&&
      (()=>{if(workout.setIds.some((id:string)=>claimedSetIds.has(id)))return false;workout.setIds.forEach((id:string)=>claimedSetIds.add(id));return true;})());
    const nextCompleted=mergeById(currentCompleted,safeCompleted);
    const currentWater=JSON.parse(localStorage.getItem('fitpulse-water')||'{}');const currentWeights=JSON.parse(localStorage.getItem('fitpulse-weight-history')||'{}');
    const nextWater={...(journal['fitpulse-water']??{}),...currentWater};const nextWeights={...(journal['fitpulse-weight-history']??{}),...currentWeights};
    const currentTemplates=JSON.parse(localStorage.getItem('fitpulse-meal-templates')||'[]');
    const nextTemplates=Array.isArray(journal['fitpulse-meal-templates'])?mergeById(currentTemplates,journal['fitpulse-meal-templates'] as any[]):currentTemplates;
    const currentJournal={'fitpulse-macros':currentMeals,'fitpulse-workouts':currentSets,'fitpulse-completed-workouts':currentCompleted,'fitpulse-water':currentWater,'fitpulse-weight-history':currentWeights,'fitpulse-meal-templates':currentTemplates};
    const nextJournal={'fitpulse-macros':nextMeals,'fitpulse-workouts':nextSets,'fitpulse-completed-workouts':nextCompleted,'fitpulse-water':nextWater,'fitpulse-weight-history':nextWeights,'fitpulse-meal-templates':nextTemplates};
    if(!validJournalBackup(currentJournal)||!validJournalBackup(nextJournal)||!props.sessions.every(validWorkoutRecord))throw new Error('The local journal or merge failed validation. Nothing was replaced.');
    const sessionText=incoming.localSessions?.['fitpulse-workout-sessions'];
    const importedSessions=typeof sessionText==='string'?JSON.parse(sessionText):[];
    if(!Array.isArray(importedSessions)||!importedSessions.every(validWorkoutRecord)||new Set(importedSessions.map((x:any)=>x.id)).size!==importedSessions.length)throw new Error('Workout sessions failed validation. Nothing was replaced.');
    const restoredWebMeals=nextMeals.map(meal=>adaptJournalMealToWeb({...meal})) as Meal[];
    const writes:[string,unknown][]=[['fitpulse-macros',restoredWebMeals],['fitpulse-workouts',nextSets],['fitpulse-completed-workouts',nextCompleted],['fitpulse-water',nextWater],['fitpulse-weight-history',nextWeights]];
    if(Array.isArray(journal['fitpulse-meal-templates']))writes.push(['fitpulse-meal-templates',nextTemplates]);
    const prior=writes.map(([k])=>[k,localStorage.getItem(k)] as const);
    try{writes.forEach(([k,v])=>localStorage.setItem(k,JSON.stringify(v)));}catch(error){for(const [k,v]of prior){try{if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v);}catch{/* leave remaining original keys untouched where possible */}}throw new Error('Browser storage could not complete the merge. Existing journal data was restored where possible.');}
    props.onJournalRestore({meals:restoredWebMeals,sets:nextSets,completed:nextCompleted,water:nextWater,weights:nextWeights});
    if(importedSessions.length)props.onSessionsRestore(importedSessions);
    const draftText=incoming.localSessions?.['fitpulse-active-workout'];if(typeof draftText==='string'&&localStorage.getItem('fitpulse-active-workout')===null)props.onDraftRestore(JSON.parse(draftText));
    if(restoreProfile&&journal['fitpulse-profile'])props.onRestoreProfile(journal['fitpulse-profile']);
    premiumWritable.current=true;
    setState(s=>({...s,routines:mergeById(s.routines,incoming.advanced.routines),favourites:mergeById(s.favourites,incoming.advanced.favourites),recipes:mergeById(s.recipes,incoming.advanced.recipes),guided:s.guided??incoming.advanced.guided,routineDraft:s.routineDraft??incoming.advanced.routineDraft,recipeDraft:s.recipeDraft??incoming.advanced.recipeDraft,...(incoming.restorePreferences?{settings:incoming.advanced.settings,equipment:incoming.advanced.equipment,dayMode:incoming.advanced.dayMode,dayTargets:incoming.advanced.dayTargets}:{})}));
    window.dispatchEvent(new Event('fitpulse:journal-storage-change'));setIncoming(null);setMessage('Restore merged. Existing IDs and daily water or weight values were kept. Paired deletion markers remain respected.');
  };
  const exportBackup=async(includePhotos:boolean)=>{const read=(key:string)=>{try{return JSON.parse(localStorage.getItem(key)||'null');}catch{throw new Error(`Cannot export invalid saved data (${key}).`);}};
    const storedProfile=read('fitpulse-profile')??props.profile;const profile={...storedProfile,waterGoalMl:read('fitpulse-water-goal')??2000,age:26,sex:'male',activity:'moderate'};const meals=read('fitpulse-macros')??[];const sets=read('fitpulse-workouts')??[];const completedWorkouts=read('fitpulse-completed-workouts')??[];const water=read('fitpulse-water')??{};const weights=read('fitpulse-weight-history')??{};
    const localSessions:Record<string,string>={};const mealTemplates=read('fitpulse-meal-templates');const sessions=read('fitpulse-workout-sessions');
    if(mealTemplates)localSessions['@fitpulse/mobile/meal-templates/v1']=JSON.stringify(mealTemplates);
    if(sessions)localSessions['fitpulse-workout-sessions']=JSON.stringify(sessions);
    const activeWorkout=read('fitpulse-active-workout');if(activeWorkout)localSessions['fitpulse-active-workout']=JSON.stringify(activeWorkout);
    const journal={version:1,profile,meals:meals.map((m:any)=>adaptLegacyWebMealToJournal(m)),sets,completedWorkouts,water,weights:Object.entries(weights).map(([date,weight])=>({date,weight}))};
    const photos=includePhotos?await Promise.all(state.photos.map(async p=>{if(!p.key)throw new Error('A local progress photo could not be opened; backup was not created.');const blob=await photoRead(p.key);if(!blob)throw new Error('A private photo could not be read; backup was not created.');return {...p,uri:await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);}),key:undefined};})): [];
    const advanced={...state,photos};
    const backup={format:'GYMBuddy',version:1,exportedAt:new Date().toISOString(),journal,advanced,localSessions};
    const text=JSON.stringify(backup);if(text.length>40_000_000)throw new Error('Backup exceeds 40 MB. Export without photos or choose smaller photos.');
    const blob=new Blob([text],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`gym-buddy-${props.today}.json`;a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);setMessage('Private backup downloaded. Pairing keys and journal sync credentials are never exported.');
  };
  const restorePhotos=async()=>{
    if(!incoming?.advanced?.photos?.length)return;
    const additions:Array<{key:string;blob:Blob;photo:PremiumState['photos'][number]}>=[];let skippedLocalOnly=false;
    const known=[...state.photos];
    for(const photo of incoming.advanced.photos as PremiumState['photos']){
      const data=photo.uri;if(!data?.startsWith('data:image/')){skippedLocalOnly=true;continue;}
      const blob=await(await fetch(data)).blob();const contentHash=await photoHash(blob);const sourceId=photo.sourceId??photo.id;
      const equivalent=known.find(x=>(x.sourceId??x.id)===sourceId&&x.contentHash===contentHash&&x.date===photo.date&&x.note===photo.note);
      if(equivalent)continue;
      const sameSource=known.find(x=>x.id===photo.id);
      if(sameSource&&sameSource.key){const saved=await photoRead(sameSource.key);if(saved&&await photoHash(saved)===contentHash)continue;}
      let id=photo.id;
      if(sameSource){const base=`restored-${photoIdHash(`${sourceId}:${contentHash}:${photo.date}:${photo.note}`)}`;let generation=0;
        while(true){const candidate=`${base}-${generation++}`;const found=known.find(x=>x.id===candidate);
          if(!found){id=candidate;break;}
          if(found.contentHash===contentHash&&found.date===photo.date&&found.note===photo.note){id=found.id;break;}
          if(found.key&&found.date===photo.date&&found.note===photo.note){const saved=await photoRead(found.key);if(saved&&await photoHash(saved)===contentHash){id=found.id;break;}}
        }
        if(known.some(x=>x.id===id&&x.contentHash===contentHash&&x.date===photo.date&&x.note===photo.note))continue;
      }
      const key=`photo-${uid()}`;const savedPhoto={id,date:photo.date,note:photo.note,key,sourceId,contentHash};
      additions.push({key,blob,photo:savedPhoto});known.push(savedPhoto);
    }
    if(!additions.length){if(skippedLocalOnly)setMessage('Journal restored. Some photos use device-local paths and were not portable; export again with photos included.');return;}
    await photoWriteMany(additions);
    setState(s=>({...s,photos:[...s.photos,...additions.map(x=>x.photo)]}));
    setMessage(`${additions.length} private progress photo${additions.length===1?'':'s'} restored locally.${skippedLocalOnly?' Device-local photos were skipped.':''}`);
  };

  return <div className="pt-page">
    <header className="pt-header"><div><span className="pt-kicker">YOUR PERSONAL WORKSPACE</span><h1>Tools for your rhythm.</h1><p>Food, training, history and private preferences—saved on this device.</p></div><button className="pt-back" onClick={()=>props.onNavigate('dashboard')}>Back to today</button></header>
    <nav className="pt-tabs" aria-label="Personal tools">{['Food library','Training','Calendar','Preferences','Backup & photos'].map(tab=><button type="button" key={tab} className={section===tab?'active':''} onClick={()=>setTab(tab)}>{tab}</button>)}</nav>
    {message&&<p className="pt-message" role="status" data-testid="status-premium-tools">{message}</p>}
    {section==='Food library'&&<div className="pt-columns">
      <section className="pt-panel"><h2>Quick meal entry</h2><p>Use your own nutrition data. Portion scaling applies to every macro.</p>
        <form onSubmit={submitMeal}><label>Food name<input required maxLength={120} value={mealName} onChange={e=>setMealName(e.target.value)}/></label><label>Meal<select value={mealType} onChange={e=>setMealType(e.target.value)}>{mealsOfDay.map(x=><option key={x}>{x}</option>)}</select></label>
        <div className="pt-fields">{macroNames.map(k=><label key={k}>{k==='calories'?'Calories (kcal)':`${k} (g)`}<input type="number" min="0" step="any" required={k==='calories'} value={nutri[k]} onChange={e=>setNutri(n=>({...n,[k]:e.target.value}))}/></label>)}</div>
        <button className="pt-primary" type="submit">{editingMeal?'Save meal changes':'Log meal'}</button>{editingMeal&&<button type="button" className="pt-secondary" onClick={()=>{setEditingMeal(null);setMealName('');}}>Cancel edit</button>}</form>
        <div className="pt-divider"/><h3>Barcode lookup</h3><p>Lookup uses the product barcode only. Community nutrition can be incomplete; verify package labels. You can always enter macros above.</p>
        <div className="pt-scanner"><label>Barcode / product code<input value={barcode} onChange={e=>setBarcode(e.target.value)} inputMode="numeric" aria-label="Product barcode"/></label>
          <button className="pt-secondary" disabled={barcodeBusy} onClick={()=>void lookupBarcode(barcode)}>{barcodeBusy?'Looking up…':'Look up barcode'}</button>
          <button className="pt-secondary" onClick={()=>{setBarcodeOpen(true);setScanMessage('Point the camera at a product barcode.');}}>Open camera scanner</button>
          {barcodeOpen&&<><video ref={cameraRef} autoPlay muted playsInline aria-label="Barcode camera preview"/><button className="pt-secondary" onClick={()=>{setBarcodeOpen(false);closeCamera();}}>Close camera</button></>}
          {scanMessage&&<p role="status">{scanMessage}</p>}
          {product&&<div className="pt-result"><strong>{product.name}</strong><p>Per 100 g · {product.calories} kcal · P {product.protein} g · C {product.carbs} g · F {product.fat} g</p><label>Amount eaten (g)<input type="number" min=".01" max="10000" value={grams} onChange={e=>setGrams(e.target.value)}/></label><button className="pt-primary" onClick={()=>{try{scaled({...product,meal:mealType},Number(grams)/100);}catch(error){setMessage((error as Error).message);}}}>Scale & log product</button><small>Food data source: Open Food Facts, per 100 g</small></div>}
        </div>
      </section>
      <section className="pt-panel"><h2>Recent & favourites</h2><label>Portion multiplier<input type="number" min=".01" max="100" step=".1" value={multiplier} onChange={e=>setMultiplier(e.target.value)}/></label>
        <h3>Recent meals</h3>{recent.length?recent.map(m=><div className="pt-row" key={m.id}><div><strong>{m.name}</strong><small>{m.calories} kcal · P {m.protein} · C {m.carbs} · F {m.fat} g</small></div><button onClick={()=>scaled(mealDraft(m))}>Log ×</button><button onClick={()=>saveFavorite(mealDraft(m))}>Favourite</button></div>):<p className="pt-empty">Your logged meals will appear here.</p>}
        <h3>Favourites</h3>{state.favourites.map(m=><div className="pt-row" key={m.id}><div><strong>{m.name}</strong><small>{m.calories} kcal</small></div><button onClick={()=>scaled(m)}>Log ×</button><button onClick={()=>setState(s=>({...s,favourites:s.favourites.filter(x=>x.id!==m.id)}))}>Remove</button></div>)}
        {!state.favourites.length&&<p className="pt-empty">Save any recent meal to keep it close.</p>}
      </section>
      <section className="pt-panel pt-wide"><h2>Recipes</h2><p>Ingredient values are totals for the full recipe. Serving nutrition is calculated automatically.</p>
        <div className="pt-fields"><label>Recipe name<input value={recipeName} onChange={e=>setRecipeName(e.target.value)} maxLength={120}/></label><label>Servings<input type="number" min=".01" step=".1" value={servings} onChange={e=>setServings(e.target.value)}/></label></div>
        <div className="pt-fields"><label>Ingredient<input maxLength={120} value={ingredientName} onChange={e=>setIngredientName(e.target.value)}/></label>{macroNames.map(k=><label key={k}>{k}<input type="number" min="0" step="any" value={ingredientNutri[k]} onChange={e=>setIngredientNutri(n=>({...n,[k]:e.target.value}))}/></label>)}</div>
        <button className="pt-secondary" onClick={addIngredient}>Add ingredient</button>{ingredients.map((i,n)=><div className="pt-row" key={`${i.name}-${n}`}><span>{i.name} · {i.calories} kcal</span><button onClick={()=>setIngredients(xs=>xs.filter((_,idx)=>idx!==n))}>Remove</button></div>)}
        <button className="pt-primary" onClick={saveRecipe}>Save recipe</button>
        {state.recipes.map(r=><article className="pt-recipe" key={r.id}><div><strong>{r.name}</strong><small>{r.servings} servings · {serving(r).calories} kcal per serving · P {serving(r).protein} · C {serving(r).carbs} · F {serving(r).fat} g</small></div><button onClick={()=>scaled(serving(r))}>Review & log</button><button onClick={()=>{setRecipeName(r.name);setServings(String(r.servings));setIngredients(r.ingredients);setRecipeEdit(r.id);}}>Edit</button><button onClick={()=>setState(s=>({...s,recipes:s.recipes.filter(x=>x.id!==r.id)}))}>Delete</button></article>)}
      </section>
      <section className="pt-panel pt-wide"><h2>Today’s log</h2>{props.meals.map(m=><div className="pt-row" key={m.id}><div><strong>{m.name}</strong><small>{m.meal} · {m.time} · {m.calories} kcal · P {m.protein}g / C {m.carbs}g / F {m.fat}g</small></div><button onClick={()=>beginEdit(m)}>Edit</button><button onClick={()=>{props.onDeleteMeal(m.id);setMessage('Meal deleted.');}}>Delete</button></div>)}<button className="pt-secondary" disabled={!props.canUndoDelete} onClick={()=>{props.onUndoDelete();setMessage('Meal restored.');}}>Undo last meal deletion</button></section>
    </div>}
    {section==='Training'&&<div className="pt-columns">
      <section className="pt-panel"><h2>{routineEdit?'Edit routine':'Build a routine'}</h2><label>Routine name<input value={routineName} onChange={e=>setRoutineName(e.target.value)}/></label>
        <div className="pt-fields"><label>Exercise<input value={exerciseName} onChange={e=>setExerciseName(e.target.value)}/></label><label>Planned weight (kg)<input type="number" value={exerciseWeight} onChange={e=>setExerciseWeight(e.target.value)}/></label><label>Reps<input type="number" value={exerciseReps} onChange={e=>setExerciseReps(e.target.value)}/></label></div>
        <button className="pt-secondary" onClick={addExercise}>Add exercise</button>{routineExercises.map((e,i)=><div className="pt-row" key={`${e.name}-${i}`}><span>{i+1}. {e.name} · {e.weight} kg × {e.reps}</span><button onClick={()=>setRoutineExercises(xs=>xs.filter((_,n)=>n!==i))}>Remove</button></div>)}
        <button className="pt-primary" onClick={saveRoutine}>Save routine</button>
        <h3>Exercise alternatives</h3><p>Choose a movement group and see substitutions matching the equipment you have.</p>
        <label>Available equipment<select multiple value={state.equipment} onChange={e=>setState(s=>({...s,equipment:Array.from(e.target.selectedOptions).map(o=>o.value)}))}>{['barbell','dumbbells','machines','cables','bodyweight'].map(x=><option key={x}>{x}</option>)}</select></label>
        <label>Exercise to replace<input value={exerciseName} onChange={e=>setExerciseName(e.target.value)} placeholder="e.g. Bench press"/></label>
        {alternativeExercises(exerciseName,state.equipment).map(x=><button className="pt-chip" key={x} onClick={()=>setExerciseName(x)}>Use {x}</button>)}
      </section>
      <section className="pt-panel"><h2>Saved routines</h2>{state.routines.map(r=><article className="pt-routine" key={r.id}><div><strong>{r.name}</strong><small>{r.exercises.map(x=>x.name).join(' · ')}</small></div><div className="pt-actions"><button onClick={()=>startRoutine(r)}>Start guided</button><button onClick={()=>{setRoutineEdit(r.id);setRoutineName(r.name);setRoutineExercises(r.exercises);}}>Edit</button><button onClick={()=>setState(s=>({...s,routines:s.routines.filter(x=>x.id!==r.id)}))}>Delete</button></div></article>)}
        {!state.routines.length&&<p className="pt-empty">Build your first routine to keep a familiar session ready.</p>}
        {active&&<div className="pt-guided"><h3>{active.routine.name} · {active.index+1} / {active.routine.exercises.length}</h3><strong>{active.routine.exercises[active.index].name}</strong><div className="pt-fields"><label>Weight (kg)<input type="number" value={guidedWeight} onChange={e=>setGuidedWeight(e.target.value)}/></label><label>Repetitions<input type="number" value={guidedReps} onChange={e=>setGuidedReps(e.target.value)}/></label></div><label>Set type<select value={guidedSetType} onChange={e=>setGuidedSetType(e.target.value as typeof guidedSetType)}>{['warmup','working','drop','failure'].map(x=><option key={x}>{x}</option>)}</select></label><button className="pt-primary" onClick={logGuided}>Log this set</button><button className="pt-secondary" onClick={()=>advance(-1)}>Previous</button><button className="pt-secondary" onClick={()=>advance(1)}>Next exercise</button><button className="pt-secondary" onClick={finishGuided}>Finish session</button><button className="pt-secondary" onClick={()=>{setActive(null);setState(s=>({...s,guided:null}));setMessage('Draft closed. Logged sets remain in your journal.');}}>Close draft</button></div>}
        <h3>Repeat a recorded session</h3>{props.completed.slice(0,8).map(w=>{const records=w.setIds.map(id=>props.sets.find(s=>s.id===id)).filter(Boolean) as SetRecord[];return <button className="pt-replay" key={w.id} onClick={()=>startRoutine({id:uid(),name:`Repeat ${w.date}`,exercises:records.map(s=>({name:s.exercise,weight:s.weight,reps:s.reps}))})}>Repeat {w.date} · {records.length} sets</button>;})}
      </section>
      <section className="pt-panel pt-wide"><h2>Plate calculator</h2><p>Barbell total weight, with the plate load needed on each side.</p><div className="pt-fields"><label>Target total (kg)<input type="number" value={platesWeight} onChange={e=>setPlatesWeight(e.target.value)}/></label><label>Bar weight (kg)<input type="number" value={barWeight} onChange={e=>setBarWeight(e.target.value)}/></label></div>
        {(()=>{try{const result=calculatePlates(Number(platesWeight),Number(barWeight));return <div className="pt-result"><strong>{result.exact?'Exact load':'Closest load'} · {result.loadable} kg</strong><p>{result.plates.length?result.plates.map(p=>`${p.count} × ${p.plate} kg per side`).join(' · '):'No plates required'}{!result.exact?` · ${result.shortfall} kg short`:''}</p></div>}catch(e){return <p role="alert">{(e as Error).message}</p>}})()}
      </section>
    </div>}
    {section==='Calendar'&&<section className="pt-panel"><div className="pt-month"><button onClick={()=>setCalendarMonth(m=>new Date(m.getFullYear(),m.getMonth()-1,1))}>Previous month</button><h2>{calendarMonth.toLocaleDateString('en-US',{month:'long',year:'numeric'})}</h2><button onClick={()=>setCalendarMonth(m=>new Date(m.getFullYear(),m.getMonth()+1,1))}>Next month</button></div>
      <div className="pt-calendar">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((x,i)=><strong key={`${x}-${i}`}>{x}</strong>)}{days().map((d,i)=>d?<button key={d} className={`${selectedDay===d?'selected':''}${dateHasRecords(d)?' has-records':''}`} onClick={()=>setSelectedDay(d)} aria-label={`${d}${dateHasRecords(d)?', journal entries':''}`}><span>{Number(d.slice(-2))}</span>{dateHasRecords(d)&&<i/>}</button>:<span key={`empty-${i}`}/>)}</div>
      <div className="pt-journal"><h3>{selectedDay} journal</h3><p>{props.meals.filter(x=>x.date===selectedDay).length} meals · {props.sets.filter(x=>x.date===selectedDay).length} sets · {props.water[selectedDay]??0} ml water · {props.steps[selectedDay]===undefined?'Steps unavailable':`${props.steps[selectedDay]} steps`}</p>
        {props.weights[selectedDay]!==undefined&&<p>Weight · {props.weights[selectedDay]} kg</p>}
        {props.meals.filter(x=>x.date===selectedDay).map(m=><div className="pt-row" key={m.id}><span>{m.time} · {m.name} · {m.calories} kcal</span><button onClick={()=>beginEdit(m)}>Edit</button></div>)}
        {props.sets.filter(x=>x.date===selectedDay).map(s=><p key={s.id}>{s.exercise} · {s.weight} kg × {s.reps} · {s.setType??'working'}</p>)}
        {!dateHasRecords(selectedDay)&&<p className="pt-empty">No journal entries on this date. Absence of records does not mean no activity occurred.</p>}
        <label>Open date<input type="date" value={selectedDay} onChange={e=>{setSelectedDay(e.target.value);const d=new Date(`${e.target.value}T12:00:00`);setCalendarMonth(d);}}/></label>
      </div>
    </section>}
    {section==='Preferences'&&<div className="pt-columns">
      <section className="pt-panel"><h2>Appearance</h2><label>Theme<select value={state.settings.appearance} onChange={e=>setState(s=>({...s,settings:{...s.settings,appearance:e.target.value as PremiumState['settings']['appearance']}}))}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
        <h3>Today metrics</h3>{['calories','protein','steps','strength','water'].map(x=><label className="pt-check" key={x}><input type="checkbox" checked={state.settings.metrics.includes(x)} onChange={()=>setState(s=>({...s,settings:{...s.settings,metrics:s.settings.metrics.includes(x)?s.settings.metrics.filter(y=>y!==x):[...s.settings.metrics,x]}}))}/>{x}</label>)}
        <h3>Shortcuts</h3>{['Nutrition','Strength','Movement','Insights','My plan'].map(x=><label className="pt-check" key={x}><input type="checkbox" checked={state.settings.shortcuts.includes(x)} onChange={()=>setState(s=>({...s,settings:{...s.settings,shortcuts:s.settings.shortcuts.includes(x)?s.settings.shortcuts.filter(y=>y!==x):[...s.settings.shortcuts,x]}}))}/>{x}</label>)}
      </section>
      <section className="pt-panel"><h2>Training & rest day targets</h2><p>These optional overrides never overwrite your saved base plan.</p>
        <label>Active target mode<select value={state.dayMode} onChange={e=>setState(s=>({...s,dayMode:e.target.value as PremiumState['dayMode']}))}><option value="standard">Base plan</option><option value="training">Training day</option><option value="rest">Rest day</option></select></label>
        <div className="pt-actions"><button className="pt-secondary" onClick={()=>{setTargetKind('training');setTargets(state.dayTargets.training);}}>Edit training day</button><button className="pt-secondary" onClick={()=>{setTargetKind('rest');setTargets(state.dayTargets.rest);}}>Edit rest day</button></div>
        <div className="pt-fields">{macroNames.map(k=><label key={k}>{k==='calories'?'Calories (kcal)':`${k} target (g)`}<input type="number" min={k==='calories'?1000:1} max={k==='calories'?10000:1000} value={(targets??state.dayTargets[targetKind])[({calories:'calorieTarget',protein:'proteinTarget',carbs:'carbsTarget',fat:'fatTarget'} as const)[k]]} onChange={e=>{const key=({calories:'calorieTarget',protein:'proteinTarget',carbs:'carbsTarget',fat:'fatTarget'} as const)[k];setTargets(t=>({...state.dayTargets[targetKind],...t,[key]:Number(e.target.value)}));}}/></label>)}</div>
        <button className="pt-primary" onClick={()=>{if(!targets||!Number.isInteger(targets.calorieTarget)||targets.calorieTarget<1000||targets.calorieTarget>10000||[targets.proteinTarget,targets.carbsTarget,targets.fatTarget].some(x=>!Number.isInteger(x)||x<1||x>1000)){setMessage('Calories must be 1,000–10,000 and each macro 1–1,000, using whole numbers.');return;}setState(s=>({...s,dayTargets:{...s.dayTargets,[targetKind]:targets}}));setTargets(null);setMessage(`${targetKind==='training'?'Training':'Rest'}-day targets saved.`);}}>Save {targetKind}-day targets</button>
        <p>Targets currently active in the dashboard and nutrition view: {shownTargets.calorieTarget} kcal · P {shownTargets.proteinTarget} g · C {shownTargets.carbsTarget} g · F {shownTargets.fatTarget} g.</p>
      </section>
    </div>}
    {section==='Backup & photos'&&<div className="pt-columns">
      <section className="pt-panel"><h2>Backup & restore</h2><p>Local JSON backup; private photos are excluded unless explicitly included. Pairing credentials are never exported. Mobile-only age, sex and activity fields use compatibility defaults because this browser profile does not collect them.</p>
        <label className="pt-check"><input type="checkbox" id="include-photos"/>Include private progress photos</label><button className="pt-primary" onClick={()=>void exportBackup((document.getElementById('include-photos') as HTMLInputElement)?.checked??false).catch(e=>setMessage(e.message))}>Export backup</button>
          <label>Choose backup JSON<input type="file" accept="application/json,.json" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>40_000_000)throw new Error('Backup exceeds 40 MB.');const value=normalizeBackup(JSON.parse(await file.text()));setIncoming(value);setMessage('Validated backup is ready to merge.');}catch(error){setMessage((error as Error).message);}}}/></label>
        {incoming&&<div className="pt-restore"><p>Preview: {incoming.journal?.['fitpulse-macros']?.length??0} meals · {incoming.journal?.['fitpulse-workouts']?.length??0} strength records · {incoming.advanced.routines.length} routines · {incoming.advanced.recipes.length} recipes.</p>
          <label className="pt-check"><input type="checkbox" checked={restoreProfile} onChange={e=>setRestoreProfile(e.target.checked)}/>Restore backup profile and base targets</label>
          <label className="pt-check"><input type="checkbox" checked={incoming.restorePreferences??false} onChange={e=>setIncoming((v:any)=>({...v,restorePreferences:e.target.checked}))}/>Restore preferences and day targets</label><button className="pt-primary" onClick={()=>{try{importBackup(incoming);void restorePhotos().catch(e=>setMessage(`Journal restored; photos could not be restored. ${e.message}`));}catch(e){setMessage((e as Error).message);}}}>Confirm merge restore</button><button className="pt-secondary" onClick={()=>setIncoming(null)}>Cancel</button></div>}
      </section>
      <section className="pt-panel"><h2>Private progress photos</h2><p>Photos stay in this browser’s IndexedDB. They are never paired or backed up unless you opt in.</p><label>Optional note<input maxLength={500} value={photoNote} onChange={e=>setPhotoNote(e.target.value)}/></label>
        <label className="pt-primary pt-file">Choose a photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>5_000_000){setMessage('Choose a photo smaller than 5 MB.');return;}if(!['image/jpeg','image/png','image/webp'].includes(file.type)){setMessage('Choose a JPEG, PNG or WebP photo.');return;}const key=`photo-${uid()}`,id=uid();try{const contentHash=await photoHash(file);await photoWrite(key,file);setState(s=>({...s,photos:[...s.photos,{id,date:props.today,note:photoNote.trim(),key,sourceId:id,contentHash}]}));setPhotoNote('');setMessage('Private photo saved locally.');}catch{setMessage('Photo storage is unavailable. No photo was added.');}}}/></label>
        <div className="pt-photo-grid">{state.photos.map(p=><article key={p.id}>{photoUrls[p.id]&&<img src={photoUrls[p.id]} alt={`Private progress photo from ${p.date}`}/>}<p>{p.date}{p.note?` · ${p.note}`:''}</p><button onClick={()=>{if(p.key)void photoDelete(p.key);setState(s=>({...s,photos:s.photos.filter(x=>x.id!==p.id)}));}}>Delete photo</button></article>)}</div>
      </section>
    </div>}
  </div>;
}
function alternativeExercises(name:string,equipment:string[]) {
  const lib=[
    ['Barbell squat','legs','barbell'],['Goblet squat','legs','dumbbells'],['Bodyweight squat','legs','bodyweight'],['Leg press','legs','machines'],
    ['Bench press','chest','barbell'],['Dumbbell press','chest','dumbbells'],['Push-up','chest','bodyweight'],['Cable chest press','chest','cables'],
    ['Barbell row','back','barbell'],['Dumbbell row','back','dumbbells'],['Lat pulldown','back','machines'],['Cable row','back','cables'],
    ['Overhead press','shoulders','barbell'],['Dumbbell shoulder press','shoulders','dumbbells'],['Pike push-up','shoulders','bodyweight'],
    ['Romanian deadlift','hinge','barbell'],['Dumbbell Romanian deadlift','hinge','dumbbells'],['Hip bridge','hinge','bodyweight'],
  ];
  const original=lib.find(x=>x[0].toLowerCase()===name.toLowerCase());return original?lib.filter(x=>x[1]===original[1]&&x[0]!==name&&equipment.includes(x[2])).map(x=>x[0]):[];
}