import { DEFAULT_REST_SECONDS, type CompletedSet } from '@overload/domain';
import { useKeepAwake } from 'expo-keep-awake';
import { useFocusEffect, router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getWeightUnit } from '../../data/settingsRepo';
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

  // Bumping this re-renders, which re-reads the workout from SQLite and the
  // weight-unit preference. The re-read only affects placeholders and newly
  // mounted rows, though: each SetRow freezes its own `values` state (the
  // typed weight) at mount, so an already-rendered box does NOT reconvert if
  // the unit changes underneath it — a box showing "60" typed as kg would
  // still submit as toStorageKg(60, 'lb') if the unit flipped to lb without
  // remounting the row. Unreachable today, since Settings is only linked from
  // Home and reaching it pops this screen off the stack, so there is nothing
  // to fix yet — but the next person who links Settings from within a session
  // needs to know this trap exists before doing that.
  const [, setVersion] = useState(0);
  const detail = getWorkoutDetail(db, workoutId);
  const unit = getWeightUnit(db);

  useFocusEffect(
    useCallback(() => {
      setVersion((v) => v + 1);
    }, []),
  );

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
    // KeyboardAvoidingView doubles as the flex column that pins the rest timer:
    // the ScrollView takes the remaining height and the timer sits under it.
    // iOS needs the padding behaviour; Android resizes the window itself.
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        // The numeric keypads have no return key on iOS, so dragging the list
        // is the only way to dismiss the keyboard.
        keyboardDismissMode="interactive"
        // Without this the first tap after typing only dismisses the keyboard,
        // swallowing the tap on the set's checkmark.
        keyboardShouldPersistTaps="handled"
      >
        {detail.exercises.map((entry) => (
          <ExerciseCard
            key={entry.workoutExercise.id}
            entry={entry}
            previous={previousByExercise.get(entry.exercise.id) ?? []}
            unit={unit}
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
          title="Add exercise"
          variant="secondary"
          onPress={() => router.push(`/session/${workoutId}/add-exercise`)}
        />

        <Button
          title="Finish workout"
          onPress={() => {
            finishWorkout(db, workoutId, Date.now());
            // replace() alone swaps only the top route, leaving
            // Home -> Routines -> Builder -> Home with a back button into the
            // builder of a workout that is already over. Pop to the root first.
            router.dismissAll();
            router.replace('/');
          }}
        />
      </ScrollView>

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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scroll: { flex: 1 },
  content: { padding: theme.spacing.lg, gap: theme.spacing.lg },
  empty: { ...theme.text.body, color: theme.colors.textMuted, textAlign: 'center' },
});
