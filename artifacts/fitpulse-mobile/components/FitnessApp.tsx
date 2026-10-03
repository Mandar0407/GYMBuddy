import { BrandMark } from './BrandMark';
import { BrandWordmark } from './BrandWordmark';
import React, { useEffect,useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Keyboard, Linking, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { usePremium } from '@/providers/PremiumProvider';
import TrainingHub from '@/components/premium/TrainingHub';
import NutritionHub from '@/components/premium/NutritionHub';
import PremiumCenter from '@/components/premium/PremiumCenter';
import DashboardExtras from '@/components/premium/DashboardExtras';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import {registerDraftSaver} from '@/lib/draftFlush';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useFitness, dateKey, type MovementSummary } from '@/providers/FitnessProvider';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import FastingCard from '@/components/FastingCard';
import IntervalTimer from '@/components/IntervalTimer';
import ProfileModal from '@/components/ProfileModal';
import RestTimer from '@/components/RestTimer';
import PRCelebration from '@/components/PRCelebration';
import {LiveWorkoutLaunchers} from '@/components/LiveWorkout';
import {PersistentPage,FrozenPageContent} from '@/components/PersistentPage';
import MealTemplates from '@/components/MealTemplates';
import WaterIntakeCard from '@/components/WaterIntakeCard';

type Tab = 'Today' | 'Nutrition' | 'Strength' | 'Movement' | 'Insights' | 'My plan';
type MainTab = 'Today' | 'Log' | 'Movement' | 'Insights' | 'Plan';
type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';
type SetType = 'warmup' | 'working' | 'drop' | 'failure';
type Palette = ReturnType<typeof useColors>;
const tabs: MainTab[] = ['Today', 'Log', 'Movement', 'Insights', 'Plan'];
const icons: Record<MainTab, keyof typeof Feather.glyphMap> = {
  Today: 'home', Log: 'plus-square', Movement: 'navigation', Insights: 'bar-chart-2', Plan: 'clipboard',
};
const number = (n: number) => Number(n.toFixed(1)).toLocaleString('en-US', { maximumFractionDigits: 1 });
const integer = (s: string, low: number, high: number) => /^\d+$/.test(s.trim()) && Number(s) >= low && Number(s) <= high;
const decimal = (s: string, low: number, high: number) => s.trim() !== '' && Number.isFinite(Number(s)) && Number(s) >= low && Number(s) <= high;
const fmtDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};

function Label({ children, colors }: { children: React.ReactNode; colors: Palette }) {
  return <Text style={[s.label, { color: colors.primary }]}>{children}</Text>;
}
function Title({ children, colors }: { children: React.ReactNode; colors: Palette }) {
  return <Text style={[s.title, { color: colors.foreground }]}>{children}</Text>;
}
function Muted({ children, colors, style }: { children: React.ReactNode; colors: Palette; style?: object }) {
  return <Text style={[s.muted, { color: colors.mutedForeground }, style]}>{children}</Text>;
}
function Panel({ children, colors, style }: { children: React.ReactNode; colors: Palette; style?: object }) {
  return <View style={[s.panel, { backgroundColor: colors.card, borderColor: colors.border }, style]}>{children}</View>;
}
function Action({ children, onPress, colors, secondary = false, disabled = false, testID }: {
  children: React.ReactNode; onPress: () => void; colors: Palette; secondary?: boolean; disabled?: boolean; testID?: string;
}) {
  const premium=usePremium();
  const tap=()=>{if(premium.settings.haptics&&Platform.OS!=='web')void Haptics.selectionAsync().catch(()=>{});};
  return <Pressable accessibilityRole="button" testID={testID} disabled={disabled} onPress={() => { tap(); onPress(); }} style={({ pressed }) => [s.action,
    { backgroundColor: secondary ? colors.secondary : colors.accent, opacity: pressed || disabled ? .5 : 1 }]}>
    <Text style={[s.actionText, { color: secondary ? colors.secondaryForeground : colors.accentForeground }]}>{children}</Text>
  </Pressable>;
}
function Field({ label, value, onChange, colors, placeholder, numeric = false, testID }: {
  label: string; value: string; onChange: (value: string) => void; colors: Palette; placeholder?: string; numeric?: boolean; testID?: string;
}) {
  return <View style={s.field}>
    <Text style={[s.fieldLabel, { color: colors.foreground }]}>{label}</Text>
    <TextInput testID={testID} value={value} onChangeText={onChange} keyboardType={numeric ? 'decimal-pad' : 'default'}
      placeholder={placeholder} placeholderTextColor={colors.mutedForeground} style={[s.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]} />
  </View>;
}
function Select<T extends string>({ values, value, onChange, colors }: {
  values: readonly T[]; value: T; onChange: (v: T) => void; colors: Palette;
}) {
  const premium=usePremium();
  const tap=()=>{if(premium.settings.haptics&&Platform.OS!=='web')void Haptics.selectionAsync().catch(()=>{});};
  return <View style={s.pills}>{values.map(v => <Pressable accessibilityRole="button" accessibilityState={{ selected: v === value }} key={v} onPress={() => { tap(); onChange(v); }}
    style={[s.pill, { backgroundColor: v === value ? colors.accent : colors.background, borderColor: v === value ? colors.accent : colors.border }]}>
    <Text style={[s.pillText, { color: v===value ? colors.accentForeground : colors.foreground }]}>{v === 'warmup' ? 'Warm-up' : v === 'working' ? 'Working' : v === 'drop' ? 'Drop' : v === 'failure' ? 'Failure' : v[0].toUpperCase() + v.slice(1)}</Text>
  </Pressable>)}</View>;
}
function Meter({ value, target, color, colors }: { value: number; target: number; color: string; colors: Palette }) {
  return <View style={[s.track, { backgroundColor: colors.muted }]}>
    <View style={[s.fill, { backgroundColor: color, width: `${target > 0 ? Math.min(100, Math.max(0, value / target * 100)) : 0}%` }]} />
  </View>;
}
function Macro({ name, value, target, color, colors }: { name: string; value: number; target: number; color: string; colors: Palette }) {
  return <View style={s.macro}>
    <View style={s.between}><Text style={[s.smallStrong, { color: colors.foreground }]}>{name}</Text><Muted colors={colors}>{number(value)} / {number(target)}g</Muted></View>
    <Meter value={value} target={target} color={color} colors={colors} />
    <Muted colors={colors} style={s.micro}>{value > target ? `${number(value - target)}g over target` : `${number(target - value)}g remaining`}</Muted>
  </View>;
}

export default function FitnessApp({ movementSummary, movementScreen }: { movementSummary: MovementSummary & { paired?: boolean }; movementScreen: React.ReactNode }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const fit = useFitness();
  const advanced = usePremium();
  const reduced=useReducedMotion();
  const tap=()=>{if(advanced.settings.haptics&&Platform.OS!=='web')void Haptics.selectionAsync().catch(()=>{});};
  const success=()=>{if(advanced.settings.haptics&&Platform.OS!=='web')void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(()=>{});};
  const dark=colors.background==='#181c19';
  const heroBg=dark?colors.card:colors.foreground;
  const heroFg=dark?colors.foreground:colors.card;
  const heroMuted=dark?colors.mutedForeground:colors.muted;
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('Today');
  const [visited,setVisited]=useState<Tab[]>(['Today']);
  useEffect(()=>{setVisited(previous=>previous.includes(tab)?previous:[...previous,tab]);},[tab]);
  const [mealSaved, setMealSaved] = useState('');
  const [setSaved, setSetSaved] = useState('');
  const [finishMessage, setFinishMessage] = useState('');
  const [menu, setMenu] = useState(false);
  const [mealOpen, setMealOpen] = useState(false);
  const [mealType, setMealType] = useState<MealType>('Breakfast');
  const [mealName, setMealName] = useState('');
  const [mealValues, setMealValues] = useState({ calories: '', protein: '', carbs: '', fat: '' });
  const [mealError, setMealError] = useState('');
  const [exercise, setExercise] = useState('');
  const [load, setLoad] = useState('');
  const [reps, setReps] = useState('');
  const [setType, setSetType] = useState<SetType>('working');
  const [setError, setSetError] = useState('');
  const [targets, setTargets] = useState<{ calories: string; protein: string; carbs: string; fat: string } | null>(null);
  const [targetMessage, setTargetMessage] = useState('');
  const [weightInput, setWeightInput] = useState('');
  const [weightMessage, setWeightMessage] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);
  const [plan, setPlan] = useState<{ weight: string; height: string; age: string; sex: 'female'|'male'; activity: 'sedentary'|'light'|'moderate'|'high'; goal: 'cut'|'maintain'|'bulk' } | null>(null);
  const [planMessage, setPlanMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [restStartKey, setRestStartKey] = useState(0);
  const [record, setRecord] = useState<{ exercise: string; kind: string; value: number } | null>(null);
  const [dateNow, setDateNow] = useState(() => new Date());
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftMessage, setDraftMessage] = useState('');
  const draftRef = useRef('');
  useEffect(() => {
    let alive = true;
    void AsyncStorage.getItem('@fitpulse/mobile/form-drafts/v1').then(raw => {
      if (!alive || !raw) return;
      const d = JSON.parse(raw);
      if (!d || d.version !== 1 || !['mealName','exercise','load','reps'].every(k => typeof d[k] === 'string' && d[k].length <= 120) ||
        !['Breakfast','Lunch','Dinner','Snack'].includes(d.mealType) || !['warmup','working','drop','failure'].includes(d.setType) ||
        !d.mealValues || !['calories','protein','carbs','fat'].every(k => typeof d.mealValues[k] === 'string' && d.mealValues[k].length <= 30)) {
        throw new Error('Stored form draft is invalid.');
      }
      setMealName(d.mealName);setExercise(d.exercise);setLoad(d.load);setReps(d.reps);setMealType(d.mealType);setSetType(d.setType);setMealValues(d.mealValues);
      if (typeof d.editingMealId === 'string') setEditingMealId(d.editingMealId);
      if(d.plan&&['weight','height','age','sex','activity','goal'].every(k=>typeof d.plan[k]==='string'&&d.plan[k].length<=120))setPlan(d.plan);
      if(d.targets&&['calories','protein','carbs','fat'].every(k=>typeof d.targets[k]==='string'&&d.targets[k].length<=30))setTargets(d.targets);
      if(typeof d.weightInput==='string'&&d.weightInput.length<=120)setWeightInput(d.weightInput);
      if (d.mealName || d.exercise) setDraftMessage('Your unfinished meal or set draft was restored.');
    }).catch(() => { if (alive) setDraftMessage('Your form draft could not load. Saved journal records are unaffected.'); })
      .finally(() => { if (alive) setDraftLoaded(true); });
    return () => {alive=false;};
  }, []);
  useEffect(() => {
    if (!draftLoaded) return;
    draftRef.current = JSON.stringify({version:1,mealName,mealType,mealValues,exercise,load,reps,setType,editingMealId,plan,targets,weightInput});
    const timer=setTimeout(()=>{void AsyncStorage.setItem('@fitpulse/mobile/form-drafts/v1',draftRef.current).catch(()=>setDraftMessage('Form draft could not save. Keep the app open until you save your entry.'));},350);
    return ()=>clearTimeout(timer);
  }, [draftLoaded,mealName,mealType,mealValues,exercise,load,reps,setType,editingMealId,plan,targets,weightInput]);
  useEffect(()=>{
    if(!draftLoaded)return;
    return registerDraftSaver('main-forms',async()=>{if(draftRef.current)await AsyncStorage.setItem('@fitpulse/mobile/form-drafts/v1',draftRef.current);});
  },[draftLoaded]);
  useEffect(() => {
    const sub=AppState.addEventListener('change',state=>{if(state!=='active'&&draftRef.current)void AsyncStorage.setItem('@fitpulse/mobile/form-drafts/v1',draftRef.current).catch(()=>{});});
    return ()=>sub.remove();
  },[]);
  useEffect(() => {
    let active = true;
    const open = (url: string | null) => {
      if (active && url && /^fitpulse:\/\/log(?:[/?#]|$)/i.test(url)) {
        setTab('Nutrition');
        setMenu(false);
      }
    };
    void Linking.getInitialURL().then(open).catch(() => {});
    const listener = Linking.addEventListener('url', ({ url }) => open(url));
    return () => { active = false; listener.remove(); };
  }, []);
  useEffect(() => {
    const refreshDate = () => setDateNow(new Date());
    const timer = setInterval(refreshDate, 60000);
    const foreground = AppState.addEventListener('change', state => { if (state === 'active') refreshDate(); });
    return () => { clearInterval(timer); foreground.remove(); };
  }, []);
  const today = dateKey(dateNow);
  const profile = { ...fit.profile, ...(advanced.dayMode === 'standard' ? {} : advanced.dayTargets[advanced.dayMode]) };
  const meals = fit.meals.filter(m => m.date === today);
  const sets = fit.sets.filter(x => x.date === today);
  const finishedIds = new Set(fit.completedWorkouts.filter(x => x.date === today).flatMap(x => x.setIds));
  const pending = sets.filter(x => !finishedIds.has(x.id));
  const sum = (field: 'calories'|'protein'|'carbs'|'fat') => meals.reduce((total, meal) => total + meal[field], 0);
  const calories = sum('calories'), protein = sum('protein'), carbs = sum('carbs'), fat = sum('fat');
  const steps = movementSummary.steps;
  const goalSteps = movementSummary.goal || profile.stepTarget;
  const changeTab = (next: Tab) => { Keyboard.dismiss(); tap(); setTab(next); setMenu(false); };
  const openMeal = () => { setMealError(''); setMealOpen(true); };
  const saveMeal = async () => {
    const name = mealName.replace(/\s+/g, ' ').trim();
    if (!name || name.length > 120) { setMealError('Enter a meal name (up to 120 characters).'); return; }
    if (!decimal(mealValues.calories, .01, 10000)) { setMealError('Calories must be between 0.01 and 10,000.'); return; }
    if (!(['protein', 'carbs', 'fat'] as const).every(k => decimal(mealValues[k], 0, 1000))) { setMealError('Protein, carbs, and fat must each be between 0 and 1,000 g.'); return; }
    setSaving(true);
    const input = { meal: mealType, name, calories: Number(mealValues.calories), protein: Number(mealValues.protein), carbs: Number(mealValues.carbs), fat: Number(mealValues.fat) };
    const ok = editingMealId ? await fit.editMeal(editingMealId, input) : await fit.addMeal(input);
    setSaving(false);
    if (!ok) { setMealError('Meal could not be saved on this device. Your entries are still here; try again.'); return; }
    setMealValues({ calories: '', protein: '', carbs: '', fat: '' }); setMealName(''); setMealError(''); setMealOpen(false);
    setMealSaved(editingMealId ? 'Meal updated; its original date was kept.' : 'Meal saved to today.'); setEditingMealId(null); success();
  };
  const saveSet = async () => {
    const name = exercise.replace(/\s+/g, ' ').trim();
    if (!name || name.length > 100) { setSetError('Enter an exercise name (up to 100 characters).'); return; }
    if (!decimal(load, .01, 500) || !integer(reps, 1, 30)) { setSetError('Use 0.01–500 kg and 1–30 whole reps.'); return; }
    const prior = fit.sets.filter(x => x.exercise.trim().toLowerCase() === name.toLowerCase());
    const weight = Number(load), count = Number(reps);
    const estimatedOneRm = weight * (1 + count / 30);
    const weightRecord = prior.length > 0 && weight > Math.max(...prior.map(x => x.weight));
    const oneRmRecord = prior.length > 0 && estimatedOneRm > Math.max(...prior.map(x => x.estimatedOneRm));
    setSaving(true);
    const ok = await fit.addSet({ exercise: name, weight, reps: count, setType });
    setSaving(false);
    if (!ok) { setSetError('Set could not be saved on this device. Please try again.'); return; }
    setLoad(''); setReps(''); setSetError('');
    setSetSaved('Set saved to today.'); success();
    if (setType === 'working') setRestStartKey(v => v + 1);
    if (weightRecord || oneRmRecord) setRecord({ exercise: name, kind: oneRmRecord ? 'Estimated 1RM' : 'Weight', value: oneRmRecord ? estimatedOneRm : weight });
  };
  const targetForm = targets ?? { calories: String(fit.profile.calorieTarget), protein: String(fit.profile.proteinTarget), carbs: String(fit.profile.carbsTarget), fat: String(fit.profile.fatTarget) };
  const updateTarget = (key: keyof typeof targetForm, value: string) => { setTargets({ ...targetForm, [key]: value }); setTargetMessage(''); };
  const saveGoals = async () => {
    if (!integer(targetForm.calories, 1000, 10000) || !(['protein', 'carbs', 'fat'] as const).every(k => integer(targetForm[k], 1, 1000))) {
      setTargetMessage('Use 1,000–10,000 calories and 1–1,000 g for each macro.'); return;
    }
    setSaving(true);
    const ok = await fit.saveTargets({ calorieTarget: Number(targetForm.calories), proteinTarget: Number(targetForm.protein), carbsTarget: Number(targetForm.carbs), fatTarget: Number(targetForm.fat) });
    setSaving(false);
    setTargetMessage(ok ? 'Daily targets saved.' : 'Could not save these targets. Check your values.');
    if (ok) success();
    if (ok) setTargets(null);
  };
  const planForm = plan ?? {
    weight: String(profile.weight), height: String(profile.height), age: String(profile.age),
    sex: profile.sex, activity: profile.activity,
    goal: (['cut', 'maintain', 'bulk'].includes(profile.goal.toLowerCase()) ? profile.goal.toLowerCase() : 'maintain') as 'cut'|'maintain'|'bulk',
  };
  const updatePlan = (key: keyof typeof planForm, value: string) => { setPlan({ ...planForm, [key]: value } as typeof planForm); setPlanMessage(''); };
  const validPlan = decimal(planForm.weight, 20, 500) && decimal(planForm.height, 100, 230) && integer(planForm.age, 14, 90);
  const w = Number(planForm.weight), h = Number(planForm.height), a = Number(planForm.age);
  const multipliers = { sedentary: 1.2, light: 1.375, moderate: 1.55, high: 1.725 };
  const maintenance = validPlan ? Math.round((10*w + 6.25*h - 5*a + (planForm.sex === 'female' ? -161 : 5)) * multipliers[planForm.activity]) : 0;
  const planCalories = validPlan ? Math.max(1200, maintenance + (planForm.goal === 'cut' ? -400 : planForm.goal === 'bulk' ? 300 : 0)) : 0;
  const planProtein = validPlan ? Math.round(w * (planForm.goal === 'cut' ? 2.2 : planForm.goal === 'bulk' ? 1.8 : 2)) : 0;
  const planFat = validPlan ? Math.round(planCalories * .25 / 9) : 0;
  const planCarbs = validPlan ? Math.max(0, Math.round((planCalories - planProtein * 4 - planFat * 9) / 4)) : 0;
  const validResult = validPlan && planCalories >= 1000 && planCalories <= 10000 && [planProtein, planFat, planCarbs].every(n => n >= 1 && n <= 1000);
  const apply = async () => {
    if (!validResult) { setPlanMessage('Adjust your inputs to keep calories within 1,000–10,000 and macros within 1–1,000 g.'); return; }
    setSaving(true);
    const ok = await fit.applyPlan({ weight: w, height: h, age: a, sex: planForm.sex, activity: planForm.activity, goal: planForm.goal,
      calorieTarget: planCalories, proteinTarget: planProtein, carbsTarget: planCarbs, fatTarget: planFat });
    setSaving(false);
    if (!ok) { setPlanMessage('Your plan could not be saved on this device. Please try again.'); return; }
    setTargets(null);
    setTargetMessage('');
    setPlanMessage(advanced.dayMode==='standard'?'Your plan is applied. Nutrition targets are up to date.':`Base plan applied. Your ${advanced.dayMode}-day override remains active; switch to standard mode in Your workspace to use the new base goals.`);
    success();
  };
  const heading = (eyebrow: string, title: string, description: string) => <View style={s.pageHeading}>
    <Label colors={colors}>{eyebrow}</Label><Title colors={colors}>{title}</Title><Muted colors={colors}>{description}</Muted>
  </View>;
  const mealList = (limited = false) => <Panel colors={colors}>
    <View style={s.between}><View><Label colors={colors}>ON YOUR PLATE</Label><Text style={[s.sectionTitle, { color: colors.foreground }]}>Meals today</Text><Muted colors={colors}>{meals.length} {meals.length === 1 ? 'meal' : 'meals'} logged</Muted></View>
      <Pressable testID="open-meal" onPress={openMeal} style={[s.iconCircle, { backgroundColor: colors.background }]}><Feather name="plus" size={21} color={colors.primary} /></Pressable></View>
    {meals.length ? (limited ? meals.slice(0, 4) : meals).map(m => <View key={m.id} style={[s.listRow, { borderBottomColor: colors.border }]}>
      <View style={[s.mealIcon, { backgroundColor: colors.secondary }]}><Feather name="coffee" size={16} color={colors.secondaryForeground} /></View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${m.name}`} testID={`edit-meal-${m.id}`} style={s.rowContent} onPress={() => {
        setEditingMealId(m.id);setMealName(m.name);setMealType(m.meal);setMealValues({calories:String(m.calories),protein:String(m.protein),carbs:String(m.carbs),fat:String(m.fat)});openMeal();
      }}><Text style={[s.smallStrong, { color: colors.foreground }]} numberOfLines={2}>{m.name}</Text><Muted colors={colors} style={s.micro}>{m.meal} · {m.time} · P {number(m.protein)}g · C {number(m.carbs)}g · F {number(m.fat)}g · Tap to edit</Muted></Pressable>
      <Text style={[s.smallStrong, { color: colors.foreground }]}>{number(m.calories)}</Text>
       {!limited && <Pressable testID={`delete-meal-${m.id}`} accessibilityLabel={`Delete ${m.name}`} onPress={() => void fit.removeMeal(m.id)} hitSlop={10}><Feather name="trash-2" size={17} color={colors.destructive} /></Pressable>}
    </View>) : <View style={s.empty}><Feather name="book-open" size={26} color={colors.primary} /><Text style={[s.smallStrong, { color: colors.foreground }]}>No meals logged yet</Text><Muted colors={colors}>Track your first bite and build a clearer picture of today.</Muted><Action colors={colors} onPress={openMeal}>Log a meal</Action></View>}
    {meals.length > 0 && <Pressable onPress={limited ? () => changeTab('Nutrition') : openMeal} style={s.textLink}><Text style={[s.link, { color: colors.primary }]}>{limited ? 'See full nutrition log' : '+ Add to today’s log'}  →</Text></Pressable>}
  </Panel>;
  const nutritionCard = () => <Panel colors={colors}>
    <Label colors={colors}>EAT WELL, YOUR WAY</Label><Text style={[s.sectionTitle, { color: colors.foreground }]}>Today’s nourishment</Text><Muted colors={colors}>There’s room for what your body needs next.</Muted>
    <View style={s.nutritionRow}>
      <View style={[s.ring, { borderColor: colors.primary }]}><Label colors={colors}>CONSUMED</Label><Text style={[s.ringNumber, { color: colors.foreground }]}>{number(calories)}</Text><Muted colors={colors} style={s.micro}>of {number(profile.calorieTarget)} kcal</Muted></View>
      <View style={s.macroColumn}>
        <Macro name="Protein" value={protein} target={profile.proteinTarget} color={colors.secondaryForeground} colors={colors} />
        <Macro name="Carbs" value={carbs} target={profile.carbsTarget} color={colors.accent} colors={colors} />
        <Macro name="Fat" value={fat} target={profile.fatTarget} color={colors.primary} colors={colors} />
      </View>
    </View>
    <View style={[s.callout, { backgroundColor: colors.background }]}><View style={s.rowContent}><Label colors={colors}>YOUR DAILY PLAN</Label><Text style={[s.smallStrong, { color: colors.foreground }]}>{number(Math.abs(profile.calorieTarget-calories))} kcal {calories > profile.calorieTarget ? 'over' : 'left'} · {number(Math.abs(profile.proteinTarget-protein))}g protein {protein > profile.proteinTarget ? 'over' : 'left'}</Text></View>
      <Pressable onPress={openMeal} style={[s.smallButton, { backgroundColor: colors.primary }]}><Text style={{ color: colors.primaryForeground, fontFamily: 'DMSans_700Bold', fontSize: 11 }}>Log food</Text></Pressable></View>
  </Panel>;
  const nextAction: { label: string; detail: string; section: Tab; icon: keyof typeof Feather.glyphMap } =
    pending.length ? { label: 'Finish your workout', detail: `${pending.length} ${pending.length === 1 ? 'set' : 'sets'} ready to finish`, section: 'Strength', icon: 'check-circle' } :
    !meals.length ? { label: 'Log your first meal', detail: 'Start today’s food journal', section: 'Nutrition', icon: 'plus' } :
    !sets.length ? { label: 'Log a strength set', detail: 'Record your next exercise', section: 'Strength', icon: 'activity' } :
    steps < goalSteps ? { label: 'Check your movement', detail: `${number(goalSteps - steps)} steps to your goal`, section: 'Movement', icon: 'navigation' } :
    { label: 'Review your week', detail: 'See what your journal shows', section: 'Insights', icon: 'bar-chart-2' };
  const todayScreen = tab==='Today'?<View style={s.todayStack}>
    <View style={s.todayHeading}>
      <Label colors={colors}>{new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(dateNow).toUpperCase()}</Label>
      <Text style={[s.todayTitle, { color: colors.foreground }]}>Today<Text style={{ color: colors.secondaryForeground }}>.</Text></Text>
      <Muted colors={colors}>Your progress, at a glance.</Muted>
    </View>
    <View style={[s.todaySummary, { backgroundColor: heroBg }]}>
      <View style={s.between}><Text style={[s.heroLabel, { color: colors.accent }]}>DAILY JOURNAL</Text><Feather name="activity" size={18} color={colors.accent} /></View>
      <Text style={[s.todaySummaryNumber, { color: heroFg }]}>{number(calories)} <Text style={[s.todaySummaryUnit, { color: heroMuted }]}>/ {number(profile.calorieTarget)} kcal</Text></Text>
      <Meter value={calories} target={profile.calorieTarget} color={colors.accent} colors={colors} />
      <Text style={[s.heroBody, { color: heroMuted }]}>{meals.length} {meals.length === 1 ? 'meal' : 'meals'} logged today · {advanced.dayMode} targets</Text>
    </View>
    <View style={[s.todayMetrics, { backgroundColor: colors.card, borderColor: colors.border,flexWrap:'wrap' }]}>
      {([
        ['Protein', `${number(protein)}g`, `${number(profile.proteinTarget)}g goal`, 'Nutrition'],
        ['Steps', number(steps), `${number(goalSteps)} goal`, 'Movement'],
        ['Strength', String(sets.length), 'sets today', 'Strength'],
        ['Water',`${number(fit.water[today]??0)} ml`,`${profile.waterGoalMl} ml goal`,'Nutrition'],
        ['Calories',number(calories),`${profile.calorieTarget} kcal goal`,'Nutrition'],
      ] as const).filter(([label])=>advanced.settings.metrics.includes(label.toLowerCase())).map(([label, value, detail, destination], i) => <Pressable accessibilityRole="button" key={label} onPress={() => changeTab(destination)}
        style={[s.todayMetric, {flexBasis:advanced.settings.metrics.length>3?'42%':'0%'}, i > 0 && { borderLeftColor: colors.border, borderLeftWidth: 1 }]}>
        <Text style={[s.statLabel, { color: colors.mutedForeground }]}>{label.toUpperCase()}</Text>
        <Text style={[s.todayMetricValue, { color: colors.foreground }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
        <Muted colors={colors} style={s.micro}>{detail}</Muted>
      </Pressable>)}
    </View>
    {!!draftMessage && <Muted colors={colors}>{draftMessage}</Muted>}
    <View>
      <Label colors={colors}>UP NEXT</Label>
      <Pressable accessibilityRole="button" testID="today-next-action" onPress={() => changeTab(nextAction.section)} style={({ pressed }) => [s.nextCard, { backgroundColor: colors.secondary, opacity: pressed ? .78 : 1 }]}>
        <View style={[s.nextIcon, { backgroundColor: colors.accent }]}><Feather name={nextAction.icon} size={20} color={colors.accentForeground} /></View>
        <View style={s.rowContent}><Text style={[s.nextTitle, { color: colors.foreground }]}>{nextAction.label}</Text><Muted colors={colors}>{nextAction.detail}</Muted></View>
        <Feather name="arrow-up-right" size={20} color={colors.secondaryForeground} />
      </Pressable>
    </View>
    <DashboardExtras onNavigate={changeTab} />
  </View>:null;
  const nutritionScreen = tab==='Nutrition'?<View style={s.stack}>
    {heading('NUTRITION · TODAY', 'Nutrition log', 'Meals, water, and daily targets.')}
    <NutritionHub onMeal={m=>{setEditingMealId(null);setMealName(m.name);setMealType(m.meal);setMealValues({calories:String(m.calories),protein:String(m.protein),carbs:String(m.carbs),fat:String(m.fat)});openMeal();}} />
    {!!mealSaved && <Text accessibilityRole="alert" style={[s.feedback, { color: colors.secondaryForeground }]}>{mealSaved}</Text>}
    <Panel colors={colors}><Label colors={colors}>YOUR DAILY TARGETS</Label><Text style={[s.sectionTitle, { color: colors.foreground }]}>Base-plan goals</Text><Muted colors={colors}>Current focus: {profile.goal} · Active mode: {advanced.dayMode}. Editing below changes your base plan, not the optional day overrides.</Muted>
      <View style={s.twoColumns}>{(['calories', 'protein', 'carbs', 'fat'] as const).map(k => <View key={k} style={s.half}>
        <Field label={`${k[0].toUpperCase()+k.slice(1)} (${k === 'calories' ? 'kcal' : 'g'})`} numeric value={targetForm[k]} onChange={v => updateTarget(k, v)} colors={colors} testID={`target-${k}`} />
      </View>)}</View>
      {!!targetMessage && <Text style={[s.feedback, { color: targetMessage.includes('saved') ? colors.secondaryForeground : colors.destructive }]}>{targetMessage}</Text>}
        <Action colors={colors} onPress={() => void saveGoals()} disabled={saving} testID="save-targets">{saving ? 'Saving…' : 'Save daily targets'}</Action>
    </Panel>
    {nutritionCard()}
    <FastingCard />
    <WaterIntakeCard todayMl={fit.water[today] ?? 0} goalMl={profile.waterGoalMl}
      onAdd={fit.addWater} onRemove={fit.removeWater} onSetGoal={fit.setWaterGoal} />
    <MealTemplates onLog={fit.addMeal} />
    {mealList()}
  </View>:null;
  const strengthScreen = tab==='Strength'?<View style={s.stack}>
    {heading('STRENGTH · TODAY', 'Strength log', 'Sessions and sets in one place.')}
    <TrainingHub exercise={exercise} weight={load} onExercise={(name,w,r)=>{setExercise(name);if(w!==undefined)setLoad(w===null?'':String(w));if(r!==undefined)setReps(r===null?'':String(r));}} />
    {!!setSaved && <Text accessibilityRole="alert" style={[s.feedback, { color: colors.secondaryForeground }]}>{setSaved}</Text>}
     <LiveWorkoutLaunchers kinds={['strength']}/>
    <IntervalTimer />
    <Panel colors={colors} style={{ backgroundColor: colors.secondary }}>
      <Label colors={colors}>STRENGTH SETS · TODAY</Label><Text style={[s.bigNumber, { color: colors.secondaryForeground }]}>{sets.length} <Text style={s.numberUnit}>sets logged</Text></Text>
      <Muted colors={colors}>{pending.length} {pending.length === 1 ? 'set' : 'sets'} awaiting Finish workout · {fit.completedWorkouts.filter(x => x.date === today).length} completed set-log sessions</Muted>
       <Muted colors={colors}>Live sessions are saved in the history above.</Muted>
       {!!finishMessage && <Text accessibilityRole="alert" style={[s.feedback, { color: finishMessage === 'Workout saved.' || finishMessage.startsWith('Strength session and') ? colors.secondaryForeground : colors.destructive }]}>{finishMessage}</Text>}
        <Action colors={colors} onPress={() => { setSaving(true); void fit.finishWorkout().then(ok => { setSaving(false); setFinishMessage(ok ? 'Workout saved.' : 'Could not finish workout. Try again.'); if (ok) success(); }); }} disabled={!pending.length || saving} testID="finish-workout">{saving ? 'Saving…' : 'Finish workout'}</Action>
    </Panel>
    <Panel colors={colors}><Label colors={colors}>LOG A SET</Label><Text style={[s.sectionTitle, { color: colors.foreground }]}>Show up for one rep.</Text>
      <Field label="Exercise" value={exercise} onChange={setExercise} placeholder="e.g. Back squat" colors={colors} testID="set-exercise" />
      {fit.sets.find(x=>x.exercise.toLowerCase()===exercise.trim().toLowerCase()) && <Muted colors={colors}>Previous: {fit.sets.find(x=>x.exercise.toLowerCase()===exercise.trim().toLowerCase())!.weight} kg × {fit.sets.find(x=>x.exercise.toLowerCase()===exercise.trim().toLowerCase())!.reps}</Muted>}
      <View style={s.twoColumns}><View style={s.half}><Field label="Weight (kg)" numeric value={load} onChange={setLoad} placeholder="60" colors={colors} testID="set-weight" /></View>
        <View style={s.half}><Field label="Reps" numeric value={reps} onChange={setReps} placeholder="8" colors={colors} testID="set-reps" /></View></View>
      <Text style={[s.fieldLabel, { color: colors.foreground }]}>Set type</Text><Select values={['warmup', 'working', 'drop', 'failure'] as const} value={setType} onChange={setSetType} colors={colors} />
      {!!setError && <Text style={[s.feedback, { color: colors.destructive }]}>{setError}</Text>}
        <Action colors={colors} onPress={() => void saveSet()} disabled={saving} testID="add-set">{saving ? 'Saving…' : 'Log set'}</Action>
    </Panel>
    <Panel colors={colors}><Label colors={colors}>TRAINING HISTORY</Label><Text style={[s.sectionTitle, { color: colors.foreground }]}>The record, kept.</Text>
      {fit.sets.length ? [...fit.sets].reverse().map(x => <View key={x.id} style={[s.listRow, { borderBottomColor: colors.border }]}>
        <View style={s.rowContent}><Text style={[s.smallStrong, { color: colors.foreground }]}>{x.exercise}</Text>
          <Muted colors={colors} style={s.micro}>{x.date} · {x.setType} · {number(x.weight)} kg × {x.reps} · Est. 1RM {number(x.estimatedOneRm)} kg{finishedIds.has(x.id) ? ' · Finished' : ''}</Muted></View>
         <Pressable testID={`delete-set-${x.id}`} accessibilityLabel={`Delete ${x.exercise} set`} onPress={() => void fit.removeSet(x.id)} hitSlop={10}><Feather name="trash-2" size={17} color={colors.destructive} /></Pressable>
      </View>) : <View style={s.empty}><MaterialCommunityIcons name="dumbbell" size={28} color={colors.primary} /><Text style={[s.smallStrong, { color: colors.foreground }]}>No sets logged yet</Text><Muted colors={colors}>Your next set can be the first mark in a very good training log.</Muted></View>}
    </Panel>
  </View>:null;
  const {days,inWeek,weekMeals,weekSets,weekWeights,loggedSteps,hasWeek,previousMeals,previousSets,previousSteps,records}=useMemo(()=>{
  const weekStart = fmtDate(today);
  weekStart.setHours(12, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7) + weekOffset * 7);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return dateKey(d); });
  const inWeek = (date: string) => days.includes(date);
  const weekMeals = fit.meals.filter(x => inWeek(x.date));
  const weekSets = fit.sets.filter(x => inWeek(x.date));
  const weekWeights = fit.weights.filter(x => inWeek(x.date));
  const loggedSteps = movementSummary.week.filter(x => inWeek(x.date) && x.steps !== null);
  const hasWeek = weekMeals.length > 0 || weekSets.length > 0 || weekWeights.length > 0 || loggedSteps.length > 0 || days.some(d => (fit.water[d] ?? 0) > 0) || fit.completedWorkouts.some(x => inWeek(x.date));
  const previousDays = days.map(d => { const prior = fmtDate(d); prior.setDate(prior.getDate() - 7); return dateKey(prior); });
  const previousMeals = fit.meals.filter(x => previousDays.includes(x.date));
  const previousSets = fit.sets.filter(x => previousDays.includes(x.date));
  const previousSteps = movementSummary.week.filter(x => previousDays.includes(x.date) && x.steps !== null);
  const bestByExercise=new Map<string,(typeof fit.sets)[number]>();
  for(const entry of fit.sets){
    const key=entry.exercise.trim().toLowerCase(),best=bestByExercise.get(key);
    if(!best||entry.estimatedOneRm>best.estimatedOneRm)bestByExercise.set(key,entry);
  }
  const records=[...bestByExercise.values()].filter(x=>inWeek(x.date)).sort((a,b)=>b.estimatedOneRm-a.estimatedOneRm).slice(0,3);
  return {days,inWeek,weekMeals,weekSets,weekWeights,loggedSteps,hasWeek,previousMeals,previousSets,previousSteps,records};
  },[today,weekOffset,fit.meals,fit.sets,fit.weights,fit.water,fit.completedWorkouts,movementSummary.week]);
  const comparison = (current: number, previous: number, available: boolean, unit: string) =>
    available ? `${current > previous ? '+' : ''}${number(current - previous)} ${unit} vs previous week` : 'No previous-week entries to compare';
  const insightsScreen = tab==='Insights'?<View style={s.stack}>
    {heading('YOUR JOURNAL', 'Insights', 'Compare logged activity week by week.')}
    <View style={[s.weekNav, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Pressable testID="previous-week" onPress={() => setWeekOffset(v => v-1)} hitSlop={12}><Feather name="chevron-left" color={colors.foreground} size={23} /></Pressable>
      <View style={{ alignItems: 'center' }}><Label colors={colors}>{weekOffset === 0 ? 'THIS WEEK' : 'YOUR JOURNAL'}</Label><Text style={[s.smallStrong, { color: colors.foreground }]}>{fmtDate(days[0]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {fmtDate(days[6]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text></View>
      <Pressable testID="next-week" disabled={weekOffset === 0} onPress={() => setWeekOffset(v => Math.min(0, v+1))} hitSlop={12}><Feather name="chevron-right" color={weekOffset === 0 ? colors.mutedForeground : colors.foreground} size={23} /></Pressable>
    </View>
    <Panel colors={colors}>
      <Label colors={colors}>THIS WEEK / LAST WEEK</Label>
      <Text style={[s.sectionTitle, { color: colors.foreground }]}>Weekly comparison</Text>
      {([
        ['Meals', weekMeals.length, previousMeals.length, previousMeals.length > 0, 'meals'],
        ['Strength sets', weekSets.length, previousSets.length, previousSets.length > 0, 'sets'],
        ['Recorded steps', loggedSteps.reduce((n, x) => n + (x.steps ?? 0), 0), previousSteps.reduce((n, x) => n + (x.steps ?? 0), 0), previousSteps.length > 0, 'steps'],
      ] as const).map(([label, current, prior, available, unit]) => <View key={label} style={[s.comparisonRow, { borderTopColor: colors.border }]}>
        <View style={s.rowContent}><Text style={[s.smallStrong, { color: colors.foreground }]}>{label}</Text><Muted colors={colors}>{comparison(current, prior, available, unit)}</Muted></View>
        <Text style={[s.comparisonValue, { color: colors.secondaryForeground }]}>{number(current)}</Text>
      </View>)}
      <Muted colors={colors} style={s.micro}>Only recorded entries are compared. Missing days are not counted as zero.</Muted>
    </Panel>
    <Panel colors={colors}>
      <Label colors={colors}>STRENGTH HIGHLIGHTS</Label>
      <Text style={[s.sectionTitle, { color: colors.foreground }]}>Best lifts this week</Text>
      {records.length ? records.map(x => <View key={x.id} style={[s.comparisonRow, { borderTopColor: colors.border }]}>
        <View style={s.rowContent}><Text style={[s.smallStrong, { color: colors.foreground }]}>{x.exercise}</Text><Muted colors={colors}>All-time best estimated 1RM · {x.date}</Muted></View>
        <Text style={[s.smallStrong, { color: colors.secondaryForeground }]}>{number(x.estimatedOneRm)} kg</Text>
      </View>) : <Muted colors={colors}>No all-time best sets logged in this week yet.</Muted>}
    </Panel>
    {!hasWeek ? <Panel colors={colors}><View style={s.empty}><Feather name="book-open" color={colors.primary} size={33} /><Label colors={colors}>A FRESH PAGE</Label><Text style={[s.sectionTitle, { color: colors.foreground, textAlign: 'center' }]}>Nothing logged here yet. That’s okay.</Text><Muted colors={colors} style={{ textAlign: 'center' }}>This week has no entries in your journal. That doesn’t mean you weren’t moving, drinking water, eating well, or getting stronger.</Muted>
      <Action colors={colors} onPress={() => changeTab('Nutrition')}>Log food or water</Action><Action colors={colors} secondary onPress={() => changeTab('Movement')}>Log movement</Action></View></Panel> : <>
      <View style={[s.hero, { backgroundColor: colors.foreground }]}><Text style={[s.heroLabel, { color: colors.accent }]}>MOVEMENT / 01</Text><Text style={[s.heroTitle, { color: colors.card }]}>The steps you recorded.</Text><Text style={[s.heroBody, { color: colors.muted }]}>{loggedSteps.length ? `${loggedSteps.reduce((n, x) => n + (x.steps ?? 0), 0).toLocaleString()} steps across ${loggedSteps.length} logged ${loggedSteps.length === 1 ? 'day' : 'days'}.` : 'No step history logged this week.'}</Text>
        <View style={s.chart}>{days.map(d => { const item = movementSummary.week.find(x => x.date === d); const v = item?.steps; return <View key={d} style={s.chartDay}><Text style={[s.chartText, { color: colors.accent }]}>{v === null || v === undefined ? '—' : v ? v >= 1000 ? `${(v/1000).toFixed(1)}k` : String(v) : '0'}</Text><View style={[s.chartBar, { height: v === null || v === undefined ? 2 : Math.max(3, Math.min(75, v / Math.max(1, goalSteps) * 75)), backgroundColor: colors.accent, opacity: v === null || v === undefined ? .3 : 1 }]} /><Text style={[s.chartText, { color: colors.muted }]}>{fmtDate(d).toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2)}</Text></View>; })}</View>
        <Text style={[s.heroBody, { color: colors.muted }]}>— means unlogged, not zero steps.</Text>
      </View>
      <View style={s.twoColumns}><Panel colors={colors} style={s.half}><Label colors={colors}>NOURISHMENT</Label><Text style={[s.bigNumber, { color: colors.foreground }]}>{weekMeals.length}</Text><Muted colors={colors}>meals recorded</Muted><Muted colors={colors}>{number(weekMeals.reduce((n,x) => n+x.calories, 0))} kcal logged</Muted></Panel>
        <Panel colors={colors} style={s.half}><Label colors={colors}>STRENGTH</Label><Text style={[s.bigNumber, { color: colors.foreground }]}>{weekSets.length}</Text><Muted colors={colors}>sets recorded</Muted><Muted colors={colors}>{fit.completedWorkouts.filter(x => inWeek(x.date)).length} sessions finished</Muted></Panel></View>
      <Panel colors={colors}>
        <Label colors={colors}>NUTRITION / 02</Label><Text style={[s.sectionTitle, { color: colors.foreground }]}>What you logged.</Text>
        <Muted colors={colors}>Only days with food entries are measured. Empty days are not treated as zero.</Muted>
        {days.map(d => {
          const entries = weekMeals.filter(x => x.date === d);
          const kcal = entries.reduce((n,x) => n + x.calories, 0);
          const grams = entries.reduce((n,x) => n + x.protein, 0);
          return <View key={d} style={[s.listRow, { borderBottomColor: colors.border }]}>
            <Text style={[s.smallStrong, { color: colors.foreground, width: 43 }]}>{fmtDate(d).toLocaleDateString('en-US', { weekday: 'short' })}</Text>
            <View style={s.rowContent}><Meter value={kcal} target={profile.calorieTarget} color={colors.accent} colors={colors} /><Muted colors={colors}>{entries.length ? `${number(kcal)} kcal · ${number(grams)}g protein` : 'No meals logged'}</Muted></View>
          </View>;
        })}
      </Panel>
      <Panel colors={colors}>
        <Label colors={colors}>WATER / 03</Label><Text style={[s.sectionTitle, { color: colors.foreground }]}>The water you tracked.</Text>
        {days.map(d => <View key={d} style={[s.listRow, { borderBottomColor: colors.border }]}>
          <Text style={[s.smallStrong, { color: colors.foreground, width: 43 }]}>{fmtDate(d).toLocaleDateString('en-US', { weekday: 'short' })}</Text>
          <View style={s.rowContent}><Meter value={fit.water[d] ?? 0} target={profile.waterGoalMl ?? 2500} color={colors.secondaryForeground} colors={colors} /><Muted colors={colors}>{fit.water[d] ? `${fit.water[d]} ml` : 'No water logged'}</Muted></View>
        </View>)}
      </Panel>
      <Panel colors={colors}>
        <Label colors={colors}>STRENGTH / 04</Label><Text style={[s.sectionTitle, { color: colors.foreground }]}>Each day you showed up.</Text>
        {days.map(d => {
          const count = weekSets.filter(x => x.date === d).length;
          const sessions = fit.completedWorkouts.filter(x => x.date === d).length;
          return <View key={d} style={[s.listRow, { borderBottomColor: colors.border }]}>
            <Text style={[s.smallStrong, { color: colors.foreground, width: 43 }]}>{fmtDate(d).toLocaleDateString('en-US', { weekday: 'short' })}</Text>
            <View style={s.rowContent}><Meter value={count} target={Math.max(1, ...days.map(day => weekSets.filter(x => x.date === day).length))} color={colors.primary} colors={colors} />
              <Muted colors={colors}>{count || sessions ? `${count} ${count === 1 ? 'set' : 'sets'} · ${sessions} ${sessions === 1 ? 'session' : 'sessions'} finished` : 'No strength entries logged'}</Muted></View>
          </View>;
        })}
      </Panel>
      <Panel colors={colors}><Label colors={colors}>YOUR JOURNAL, DAY BY DAY</Label>{days.map(d => <View key={d} style={[s.listRow, { borderBottomColor: colors.border }]}><Text style={[s.smallStrong, { color: colors.foreground, width: 55 }]}>{fmtDate(d).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}</Text><View style={s.rowContent}><Muted colors={colors}>{fit.meals.some(x => x.date === d) ? `${number(fit.meals.filter(x => x.date === d).reduce((n,x) => n+x.calories, 0))} kcal` : 'Food —'} · {fit.water[d] ? `${fit.water[d]} ml` : 'Water —'}</Muted><Muted colors={colors}>{fit.sets.filter(x => x.date === d).length || '—'} sets · {movementSummary.week.find(x => x.date === d)?.steps ?? '—'} steps</Muted></View></View>)}</Panel>
    </>}
    <Panel colors={colors}><Label colors={colors}>WEIGHT JOURNAL</Label><Text style={[s.sectionTitle, { color: colors.foreground }]}>A number, not a verdict.</Text>
       {!!weekWeights.length && <Muted colors={colors}>Average of {weekWeights.length} measured {weekWeights.length === 1 ? 'day' : 'days'}: {number(weekWeights.reduce((n,x) => n + x.weight, 0) / weekWeights.length)} kg. Missing days are not estimated.</Muted>}
       <View style={s.weightRow}><View style={s.rowContent}><Field label="Weight (kg)" value={weightInput} onChange={setWeightInput} numeric colors={colors} placeholder={String(profile.weight)} testID="weight-input" /></View>
         <Action colors={colors} disabled={saving} onPress={() => {
           if (!decimal(weightInput, 20, 500)) { setWeightMessage('Enter a weight between 20 and 500 kg.'); return; }
           setSaving(true);
           void fit.logWeight(Number(weightInput)).then((ok) => {
             setSaving(false);
             if (ok) { setWeightInput(''); setWeightMessage('Weight logged for today.'); }
             else setWeightMessage('Weight could not be saved on this device. Please try again.');
           });
         }} testID="log-weight">Log</Action></View>
       {!!weightMessage && <Text style={[s.feedback, { color: weightMessage.startsWith('Enter') || weightMessage.includes('could not') ? colors.destructive : colors.secondaryForeground }]}>{weightMessage}</Text>}
      {weekWeights.length ? weekWeights.map((x, i) => <View key={`${x.date}-${i}`} style={[s.listRow, { borderBottomColor: colors.border }]}><Text style={[s.smallStrong, { color: colors.foreground }]}>{x.date}</Text><Text style={[s.smallStrong, { color: colors.secondaryForeground }]}>{number(x.weight)} kg</Text></View>) : <Muted colors={colors}>No weight entries in this week.</Muted>}
    </Panel>
  </View>:null;
  const bmi = validPlan ? w / Math.pow(h/100, 2) : 0;
  const loadBlocked = fit.error.startsWith('Saved fitness data could not be read') ||
    fit.error.startsWith('Fitness data could not be loaded');
  const planScreen = tab==='My plan'?<View style={s.stack}>
    {heading('PLANNING DESK · PERSONAL TARGETS', 'Know what to aim for.', 'Use your body, activity, and goal to create a starting point you can actually follow.')}
    <Panel colors={colors}><Label colors={colors}>YOUR INPUTS</Label><Text style={[s.sectionTitle, { color: colors.foreground }]}>A plan that starts with you.</Text><Muted colors={colors}>Change any number and the plan updates instantly.</Muted>
      <View style={s.twoColumns}><View style={s.half}><Field label="Body weight (kg)" numeric value={planForm.weight} onChange={v => updatePlan('weight', v)} colors={colors} testID="plan-weight" /></View><View style={s.half}><Field label="Height (cm)" numeric value={planForm.height} onChange={v => updatePlan('height', v)} colors={colors} testID="plan-height" /></View></View>
      <Field label="Age (years)" numeric value={planForm.age} onChange={v => updatePlan('age', v)} colors={colors} testID="plan-age" />
      <Text style={[s.fieldLabel, { color: colors.foreground }]}>Calculation profile</Text><Select values={['female', 'male'] as const} value={planForm.sex} onChange={v => updatePlan('sex', v)} colors={colors} />
      <Text style={[s.fieldLabel, { color: colors.foreground }]}>Typical activity</Text><Select values={['sedentary', 'light', 'moderate', 'high'] as const} value={planForm.activity} onChange={v => updatePlan('activity', v)} colors={colors} />
      <Text style={[s.fieldLabel, { color: colors.foreground }]}>Current goal</Text><Select values={['cut', 'maintain', 'bulk'] as const} value={planForm.goal} onChange={v => updatePlan('goal', v)} colors={colors} />
      <Muted colors={colors}>This is a planning estimate, not medical advice. Track how you feel and adjust over time.</Muted>
    </Panel>
    <Panel colors={colors}><Label colors={colors}>YOUR STARTING TARGETS</Label><Text style={[s.sectionTitle, { color: colors.foreground }]}>Built from your inputs.</Text>
      <View style={[s.result, { backgroundColor: colors.secondary }]}><Label colors={colors}>{planForm.goal.toUpperCase()} CALORIES</Label><Text style={[s.bigNumber, { color: colors.secondaryForeground }]}>{validPlan ? number(planCalories) : '—'} <Text style={s.numberUnit}>kcal/day</Text></Text><Muted colors={colors}>Maintenance estimate: {validPlan ? number(maintenance) : '—'} kcal</Muted></View>
      {([['Protein', planProtein], ['Carbs', planCarbs], ['Fat', planFat]] as const).map(([label, value]) => <View key={label} style={[s.listRow, { borderBottomColor: colors.border }]}><Text style={[s.smallStrong, { color: colors.foreground }]}>{label}</Text><Text style={[s.smallStrong, { color: colors.foreground }]}>{validPlan ? `${value}g` : '—'}</Text></View>)}
      {!validPlan && <Text style={[s.feedback, { color: colors.destructive }]}>Enter a weight of 20–500 kg, height of 100–230 cm, and age of 14–90.</Text>}
      {validPlan && !validResult && <Text style={[s.feedback, { color: colors.destructive }]}>This plan exceeds the supported target range. Adjust your inputs.</Text>}
       {!!planMessage && <Text style={[s.feedback, { color: planMessage.startsWith('Adjust') || planMessage.includes('could not') ? colors.destructive : colors.secondaryForeground }]}>{planMessage}</Text>}
       <Action colors={colors} onPress={() => void apply()} disabled={!validResult || saving} testID="apply-plan">{saving ? 'Applying…' : 'Apply these targets'}</Action>
    </Panel>
    <Panel colors={colors}><Label colors={colors}>BMI CALCULATOR</Label><Text style={[s.sectionTitle, { color: colors.foreground }]}>One number, some context.</Text><Text style={[s.bigNumber, { color: colors.foreground }]}>{validPlan ? bmi.toFixed(1) : '—'}</Text><Muted colors={colors}>{validPlan ? bmi < 18.5 ? 'Below healthy range' : bmi < 25 ? 'Healthy range' : bmi < 30 ? 'Above healthy range' : 'High range' : 'Enter valid measurements to calculate.'}</Muted><Muted colors={colors}>BMI is one signal, not a complete picture of health or athleticism.</Muted></Panel>
  </View>:null;
  return <View style={[s.root, { backgroundColor: colors.background }]}>
    <View style={[s.header, { paddingTop: Platform.OS === 'web' ? 67 : insets.top + 10, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
      <View style={s.brand}><BrandMark size={40} tile={colors.accent} glyph={colors.foreground} /><BrandWordmark size={25} color={colors.foreground} accentColor={colors.secondaryForeground} /></View>
      <Pressable testID="open-menu" accessibilityRole="button" accessibilityLabel="Open menu" onPress={() => { tap(); setMenu(v => !v); }} style={[s.menuButton, { borderColor: colors.border, backgroundColor: colors.card }]}><Feather name={menu ? 'x' : 'user'} size={19} color={colors.foreground} /></Pressable>
    </View>
    {menu && <View style={[s.menu, { top: (Platform.OS === 'web' ? 67 : insets.top + 10) + 48, backgroundColor: colors.card, borderColor: colors.border }]}>
      <Pressable testID="open-workspace" accessibilityLabel="Open personal workspace" onPress={()=>{setMenu(false);setWorkspaceOpen(true);}} style={s.menuItem}><Feather name="grid" size={18} color={colors.primary}/><Text style={[s.smallStrong,{color:colors.foreground}]}>Your workspace</Text></Pressable>
      <Pressable testID="nav-my-plan" onPress={() => changeTab('My plan')} style={s.menuItem}><Feather name="clipboard" size={18} color={colors.primary} /><Text style={[s.smallStrong, { color: colors.foreground }]}>My plan</Text><Feather name="arrow-right" size={16} color={colors.primary} /></Pressable>
      <Pressable testID="open-profile" onPress={() => { setMenu(false); setProfileOpen(true); }} style={s.menuItem}><Feather name="user" size={18} color={colors.primary} /><Text style={[s.smallStrong, { color: colors.foreground }]}>Edit profile</Text><Feather name="arrow-right" size={16} color={colors.primary} /></Pressable>
    </View>}
    {(tab === 'Nutrition' || tab === 'Strength') && <View style={[s.logSwitchWrap, { backgroundColor: colors.background }]}>
      <View style={[s.logSwitch, { backgroundColor: colors.secondary }]}>
        {(['Nutrition', 'Strength'] as const).map(section => <Pressable key={section} testID={`switch-${section.toLowerCase()}`} accessibilityRole="tab" accessibilityState={{ selected: tab === section }} onPress={() => changeTab(section)}
          style={({ pressed }) => [s.logSwitchItem, { backgroundColor: tab === section ? colors.card : colors.secondary, opacity: pressed ? .7 : 1 }]}>
          <Text style={[s.logSwitchText, { color: tab === section ? colors.foreground : colors.mutedForeground }]}>{section}</Text>
        </Pressable>)}
      </View>
    </View>}
    <PersistentPage active={tab==='Movement'}>
      <FrozenPageContent active={tab==='Movement'}>{movementScreen}</FrozenPageContent>
    </PersistentPage>
     {(['Today', 'Nutrition', 'Strength', 'Insights', 'My plan'] as const).filter(section=>section===tab||visited.includes(section)).map((section) =>
      // Native keyboard-aware scrolling adds its own flex container. Hide the
      // whole page, not just its inner scroll view, so inactive tabs take no space.
      <PersistentPage key={section} active={tab===section}>
      <FrozenPageContent active={tab===section}>
      <KeyboardAwareScrollViewCompat testID={`page-${section.toLowerCase().replace(/\s/g,'-')}`} style={{ flex: 1 }} bottomOffset={60} keyboardDismissMode="on-drag" contentContainerStyle={[s.content, { paddingBottom: Platform.OS === 'web' ? 34 + 30 : insets.bottom + 30 }]} keyboardShouldPersistTaps="handled">
       {!fit.ready ? <View style={s.stack}>{[1,2,3].map(n => <View key={n} style={[s.skeleton, { backgroundColor: colors.muted }]} />)}</View> : loadBlocked ? <Panel colors={colors}><Text style={[s.sectionTitle, { color: colors.destructive }]}>Your journal couldn’t load.</Text><Muted colors={colors}>{fit.error}</Muted><Muted colors={colors}>Please reopen the app to try again.</Muted></Panel> :
       <View style={s.stack}>
         {!!fit.error && <Text accessibilityRole="alert" style={[s.feedback, { color: colors.destructive }]}>{fit.error}</Text>}
         {section === 'Today' ? todayScreen : section === 'Nutrition' ? nutritionScreen : section === 'Strength' ? strengthScreen : section === 'Insights' ? insightsScreen : planScreen}
       </View>}
     </KeyboardAwareScrollViewCompat>
     </FrozenPageContent>
     </PersistentPage>)}
    <View style={[s.navWrap, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom }]}>
      <View style={s.nav}>{tabs.map(t => {
        const selected = t === 'Log' ? tab === 'Nutrition' || tab === 'Strength' : t === 'Plan' ? tab === 'My plan' : tab === t;
        const destination: Tab = t === 'Log' ? (tab === 'Strength' ? 'Strength' : 'Nutrition') : t === 'Plan' ? 'My plan' : t;
        return <Pressable key={t} testID={`nav-${t.toLowerCase()}`} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => changeTab(destination)} style={({ pressed }) => [s.navItem, { opacity: pressed ? .65 : 1 }]}>
          <View style={[s.navIcon, { backgroundColor: selected ? colors.accent : colors.card }]}><Feather name={icons[t]} size={20} color={selected ? colors.foreground : colors.mutedForeground} /></View>
          <Text style={[s.navText, { color: selected ? colors.foreground : colors.mutedForeground }]}>{t}</Text>
        </Pressable>;
      })}</View>
    </View>
    {fit.undoAvailable && <Pressable accessibilityRole="button" testID="undo-latest-deletion" onPress={()=>void fit.undoLastDeletion()} style={[s.undoBar,{backgroundColor:colors.secondary}]}><Text style={[s.smallStrong,{color:colors.secondaryForeground}]}>Entry deleted · Undo</Text></Pressable>}
    <PremiumCenter visible={workspaceOpen} onClose={()=>setWorkspaceOpen(false)} movementSummary={movementSummary}/>
    <Modal visible={mealOpen} animationType={reduced?'none':'slide'} transparent onRequestClose={() => { if (!saving) setMealOpen(false); }}>
      <View style={[s.modalBackdrop, { backgroundColor: colors.foreground + '99' }]}>
         <KeyboardAwareScrollViewCompat bottomOffset={60} keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 18, paddingVertical: Platform.OS === 'web' ? 67 : insets.top + 15 }}>
          <View style={[s.modalCard, { backgroundColor: colors.card }]}>
            <View style={s.between}><Label colors={colors}>A MOMENT TO NOTICE</Label><Pressable disabled={saving} onPress={() => setMealOpen(false)} accessibilityLabel="Close meal form"><Feather name="x" size={22} color={colors.foreground} /></Pressable></View>
            <Text style={[s.title, { color: colors.foreground, fontSize: 28 }]}>Log a meal</Text><Muted colors={colors}>Useful is better than perfect. Add what you know.</Muted>
            <Text style={[s.fieldLabel, { color: colors.foreground }]}>Meal</Text><Select values={['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const} value={mealType} onChange={setMealType} colors={colors} />
            <Field label="What did you eat?" value={mealName} onChange={setMealName} colors={colors} placeholder="e.g. Oatmeal and fruit" testID="meal-name" />
            <View style={s.twoColumns}>{(['calories', 'protein', 'carbs', 'fat'] as const).map(k => <View key={k} style={s.half}><Field label={`${k[0].toUpperCase()+k.slice(1)} (${k === 'calories' ? 'kcal' : 'g'})`} value={mealValues[k]} onChange={v => setMealValues({ ...mealValues, [k]: v })} colors={colors} numeric testID={`meal-${k}`} /></View>)}</View>
            {!!mealError && <Text style={[s.feedback, { color: colors.destructive }]}>{mealError}</Text>}
             <Action colors={colors} onPress={() => void saveMeal()} disabled={saving} testID="save-meal">{saving ? 'Saving…' : 'Save meal'}</Action>
          </View>
         </KeyboardAwareScrollViewCompat>
      </View>
    </Modal>
    <ProfileModal profile={movementSummary.paired ? { ...fit.profile, stepTarget: movementSummary.goal } : fit.profile}
      stepTargetManagedInMovement={!!movementSummary.paired} visible={profileOpen} onClose={() => setProfileOpen(false)} onSave={async (update) => {
      const ok = await fit.applyPlan(update);
      if (ok) { setTargets(null); setPlan(null); }
      return ok;
    }} />
    <RestTimer startKey={restStartKey} />
    <PRCelebration visible={!!record} exercise={record?.exercise ?? ''} kind={record?.kind ?? ''} value={record?.value ?? 0} onClose={() => setRecord(null)} />
  </View>;
}

const s = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  undoBar: { paddingHorizontal:20,paddingVertical:12,minHeight:44 },
  header: { paddingHorizontal: 20, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1 },
  brand: { flexDirection: 'row', gap: 9, alignItems: 'center' },
  menuButton: { borderWidth: 1, width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  menu: { position: 'absolute', top: Platform.OS === 'web' ? 119 : 93, right: 16, zIndex: 10, borderWidth: 1, borderRadius: 12, padding: 8, width: 170, elevation: 5 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  navWrap: { borderTopWidth: 1 },
  nav: { flexDirection: 'row', paddingHorizontal: 6, paddingTop: 7, paddingBottom: 3 },
  navItem: { flex: 1, minHeight: 53, alignItems: 'center', justifyContent: 'center', gap: 2 },
  navIcon: { width: 42, height: 30, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  navText: { fontFamily: 'DMSans_700Bold', fontSize: 11 },
  logSwitchWrap: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  logSwitch: { flexDirection: 'row', borderRadius: 12, padding: 4 },
  logSwitchItem: { flex: 1, minHeight: 37, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  logSwitchText: { fontFamily: 'DMSans_700Bold', fontSize: 13 },
  movementLauncher: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1 },
  content: { paddingHorizontal: 20, paddingTop: 22, maxWidth: 610, width: '100%', alignSelf: 'center' },
  stack: { gap: 15 },
  todayStack: { gap: 21 },
  todayHeading: { gap: 2, paddingTop: 4, paddingBottom: 3 },
  todayTitle: { fontFamily: 'DMSans_700Bold', fontSize: 42, lineHeight: 49, letterSpacing: -2.3 },
  todaySummary: { borderRadius: 18, padding: 20, gap: 14 },
  todaySummaryNumber: { fontFamily: 'DMSans_700Bold', fontSize: 38, letterSpacing: -1.8 },
  todaySummaryUnit: { fontFamily: 'DMSans_400Regular', fontSize: 14, letterSpacing: 0 },
  todayMetrics: { flexDirection: 'row', borderWidth: 1, borderRadius: 16, paddingVertical: 17 },
  todayMetric: { flex: 1, paddingHorizontal: 11, gap: 6 },
  todayMetricValue: { fontFamily: 'DMSans_700Bold', fontSize: 22, letterSpacing: -.8 },
  nextCard: { marginTop: 10, borderRadius: 16, minHeight: 87, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 13 },
  nextIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  nextTitle: { fontFamily: 'DMSans_700Bold', fontSize: 16, letterSpacing: -.3 },
  comparisonRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, paddingVertical: 11, gap: 8 },
  comparisonValue: { fontFamily: 'DMSans_700Bold', fontSize: 21, letterSpacing: -.7 },
  pageHeading: { gap: 6, marginBottom: 5 },
  label: { fontFamily: 'DMSans_700Bold', fontSize: 9, letterSpacing: 1.5, lineHeight: 14 },
  title: { fontFamily: 'DMSans_700Bold', fontSize: 38, lineHeight: 42, letterSpacing: -2.2 },
  serif: { fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontStyle: 'italic', fontSize: 47, lineHeight: 51, letterSpacing: -2 },
  muted: { fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 20 },
  micro: { fontSize: 10, lineHeight: 15 },
  hero: { minHeight: 226, borderRadius: 17, padding: 20, paddingTop: 51, overflow: 'hidden', justifyContent: 'flex-end', gap: 9 },
  heroOrbit: { position: 'absolute', top: -23, right: -12, width: 125, height: 125, borderRadius: 80, borderWidth: 1, alignItems: 'center', justifyContent: 'center', opacity: .65 },
  heroLabel: { fontFamily: 'DMSans_700Bold', fontSize: 9, letterSpacing: 1.5 },
  heroTitle: { fontFamily: 'DMSans_700Bold', fontSize: 27, lineHeight: 30, letterSpacing: -1.4, maxWidth: 280 },
  heroBody: { fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 20 },
  heroLink: { fontFamily: 'DMSans_700Bold', fontSize: 11, marginTop: 4 },
  sectionTitle: { fontFamily: 'DMSans_700Bold', fontSize: 20, lineHeight: 25, letterSpacing: -.7, marginTop: 4 },
  panel: { borderWidth: 1, borderRadius: 15, padding: 17, gap: 10 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  stat: { width: '48.5%', borderWidth: 1, borderRadius: 12, padding: 13, gap: 8 },
  statWide: { width: '100%' },
  statHeading: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  statIcon: { width: 25, height: 25, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  statLabel: { fontFamily: 'DMSans_700Bold', fontSize: 9, letterSpacing: 1 },
  statValue: { fontFamily: 'DMSans_700Bold', fontSize: 25, letterSpacing: -1.2 },
  statUnit: { fontFamily: 'DMSans_400Regular', fontSize: 10, letterSpacing: 0 },
  track: { height: 5, borderRadius: 5, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5 },
  insightsLink: { borderWidth: 1, borderRadius: 12, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 9 },
  rowContent: { flex: 1, gap: 3, minWidth: 0 },
  link: { fontFamily: 'DMSans_700Bold', fontSize: 11 },
  nutritionRow: { flexDirection: 'row', gap: 13, alignItems: 'center', paddingVertical: 8 },
  ring: { width: 119, height: 119, borderWidth: 8, borderRadius: 70, alignItems: 'center', justifyContent: 'center' },
  ringNumber: { fontFamily: 'DMSans_700Bold', fontSize: 25, letterSpacing: -1 },
  macroColumn: { flex: 1, gap: 9 },
  macro: { gap: 3 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  smallStrong: { fontFamily: 'DMSans_700Bold', fontSize: 12, lineHeight: 17 },
  callout: { borderRadius: 10, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  smallButton: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 11 },
  iconCircle: { width: 39, height: 39, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  listRow: { paddingVertical: 12, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
  mealIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 20, gap: 10 },
  textLink: { paddingTop: 8, paddingBottom: 2 },
  strengthTeaser: { borderRadius: 13, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 11 },
  action: { minHeight: 43, borderRadius: 9, paddingHorizontal: 15, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontFamily: 'DMSans_700Bold', fontSize: 12 },
  field: { gap: 6, marginTop: 4 },
  fieldLabel: { fontFamily: 'DMSans_700Bold', fontSize: 11, marginTop: 3 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, minHeight: 48, fontFamily: 'DMSans_400Regular', fontSize: 16 },
  twoColumns: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  half: { width: '48%', flexGrow: 1 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 9, minHeight: 37, justifyContent: 'center' },
  pillText: { fontFamily: 'DMSans_700Bold', fontSize: 11 },
  feedback: { fontFamily: 'DMSans_400Regular', fontSize: 12, lineHeight: 18 },
  quickRow: { flexDirection: 'row', gap: 8 },
  quickButton: { flex: 1, alignItems: 'center', borderRadius: 9, paddingVertical: 12 },
  bigNumber: { fontFamily: 'DMSans_700Bold', fontSize: 38, letterSpacing: -2 },
  numberUnit: { fontFamily: 'DMSans_400Regular', fontSize: 14, letterSpacing: 0 },
  weekNav: { borderWidth: 1, borderRadius: 11, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chart: { flexDirection: 'row', height: 110, alignItems: 'flex-end', gap: 4, marginTop: 8 },
  chartDay: { flex: 1, alignItems: 'center', gap: 4 },
  chartBar: { width: '70%', borderRadius: 4 },
  chartText: { fontFamily: 'DMSans_400Regular', fontSize: 9 },
  weightRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
  result: { borderRadius: 11, padding: 15, gap: 5 },
  skeleton: { height: 150, borderRadius: 16 },
  modalBackdrop: { flex: 1 },
  modalCard: { borderRadius: 18, padding: 22, gap: 13, maxWidth: 440, width: '100%', alignSelf: 'center' },
});