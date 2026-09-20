import { formatTrackedSet, formatWeight, toStorageKg, type CompletedSet, type TrackingType, type Unit } from '@overload/domain';
import type { WorkoutSet } from '@overload/schema';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { SetValues } from '../../data/sessionRepo';
import { theme } from '../../ui/theme';
import { formatDurationInput, inputsFor, parseDuration, type SetField } from './setInputs';

type Props = {
  set: WorkoutSet;
  index: number;
  trackingType: TrackingType;
  previous: CompletedSet[];
  unit: Unit;
  onComplete: (values: SetValues) => void;
  onUncomplete: () => void;
};

/**
 * The matching set from last time, formatted for its tracking type via the
 * shared `formatTrackedSet` (also used by the workout history detail view,
 * so the two never drift): "80 kg × 8" for weight_reps, "12 reps" for reps,
 * "2:05" for duration, "5000 m · 30:00" for distance_duration, or an em dash
 * when there was no matching set at this index.
 */
export function formatPrevious(sets: CompletedSet[], index: number, unit: Unit): string {
  const match = sets[index];
  if (!match) return '—';
  return formatTrackedSet(match.trackingType, match, unit);
}

function toNumber(value: string): number | null {
  const parsed = Number.parseFloat(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

/** The weight text input holds a plain number in the display unit, never "kg"/"lb" suffixed. */
function weightInputValue(weightKg: number | null, unit: Unit): string {
  if (weightKg === null) return '';
  const displayKg = formatWeight(weightKg, unit);
  // formatWeight renders "123.4 kg"/"lb"; strip the unit suffix back off for the input.
  return displayKg.slice(0, displayKg.lastIndexOf(' '));
}

export function SetRow({ set, index, trackingType, previous, unit, onComplete, onUncomplete }: Props) {
  const inputs = inputsFor(trackingType);
  const completed = set.completedAt !== null;

  const [values, setValues] = useState<Record<SetField, string>>(() => ({
    weightKg: weightInputValue(set.weightKg, unit),
    reps: set.reps?.toString() ?? '',
    durationSeconds: formatDurationInput(set.durationSeconds),
    distanceM: set.distanceM?.toString() ?? '',
  }));

  // Only the fields this tracking type renders are sent. An omitted key leaves
  // the stored value alone, so a plank never writes a null over a weight and a
  // lift never writes a null over a duration. The weight field is entered in
  // the display unit and converted to kilograms here — the one place a typed
  // weight becomes storage.
  function collect(): SetValues {
    const patch: SetValues = {};
    for (const input of inputs) {
      if (input.field === 'durationSeconds') {
        patch.durationSeconds = parseDuration(values.durationSeconds);
      } else if (input.field === 'weightKg') {
        const entered = toNumber(values.weightKg);
        patch.weightKg = entered === null ? null : toStorageKg(entered, unit);
      } else {
        patch[input.field] = toNumber(values[input.field]);
      }
    }
    return patch;
  }

  return (
    <View style={[styles.row, completed && styles.rowCompleted]}>
      <Text style={styles.index}>{index + 1}</Text>
      <Text style={styles.previous}>{formatPrevious(previous, index, unit)}</Text>

      {inputs.map((input) => (
        <TextInput
          key={input.field}
          value={values[input.field]}
          onChangeText={(text) => setValues((v) => ({ ...v, [input.field]: text }))}
          editable={!completed}
          keyboardType={input.keyboard}
          placeholder={input.field === 'weightKg' ? unit : input.placeholder}
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.input, completed && styles.inputLocked]}
        />
      ))}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={completed ? 'Mark set incomplete' : 'Complete set'}
        accessibilityState={{ checked: completed }}
        // The box is 34x34, under the 44pt iOS and 48dp Android minimums, and
        // it is the control tapped most often in the app. hitSlop grows the
        // touch target to 48x48 without changing the layout.
        hitSlop={7}
        onPress={() => (completed ? onUncomplete() : onComplete(collect()))}
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
  inputLocked: { color: theme.colors.textMuted },
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
