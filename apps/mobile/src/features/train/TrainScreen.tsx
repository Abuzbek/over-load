import { formatLastTrained } from '@overload/domain';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { listRoutineSummaries, type RoutineSummary } from '../../data/routineRepo';
import { discardWorkout, getActiveWorkoutId, startEmptyWorkout } from '../../data/sessionRepo';
import { db } from '../../db/client';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { EmptyState } from '../../ui/EmptyState';
import { Screen } from '../../ui/Screen';
import { SectionLabel } from '../../ui/SectionLabel';
import { Sheet } from '../../ui/Sheet';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';

function RoutineCard({ summary }: { summary: RoutineSummary }) {
  const { routine, exerciseCount, lastTrainedAt, primaryMuscles } = summary;
  const count = `${exerciseCount} ${exerciseCount === 1 ? 'exercise' : 'exercises'}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${routine.name}, ${count}`}
      onPress={() => router.push(`/routines/${routine.id}`)}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Card>
        <Text variant="title">{routine.name}</Text>
        <Text variant="caption" color="textMuted">
          {count} · {formatLastTrained(lastTrainedAt, Date.now())}
        </Text>
        {primaryMuscles.length > 0 ? (
          <Text variant="caption" color="textMuted">{primaryMuscles.join(' · ')}</Text>
        ) : null}
      </Card>
    </Pressable>
  );
}

export function TrainScreen() {
  // Bumping this forces a re-read of listRoutineSummaries. useFocusEffect bumps
  // it when the screen regains focus, since the builder and the session mutate
  // this data and navigate back, leaving this screen mounted underneath.
  // Do NOT switch this to key={version} — that remounts and resets scroll (6b249e9).
  const [, setVersion] = useState(0);
  const [blockingWorkoutId, setBlockingWorkoutId] = useState<string | null>(null);

  useFocusEffect(useCallback(() => setVersion((v) => v + 1), []));

  const summaries = listRoutineSummaries(db);

  const startEmpty = useCallback(() => {
    setBlockingWorkoutId(null);
    const workoutId = startEmptyWorkout(db, 'Empty workout', Date.now());
    router.push(`/session/${workoutId}`);
  }, []);

  const onStartEmptyPressed = useCallback(() => {
    // getActiveWorkoutId only ever returns the newest unfinished workout, so
    // starting a second one strands the first: no endedAt keeps it out of
    // history, and a newer sibling keeps it out of resume.
    const active = getActiveWorkoutId(db);
    if (active) return setBlockingWorkoutId(active);
    startEmpty();
  }, [startEmpty]);

  return (
    <Screen scroll>
      <Text variant="display">Train</Text>

      <SectionLabel>Your routines</SectionLabel>
      {summaries.length === 0 ? (
        <EmptyState
          title="No routines yet"
          body="Build one and it will show up here, with the last time you trained it."
          action={{ title: 'New routine', onPress: () => router.push('/routines') }}
        />
      ) : (
        <View style={styles.list}>
          {summaries.map((s) => <RoutineCard key={s.routine.id} summary={s} />)}
        </View>
      )}

      {/* Always present, not only in the empty state: the cards route to a
          single routine, so without this there is no way to reach the routine
          list and create a second one. */}
      <Button title="New routine" variant="secondary" onPress={() => router.push('/routines')} />
      <Button title="Start empty workout" variant="secondary" onPress={onStartEmptyPressed} />
      <Button title="Browse exercises" variant="secondary" onPress={() => router.push('/exercises')} />

      <Sheet
        visible={blockingWorkoutId !== null}
        onRequestClose={() => setBlockingWorkoutId(null)}
        title="A workout is already in progress"
        body="Resume it, or discard it and start an empty workout instead. Discarding keeps nothing from the unfinished workout."
      >
        <Button
          title="Resume it"
          onPress={() => {
            const active = blockingWorkoutId;
            setBlockingWorkoutId(null);
            if (active) router.push(`/session/${active}`);
          }}
        />
        <Button
          title="Discard it and start"
          variant="destructive"
          onPress={() => {
            if (blockingWorkoutId) discardWorkout(db, blockingWorkoutId, Date.now());
            startEmpty();
          }}
        />
        <Button title="Cancel" variant="secondary" onPress={() => setBlockingWorkoutId(null)} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: theme.spacing.md },
  pressed: { opacity: 0.7 },
});
