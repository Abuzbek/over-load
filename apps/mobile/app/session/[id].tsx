import { Stack, useLocalSearchParams } from 'expo-router';
import { ActiveSession } from '../../src/features/session/ActiveSession';

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ActiveSession sessionId={id} />
    </>
  );
}
