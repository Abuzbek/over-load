import { formatWeight } from '@overload/domain';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { listFinishedWorkouts } from '../../data/historyRepo';
import { getWeightUnit } from '../../data/settingsRepo';
import { db } from '../../db/client';
import { ListRow } from '../../ui/ListRow';
import { theme } from '../../ui/theme';

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
        ListEmptyComponent={<Text style={styles.empty}>No finished workouts yet.</Text>}
        renderItem={({ item }) => (
          <ListRow
            title={item.workout.name}
            subtitle={`${new Date(item.workout.startedAt).toLocaleDateString()} · ${item.setCount} sets · ${formatWeight(item.volumeKg, unit)}`}
            onPress={() => router.push(`/history/${item.workout.id}`)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  empty: { ...theme.text.body, color: theme.colors.textMuted, textAlign: 'center', padding: theme.spacing.xl },
});
