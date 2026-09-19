import { Stack } from 'expo-router';
import { ExerciseList } from '../src/features/library/ExerciseList';

export default function ExercisesScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Exercises' }} />
      <ExerciseList />
    </>
  );
}
