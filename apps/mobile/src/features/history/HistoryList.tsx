import { formatWeight, type Unit } from '@overload/domain';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { listFinishedWorkouts, type WorkoutSummary } from '../../data/historyRepo';
import { getWeightUnit } from '../../data/settingsRepo';
import { db } from '../../db/client';
import { Card } from '../../ui/Card';
import { EmptyState } from '../../ui/EmptyState';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';

function WorkoutCard({ summary, unit }: { summary: WorkoutSummary; unit: Unit }) {
  const { workout, setCount, volumeKg } = summary;
  const sets = `${setCount} ${setCount === 1 ? 'set' : 'sets'}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={workout.name}
      onPress={() => router.push(`/history/${workout.id}`)}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Card>
        <Text variant="heading">{workout.name}</Text>
        <Text variant="caption" color="textMuted">
          {new Date(workout.startedAt).toLocaleDateString()} · {sets} · {formatWeight(volumeKg, unit)}
        </Text>
      </Card>
    </Pressable>
  );
}

export function HistoryList() {
  // A local counter is the refresh signal: bumping it forces a re-read of
  // both the workout list and the weight-unit preference, since a change
  // made on the Settings screen must show up here on return, and this
  // screen stays mounted underneath the stack rather than remounting.
  const [, setVersion] = useState(0);
  const summaries = listFinishedWorkouts(db);
  const unit = getWeightUnit(db);

  useFocusEffect(
    useCallback(() => {
      setVersion((v) => v + 1);
    }, []),
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={summaries}
        keyExtractor={(item) => item.workout.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={<Text variant="display">History</Text>}
        ListEmptyComponent={
          <EmptyState
            title="No workouts yet"
            body="Finish a workout and it will appear here."
          />
        }
        renderItem={({ item }) => <WorkoutCard summary={item} unit={unit} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { flexGrow: 1, padding: theme.spacing.lg, gap: theme.spacing.lg },
  separator: { height: theme.spacing.md },
  pressed: { opacity: 0.7 },
});
