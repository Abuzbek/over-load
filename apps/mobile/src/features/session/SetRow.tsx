import type { CompletedSet } from '@workouts/domain';
import type { WorkoutSet } from '@workouts/schema';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { theme } from '../../ui/theme';

type Props = {
  set: WorkoutSet;
  index: number;
  previous: CompletedSet[];
  onComplete: (values: { weightKg: number | null; reps: number | null }) => void;
  onUncomplete: () => void;
};

/** "80 kg × 8" for the matching set last time, or an em dash when there was none. */
export function formatPrevious(sets: CompletedSet[], index: number): string {
  const match = sets[index];
  if (!match) return '—';
  if (match.weightKg === null) return `${match.reps ?? '—'} reps`;
  return `${match.weightKg} kg × ${match.reps ?? '—'}`;
}

function toNumber(value: string): number | null {
  const parsed = Number.parseFloat(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

export function SetRow({ set, index, previous, onComplete, onUncomplete }: Props) {
  const [weight, setWeight] = useState(set.weightKg?.toString() ?? '');
  const [reps, setReps] = useState(set.reps?.toString() ?? '');
  const completed = set.completedAt !== null;

  return (
    <View style={[styles.row, completed && styles.rowCompleted]}>
      <Text style={styles.index}>{index + 1}</Text>
      <Text style={styles.previous}>{formatPrevious(previous, index)}</Text>

      <TextInput
        value={weight}
        onChangeText={setWeight}
        keyboardType="decimal-pad"
        placeholder="kg"
        placeholderTextColor={theme.colors.textMuted}
        style={styles.input}
      />
      <TextInput
        value={reps}
        onChangeText={setReps}
        keyboardType="number-pad"
        placeholder="reps"
        placeholderTextColor={theme.colors.textMuted}
        style={styles.input}
      />

      <Pressable
        accessibilityLabel={completed ? 'Mark set incomplete' : 'Complete set'}
        onPress={() =>
          completed
            ? onUncomplete()
            : onComplete({ weightKg: toNumber(weight), reps: toNumber(reps) })
        }
        style={[styles.check, completed && styles.checkOn]}
      >
        <Text style={styles.checkMark}>{completed ? '✓' : ''}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.sm },
  rowCompleted: { opacity: 0.6 },
  index: { ...theme.text.body, color: theme.colors.textMuted, width: 20 },
  previous: { ...theme.text.caption, color: theme.colors.textMuted, width: 86 },
  input: {
    flex: 1,
    ...theme.text.body,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    textAlign: 'center',
  },
  check: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: theme.colors.success, borderColor: theme.colors.success },
  checkMark: { color: '#0B0B0F', fontWeight: '700' },
});
