import { Stack, router, useLocalSearchParams } from 'expo-router';
import { swapSessionExercise } from '../../../src/data/sessionRepo';
import { db } from '../../../src/db/client';
import { ExerciseList } from '../../../src/features/library/ExerciseList';

/** The whole library, each row a swap for the exercise `entry` (a session exercise) names. */
export default function SwapExerciseScreen() {
  const { entry, name } = useLocalSearchParams<{ id: string; entry: string; name: string }>();
  return (
    <>
      <Stack.Screen options={{ title: `Swapping with “${name}”` }} />
      <ExerciseList
        onSwap={(exerciseId) => {
          swapSessionExercise(db, entry, exerciseId, Date.now());
          router.back();
        }}
      />
    </>
  );
}
