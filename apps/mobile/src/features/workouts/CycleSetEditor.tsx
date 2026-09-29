import type { CycleSet } from '@overload/domain';
import { Lucide } from '@react-native-vector-icons/lucide';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomSheet } from '../../ui/BottomSheet';
import { Button } from '../../ui/Button';
import { RIR_COLORS } from '../../ui/rirColors';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';

type Props = {
  /** The sets to edit; null closes the sheet. */
  sets: CycleSet[] | null;
  title: string;
  /** "Cycle 3" or "Deload": which cycle "this cycle" is. */
  cycleLabel: string;
  onSave: (sets: CycleSet[], scope: 'cycle' | 'all') => void;
  onReset: () => void;
  onClose: () => void;
};

/**
 * One exercise's sets for a cycle, edited: each set's rep range and reps in
 * reserve, standard or to failure, sets added and removed. Saved to this
 * cycle alone, or to every cycle of the block; or reset to periodization's plan.
 */
export function CycleSetEditor({ sets, title, cycleLabel, onSave, onReset, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<CycleSet[]>([]);
  useEffect(() => {
    if (sets) setDraft(sets);
  }, [sets]);

  const change = (i: number, patch: Partial<CycleSet>) => setDraft((d) => d.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <BottomSheet visible={sets !== null} onClose={onClose} title={title} subtitle={`${cycleLabel} sets`}>
      <View style={[styles.body, { paddingBottom: insets.bottom + theme.spacing.lg }]}>
        <View style={styles.head}>
          <Text variant="caption" color="textMuted" style={styles.badgeCol}>Set</Text>
          <Text variant="caption" color="textMuted" style={styles.flex}>Reps</Text>
          <Text variant="caption" color="textMuted" style={styles.rirCol}>RIR</Text>
          <View style={styles.removeCol} />
        </View>
        {draft.map((set, i) => {
          const failure = set.setType === 'failure';
          return (
            <View key={i} style={styles.row}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={failure ? 'Set to failure, make standard' : 'Standard set, make to failure'}
                onPress={() => change(i, failure ? { setType: 'normal', repsMax: set.repsMin + 2, rir: 2 } : { setType: 'failure', repsMax: null, rir: 0 })}
                style={[styles.badge, failure && styles.badgeFailure]}
              >
                <Text variant="heading" color={failure ? 'onAccent' : 'text'}>{failure ? 'F' : i + 1}</Text>
              </Pressable>
              <View style={[styles.flex, styles.reps]}>
                <Stepper value={set.repsMin} min={1} max={set.repsMax ?? 50} onChange={(repsMin) => change(i, { repsMin })} label="Minimum reps" />
                {failure ? (
                  <Text color="textMuted">+</Text>
                ) : (
                  <>
                    <Text color="textMuted">–</Text>
                    <Stepper value={set.repsMax ?? set.repsMin} min={set.repsMin} max={50} onChange={(repsMax) => change(i, { repsMax })} label="Maximum reps" />
                  </>
                )}
              </View>
              <View style={styles.rirCol}>
                {failure ? (
                  <View style={[styles.rir, { backgroundColor: RIR_COLORS[0] }]}><Text variant="caption" color="onAccent">0</Text></View>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${set.rir} reps in reserve, change`}
                    onPress={() => change(i, { rir: (set.rir + 1) % 7 })}
                    style={[styles.rir, { backgroundColor: RIR_COLORS[Math.min(set.rir, 6)] }]}
                  >
                    <Text variant="caption" color="onAccent">{set.rir >= 6 ? '6+' : set.rir}</Text>
                  </Pressable>
                )}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove set ${i + 1}`}
                disabled={draft.length <= 1}
                hitSlop={8}
                onPress={() => setDraft((d) => d.filter((_, j) => j !== i))}
                style={[styles.removeCol, draft.length <= 1 && styles.dim]}
              >
                <Lucide name="x" size={18} color={theme.colors.textMuted} />
              </Pressable>
            </View>
          );
        })}
        <Pressable
          accessibilityRole="button"
          onPress={() => setDraft((d) => [...d, { ...(d.at(-1) ?? { repsMin: 8, repsMax: 10, rir: 2, setType: 'normal' }) }])}
          style={styles.add}
        >
          <Lucide name="plus" size={18} color={theme.colors.text} />
          <Text>Add set</Text>
        </Pressable>
        <Text variant="caption" color="textMuted">Tap a set's number to make it a set to failure; tap its RIR to change it.</Text>
        <Button title={`Save to ${cycleLabel.toLowerCase()}`} onPress={() => onSave(draft, 'cycle')} />
        <Button title="Save to all cycles" variant="secondary" onPress={() => onSave(draft, 'all')} />
        <Button title="Reset to the plan" variant="ghost" onPress={onReset} />
      </View>
    </BottomSheet>
  );
}

function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string }) {
  return (
    <View style={styles.stepper}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}, fewer`} disabled={value <= min} hitSlop={6} onPress={() => onChange(value - 1)}>
        <Lucide name="minus" size={16} color={value <= min ? theme.colors.border : theme.colors.text} />
      </Pressable>
      <Text variant="numeric" style={styles.stepValue}>{value}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}, more`} disabled={value >= max} hitSlop={6} onPress={() => onChange(value + 1)}>
        <Lucide name="plus" size={16} color={value >= max ? theme.colors.border : theme.colors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: theme.spacing.xl, gap: theme.spacing.md },
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  badgeCol: { width: 36, textAlign: 'center' },
  badge: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  badgeFailure: { backgroundColor: RIR_COLORS[0] },
  reps: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingHorizontal: theme.spacing.sm, paddingVertical: 6, borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceRaised },
  stepValue: { minWidth: 20, textAlign: 'center' },
  rirCol: { width: 40, alignItems: 'center' },
  rir: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  removeCol: { width: 22, alignItems: 'center' },
  dim: { opacity: 0.3 },
  add: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.sm },
});
