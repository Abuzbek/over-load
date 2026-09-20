import { router, Stack, useLocalSearchParams } from 'expo-router';
import { addExerciseToWorkout } from '../../../src/data/sessionRepo';
import { db } from '../../../src/db/client';
import { ExerciseList } from '../../../src/features/library/ExerciseList';

export default function AddExerciseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <>
      <Stack.Screen options={{ title: 'Add exercise', presentation: 'modal' }} />
      <ExerciseList
        onSelect={(exercise) => {
          addExerciseToWorkout(db, id, exercise.id, Date.now());
          router.back();
        }}
      />
    </>
  );
}
