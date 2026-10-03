import Feather from '@expo/vector-icons/Feather';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

type Props = {
  todayMl: number;
  goalMl: number;
  onAdd: (amount: number) => Promise<boolean>;
  onRemove: (amount: number) => Promise<boolean>;
  onSetGoal: (goalMl: number) => Promise<boolean>;
};
type Palette = ReturnType<typeof useColors>;

const QUICK_AMOUNTS = [250, 500, 750];
const SEGMENTS = 8;

function Entry({ label, value, onChange, colors, placeholder, testID }: {
  label: string; value: string; onChange: (value: string) => void; colors: Palette; placeholder: string; testID: string;
}) {
  return <View style={styles.entry}>
    <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{label}</Text>
    <TextInput
      testID={testID}
      value={value}
      onChangeText={onChange}
      keyboardType="number-pad"
      placeholder={placeholder}
      placeholderTextColor={colors.mutedForeground}
      style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
    />
  </View>;
}

export default function WaterIntakeCard({ todayMl, goalMl, onAdd, onRemove, onSetGoal }: Props) {
  const colors = useColors();
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState(String(goalMl));
  const [customDraft, setCustomDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setGoalDraft(String(goalMl)); }, [goalMl]);

  const run = async (action: () => Promise<boolean>, onSuccess?: () => void) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (await action()) onSuccess?.();
      else setError('Water intake could not be saved. Please try again.');
    } catch {
      setError('Water intake could not be saved. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const setGoal = () => {
    if (!/^\d+$/.test(goalDraft.trim()) || Number(goalDraft) < 250 || Number(goalDraft) > 10000) {
      setError('Enter a whole number from 250 to 10,000 ml.');
      return;
    }
    void run(() => onSetGoal(Number(goalDraft)), () => setEditingGoal(false));
  };

  const addCustom = () => {
    if (!/^\d+$/.test(customDraft.trim()) || Number(customDraft) < 1 || Number(customDraft) > 10000) {
      setError('Enter a whole number from 1 to 10,000 ml.');
      return;
    }
    void run(() => onAdd(Number(customDraft)), () => setCustomDraft(''));
  };

  const percent = goalMl > 0 ? Math.round(todayMl / goalMl * 100) : 0;
  const filled = goalMl > 0 ? Math.min(SEGMENTS, Math.ceil(todayMl / goalMl * SEGMENTS)) : 0;

  return <View testID="card-water-intake" style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
    <View style={styles.header}>
      <View style={[styles.dropIcon, { backgroundColor: colors.secondary }]}>
        <Feather name="droplet" size={17} color={colors.secondaryForeground} />
      </View>
      <View style={styles.headingCopy}>
        <Text style={[styles.title, { color: colors.foreground }]}>Water intake</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Build the habit, one glass at a time.</Text>
      </View>
      <Pressable
        testID="button-edit-water-goal"
        accessibilityRole="button"
        accessibilityLabel={editingGoal ? 'Close water goal editor' : 'Edit daily water goal'}
        accessibilityState={{ expanded: editingGoal }}
        onPress={() => { setGoalDraft(String(goalMl)); setError(''); setEditingGoal((open) => !open); }}
        hitSlop={8}
        style={styles.iconButton}
      ><Feather name="sliders" size={17} color={colors.mutedForeground} /></Pressable>
    </View>

    {editingGoal && <View style={[styles.goalForm, { backgroundColor: colors.background }]}>
      <Entry label="Daily goal (ml)" value={goalDraft} onChange={(value) => { setGoalDraft(value); setError(''); }}
        colors={colors} placeholder="2500" testID="input-water-goal" />
      <Pressable testID="button-save-water-goal" onPress={setGoal} disabled={busy}
        style={[styles.actionButton, { backgroundColor: colors.primary, opacity: busy ? 0.5 : 1 }]}>
        <Text style={[styles.actionText, { color: colors.primaryForeground }]}>{busy ? 'Saving…' : 'Save goal'}</Text>
      </Pressable>
    </View>}

    <View style={styles.progressCopy}>
      <Text testID="text-water-intake" style={[styles.total, { color: colors.foreground }]}>
        {todayMl.toLocaleString()} <Text style={[styles.unit, { color: colors.mutedForeground }]}>ml</Text>
      </Text>
      <Text testID="text-water-goal" style={[styles.goalCopy, { color: colors.mutedForeground }]}>
        {percent}% of {goalMl.toLocaleString()} ml goal
      </Text>
    </View>
    <View accessibilityRole="progressbar" accessibilityLabel="Water intake" accessibilityValue={{
      min: 0, max: goalMl, now: Math.min(todayMl, goalMl), text: `${todayMl.toLocaleString()} of ${goalMl.toLocaleString()} milliliters`,
    }} style={styles.segments}>
      {Array.from({ length: SEGMENTS }, (_, index) => <View key={index}
        style={[styles.segment, { backgroundColor: index < filled ? colors.secondaryForeground : colors.muted }]} />)}
    </View>

    <View style={styles.quickRow} accessibilityLabel="Quick add water">
      {QUICK_AMOUNTS.map((amount) => <Pressable key={amount} testID={amount === 250 ? 'button-add-water' : `button-add-water-${amount}`}
        onPress={() => void run(() => onAdd(amount))} disabled={busy}
        style={[styles.quickButton, { backgroundColor: colors.secondary, opacity: busy ? 0.5 : 1 }]}>
        <Feather name="plus" size={13} color={colors.secondaryForeground} />
        <Text style={[styles.quickText, { color: colors.secondaryForeground }]}>{amount} ml</Text>
      </Pressable>)}
    </View>

    <View style={styles.customForm}>
      <Entry label="Custom amount (ml)" value={customDraft} onChange={(value) => { setCustomDraft(value); setError(''); }}
        colors={colors} placeholder="Enter ml" testID="input-water-custom" />
      <Pressable testID="button-add-water-custom" onPress={addCustom} disabled={busy}
        style={[styles.actionButton, { backgroundColor: colors.primary, opacity: busy ? 0.5 : 1 }]}>
        <Text style={[styles.actionText, { color: colors.primaryForeground }]}>{busy ? 'Saving…' : 'Log water'}</Text>
      </Pressable>
    </View>
    <Pressable testID="button-remove-water" accessibilityLabel="Remove 250 milliliters of water"
      onPress={() => void run(() => onRemove(250))} disabled={busy || todayMl <= 0}
      style={styles.undo}>
      <Feather name="rotate-ccw" size={13} color={colors.mutedForeground} />
      <Text style={[styles.undoText, { color: colors.mutedForeground }]}>Undo 250 ml</Text>
    </Pressable>
    {!!error && <Text testID="status-water-error" accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 13 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dropIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  headingCopy: { flex: 1, minWidth: 0 },
  title: { fontFamily: 'DMSans_700Bold', fontSize: 16, lineHeight: 21 },
  subtitle: { fontFamily: 'DMSans_400Regular', fontSize: 10, lineHeight: 15, marginTop: 1 },
  iconButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  goalForm: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderRadius: 12, padding: 10 },
  entry: { flex: 1, minWidth: 0, gap: 5 },
  fieldLabel: { fontFamily: 'DMSans_700Bold', fontSize: 10, lineHeight: 14 },
  input: { minHeight: 40, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, fontFamily: 'DMSans_400Regular', fontSize: 13 },
  actionButton: { minHeight: 40, borderRadius: 9, paddingHorizontal: 11, justifyContent: 'center', alignItems: 'center' },
  actionText: { fontFamily: 'DMSans_700Bold', fontSize: 11 },
  progressCopy: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 },
  total: { fontFamily: 'DMSans_700Bold', fontSize: 27, lineHeight: 32, letterSpacing: -0.8 },
  unit: { fontFamily: 'DMSans_400Regular', fontSize: 12, letterSpacing: 0 },
  goalCopy: { flexShrink: 1, textAlign: 'right', fontFamily: 'DMSans_400Regular', fontSize: 10 },
  segments: { flexDirection: 'row', gap: 5, height: 7 },
  segment: { flex: 1, borderRadius: 5 },
  quickRow: { flexDirection: 'row', gap: 7 },
  quickButton: { flex: 1, minHeight: 39, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 10, paddingHorizontal: 4 },
  quickText: { fontFamily: 'DMSans_700Bold', fontSize: 10 },
  customForm: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  undo: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 30 },
  undoText: { fontFamily: 'DMSans_700Bold', fontSize: 10 },
  error: { fontFamily: 'DMSans_400Regular', fontSize: 11, lineHeight: 16 },
});