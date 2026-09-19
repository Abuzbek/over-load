import { Stack, useLocalSearchParams } from 'expo-router';
import { RoutineBuilder } from '../../src/features/routines/RoutineBuilder';

export default function RoutineScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ title: 'Edit routine' }} />
      <RoutineBuilder routineId={id} />
    </>
  );
}
