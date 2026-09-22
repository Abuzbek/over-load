import { Stack } from 'expo-router';
import { ProgramsScreen } from '../../src/features/programs/ProgramsScreen';

export default function ProgramsRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Programs' }} />
      <ProgramsScreen />
    </>
  );
}
