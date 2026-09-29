import { Stack, useLocalSearchParams } from 'expo-router';
import { ProgramSettingsScreen } from '../../../src/features/programs/ProgramSettingsScreen';

export default function ProgramSettingsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ title: 'Program settings' }} />
      <ProgramSettingsScreen programId={id} />
    </>
  );
}
