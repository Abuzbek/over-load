import { toStorageKg, type Unit } from '@overload/domain';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { RoutineDetailExercise } from '../../data/routineRepo';
import { addRoutineSet, getRoutineDetail, reorderRoutineExercises } from '../../data/routineRepo';
import { getWeightUnit } from '../../data/settingsRepo';
import { discardWorkout, getActiveWorkoutId, startWorkoutFromRoutine } from '../../data/sessionRepo';
import { db } from '../../db/client';
import { Button } from '../../ui/Button';
import { theme } from '../../ui/theme';
import { textStyle } from '../../ui/typography';
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
  const inputs = targetInputsFor(trackingType, unit);
  const [draft, setDraft] = useState(EMPTY_DRAFT);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{entry.exercise.name}</Text>
        <View style={styles.reorderControls}>
          {onMoveUp ? <Button title="Move up" variant="secondary" onPress={onMoveUp} /> : null}
          {onMoveDown ? <Button title="Move down" variant="secondary" onPress={onMoveDown} /> : null}
        </View>
      </View>
      {entry.sets.map((set, index) => {
        const target = formatRoutineTarget(trackingType, set, unit);
        return (
          <Text key={set.id} style={styles.setLine}>
            {target === null ? `Set ${index + 1}` : `Set ${index + 1}: ${target}`}
          </Text>
        );
      })}
      <View style={styles.addSetContainer}>
        {inputs.map((input) => (
          <TextInput
            key={input.field}
            value={draft[input.field]}
            onChangeText={(text) => setDraft((current) => ({ ...current, [input.field]: text }))}
            placeholder={input.placeholder}
            keyboardType={input.keyboard}
            placeholderTextColor={theme.colors.textMuted}
            style={styles.setInput}
          />
        ))}
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
    </View>
  );
}

export function RoutineBuilder({ routineId }: Props) {
  // A local counter is the refresh signal: bumping it forces a re-read of
  // getRoutineDetail. "Add set" bumps it directly; useFocusEffect bumps it
  // whenever this screen regains focus, since other screens (e.g.
  // add-exercise) mutate this routine and navigate back via router.back(),
  // leaving this screen mounted underneath rather than remounting it.
  const [, setVersion] = useState(0);
  const detail = getRoutineDetail(db, routineId);
  const unit = getWeightUnit(db);

  // The unfinished workout that blocks starting a new one. getActiveWorkoutId
  // only ever returns the newest unfinished workout, so silently starting a
  // second one strands the first: no endedAt keeps it out of history, and a
  // newer sibling keeps it out of resume. Its sets then sit in SQLite,
  // invisible to every screen, forever. A Modal rather than Alert.alert —
  // Alert's button semantics are iOS-shaped, and this app ships Android too.
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
      <View style={styles.container}>
        <Text style={styles.empty}>Routine not found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
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
          <Text style={styles.empty}>No exercises yet. Add one to get started.</Text>
        ) : null}

        <Button title="Start workout" onPress={onStartPressed} />

        <Button
          title="Add exercise"
          onPress={() => router.push(`/routines/${routineId}/add-exercise`)}
        />
      </ScrollView>

      <Modal
        visible={blockingWorkoutId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setBlockingWorkoutId(null)}
      >
        <View style={styles.backdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>A workout is already in progress</Text>
            <Text style={styles.modalBody}>
              Resume it, or discard it and start this routine instead. Discarding keeps nothing
              from the unfinished workout.
            </Text>
            <Button title="Resume it" onPress={onResume} />
            <Button title="Discard it and start" variant="secondary" onPress={onDiscardAndStart} />
            <Button title="Cancel" variant="secondary" onPress={() => setBlockingWorkoutId(null)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, gap: theme.spacing.lg },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  cardTitle: { ...textStyle('title', true), color: theme.colors.text, flexShrink: 1 },
  reorderControls: { flexDirection: 'row', gap: theme.spacing.sm },
  setLine: { ...textStyle('body', true), color: theme.colors.textMuted },
  addSetContainer: { gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  setInput: {
    ...textStyle('body', true),
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    textAlign: 'center',
  },
  empty: { ...textStyle('body', true), color: theme.colors.textMuted, textAlign: 'center' },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  modalCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  modalTitle: { ...textStyle('title', true), color: theme.colors.text },
  modalBody: { ...textStyle('body', true), color: theme.colors.textMuted },
});
