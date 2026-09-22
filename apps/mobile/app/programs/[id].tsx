import { Stack, useLocalSearchParams } from 'expo-router';
import { ProgramWeekScreen } from '../../src/features/programs/ProgramWeekScreen';

export default function ProgramWeekRoute() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  return (
    <>
      <Stack.Screen options={{ title: name ?? 'Program' }} />
      <ProgramWeekScreen programId={id} />
    </>
  );
}
