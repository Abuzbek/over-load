import type { Exercise } from '@workouts/schema';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { listExercises } from '../../data/exerciseRepo';
import { db } from '../../db/client';
import { ListRow } from '../../ui/ListRow';
import { SearchField } from '../../ui/SearchField';
import { theme } from '../../ui/theme';

type Props = {
  /** Supplying onSelect turns the list into a picker. */
  onSelect?: (exercise: Exercise) => void;
};

export function ExerciseList({ onSelect }: Props) {
  const [search, setSearch] = useState('');

  // The library is static during a session, so re-query only as the search changes.
  const exercises = useMemo(() => listExercises(db, { search: search.trim() || undefined }), [search]);

  return (
    <View style={styles.container}>
      <SearchField value={search} onChangeText={setSearch} placeholder="Search exercises" />
      <FlatList
        data={exercises}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Text style={styles.empty}>No exercises match "{search}"</Text>}
        renderItem={({ item }) => (
          <ListRow
            title={item.name}
            subtitle={`${item.primaryMuscle} · ${item.equipment}`}
            onPress={onSelect ? () => onSelect(item) : undefined}
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
