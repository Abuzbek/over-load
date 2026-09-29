import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listExercises, smartSubstitutes } from '../../data/exerciseRepo';
import { getActiveGym } from '../../data/gymRepo';
import { db } from '../../db/client';
import { BottomSheet } from '../../ui/BottomSheet';
import { Button } from '../../ui/Button';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';
import { ExerciseRow } from '../library/ExerciseList';

type Props = {
  /** The exercise being swapped out; null closes the sheet. */
  exerciseId: string | null;
  /** Some of its sets are done: swapping would relabel them. */
  logged: boolean;
  onClose: () => void;
  onSwap: (exerciseId: string) => void;
  /** The whole library, to pick any replacement. */
  onFindOther: () => void;
  onInfo: (exerciseId: string) => void;
};

/**
 * Swap: the exercise, a few that train exactly the same main muscles with the
 * active gym's equipment, and the way into the full library.
 */
export function SwapSheet({ exerciseId, logged, onClose, onSwap, onFindOther, onInfo }: Props) {
  const insets = useSafeAreaInsets();
  const current = useMemo(() => (exerciseId ? listExercises(db, { ids: [exerciseId] })[0] : undefined), [exerciseId]);
  const substitutes = useMemo(() => (exerciseId ? smartSubstitutes(db, exerciseId, getActiveGym(db)?.id ?? null) : []), [exerciseId]);

  return (
    <BottomSheet visible={exerciseId !== null} onClose={onClose} title="Swap">
      <View style={{ paddingBottom: insets.bottom + theme.spacing.lg }}>
        {current ? <ExerciseRow item={current} onPress={() => onInfo(current.id)} /> : null}
        {logged ? (
          <Text color="textMuted" style={styles.note}>
            Sets of this exercise are already logged. Add the other exercise instead, or undo those sets to swap.
          </Text>
        ) : (
          <>
            <Text variant="title" style={styles.heading}>Smart Substitutions</Text>
            {substitutes.length === 0 ? (
              <Text color="textMuted" style={styles.note}>Nothing in this gym trains exactly the same muscles.</Text>
            ) : (
              substitutes.map((e) => <ExerciseRow key={e.id} item={e} onPress={() => onInfo(e.id)} onSwap={() => onSwap(e.id)} />)
            )}
            <View style={styles.find}>
              <Button title="Find Other Replacements" variant="secondary" onPress={onFindOther} />
            </View>
          </>
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  heading: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.xl, paddingBottom: theme.spacing.sm },
  note: { paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.lg },
  find: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg },
});
