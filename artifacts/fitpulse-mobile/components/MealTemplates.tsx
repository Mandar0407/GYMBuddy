import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';
type Template = {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  meal: MealType;
};
type MealInput = Omit<Template, 'id'>;
type Props = { onLog: (input: MealInput) => Promise<boolean> };
type Palette = ReturnType<typeof useColors>;

const STORAGE_KEY = '@fitpulse/mobile/meal-templates/v1';
const TYPES: MealType[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

function cleanName(value: string) {
  return value.trim().replace(/\s+/g, ' ').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 60);
}

function validTemplate(value: unknown): value is Template {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<Template>;
  return typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 100 &&
    typeof item.name === 'string' && cleanName(item.name).length > 0 &&
    typeof item.calories === 'number' && Number.isFinite(item.calories) && item.calories > 0 && item.calories <= 10000 &&
    (['protein', 'carbs', 'fat'] as const).every((key) =>
      typeof item[key] === 'number' && Number.isFinite(item[key]) && item[key]! >= 0 && item[key]! <= 1000) &&
    TYPES.includes(item.meal as MealType);
}

const isWholeOrDecimal = (value: string, min: number, max: number) =>
  value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max;

function Field({ label, value, onChange, colors, placeholder, testID }: {
  label: string; value: string; onChange: (value: string) => void; colors: Palette; placeholder: string; testID: string;
}) {
  return <View style={styles.field}>
    <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{label}</Text>
    <TextInput
      testID={testID}
      value={value}
      onChangeText={onChange}
      keyboardType="decimal-pad"
      placeholder={placeholder}
      placeholderTextColor={colors.mutedForeground}
      style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
    />
  </View>;
}

export default function MealTemplates({ onLog }: Props) {
  const colors = useColors();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadReady, setLoadReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [mealType, setMealType] = useState<MealType>('Breakfast');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (!mounted) return;
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (!Array.isArray(parsed) || !parsed.every(validTemplate)) {
          throw new Error('Saved meal templates are invalid. They were left untouched.');
        }
        setTemplates(parsed.map((item: Template) => ({ ...item, name: cleanName(item.name) })));
      }
      setLoadReady(true);
    }).catch((loadError: unknown) => {
      if (!mounted) return;
      setError(`Meal templates could not be loaded. Existing saved meals are protected. ${loadError instanceof Error ? loadError.message : String(loadError)}`);
    });
    return () => { mounted = false; };
  }, []);

  const persist = async (next: Template[]) => {
    if (!loadReady || busy) return false;
    setBusy(true);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setTemplates(next);
      setError('');
      return true;
    } catch (writeError) {
      setError(`Meal templates could not be saved. Your saved meals are unchanged. ${writeError instanceof Error ? writeError.message : String(writeError)}`);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const safeName = cleanName(name);
    if (!safeName || !isWholeOrDecimal(calories, 0.01, 10000) ||
      ![protein, carbs, fat].every((value) => isWholeOrDecimal(value, 0, 1000))) {
      setError('Add a name (up to 60 characters), 1–10,000 kcal, and macros between 0–1,000 g.');
      return;
    }
    const item: Template = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      name: safeName,
      calories: Number(calories),
      protein: Number(protein),
      carbs: Number(carbs),
      fat: Number(fat),
      meal: mealType,
    };
    if (await persist([...templates, item])) {
      setName('');
      setCalories('');
      setProtein('');
      setCarbs('');
      setFat('');
      setMealType('Breakfast');
      setShowForm(false);
    }
  };

  const remove = (item: Template) => {
    Alert.alert('Delete saved meal?', `${item.name} will be removed from templates. Your meal log will not change.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => { void persist(templates.filter((template) => template.id !== item.id)); },
      },
    ]);
  };

  const log = async (item: Template) => {
    setBusy(true);
    setError('');
    try {
      const success = await onLog({
        name: item.name,
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
        meal: item.meal,
      });
      if (!success) setError('This meal could not be logged. Please try again.');
    } catch {
      setError('This meal could not be logged. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return <View testID="section-meal-templates" style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
    <View style={styles.header}>
      <View style={styles.headingCopy}>
        <Text style={[styles.title, { color: colors.foreground }]}>Saved meals &amp; smoothies</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Keep your regulars ready to log.</Text>
      </View>
      <Pressable
        testID="button-create-meal-template"
        onPress={() => { setShowForm((open) => !open); setError(''); }}
        disabled={!loadReady || busy}
        style={[styles.button, { backgroundColor: colors.primary, opacity: !loadReady || busy ? 0.5 : 1 }]}
      >
        <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>{showForm ? 'Cancel' : 'Save meal'}</Text>
      </Pressable>
    </View>

    {templates.map((item) => <View key={item.id} testID={`card-meal-template-${item.id}`} style={[styles.template, { borderTopColor: colors.border }]}>
      <View style={styles.templateCopy}>
        <Text style={[styles.templateName, { color: colors.foreground }]} numberOfLines={2}>{item.name}</Text>
        <Text style={[styles.detail, { color: colors.mutedForeground }]}>{item.meal} · {item.calories.toLocaleString()} kcal</Text>
        <Text style={[styles.detail, { color: colors.mutedForeground }]}>P {item.protein}g · C {item.carbs}g · F {item.fat}g</Text>
      </View>
      <View style={styles.templateActions}>
        <Pressable
          testID={`button-log-template-${item.id}`}
          accessibilityLabel={`Log ${item.name}`}
          onPress={() => void log(item)}
          disabled={!loadReady || busy}
          style={[styles.button, { backgroundColor: colors.secondary, opacity: busy ? 0.5 : 1 }]}
        >
          <Feather name="plus" size={14} color={colors.secondaryForeground} />
          <Text style={[styles.buttonText, { color: colors.secondaryForeground }]}>Log</Text>
        </Pressable>
        <Pressable
          testID={`button-delete-template-${item.id}`}
          accessibilityLabel={`Delete template ${item.name}`}
          onPress={() => remove(item)}
          disabled={!loadReady || busy}
          hitSlop={8}
          style={styles.iconButton}
        ><Feather name="trash-2" size={17} color={colors.destructive} /></Pressable>
      </View>
    </View>)}

    {!templates.length && !showForm && <Text style={[styles.empty, { color: colors.mutedForeground }]}>
      {loadReady ? 'Save a favorite once, then log it with one tap.' : 'Loading saved meals…'}
    </Text>}

    {showForm && <View style={[styles.form, { borderTopColor: colors.border }]}>
      <Field label="Meal or smoothie name" value={name} onChange={setName} colors={colors} placeholder="e.g. Morning smoothie" testID="input-template-name" />
      <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Meal type</Text>
      <View style={styles.types}>
        {TYPES.map((option) => <Pressable key={option} onPress={() => setMealType(option)}
          style={[styles.typeChip, { backgroundColor: mealType === option ? colors.accent : colors.background, borderColor: mealType === option ? colors.accent : colors.border }]}>
          <Text style={[styles.typeText, { color: colors.foreground }]}>{option}</Text>
        </Pressable>)}
      </View>
      <View style={styles.macroGrid}>
        <Field label="Calories (kcal)" value={calories} onChange={setCalories} colors={colors} placeholder="350" testID="input-template-calories" />
        <Field label="Protein (g)" value={protein} onChange={setProtein} colors={colors} placeholder="25" testID="input-template-protein" />
        <Field label="Carbs (g)" value={carbs} onChange={setCarbs} colors={colors} placeholder="40" testID="input-template-carbs" />
        <Field label="Fat (g)" value={fat} onChange={setFat} colors={colors} placeholder="10" testID="input-template-fat" />
      </View>
      <Pressable testID="button-save-meal-template" onPress={() => void save()} disabled={!loadReady || busy}
        style={[styles.button, styles.saveButton, { backgroundColor: colors.primary, opacity: !loadReady || busy ? 0.5 : 1 }]}>
        <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>{busy ? 'Saving…' : 'Save template'}</Text>
      </Pressable>
    </View>}
    {!!error && <Text testID="status-meal-template-error" accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  headingCopy: { flex: 1, minWidth: 0 },
  title: { fontFamily: 'DMSans_700Bold', fontSize: 17, lineHeight: 22 },
  subtitle: { fontFamily: 'DMSans_400Regular', fontSize: 12, lineHeight: 18, marginTop: 2 },
  button: { minHeight: 38, borderRadius: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  buttonText: { fontFamily: 'DMSans_700Bold', fontSize: 12 },
  template: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  templateCopy: { flex: 1, minWidth: 0 },
  templateName: { fontFamily: 'DMSans_700Bold', fontSize: 13, lineHeight: 18 },
  detail: { fontFamily: 'DMSans_400Regular', fontSize: 10, lineHeight: 15 },
  templateActions: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  iconButton: { width: 32, height: 38, justifyContent: 'center', alignItems: 'center' },
  empty: { fontFamily: 'DMSans_400Regular', fontSize: 12, lineHeight: 18 },
  form: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 9 },
  field: { flex: 1, minWidth: 0, gap: 5 },
  fieldLabel: { fontFamily: 'DMSans_700Bold', fontSize: 10, lineHeight: 14 },
  input: { minHeight: 42, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, fontFamily: 'DMSans_400Regular', fontSize: 13 },
  types: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  typeChip: { borderWidth: 1, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 9 },
  typeText: { fontFamily: 'DMSans_700Bold', fontSize: 10 },
  macroGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  saveButton: { alignSelf: 'flex-start', marginTop: 2 },
  error: { fontFamily: 'DMSans_400Regular', fontSize: 11, lineHeight: 16 },
});