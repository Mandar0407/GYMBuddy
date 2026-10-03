import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { FitnessProfile } from '@/providers/FitnessProvider';

type ProfileForm = {
  name: string;
  goal: string;
  weight: string;
  height: string;
  calorieTarget: string;
  stepTarget: string;
  age: string;
  sex: FitnessProfile['sex'];
};

type Props = {
  profile: FitnessProfile;
  visible: boolean;
  onClose: () => void;
  onSave: (update: Partial<FitnessProfile>) => Promise<boolean>;
  stepTargetManagedInMovement?: boolean;
};

const cleanText = (value: string, maxLength: number) =>
  value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLength);

const numberValue = (value: string) =>
  value.trim() === '' ? Number.NaN : Number(value);

const validDecimal = (value: string, min: number, max: number) => {
  const number = numberValue(value);
  return Number.isFinite(number) && number >= min && number <= max;
};

const validInteger = (value: string, min: number, max: number) =>
  /^\d+$/.test(value.trim()) && Number(value) >= min && Number(value) <= max;

export default function ProfileModal({ profile, visible, onClose, onSave, stepTargetManagedInMovement = false }: Props) {
  const colors = useColors();
  const reduced=useReducedMotion();
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<ProfileForm>(() => ({
    name: profile.name,
    goal: profile.goal,
    weight: String(profile.weight),
    height: String(profile.height || 170),
    calorieTarget: String(profile.calorieTarget),
    stepTarget: String(profile.stepTarget),
    age: String(profile.age),
    sex: profile.sex,
  }));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setForm({
      name: profile.name,
      goal: profile.goal,
      weight: String(profile.weight),
      height: String(profile.height || 170),
      calorieTarget: String(profile.calorieTarget),
      stepTarget: String(profile.stepTarget),
      age: String(profile.age),
      sex: profile.sex,
    });
    setError('');
    setSaving(false);
  }, [
    visible,
    profile.name,
    profile.goal,
    profile.weight,
    profile.height,
    profile.calorieTarget,
    profile.stepTarget,
    profile.age,
    profile.sex,
  ]);

  const update = (key: Exclude<keyof ProfileForm, 'sex'>, value: string) => {
    setForm(current => ({ ...current, [key]: value }));
    setError('');
  };

  const submit = async () => {
    const name = cleanText(form.name, 80);
    const goal = cleanText(form.goal, 120);
    const weight = numberValue(form.weight);
    const height = numberValue(form.height);
    const calorieTarget = numberValue(form.calorieTarget);
    const stepTarget = numberValue(form.stepTarget);
    const age = numberValue(form.age);

    if (!name) {
      setError('Add your name so the ritual feels like yours.');
      return;
    }
    if (
      !validDecimal(form.weight, 20, 500) ||
      !validDecimal(form.height, 100, 230) ||
      !validInteger(form.calorieTarget, 1000, 10000) ||
      (!stepTargetManagedInMovement && !validInteger(form.stepTarget, 1000, 100000))
    ) {
      setError('Use 20–500 kg, 100–230 cm, 1,000–10,000 calories and 1,000–100,000 steps.');
      return;
    }

    if (!validInteger(form.age, 14, 90) || (form.sex !== 'male' && form.sex !== 'female')) {
      setError('Use a whole age from 14–90 and choose Male or Female.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const saved = await onSave({
        name,
        goal: goal || 'Build consistency',
        weight,
        height,
        age,
        sex: form.sex,
        calorieTarget,
        proteinTarget: profile.proteinTarget,
        carbsTarget: profile.carbsTarget,
        fatTarget: profile.fatTarget,
        ...(!stepTargetManagedInMovement ? { stepTarget } : {}),
      });
      if (saved) onClose();
      else setError('Your profile could not be saved on this device. Your entries are still here; try again.');
    } catch {
      setError('Your profile could not be saved on this device. Your entries are still here; try again.');
    } finally {
      setSaving(false);
    }
  };

  const field = (
    key: Exclude<keyof ProfileForm, 'sex'>,
    label: string,
    testID: string,
    options: { placeholder?: string; keyboardType?: 'default' | 'decimal-pad' | 'number-pad'; hint?: string } = {},
  ) => (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      <TextInput
        testID={testID}
        accessibilityLabel={label}
        accessibilityHint={options.hint}
        value={form[key]}
        onChangeText={value => update(key, value)}
        placeholder={options.placeholder}
        placeholderTextColor={colors.mutedForeground}
        keyboardType={options.keyboardType ?? 'default'}
        autoCapitalize={key === 'name' || key === 'goal' ? 'words' : 'none'}
        returnKeyType="next"
        style={[
          styles.input,
          {
            color: colors.foreground,
            backgroundColor: colors.background,
            borderColor: colors.border,
          },
        ]}
      />
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduced?'none':'fade'}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.backdrop,
          {
            paddingTop: Math.max(insets.top, 12),
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        <KeyboardAwareScrollViewCompat
          style={[
            styles.sheet,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
          contentContainerStyle={styles.content}
          bottomOffset={72}
          keyboardShouldPersistTaps="handled"
          accessibilityViewIsModal
        >
          <View style={styles.header}>
            <View style={styles.heading}>
              <View style={[styles.eyebrowMark, { backgroundColor: colors.accent }]} />
              <Text style={[styles.eyebrow, { color: colors.secondaryForeground }]}>YOUR DAILY RHYTHM</Text>
              <Text
                accessibilityRole="header"
                accessibilityLabel="Your profile"
                style={[styles.title, { color: colors.foreground }]}
              >
                Your profile
              </Text>
              <Text style={[styles.description, { color: colors.mutedForeground }]}>
                Make the targets fit your actual life.
              </Text>
            </View>
            <Pressable
              testID="button-close-profile"
              accessibilityRole="button"
              accessibilityLabel="Close profile settings"
              onPress={onClose}
              hitSlop={12}
              style={({ pressed }) => [styles.closeButton, { opacity: pressed ? 0.65 : 1 }]}
            >
              <Feather name="x" size={21} color={colors.secondaryForeground} />
            </Pressable>
          </View>

          <View style={styles.form}>
            {field('name', 'Name', 'input-profile-name', { placeholder: 'Your name' })}
            {field('goal', 'Main focus', 'input-profile-goal', { placeholder: 'e.g. Feel stronger' })}
            <View style={styles.row}>
              <View style={styles.half}>
                {field('weight', 'Body weight · kg', 'input-profile-weight', {
                  placeholder: '68',
                  keyboardType: 'decimal-pad',
                })}
              </View>
              <View style={styles.half}>
                {field('height', 'Height · cm', 'input-profile-height', {
                  placeholder: '170',
                  keyboardType: 'decimal-pad',
                })}
              </View>
            </View>
            <View style={styles.row}>
              <View style={styles.half}>
                {field('age', 'Age · years', 'input-profile-age', {
                  placeholder: '26',
                  keyboardType: 'number-pad',
                })}
              </View>
              <View style={styles.half}>
                <View style={styles.field}>
                  <Text style={[styles.label, { color: colors.foreground }]}>Gender</Text>
                  <View accessibilityRole="radiogroup" style={styles.segment}>
                    {(['male', 'female'] as const).map(option => {
                      const selected = form.sex === option;
                      return (
                        <Pressable
                          key={option}
                          testID={`button-profile-sex-${option}`}
                          accessibilityRole="radio"
                          accessibilityState={{ selected }}
                          accessibilityLabel={option === 'male' ? 'Male' : 'Female'}
                          onPress={() => { setForm(c => ({ ...c, sex: option })); setError(''); }}
                          style={[
                            styles.segmentItem,
                            {
                              backgroundColor: selected ? colors.secondaryForeground : colors.background,
                              borderColor: selected ? colors.secondaryForeground : colors.border,
                            },
                          ]}
                        >
                          <Text style={[styles.segmentText, { color: selected ? colors.card : colors.foreground }]}>
                            {option === 'male' ? 'Male' : 'Female'}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </View>
            </View>
            <View style={styles.row}>
              <View style={styles.half}>
                {field('calorieTarget', 'Calorie target · kcal', 'input-profile-calories', {
                  placeholder: '2200',
                  keyboardType: 'number-pad',
                })}
              </View>
              <View style={styles.half}>
                {stepTargetManagedInMovement ? <View>
                  <Text style={[styles.label, { color: colors.foreground }]}>Daily step target</Text>
                  <Text style={{ color: colors.mutedForeground, marginTop: 10 }}>{profile.stepTarget.toLocaleString()} steps · edit in Movement settings while paired</Text>
                </View> : field('stepTarget', 'Daily step target', 'input-profile-steps', {
                  placeholder: '10000',
                  keyboardType: 'number-pad',
                })}
              </View>
            </View>
          </View>

          {!!error && (
            <Text
              testID="profile-error"
              accessibilityRole="alert"
              style={[styles.error, { color: colors.destructive }]}
            >
              {error}
            </Text>
          )}

          <View style={styles.actions}>
            <Pressable
              testID="button-cancel-profile"
              accessibilityRole="button"
              disabled={saving}
              onPress={onClose}
              style={({ pressed }) => [
                styles.cancelButton,
                { borderColor: colors.border, opacity: pressed || saving ? 0.6 : 1 },
              ]}
            >
              <Text style={[styles.cancelText, { color: colors.secondaryForeground }]}>Cancel</Text>
            </Pressable>
            <Pressable
              testID="button-save-profile"
              accessibilityRole="button"
              accessibilityLabel="Save profile"
              disabled={saving}
              onPress={() => void submit()}
              style={({ pressed }) => [
                styles.saveButton,
                { backgroundColor: colors.secondaryForeground, opacity: pressed || saving ? 0.75 : 1 },
              ]}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.card} />
              ) : (
                <Feather name="check" size={17} color={colors.card} />
              )}
              <Text style={[styles.saveText, { color: colors.card }]}>
                {saving ? 'Saving…' : 'Save profile'}
              </Text>
            </Pressable>
          </View>
        </KeyboardAwareScrollViewCompat>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: 'rgba(27, 35, 29, 0.54)',
  },
  sheet: {
    flexGrow: 0,
    flexShrink: 1,
    width: '100%',
    maxHeight: '100%',
    borderWidth: 1,
    borderRadius: 26,
    overflow: 'hidden',
  },
  content: {
    flexGrow: 0,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 22,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  heading: {
    flex: 1,
    paddingRight: 12,
  },
  eyebrowMark: {
    width: 30,
    height: 4,
    borderRadius: 4,
    marginBottom: 12,
  },
  eyebrow: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 10,
    letterSpacing: 1.4,
    marginBottom: 6,
  },
  title: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 27,
    lineHeight: 33,
  },
  description: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  form: {
    flexShrink: 0,
    gap: 15,
  },
  row: {
    flexDirection: 'row',
    flexShrink: 0,
    gap: 12,
  },
  half: {
    flex: 1,
    minWidth: 0,
  },
  field: {
    flexShrink: 0,
    gap: 7,
  },
  label: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 12,
    lineHeight: 16,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 13,
    paddingVertical: 10,
    fontFamily: 'DMSans_400Regular',
    fontSize: 15,
  },
  segment: { flexDirection: 'row', gap: 6 },
  segmentItem: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: { fontFamily: 'DMSans_700Bold', fontSize: 13 },
  error: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 14,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
  },
  cancelButton: {
    minHeight: 50,
    paddingHorizontal: 17,
    borderWidth: 1,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
  },
  saveButton: {
    minHeight: 50,
    flex: 1,
    borderRadius: 15,
    paddingHorizontal: 16,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
  },
});