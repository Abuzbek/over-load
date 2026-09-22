import { formatTrackedSet } from '@overload/domain';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';
import { getSessionDetail } from '../../data/sessionRepo';
import { getDistanceUnit, getWeightUnit } from '../../data/settingsRepo';
import { db } from '../../db/client';
import { Card } from '../../ui/Card';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';

type Props = { sessionId: string };

export function WorkoutDetailView({ sessionId }: Props) {
  // See HistoryList: this screen stays mounted underneath the stack, so a
  // unit change made on Settings needs this bump to show up on return.
  const [, setVersion] = useState(0);
  const detail = getSessionDetail(db, sessionId);
  const unit = getWeightUnit(db);
  const distanceUnit = getDistanceUnit(db);

  useFocusEffect(
    useCallback(() => {
      setVersion((v) => v + 1);
    }, []),
  );

  if (!detail) {
    return (
      <Screen>
        <Text color="textMuted" style={styles.empty}>
          Session not found.
        </Text>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Text variant="display">{detail.workout.name}</Text>
      {detail.exercises.map((entry) => (
        <Card key={entry.sessionExercise.id}>
          <Text variant="heading">{entry.exercise.name}</Text>
          {entry.sessionSets
            .filter((set) => set.completedAt !== null)
            .map((set, index) => (
              <Text key={set.id} variant="numeric" color="textMuted">
                {index + 1}. {formatTrackedSet(entry.exercise.trackingType, set, unit, distanceUnit)}
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
