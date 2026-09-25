import { formatLastTrained } from '@overload/domain';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { getActiveProgram, getProgramDays } from '../../data/programRepo';
import { listWorkoutSummaries, type WorkoutSummary } from '../../data/workoutRepo';
import { db } from '../../db/client';
import { ActiveProgramCard } from '../programs/ActiveProgramCard';
import { Card } from '../../ui/Card';
import { Collapsible } from '../../ui/Collapsible';
import { ListRow } from '../../ui/ListRow';
import { EmptyState } from '../../ui/EmptyState';
import { Screen } from '../../ui/Screen';
import { SectionLabel } from '../../ui/SectionLabel';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';

function WorkoutCard({ summary }: { summary: WorkoutSummary }) {
  const { workout, exerciseCount, lastTrainedAt, primaryMuscles } = summary;
  const count = `${exerciseCount} ${exerciseCount === 1 ? 'exercise' : 'exercises'}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${workout.name}, ${count}`}
      onPress={() => router.push(`/workouts/${workout.id}`)}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Card>
        <Text variant="title">{workout.name}</Text>
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
  // Bumping this forces a re-read of listWorkoutSummaries. useFocusEffect bumps
  // it when the screen regains focus, since the builder and the session mutate
  // this data and navigate back, leaving this screen mounted underneath.
  // Do NOT switch this to key={version} — that remounts and resets scroll (6b249e9).
  const [, setVersion] = useState(0);

  useFocusEffect(useCallback(() => setVersion((v) => v + 1), []));

  const summaries = listWorkoutSummaries(db);
  const activeProgram = getActiveProgram(db);
  const days = activeProgram ? getProgramDays(db, activeProgram.id) : [];
  const summaryByWorkoutId = new Map(summaries.map((s) => [s.workout.id, s]));
  // Workouts a program schedules live under that program; the library is the ones made on their own.
  const library = summaries.filter((s) => !s.inProgram);

  return (
    <Screen scroll safeTop>
      <Text variant="display">Workout</Text>

      <SectionLabel>Active program</SectionLabel>
      {activeProgram ? (
        <ActiveProgramCard
          programId={activeProgram.id}
          programName={activeProgram.name}
          cycleNumber={activeProgram.cycleNumber}
          days={days}
          summaryByWorkoutId={summaryByWorkoutId}
          onChanged={() => setVersion((v) => v + 1)}
        />
      ) : (
        <Card style={styles.programRows}>
          <ListRow
            title="No active program"
            subtitle="Pick one from the program library"
            onPress={() => router.push('/programs')}
          />
        </Card>
      )}

      <Card style={styles.programRows}>
        <ListRow
          title="Program library"
          subtitle="Archived programs, and editing"
          onPress={() => router.push('/programs')}
        />
      </Card>

      <Collapsible title="Workout library">
        {library.length === 0 ? (
          <EmptyState
            title="No workouts yet"
            body="Build one with the + button and it will show up here, with the last time you trained it."
          />
        ) : (
          <View style={styles.list}>
            {library.map((s) => <WorkoutCard key={s.workout.id} summary={s} />)}
          </View>
        )}
      </Collapsible>

      <Card style={styles.programRows}>
        <ListRow
          title="Browse exercises"
          subtitle="Every exercise in the catalogue"
          onPress={() => router.push('/exercises')}
        />
      </Card>

    </Screen>
  );
}

const styles = StyleSheet.create({
  programRows: { paddingVertical: 0, paddingHorizontal: 0, gap: 0 },
  list: { gap: theme.spacing.md },
  pressed: { opacity: 0.7 },
});
