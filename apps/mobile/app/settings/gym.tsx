import { Stack } from 'expo-router';
import { GymScreen } from '../../src/features/settings/GymScreen';

export default function GymRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Gym' }} />
      <GymScreen />
    </>
  );
}
