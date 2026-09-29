import React, { useEffect, useState } from 'react';
import { AppState, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useFitness, dateKey, type MovementSummary } from '@/providers/FitnessProvider';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import FastingCard from '@/components/FastingCard';
import IntervalTimer from '@/components/IntervalTimer';
import ProfileModal from '@/components/ProfileModal';
import RestTimer from '@/components/RestTimer';
import PRCelebration from '@/components/PRCelebration';
import LiveWorkout from '@/components/LiveWorkout';
import MealTemplates from '@/components/MealTemplates';
import WaterIntakeCard from '@/components/WaterIntakeCard';

type Tab = 'Today' | 'Nutrition' | 'Strength' | 'Movement' | 'Insights' | 'My plan';
type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';
type SetType = 'warmup' | 'working' | 'drop' | 'failure';
type Palette = ReturnType<typeof useColors>;
const tabs: Tab[] = ['Today', 'Nutrition', 'Strength', 'Movement', 'Insights', 'My plan'];
const icons: Record<Tab, keyof typeof Feather.glyphMap> = {
  Today: 'home', Nutrition: 'pie-chart', Strength: 'activity', Movement: 'navigation', Insights: 'bar-chart-2', 'My plan': 'clipboard',
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
  return <Pressable testID={testID} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.action,
    { backgroundColor: secondary ? colors.secondary : colors.primary, opacity: pressed || disabled ? .5 : 1 }]}>
    <Text style={[s.actionText, { color: secondary ? colors.secondaryForeground : colors.primaryForeground }]}>{children}</Text>
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
  return <View style={s.pills}>{values.map(v => <Pressable key={v} onPress={() => onChange(v)}
    style={[s.pill, { backgroundColor: v === value ? colors.accent : colors.background, borderColor: v === value ? colors.accent : colors.border }]}>
    <Text style={[s.pillText, { color: colors.foreground }]}>{v === 'warmup' ? 'Warm-up' : v === 'working' ? 'Working' : v === 'drop' ? 'Drop' : v === 'failure' ? 'Failure' : v[0].toUpperCase() + v.slice(1)}</Text>
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
  const [tab, setTab] = useState<Tab>('Today');
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
  useEffect(() => {
    const refreshDate = () => setDateNow(new Date());
    const timer = setInterval(refreshDate, 60000);
    const foreground = AppState.addEventListener('change', state => { if (state === 'active') refreshDate(); });
    return () => { clearInterval(timer); foreground.remove(); };
  }, []);
  const today = dateKey(dateNow);
  const profile = fit.profile;
  const meals = fit.meals.filter(m => m.date === today);
  const sets = fit.sets.filter(x => x.date === today);
  const finishedIds = new Set(fit.completedWorkouts.filter(x => x.date === today).flatMap(x => x.setIds));
  const pending = sets.filter(x => !finishedIds.has(x.id));
  const sum = (field: 'calories'|'protein'|'carbs'|'fat') => meals.reduce((total, meal) => total + meal[field], 0);
  const calories = sum('calories'), protein = sum('protein'), carbs = sum('carbs'), fat = sum('fat');
  const steps = movementSummary.steps;
  const goalSteps = movementSummary.goal || profile.stepTarget;
  const changeTab = (next: Tab) => { setTab(next); setMenu(false); };
  const openMeal = () => { setMealError(''); setMealOpen(true); };
  const saveMeal = async () => {
    const name = mealName.replace(/\s+/g, ' ').trim();
    if (!name || name.length > 120) { setMealError('Enter a meal name (up to 120 characters).'); return; }
    if (!decimal(mealValues.calories, .01, 10000)) { setMealError('Calories must be between 0.01 and 10,000.'); return; }
    if (!(['protein', 'carbs', 'fat'] as const).every(k => decimal(mealValues[k], 0, 1000))) { setMealError('Protein, carbs, and fat must each be between 0 and 1,000 g.'); return; }
    setSaving(true);
    const ok = await fit.addMeal({ meal: mealType, name, calories: Number(mealValues.calories), protein: Number(mealValues.protein), carbs: Number(mealValues.carbs), fat: Number(mealValues.fat) });
    setSaving(false);
    if (!ok) { setMealError('Meal could not be saved on this device. Your entries are still here; try again.'); return; }
    setMealValues({ calories: '', protein: '', carbs: '', fat: '' }); setMealName(''); setMealError(''); setMealOpen(false);
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
    if (setType === 'working') setRestStartKey(v => v + 1);
    if (weightRecord || oneRmRecord) setRecord({ exercise: name, kind: oneRmRecord ? 'Estimated 1RM' : 'Weight', value: oneRmRecord ? estimatedOneRm : weight });
  };
  const targetForm = targets ?? { calories: String(profile.calorieTarget), protein: String(profile.proteinTarget), carbs: String(profile.carbsTarget), fat: String(profile.fatTarget) };
  const updateTarget = (key: keyof typeof targetForm, value: string) => { setTargets({ ...targetForm, [key]: value }); setTargetMessage(''); };
  const saveGoals = async () => {
    if (!integer(targetForm.calories, 1000, 10000) || !(['protein', 'carbs', 'fat'] as const).every(k => integer(targetForm[k], 1, 1000))) {
      setTargetMessage('Use 1,000–10,000 calories and 1–1,000 g for each macro.'); return;
    }
    setSaving(true);
    const ok = await fit.saveTargets({ calorieTarget: Number(targetForm.calories), proteinTarget: Number(targetForm.protein), carbsTarget: Number(targetForm.carbs), fatTarget: Number(targetForm.fat) });
    setSaving(false);
    setTargetMessage(ok ? 'Daily targets saved.' : 'Could not save these targets. Check your values.');
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
    setPlanMessage('Your plan is applied. Nutrition targets are up to date.');
  };
  const heading = (eyebrow: string, title: string, description: string) => <View style={s.pageHeading}>
    <Label colors={colors}>{eyebrow}</Label><Title colors={colors}>{title}</Title><Muted colors={colors}>{description}</Muted>
  </View>;
  const mealList = (limited = false) => <Panel colors={colors}>
    <View style={s.between}><View><Label colors={colors}>ON YOUR PLATE</Label><Text style={[s.sectionTitle, { color: colors.foreground }]}>Meals today</Text><Muted colors={colors}>{meals.length} {meals.length === 1 ? 'meal' : 'meals'} logged</Muted></View>
      <Pressable testID="open-meal" onPress={openMeal} style={[s.iconCircle, { backgroundColor: colors.background }]}><Feather name="plus" size={21} color={colors.primary} /></Pressable></View>
    {meals.length ? (limited ? meals.slice(0, 4) : meals).map(m => <View key={m.id} style={[s.listRow, { borderBottomColor: colors.border }]}>
      <View style={[s.mealIcon, { backgroundColor: colors.secondary }]}><Feather name="coffee" size={16} color={colors.secondaryForeground} /></View>
      <View style={s.rowContent}><Text style={[s.smallStrong, { color: colors.foreground }]} numberOfLines={2}>{m.name}</Text><Muted colors={colors} style={s.micro}>{m.meal} · {m.time} · P {number(m.protein)}g · C {number(m.carbs)}g · F {number(m.fat)}g</Muted></View>
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
  const todayScreen = <View style={s.stack}>
    <View style={s.pageHeading}><Label colors={colors}>TODAY, {new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()).toUpperCase()}</Label>
      <Title colors={colors}>Your day.</Title><Text style={[s.serif, { color: colors.secondaryForeground }]}>In progress.</Text>
      <Muted colors={colors}><Text style={{ fontFamily: 'DMSans_700Bold', color: colors.foreground }}>{profile.name.split(' ')[0]}, </Text>see your fuel, movement and strength at a glance.</Muted></View>
    <View style={[s.hero, { backgroundColor: colors.foreground }]}>
      <View style={[s.heroOrbit, { borderColor: colors.accent }]}><MaterialCommunityIcons name="dumbbell" size={24} color={colors.accent} /></View>
      <Text style={[s.heroLabel, { color: colors.accent }]}>A NOTE FOR TODAY</Text>
      <Text style={[s.heroTitle, { color: colors.card }]}>{sets.length ? 'Keep showing up for the strong version of you.' : 'Make room for one small win today.'}</Text>
      <Text style={[s.heroBody, { color: colors.muted }]}>{sets.length ? `${sets.length} ${sets.length === 1 ? 'set is' : 'sets are'} logged today.` : 'No strength sets are logged yet. Your next set can be the first.'} {Math.max(0, goalSteps - steps).toLocaleString()} steps remain in your movement goal.</Text>
      <Pressable onPress={() => changeTab('Strength')}><Text style={[s.heroLink, { color: colors.accent }]}>See your strength work  →</Text></Pressable>
    </View>
    <View><Label colors={colors}>THE DAILY PICTURE</Label><Text style={[s.sectionTitle, { color: colors.foreground }]}>Small wins, adding up.</Text><Muted colors={colors}>No perfect days required</Muted></View>
    <View style={s.statGrid}>
      {([
        ['FOOD', calories, 'kcal', profile.calorieTarget, colors.primary, 'activity'],
        ['PROTEIN', protein, 'g', profile.proteinTarget, colors.secondaryForeground, 'target'],
        ['MOVEMENT', steps, 'steps', goalSteps, colors.accent, 'navigation'],
      ] as const).map(([label, value, unit, target, tint, icon], i) => <Pressable key={label} onPress={() => changeTab(i === 2 ? 'Movement' : 'Nutrition')}
        style={[s.stat, i === 0 && s.statWide, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={s.statHeading}><View style={[s.statIcon, { backgroundColor: tint }]}><Feather name={icon} size={14} color={i === 2 ? colors.foreground : colors.card} /></View><Text style={[s.statLabel, { color: colors.mutedForeground }]}>{label}</Text></View>
        <Text style={[s.statValue, { color: colors.foreground }]}>{number(value)} <Text style={[s.statUnit, { color: colors.mutedForeground }]}>{unit}</Text></Text>
        <Muted colors={colors} style={s.micro}>{Math.round(target ? value / target * 100 : 0)}% of daily target · {number(Math.abs(target - value))} {value > target ? 'over' : 'left'}</Muted>
        <Meter colors={colors} color={tint} value={value} target={target} />
      </Pressable>)}
    </View>
    <FastingCard />
    <Pressable onPress={() => changeTab('Insights')} style={[s.insightsLink, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <View style={s.rowContent}><Text style={[s.smallStrong, { color: colors.foreground }]}>Your last 7 days</Text><Muted colors={colors}>Food, weight, steps & strength — from your journal.</Muted></View><Text style={[s.link, { color: colors.primary }]}>See trends  →</Text>
    </Pressable>
    {nutritionCard()}{mealList(true)}
    <Pressable onPress={() => changeTab('Strength')} style={[s.strengthTeaser, { backgroundColor: colors.secondary }]}>
      <View style={[s.mealIcon, { backgroundColor: colors.secondaryForeground }]}><MaterialCommunityIcons name="dumbbell" size={19} color={colors.card} /></View>
      <View style={s.rowContent}><Label colors={colors}>STRENGTH SESSION</Label><Text style={[s.smallStrong, { color: colors.foreground }]}>{sets.length ? 'Strength work, captured.' : 'A fresh start for strength.'}</Text><Muted colors={colors}>{sets.length} sets logged today</Muted></View>
      <Text style={[s.link, { color: colors.secondaryForeground }]}>View →</Text>
    </Pressable>
    <Muted colors={colors} style={{ textAlign: 'center', marginTop: 8 }}>GYM Buddy · Built around your life, not the other way around.</Muted>
  </View>;
  const nutritionScreen = <View style={s.stack}>
    {heading('FUEL LOG · TODAY', 'Macros that make sense.', 'Log the meal, then get back to living. No food guilt, no spreadsheet energy.')}
    <Panel colors={colors}><Label colors={colors}>YOUR DAILY TARGETS</Label><Text style={[s.sectionTitle, { color: colors.foreground }]}>Choose your goals</Text><Muted colors={colors}>Current focus: {profile.goal}</Muted>
      <View style={s.twoColumns}>{(['calories', 'protein', 'carbs', 'fat'] as const).map(k => <View key={k} style={s.half}>
        <Field label={`${k[0].toUpperCase()+k.slice(1)} (${k === 'calories' ? 'kcal' : 'g'})`} numeric value={targetForm[k]} onChange={v => updateTarget(k, v)} colors={colors} testID={`target-${k}`} />
      </View>)}</View>
      {!!targetMessage && <Text style={[s.feedback, { color: targetMessage.includes('saved') ? colors.secondaryForeground : colors.destructive }]}>{targetMessage}</Text>}
       <Action colors={colors} onPress={() => void saveGoals()} disabled={saving} testID="save-targets">Save daily targets</Action>
    </Panel>
    {nutritionCard()}
    <WaterIntakeCard todayMl={fit.water[today] ?? 0} goalMl={profile.waterGoalMl}
      onAdd={fit.addWater} onRemove={fit.removeWater} onSetGoal={fit.setWaterGoal} />
    <MealTemplates onLog={fit.addMeal} />
    {mealList()}
  </View>;
  const strengthScreen = <View style={s.stack}>
    {heading('STRENGTH LOG · TODAY', 'The work adds up.', 'One good set is enough to keep the story moving.')}
    <LiveWorkout steps={steps} stepDate={today} />
    <IntervalTimer />
    <Panel colors={colors} style={{ backgroundColor: colors.secondary }}>
      <Label colors={colors}>STRENGTH SETS · TODAY</Label><Text style={[s.bigNumber, { color: colors.secondaryForeground }]}>{sets.length} <Text style={s.numberUnit}>sets logged</Text></Text>
      <Muted colors={colors}>{pending.length} {pending.length === 1 ? 'set' : 'sets'} awaiting Finish workout · {fit.completedWorkouts.filter(x => x.date === today).length} completed set-log sessions</Muted>
      <Muted colors={colors}>Live workouts are saved separately in the session history above.</Muted>
       <Action colors={colors} onPress={() => void fit.finishWorkout()} disabled={!pending.length || saving} testID="finish-workout">Finish workout</Action>
    </Panel>
    <Panel colors={colors}><Label colors={colors}>LOG A SET</Label><Text style={[s.sectionTitle, { color: colors.foreground }]}>Show up for one rep.</Text>
      <Field label="Exercise" value={exercise} onChange={setExercise} placeholder="e.g. Back squat" colors={colors} testID="set-exercise" />
      <View style={s.twoColumns}><View style={s.half}><Field label="Weight (kg)" numeric value={load} onChange={setLoad} placeholder="60" colors={colors} testID="set-weight" /></View>
        <View style={s.half}><Field label="Reps" numeric value={reps} onChange={setReps} placeholder="8" colors={colors} testID="set-reps" /></View></View>
      <Text style={[s.fieldLabel, { color: colors.foreground }]}>Set type</Text><Select values={['warmup', 'working', 'drop', 'failure'] as const} value={setType} onChange={setSetType} colors={colors} />
      {!!setError && <Text style={[s.feedback, { color: colors.destructive }]}>{setError}</Text>}
       <Action colors={colors} onPress={() => void saveSet()} disabled={saving} testID="add-set">+  Log set</Action>
    </Panel>
    <Panel colors={colors}><Label colors={colors}>TRAINING HISTORY</Label><Text style={[s.sectionTitle, { color: colors.foreground }]}>The record, kept.</Text>
      {fit.sets.length ? [...fit.sets].reverse().map(x => <View key={x.id} style={[s.listRow, { borderBottomColor: colors.border }]}>
        <View style={s.rowContent}><Text style={[s.smallStrong, { color: colors.foreground }]}>{x.exercise}</Text>
          <Muted colors={colors} style={s.micro}>{x.date} · {x.setType} · {number(x.weight)} kg × {x.reps} · Est. 1RM {number(x.estimatedOneRm)} kg{finishedIds.has(x.id) ? ' · Finished' : ''}</Muted></View>
         <Pressable testID={`delete-set-${x.id}`} accessibilityLabel={`Delete ${x.exercise} set`} onPress={() => void fit.removeSet(x.id)} hitSlop={10}><Feather name="trash-2" size={17} color={colors.destructive} /></Pressable>
      </View>) : <View style={s.empty}><MaterialCommunityIcons name="dumbbell" size={28} color={colors.primary} /><Text style={[s.smallStrong, { color: colors.foreground }]}>No sets logged yet</Text><Muted colors={colors}>Your next set can be the first mark in a very good training log.</Muted></View>}
    </Panel>
  </View>;
  const weekStart = new Date();
  weekStart.setHours(12, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7) + weekOffset * 7);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return dateKey(d); });
  const inWeek = (date: string) => days.includes(date);
  const weekMeals = fit.meals.filter(x => inWeek(x.date));
  const weekSets = fit.sets.filter(x => inWeek(x.date));
  const weekWeights = fit.weights.filter(x => inWeek(x.date));
  const loggedSteps = movementSummary.week.filter(x => inWeek(x.date) && x.steps !== null);
  const hasWeek = weekMeals.length > 0 || weekSets.length > 0 || weekWeights.length > 0 || loggedSteps.length > 0 || days.some(d => (fit.water[d] ?? 0) > 0) || fit.completedWorkouts.some(x => inWeek(x.date));
  const insightsScreen = <View style={s.stack}>
    {heading('THE WEEKLY EDIT', 'A little perspective.', 'A quiet look at what you chose to record. Every entry counts.')}
    <View style={[s.weekNav, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Pressable testID="previous-week" onPress={() => setWeekOffset(v => v-1)} hitSlop={12}><Feather name="chevron-left" color={colors.foreground} size={23} /></Pressable>
      <View style={{ alignItems: 'center' }}><Label colors={colors}>{weekOffset === 0 ? 'THIS WEEK' : 'YOUR JOURNAL'}</Label><Text style={[s.smallStrong, { color: colors.foreground }]}>{fmtDate(days[0]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {fmtDate(days[6]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text></View>
      <Pressable testID="next-week" disabled={weekOffset === 0} onPress={() => setWeekOffset(v => Math.min(0, v+1))} hitSlop={12}><Feather name="chevron-right" color={weekOffset === 0 ? colors.mutedForeground : colors.foreground} size={23} /></Pressable>
    </View>
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
  </View>;
  const bmi = validPlan ? w / Math.pow(h/100, 2) : 0;
  const loadBlocked = fit.error.startsWith('Saved fitness data could not be read') ||
    fit.error.startsWith('Fitness data could not be loaded');
  const planScreen = <View style={s.stack}>
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
       <Action colors={colors} onPress={() => void apply()} disabled={!validResult || saving} testID="apply-plan">Apply these targets</Action>
    </Panel>
    <Panel colors={colors}><Label colors={colors}>BMI CALCULATOR</Label><Text style={[s.sectionTitle, { color: colors.foreground }]}>One number, some context.</Text><Text style={[s.bigNumber, { color: colors.foreground }]}>{validPlan ? bmi.toFixed(1) : '—'}</Text><Muted colors={colors}>{validPlan ? bmi < 18.5 ? 'Below healthy range' : bmi < 25 ? 'Healthy range' : bmi < 30 ? 'Above healthy range' : 'High range' : 'Enter valid measurements to calculate.'}</Muted><Muted colors={colors}>BMI is one signal, not a complete picture of health or athleticism.</Muted></Panel>
  </View>;
  return <View style={[s.root, { backgroundColor: colors.background }]}>
    <View style={[s.header, { paddingTop: Platform.OS === 'web' ? 67 : insets.top + 10, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
      <View style={s.brand}><View style={[s.brandMark, { backgroundColor: colors.accent }]}><MaterialCommunityIcons name="dumbbell" size={19} color={colors.foreground} /></View><Text style={[s.brandText, { color: colors.foreground }]}>GYM <Text style={{ color: colors.secondaryForeground }}>Buddy</Text></Text></View>
      <Pressable testID="open-menu" accessibilityLabel="Open menu" onPress={() => setMenu(v => !v)} style={[s.menuButton, { borderColor: colors.border, backgroundColor: colors.card }]}><Feather name={menu ? 'x' : 'menu'} size={19} color={colors.foreground} /></Pressable>
    </View>
    {menu && <View style={[s.menu, { top: (Platform.OS === 'web' ? 67 : insets.top + 10) + 48, backgroundColor: colors.card, borderColor: colors.border }]}>
      <Pressable testID="nav-my-plan" onPress={() => changeTab('My plan')} style={s.menuItem}><Feather name="clipboard" size={18} color={colors.primary} /><Text style={[s.smallStrong, { color: colors.foreground }]}>My plan</Text><Feather name="arrow-right" size={16} color={colors.primary} /></Pressable>
      <Pressable testID="open-profile" onPress={() => { setMenu(false); setProfileOpen(true); }} style={s.menuItem}><Feather name="user" size={18} color={colors.primary} /><Text style={[s.smallStrong, { color: colors.foreground }]}>Edit profile</Text><Feather name="arrow-right" size={16} color={colors.primary} /></Pressable>
    </View>}
    <View style={[s.navWrap, { backgroundColor: colors.card, borderBottomColor: colors.border }]}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.nav}>
      {tabs.map(t => <Pressable key={t} testID={`nav-${t.toLowerCase()}`} onPress={() => changeTab(t)} style={[s.navItem, { backgroundColor: tab === t ? colors.accent : colors.card }]}>
        <Feather name={icons[t]} size={16} color={tab === t ? colors.foreground : colors.mutedForeground} /><Text style={[s.navText, { color: tab === t ? colors.foreground : colors.mutedForeground }]}>{t}</Text>
      </Pressable>)}
    </ScrollView></View>
    <View style={{ display: tab === 'Movement' ? 'flex' : 'none', flex: 1 }}>
      <Pressable testID="movement-start-workout" onPress={() => changeTab('Strength')} style={[s.movementLauncher, { backgroundColor: colors.secondary, borderBottomColor: colors.border }]}>
        <Feather name="play-circle" size={19} color={colors.secondaryForeground} />
        <Text style={[s.smallStrong, { color: colors.secondaryForeground, flex: 1 }]}>Start a walk or strength session</Text>
        <Feather name="arrow-right" size={17} color={colors.secondaryForeground} />
      </Pressable>
      {movementScreen}
    </View>
     {(['Today', 'Nutrition', 'Strength', 'Insights', 'My plan'] as const).map((section) =>
      <KeyboardAwareScrollViewCompat key={section} style={{ flex: 1, display: tab === section ? 'flex' : 'none' }} bottomOffset={60} contentContainerStyle={[s.content, { paddingBottom: Platform.OS === 'web' ? 34 + 30 : insets.bottom + 30 }]} keyboardShouldPersistTaps="handled">
       {!fit.ready ? <View style={s.stack}>{[1,2,3].map(n => <View key={n} style={[s.skeleton, { backgroundColor: colors.muted }]} />)}</View> : loadBlocked ? <Panel colors={colors}><Text style={[s.sectionTitle, { color: colors.destructive }]}>Your journal couldn’t load.</Text><Muted colors={colors}>{fit.error}</Muted><Muted colors={colors}>Please reopen the app to try again.</Muted></Panel> :
       <View style={s.stack}>
         {!!fit.error && <Text accessibilityRole="alert" style={[s.feedback, { color: colors.destructive }]}>{fit.error}</Text>}
         {section === 'Today' ? todayScreen : section === 'Nutrition' ? nutritionScreen : section === 'Strength' ? strengthScreen : section === 'Insights' ? insightsScreen : planScreen}
       </View>}
     </KeyboardAwareScrollViewCompat>)}
    <Modal visible={mealOpen} animationType="slide" transparent onRequestClose={() => { if (!saving) setMealOpen(false); }}>
      <View style={[s.modalBackdrop, { backgroundColor: colors.foreground + '99' }]}>
         <KeyboardAwareScrollViewCompat bottomOffset={60} keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 18, paddingVertical: Platform.OS === 'web' ? 67 : insets.top + 15 }}>
          <View style={[s.modalCard, { backgroundColor: colors.card }]}>
            <View style={s.between}><Label colors={colors}>A MOMENT TO NOTICE</Label><Pressable disabled={saving} onPress={() => setMealOpen(false)} accessibilityLabel="Close meal form"><Feather name="x" size={22} color={colors.foreground} /></Pressable></View>
            <Text style={[s.title, { color: colors.foreground, fontSize: 28 }]}>Log a meal</Text><Muted colors={colors}>Useful is better than perfect. Add what you know.</Muted>
            <Text style={[s.fieldLabel, { color: colors.foreground }]}>Meal</Text><Select values={['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const} value={mealType} onChange={setMealType} colors={colors} />
            <Field label="What did you eat?" value={mealName} onChange={setMealName} colors={colors} placeholder="e.g. Oatmeal and fruit" testID="meal-name" />
            <View style={s.twoColumns}>{(['calories', 'protein', 'carbs', 'fat'] as const).map(k => <View key={k} style={s.half}><Field label={`${k[0].toUpperCase()+k.slice(1)} (${k === 'calories' ? 'kcal' : 'g'})`} value={mealValues[k]} onChange={v => setMealValues({ ...mealValues, [k]: v })} colors={colors} numeric testID={`meal-${k}`} /></View>)}</View>
            {!!mealError && <Text style={[s.feedback, { color: colors.destructive }]}>{mealError}</Text>}
             <Action colors={colors} onPress={() => void saveMeal()} disabled={saving} testID="save-meal">Add to today</Action>
          </View>
         </KeyboardAwareScrollViewCompat>
      </View>
    </Modal>
    <ProfileModal profile={movementSummary.paired ? { ...profile, stepTarget: movementSummary.goal } : profile}
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
  root: { flex: 1, minHeight: 400 },
  header: { paddingHorizontal: 17, paddingBottom: 11, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1 },
  brand: { flexDirection: 'row', gap: 9, alignItems: 'center' },
  brandMark: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  brandText: { fontFamily: 'DMSans_700Bold', fontSize: 20, letterSpacing: -1.2 },
  menuButton: { borderWidth: 1, width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  menu: { position: 'absolute', top: Platform.OS === 'web' ? 119 : 93, right: 16, zIndex: 10, borderWidth: 1, borderRadius: 12, padding: 8, width: 170, elevation: 5 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  navWrap: { borderBottomWidth: 1 },
  nav: { paddingHorizontal: 10, paddingVertical: 7, gap: 3 },
  navItem: { width: 76, height: 52, borderRadius: 9, alignItems: 'center', justifyContent: 'center', gap: 4 },
  navText: { fontFamily: 'DMSans_700Bold', fontSize: 9 },
  movementLauncher: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1 },
  content: { paddingHorizontal: 16, paddingTop: 25, maxWidth: 610, width: '100%', alignSelf: 'center' },
  stack: { gap: 15 },
  pageHeading: { gap: 6, marginBottom: 5 },
  label: { fontFamily: 'DMSans_700Bold', fontSize: 9, letterSpacing: 1.5, lineHeight: 14 },
  title: { fontFamily: 'DMSans_700Bold', fontSize: 38, lineHeight: 42, letterSpacing: -2.2 },
  serif: { fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontStyle: 'italic', fontSize: 47, lineHeight: 51, letterSpacing: -2 },
  muted: { fontFamily: 'DMSans_400Regular', fontSize: 12, lineHeight: 18 },
  micro: { fontSize: 10, lineHeight: 15 },
  hero: { minHeight: 226, borderRadius: 17, padding: 20, paddingTop: 51, overflow: 'hidden', justifyContent: 'flex-end', gap: 9 },
  heroOrbit: { position: 'absolute', top: -23, right: -12, width: 125, height: 125, borderRadius: 80, borderWidth: 1, alignItems: 'center', justifyContent: 'center', opacity: .65 },
  heroLabel: { fontFamily: 'DMSans_700Bold', fontSize: 9, letterSpacing: 1.5 },
  heroTitle: { fontFamily: 'DMSans_700Bold', fontSize: 27, lineHeight: 30, letterSpacing: -1.4, maxWidth: 280 },
  heroBody: { fontFamily: 'DMSans_400Regular', fontSize: 11, lineHeight: 17 },
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
  input: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 11, height: 44, fontFamily: 'DMSans_400Regular', fontSize: 13 },
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