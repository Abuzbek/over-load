import type { CompletedSet, Unit } from '@overload/domain';
import { StyleSheet, View } from 'react-native';
import { addSet, completeSet, uncompleteSet, type WorkoutDetailExercise } from '../../data/sessionRepo';
import { db } from '../../db/client';
import { Button } from '../../ui/Button';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';
import { SetRow } from './SetRow';

type Props = {
  entry: WorkoutDetailExercise;
  previous: CompletedSet[];
  unit: Unit;
  onChanged: () => void;
  onSetCompleted: (restSeconds: number | null) => void;
};

export function ExerciseCard({ entry, previous, unit, onChanged, onSetCompleted }: Props) {
  return (
    <View style={styles.card}>
      <Text variant="title">{entry.exercise.name}</Text>

      {entry.sets.map((set, index) => (
        <SetRow
          key={set.id}
          set={set}
          index={index}
          trackingType={entry.exercise.trackingType}
          previous={previous}
          unit={unit}
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
});
