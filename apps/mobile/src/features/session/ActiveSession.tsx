import { DEFAULT_REST_SECONDS, type CompletedSet } from '@workouts/domain';
import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { finishWorkout, getWorkoutDetail, lastPerformance } from '../../data/sessionRepo';
import { db } from '../../db/client';
import { Button } from '../../ui/Button';
import { theme } from '../../ui/theme';
import { ExerciseCard } from './ExerciseCard';
import { cancelRestNotification, scheduleRestNotification } from './notifications';
import { RestTimer } from './RestTimer';

type Props = { workoutId: string };

export function ActiveSession({ workoutId }: Props) {
  // The phone must not lock between sets.
  useKeepAwake();

  const [rest, setRest] = useState<{ startedAt: number; seconds: number } | null>(null);

  // Bumping this re-renders, which re-reads the workout from SQLite.
  const [, setVersion] = useState(0);
  const detail = getWorkoutDetail(db, workoutId);

  // Previous performance is fixed for the session — query once per exercise.
  const previousByExercise = useMemo(() => {
    const map = new Map<string, CompletedSet[]>();
    for (const entry of detail?.exercises ?? []) {
      map.set(entry.exercise.id, lastPerformance(db, entry.exercise.id, workoutId));
    }
    return map;
  }, [workoutId, detail?.exercises.length]);

  if (!detail) {
    return (
      <View style={styles.container}>
        <Text style={styles.empty}>Workout not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {detail.exercises.map((entry) => (
        <ExerciseCard
          key={entry.workoutExercise.id}
          entry={entry}
          previous={previousByExercise.get(entry.exercise.id) ?? []}
          onChanged={() => setVersion((v) => v + 1)}
          onSetCompleted={(restSeconds) => {
            const seconds = restSeconds ?? DEFAULT_REST_SECONDS;
            setRest({ startedAt: Date.now(), seconds });
            void scheduleRestNotification(seconds);
          }}
        />
      ))}

      {detail.exercises.length === 0 ? (
        <Text style={styles.empty}>This workout has no exercises.</Text>
      ) : null}

      <Button
        title="Finish workout"
        onPress={() => {
          finishWorkout(db, workoutId, Date.now());
          router.replace('/');
        }}
      />

      {rest ? (
        <RestTimer
          startedAt={rest.startedAt}
          restSeconds={rest.seconds}
          onDismiss={() => {
            setRest(null);
            void cancelRestNotification();
          }}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, gap: theme.spacing.lg },
  empty: { ...theme.text.body, color: theme.colors.textMuted, textAlign: 'center' },
});
