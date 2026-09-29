import { Stack, useLocalSearchParams } from 'expo-router';
import { WorkoutBuilder } from '../../src/features/workouts/WorkoutBuilder';

export default function WorkoutScreen() {
  const { id, cycle } = useLocalSearchParams<{ id: string; cycle?: string }>();
  return (
    <>
      <Stack.Screen options={{ title: 'Edit workout' }} />
      <WorkoutBuilder workoutId={id} cycle={cycle ? Number(cycle) : null} />
    </>
  );
}
