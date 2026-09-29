import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

export default function PRCelebration({
  visible, exercise, kind, value, onClose,
}: {
  visible: boolean;
  exercise: string;
  kind: string;
  value: number;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const normalizedKind = kind.trim().toLowerCase().replace(/[\s_-]+/g, '');
  const isOneRm = normalizedKind.includes('1rm') || normalizedKind.includes('onerm') || normalizedKind.includes('onerepmax');
  const recordLabel = isOneRm ? 'Estimated 1RM' : normalizedKind.includes('weight') || normalizedKind.includes('load')
    ? 'Heaviest load'
    : kind.trim() || 'Personal record';
  const displayValue = Number.isFinite(value)
    ? value.toLocaleString('en-US', { maximumFractionDigits: 1 })
    : '—';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={[styles.backdrop, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        <View
          accessibilityRole="summary"
          style={[styles.dialog, { backgroundColor: colors.card, borderColor: colors.border }]}
          testID="dialog-new-pr"
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close personal record celebration"
            testID="button-close-pr"
            hitSlop={10}
            onPress={onClose}
            style={styles.closeButton}
          >
            <Feather name="x" size={18} color={colors.mutedForeground} />
          </Pressable>

          <View style={[styles.emblem, { backgroundColor: colors.accent }]}>
            <Feather name="award" size={27} color={colors.accentForeground} />
          </View>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>STRENGTH MILESTONE</Text>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>New Personal Record!</Text>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>
            {exercise} — you moved your previous best forward.
          </Text>

          <View style={[styles.recordCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.recordLabel, { color: colors.mutedForeground }]}>{recordLabel}</Text>
            <Text testID={isOneRm ? 'text-pr-one-rm' : 'text-pr-weight'} style={[styles.recordValue, { color: colors.foreground }]}>
              {displayValue}<Text style={[styles.unit, { color: colors.mutedForeground }]}> kg</Text>
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            testID="button-close-pr-celebration"
            onPress={onClose}
            style={({ pressed }) => [styles.action, { backgroundColor: colors.primary, opacity: pressed ? 0.75 : 1 }]}
          >
            <Feather name="arrow-right" size={16} color={colors.primaryForeground} />
            <Text style={[styles.actionText, { color: colors.primaryForeground }]}>Keep going</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, backgroundColor: 'rgba(39, 35, 31, 0.48)' },
  dialog: { width: '100%', maxWidth: 420, borderWidth: 1, borderRadius: 24, padding: 22, alignItems: 'center' },
  closeButton: { alignSelf: 'flex-end', width: 30, height: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  emblem: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  eyebrow: { fontFamily: 'DMSans_700Bold', fontSize: 9, letterSpacing: 1.35, marginTop: 17 },
  title: { fontFamily: 'DMSans_700Bold', fontSize: 24, lineHeight: 30, letterSpacing: -0.8, textAlign: 'center', marginTop: 6 },
  description: { fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 7 },
  recordCard: { width: '100%', borderWidth: 1, borderRadius: 15, paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center', marginTop: 20 },
  recordLabel: { fontFamily: 'DMSans_700Bold', fontSize: 10, letterSpacing: 0.7 },
  recordValue: { fontFamily: 'DMSans_700Bold', fontSize: 30, lineHeight: 38, letterSpacing: -0.8, marginTop: 2, fontVariant: ['tabular-nums'] },
  unit: { fontFamily: 'DMSans_400Regular', fontSize: 15, letterSpacing: 0 },
  action: { minHeight: 47, width: '100%', borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16 },
  actionText: { fontFamily: 'DMSans_700Bold', fontSize: 13 },
});