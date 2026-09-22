import { Stack, useLocalSearchParams } from 'expo-router';
import { ProgramDaysScreen } from '../../src/features/programs/ProgramDaysScreen';

export default function ProgramDaysRoute() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  return (
    <>
      <Stack.Screen options={{ title: name ?? 'Program' }} />
      <ProgramDaysScreen programId={id} programName={name ?? 'Program'} />
    </>
  );
}
