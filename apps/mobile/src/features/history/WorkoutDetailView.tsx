import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { getWorkoutDetail } from '../../data/sessionRepo';
import { db } from '../../db/client';
import { theme } from '../../ui/theme';

type Props = { workoutId: string };

export function WorkoutDetailView({ workoutId }: Props) {
  const detail = getWorkoutDetail(db, workoutId);

  if (!detail) {
    return (
      <View style={styles.container}>
        <Text style={styles.empty}>Workout not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {detail.exercises.map((entry) => (
        <View key={entry.workoutExercise.id} style={styles.card}>
          <Text style={styles.title}>{entry.exercise.name}</Text>
          {entry.sets
            .filter((set) => set.completedAt !== null)
            .map((set, index) => (
              <Text key={set.id} style={styles.setLine}>
                {index + 1}. {set.weightKg ?? '—'} kg × {set.reps ?? '—'}
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
  title: { ...theme.text.title, color: theme.colors.text },
  setLine: { ...theme.text.body, color: theme.colors.textMuted },
  empty: { ...theme.text.body, color: theme.colors.textMuted, textAlign: 'center', padding: theme.spacing.xl },
});
