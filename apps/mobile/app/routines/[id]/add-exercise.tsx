import { router, Stack, useLocalSearchParams } from 'expo-router';
import { addExerciseToRoutine, addRoutineSet } from '../../../src/data/routineRepo';
import { db } from '../../../src/db/client';
import { ExerciseList } from '../../../src/features/library/ExerciseList';

export default function AddExerciseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <>
      <Stack.Screen options={{ title: 'Add exercise', presentation: 'modal' }} />
      <ExerciseList
        onSelect={(exercise) => {
          const routineExercise = addExerciseToRoutine(db, id, exercise.id);
          // A new exercise starts with one set so the card is never empty.
          addRoutineSet(db, routineExercise.id, { targetReps: 8 });
          router.back();
        }}
      />
    </>
  );
}
