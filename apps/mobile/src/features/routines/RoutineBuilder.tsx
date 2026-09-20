import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { addRoutineSet, getRoutineDetail } from '../../data/routineRepo';
import { discardWorkout, getActiveWorkoutId, startWorkoutFromRoutine } from '../../data/sessionRepo';
import { db } from '../../db/client';
import { Button } from '../../ui/Button';
import { theme } from '../../ui/theme';

type Props = { routineId: string };

export function RoutineBuilder({ routineId }: Props) {
  // A local counter is the refresh signal: bumping it forces a re-read of
  // getRoutineDetail. "Add set" bumps it directly; useFocusEffect bumps it
  // whenever this screen regains focus, since other screens (e.g.
  // add-exercise) mutate this routine and navigate back via router.back(),
  // leaving this screen mounted underneath rather than remounting it.
  const [, setVersion] = useState(0);
  const detail = getRoutineDetail(db, routineId);

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
        {detail.exercises.map((entry) => (
          <View key={entry.routineExercise.id} style={styles.card}>
            <Text style={styles.cardTitle}>{entry.exercise.name}</Text>
            {entry.sets.map((set, index) => (
              <Text key={set.id} style={styles.setLine}>
                Set {index + 1}: {set.targetWeightKg ?? '—'} kg × {set.targetReps ?? '—'}
              </Text>
            ))}
            <Button
              title="Add set"
              variant="secondary"
              onPress={() => {
                const last = entry.sets[entry.sets.length - 1];
                addRoutineSet(db, entry.routineExercise.id, {
                  targetReps: last?.targetReps ?? 8,
                  targetWeightKg: last?.targetWeightKg ?? undefined,
                });
                setVersion((v) => v + 1);
              }}
            />
          </View>
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
  cardTitle: { ...theme.text.title, color: theme.colors.text },
  setLine: { ...theme.text.body, color: theme.colors.textMuted },
  empty: { ...theme.text.body, color: theme.colors.textMuted, textAlign: 'center' },
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
  modalTitle: { ...theme.text.title, color: theme.colors.text },
  modalBody: { ...theme.text.body, color: theme.colors.textMuted },
});
