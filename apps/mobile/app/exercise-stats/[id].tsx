import { Stack, useLocalSearchParams } from 'expo-router';
import { ExerciseStatsScreen } from '../../src/features/dashboard/ExerciseStatsScreen';

export default function ExerciseStatsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ title: 'Exercise' }} />
      <ExerciseStatsScreen exerciseId={id} />
    </>
  );
}
