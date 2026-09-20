import { Stack, useLocalSearchParams } from 'expo-router';
import { WorkoutDetailView } from '../../src/features/history/WorkoutDetailView';

export default function WorkoutHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ title: 'Workout' }} />
      <WorkoutDetailView workoutId={id} />
    </>
  );
}
