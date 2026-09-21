import { formatTrackedSet } from '@overload/domain';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { getWorkoutDetail } from '../../data/sessionRepo';
import { getWeightUnit } from '../../data/settingsRepo';
import { db } from '../../db/client';
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
      <View style={styles.container}>
        <Text color="textMuted" style={styles.empty}>
          Workout not found.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {detail.exercises.map((entry) => (
        <View key={entry.workoutExercise.id} style={styles.card}>
          <Text variant="title">{entry.exercise.name}</Text>
          {entry.sets
            .filter((set) => set.completedAt !== null)
            .map((set, index) => (
              <Text key={set.id} color="textMuted">
                {index + 1}. {formatTrackedSet(entry.exercise.trackingType, set, unit)}
              </Text>
            ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, gap: theme.spacing.lg },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: theme.spacing.lg, gap: theme.spacing.xs },
  empty: { textAlign: 'center', padding: theme.spacing.xl },
});
