import { router, useLocalSearchParams } from 'expo-router';
import { addExerciseToWorkout, addWorkoutSet } from '../../../src/data/workoutRepo';
import { db } from '../../../src/db/client';
import { ExerciseList } from '../../../src/features/library/ExerciseList';

export default function AddExerciseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <ExerciseList
      onAdd={(exerciseIds) => {
        for (const exerciseId of exerciseIds) {
          const workoutExercise = addExerciseToWorkout(db, id, exerciseId);
          // A new exercise starts with one set so the card is never empty.
          addWorkoutSet(db, workoutExercise.id, { targetReps: 8 });
        }
        router.back();
      }}
    />
  );
}
