import { Stack, useLocalSearchParams } from 'expo-router';
import { WorkoutBuilder } from '../../src/features/workouts/WorkoutBuilder';

export default function WorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ title: 'Edit workout' }} />
      <WorkoutBuilder workoutId={id} />
    </>
  );
}
