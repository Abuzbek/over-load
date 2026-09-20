import type { CompletedSet } from '@overload/domain';
import { StyleSheet, Text, View } from 'react-native';
import { addSet, completeSet, uncompleteSet, type WorkoutDetailExercise } from '../../data/sessionRepo';
import { db } from '../../db/client';
import { Button } from '../../ui/Button';
import { theme } from '../../ui/theme';
import { SetRow } from './SetRow';

type Props = {
  entry: WorkoutDetailExercise;
  previous: CompletedSet[];
  onChanged: () => void;
  onSetCompleted: (restSeconds: number | null) => void;
};

export function ExerciseCard({ entry, previous, onChanged, onSetCompleted }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{entry.exercise.name}</Text>

      {entry.sets.map((set, index) => (
        <SetRow
          key={set.id}
          set={set}
          index={index}
          previous={previous}
          onComplete={(values) => {
            completeSet(db, set.id, values, Date.now());
            onChanged();
            onSetCompleted(entry.workoutExercise.restSeconds);
          }}
          onUncomplete={() => {
            uncompleteSet(db, set.id);
            onChanged();
          }}
        />
      ))}

      <Button
        title="Add set"
        variant="secondary"
        onPress={() => {
          addSet(db, entry.workoutExercise.id, Date.now());
          onChanged();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  title: { ...theme.text.title, color: theme.colors.text },
});
