import { DEFAULT_REST_SECONDS, type CompletedSet } from '@overload/domain';
import { useKeepAwake } from 'expo-keep-awake';
import { useFocusEffect, router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { getWeightUnit } from '../../data/settingsRepo';
import { finishWorkout, getWorkoutDetail, lastPerformance } from '../../data/sessionRepo';
import { db } from '../../db/client';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
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
  // remounting the row. Not reachable today: every route into this screen —
  // including the persistent in-progress bar (InProgressBar.tsx) — is a
  // `router.push`, which always produces a fresh mount, so there is no live
  // session whose SetRows could observe a unit change out from under them.
  // The next person who adds a way to reach a session WITHOUT a fresh push
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
        <EmptyState title="Workout not found" />
      </View>
    );
  }

  return (
    // KeyboardAvoidingView doubles as the flex column that pins the rest timer:
    // the ScrollView takes the remaining height and the timer sits under it.
    // No `behavior` on either platform: iOS keyboard handling is the
    // ScrollView's `automaticallyAdjustKeyboardInsets` below, and Android
    // resizes the window itself.
    <KeyboardAvoidingView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        // The numeric keypads have no return key on iOS, so dragging the list
        // is the only way to dismiss the keyboard.
        keyboardDismissMode="interactive"
        // Without this the first tap after typing only dismisses the keyboard,
        // swallowing the tap on the set's checkmark.
        keyboardShouldPersistTaps="handled"
        // Resizing the container is not enough: RN does not scroll the focused
        // input into view on its own, so tapping a lower set row left the
        // cursor in a box behind the keyboard. This adjusts the content inset
        // and scrolls the focused field into view. iOS-only, which is why the
        // KeyboardAvoidingView above no longer also pads on iOS — the two
        // together apply the keyboard height twice.
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
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
          <EmptyState title="No exercises yet" body="Add one to start logging sets." />
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
            // A rest notification outlives the screen that scheduled it: it is
            // an OS-level scheduled notification, and it survives navigation
            // and even a force-quit. Without this, finishing a workout inside
            // the rest period still buzzes "Time for your next set" minutes
            // after the workout is over. Skip cancels it; finishing must too.
            setRest(null);
            void cancelRestNotification();
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
});
