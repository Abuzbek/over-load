import { Stack } from 'expo-router';
import { RoutineList } from '../../src/features/routines/RoutineList';

export default function RoutinesScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Routines' }} />
      <RoutineList />
    </>
  );
}
