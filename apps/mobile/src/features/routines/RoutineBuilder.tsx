import { toStorageKg, type Unit } from '@overload/domain';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { RoutineDetailExercise } from '../../data/routineRepo';
import { addRoutineSet, getRoutineDetail, reorderRoutineExercises } from '../../data/routineRepo';
import { getWeightUnit } from '../../data/settingsRepo';
import { discardWorkout, getActiveWorkoutId, startWorkoutFromRoutine } from '../../data/sessionRepo';
import { db } from '../../db/client';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { NumericField } from '../../ui/NumericField';
import { Screen } from '../../ui/Screen';
import { Sheet } from '../../ui/Sheet';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';
import { parseDecimalInput, parseIntegerInput } from '../session/setInputs';
import {
  formatRoutineTarget,
  targetInputsFor,
  type RoutineTargetField,
} from './routineTargets';

type Props = { routineId: string };

type ExerciseCardProps = {
  entry: RoutineDetailExercise;
  unit: Unit;
  onSetAdded: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
};

const EMPTY_DRAFT: Record<RoutineTargetField, string> = { weightKg: '', reps: '' };

function ExerciseCard({ entry, unit, onSetAdded, onMoveUp, onMoveDown }: ExerciseCardProps) {
  const trackingType = entry.exercise.trackingType;
  // A duration/distance_duration exercise gets [] here — routine_sets has no
  // column for a target duration or distance, so rendering a box for it would
  // silently discard whatever the user typed. Keep this empty rather than
  // inventing a weight/reps pair for every tracking type.
  const inputs = targetInputsFor(trackingType, unit);
  const [draft, setDraft] = useState(EMPTY_DRAFT);

  return (
    <Card>
      <View style={styles.cardHeader}>
        <Text variant="title" style={styles.cardTitle}>
          {entry.exercise.name}
        </Text>
        <View style={styles.reorderControls}>
          {onMoveUp ? <Button title="Move up" variant="secondary" onPress={onMoveUp} /> : null}
          {onMoveDown ? <Button title="Move down" variant="secondary" onPress={onMoveDown} /> : null}
        </View>
      </View>
      {entry.sets.map((set, index) => {
        // null is the signal to render the bare set number — a plank does not
        // get an invented "— × 8".
        const target = formatRoutineTarget(trackingType, set, unit);
        return (
          <Text key={set.id} color="textMuted">
            {target === null ? `Set ${index + 1}` : `Set ${index + 1}: ${target}`}
          </Text>
        );
      })}
      <View style={styles.addSetContainer}>
        {inputs.length > 0 ? (
          <View style={styles.inputsRow}>
            {inputs.map((input) => (
              <NumericField
                key={input.field}
                value={draft[input.field]}
                onChangeText={(text) => setDraft((current) => ({ ...current, [input.field]: text }))}
                placeholder={input.placeholder}
                keyboard={input.keyboard}
                accessibilityLabel={input.placeholder}
              />
            ))}
          </View>
        ) : null}
        <Button
          title="Add set"
          variant="secondary"
          onPress={() => {
            const offers = (field: RoutineTargetField) => inputs.some((i) => i.field === field);

            // Only send a target for a field this tracking type actually
            // offers. The old unconditional `?? 8` gave a plank a rep target.
            const weightValue =
              offers('weightKg') && draft.weightKg ? parseDecimalInput(draft.weightKg) : undefined;
            const repsValue = offers('reps')
              ? (draft.reps ? parseIntegerInput(draft.reps) : null) ?? 8
              : undefined;

            addRoutineSet(db, entry.routineExercise.id, {
              targetReps: repsValue,
              targetWeightKg: weightValue != null ? toStorageKg(weightValue, unit) : undefined,
            });
            setDraft(EMPTY_DRAFT);
            onSetAdded();
          }}
        />
      </View>
    </Card>
  );
}

export function RoutineBuilder({ routineId }: Props) {
  // A local counter is the refresh signal: bumping it forces a re-read of
  // getRoutineDetail. "Add set" bumps it directly; useFocusEffect bumps it
  // whenever this screen regains focus, since other screens (e.g.
  // add-exercise) mutate this routine and navigate back via router.back(),
  // leaving this screen mounted underneath rather than remounting it.
  // Do NOT switch this to key={version} — that remounts and resets scroll
  // (6b249e9's failure mode).
  const [, setVersion] = useState(0);
  const detail = getRoutineDetail(db, routineId);
  const unit = getWeightUnit(db);

  // The unfinished workout that blocks starting a new one. getActiveWorkoutId
  // only ever returns the newest unfinished workout, so silently starting a
  // second one strands the first: no endedAt keeps it out of history, and a
  // newer sibling keeps it out of resume. Its sets then sit in SQLite,
  // invisible to every screen, forever. Sheet renders a Modal underneath,
  // never Alert — Alert.prompt is iOS-only and this app ships Android too.
  const [blockingWorkoutId, setBlockingWorkoutId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      setVersion((v) => v + 1);
    }, []),
  );

  const startWorkout = useCallback(() => {
    setBlockingWorkoutId(null);
    const workoutId = startWorkoutFromRoutine(db, routineId, Date.now());
    router.push(`/session/${workoutId}`);
  }, [routineId]);

  const onStartPressed = useCallback(() => {
    const active = getActiveWorkoutId(db);
    if (active) {
      setBlockingWorkoutId(active);
      return;
    }
    startWorkout();
  }, [startWorkout]);

  const onResume = useCallback(() => {
    const active = blockingWorkoutId;
    setBlockingWorkoutId(null);
    if (active) router.push(`/session/${active}`);
  }, [blockingWorkoutId]);

  const onDiscardAndStart = useCallback(() => {
    if (blockingWorkoutId) discardWorkout(db, blockingWorkoutId, Date.now());
    startWorkout();
  }, [blockingWorkoutId, startWorkout]);

  // Swaps the exercise at `index` with its neighbour in `direction` and
  // persists the full live order in one transaction. Reads the live list
  // fresh off `detail` each time rather than tracking local state, since
  // `detail` is already the source of truth this screen renders from.
  const moveExercise = useCallback(
    (index: number, direction: -1 | 1) => {
      if (!detail) return;
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= detail.exercises.length) return;

      const ids = detail.exercises.map((entry) => entry.routineExercise.id);
      const moved = ids[index];
      if (moved === undefined) return;
      ids.splice(index, 1);
      ids.splice(targetIndex, 0, moved);

      reorderRoutineExercises(db, routineId, ids, Date.now());
      setVersion((v) => v + 1);
    },
    [detail, routineId],
  );

  if (!detail) {
    return (
      <Screen>
        <Text color="textMuted" style={styles.empty}>
          Routine not found.
        </Text>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      {detail.exercises.map((entry, index) => (
        <ExerciseCard
          key={entry.routineExercise.id}
          entry={entry}
          unit={unit}
          onSetAdded={() => setVersion((v) => v + 1)}
          onMoveUp={index > 0 ? () => moveExercise(index, -1) : undefined}
          onMoveDown={index < detail.exercises.length - 1 ? () => moveExercise(index, 1) : undefined}
        />
      ))}

      {detail.exercises.length === 0 ? (
        <Text color="textMuted" style={styles.empty}>
          No exercises yet. Add one to get started.
        </Text>
      ) : null}

      <Button title="Start workout" onPress={onStartPressed} />

      <Button title="Add exercise" onPress={() => router.push(`/routines/${routineId}/add-exercise`)} />

      <Sheet
        visible={blockingWorkoutId !== null}
        onRequestClose={() => setBlockingWorkoutId(null)}
        title="A workout is already in progress"
        body="Resume it, or discard it and start this workout instead. Discarding keeps nothing from the unfinished workout."
      >
        <Button title="Resume it" onPress={onResume} />
        <Button title="Discard it and start" variant="secondary" onPress={onDiscardAndStart} />
        <Button title="Cancel" variant="secondary" onPress={() => setBlockingWorkoutId(null)} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  cardTitle: { flexShrink: 1 },
  reorderControls: { flexDirection: 'row', gap: theme.spacing.sm },
  addSetContainer: { gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  inputsRow: { flexDirection: 'row', gap: theme.spacing.sm },
  empty: { textAlign: 'center' },
});
