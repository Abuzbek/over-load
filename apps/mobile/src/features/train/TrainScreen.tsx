import { formatLastTrained } from '@overload/domain';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { getActiveProgram } from '../../data/programRepo';
import { listRoutineSummaries, type RoutineSummary } from '../../data/routineRepo';
import { db } from '../../db/client';
import { Card } from '../../ui/Card';
import { Collapsible } from '../../ui/Collapsible';
import { ListRow } from '../../ui/ListRow';
import { EmptyState } from '../../ui/EmptyState';
import { Screen } from '../../ui/Screen';
import { SectionLabel } from '../../ui/SectionLabel';
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

  useFocusEffect(useCallback(() => setVersion((v) => v + 1), []));

  const summaries = listRoutineSummaries(db);
  const activeProgram = getActiveProgram(db);

  return (
    <Screen scroll safeTop>
      <Text variant="display">Workout</Text>

      <SectionLabel>Program</SectionLabel>
      <Card style={styles.programRows}>
        <ListRow
          title={activeProgram?.name ?? 'No active program'}
          subtitle="Your day cycle"
          onPress={() =>
            activeProgram
              ? router.push({
                  pathname: '/programs/[id]',
                  params: { id: activeProgram.id, name: activeProgram.name },
                })
              : router.push('/programs')
          }
        />
        <ListRow
          title="Program library"
          subtitle="Archived programs"
          onPress={() => router.push('/programs')}
        />
      </Card>

      <Collapsible title="Workout library">
        {summaries.length === 0 ? (
          <EmptyState
            title="No workouts yet"
            body="Build one with the + button and it will show up here, with the last time you trained it."
          />
        ) : (
          <View style={styles.list}>
            {summaries.map((s) => <RoutineCard key={s.routine.id} summary={s} />)}
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
