import { router } from 'expo-router';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { listFinishedWorkouts } from '../../data/historyRepo';
import { db } from '../../db/client';
import { ListRow } from '../../ui/ListRow';
import { theme } from '../../ui/theme';

export function HistoryList() {
  const summaries = listFinishedWorkouts(db);

  return (
    <View style={styles.container}>
      <FlatList
        data={summaries}
        keyExtractor={(item) => item.workout.id}
        ListEmptyComponent={<Text style={styles.empty}>No finished workouts yet.</Text>}
        renderItem={({ item }) => (
          <ListRow
            title={item.workout.name}
            subtitle={`${new Date(item.workout.startedAt).toLocaleDateString()} · ${item.setCount} sets · ${Math.round(item.volumeKg)} kg`}
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
