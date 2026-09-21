import { formatTrackedSet } from '@overload/domain';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';
import { getWorkoutDetail } from '../../data/sessionRepo';
import { getWeightUnit } from '../../data/settingsRepo';
import { db } from '../../db/client';
import { Card } from '../../ui/Card';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';

type Props = { workoutId: string };

export function WorkoutDetailView({ workoutId }: Props) {
  // See HistoryList: this screen stays mounted underneath the stack, so a
  // unit change made on Settings needs this bump to show up on return.
  const [, setVersion] = useState(0);
  const detail = getWorkoutDetail(db, workoutId);
  const unit = getWeightUnit(db);

  useFocusEffect(
    useCallback(() => {
      setVersion((v) => v + 1);
    }, []),
  );

  if (!detail) {
    return (
      <Screen>
        <Text color="textMuted" style={styles.empty}>
          Workout not found.
        </Text>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Text variant="display">{detail.workout.name}</Text>
      {detail.exercises.map((entry) => (
        <Card key={entry.workoutExercise.id}>
          <Text variant="heading">{entry.exercise.name}</Text>
          {entry.sets
            .filter((set) => set.completedAt !== null)
            .map((set, index) => (
              <Text key={set.id} variant="numeric" color="textMuted">
                {index + 1}. {formatTrackedSet(entry.exercise.trackingType, set, unit)}
              </Text>
            ))}
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: { textAlign: 'center', padding: theme.spacing.xl },
});
