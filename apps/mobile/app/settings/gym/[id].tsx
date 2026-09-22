import { Stack, useLocalSearchParams } from 'expo-router';
import { GymDetailScreen } from '../../../src/features/settings/GymDetailScreen';

export default function GymDetailRoute() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  return (
    <>
      <Stack.Screen options={{ title: name ?? 'Gym' }} />
      <GymDetailScreen gymId={id} />
    </>
  );
}
