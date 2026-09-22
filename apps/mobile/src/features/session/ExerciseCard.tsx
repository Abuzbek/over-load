import type { CompletedSet, DistanceUnit, Unit } from '@overload/domain';
import { addSet, completeSet, uncompleteSet, type WorkoutDetailExercise } from '../../data/sessionRepo';
import { db } from '../../db/client';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Text } from '../../ui/Text';
import { SetRow } from './SetRow';

type Props = {
  entry: WorkoutDetailExercise;
  previous: CompletedSet[];
  unit: Unit;
  distanceUnit: DistanceUnit;
  onChanged: () => void;
  onSetCompleted: (restSeconds: number | null) => void;
};

export function ExerciseCard({ entry, previous, unit, distanceUnit, onChanged, onSetCompleted }: Props) {
  return (
    <Card>
      <Text variant="title">{entry.exercise.name}</Text>

      {entry.sets.map((set, index) => (
        <SetRow
          key={set.id}
          set={set}
          index={index}
          trackingType={entry.exercise.trackingType}
          previous={previous}
          unit={unit}
          distanceUnit={distanceUnit}
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
    </Card>
  );
}
