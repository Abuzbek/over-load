import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { addRoutineSet, getRoutineDetail } from '../../data/routineRepo';
import { db } from '../../db/client';
import { Button } from '../../ui/Button';
import { theme } from '../../ui/theme';

type Props = { routineId: string };

export function RoutineBuilder({ routineId }: Props) {
  const [version, setVersion] = useState(0);
  const detail = getRoutineDetail(db, routineId);

  if (!detail) {
    return (
      <View style={styles.container}>
        <Text style={styles.empty}>Routine not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} key={version}>
      {detail.exercises.map((entry) => (
        <View key={entry.routineExercise.id} style={styles.card}>
          <Text style={styles.cardTitle}>{entry.exercise.name}</Text>
          {entry.sets.map((set, index) => (
            <Text key={set.id} style={styles.setLine}>
              Set {index + 1}: {set.targetWeightKg ?? '—'} kg × {set.targetReps ?? '—'}
            </Text>
          ))}
          <Button
            title="Add set"
            variant="secondary"
            onPress={() => {
              const last = entry.sets[entry.sets.length - 1];
              addRoutineSet(db, entry.routineExercise.id, {
                targetReps: last?.targetReps ?? 8,
                targetWeightKg: last?.targetWeightKg ?? undefined,
              });
              setVersion((v) => v + 1);
            }}
          />
        </View>
      ))}

      {detail.exercises.length === 0 ? (
        <Text style={styles.empty}>No exercises yet. Add one to get started.</Text>
      ) : null}

      <Button
        title="Add exercise"
        onPress={() => router.push(`/routines/${routineId}/add-exercise`)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, gap: theme.spacing.lg },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  cardTitle: { ...theme.text.title, color: theme.colors.text },
  setLine: { ...theme.text.body, color: theme.colors.textMuted },
  empty: { ...theme.text.body, color: theme.colors.textMuted, textAlign: 'center' },
});
