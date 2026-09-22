import { Stack } from 'expo-router';
import { GymProfilesScreen } from '../../src/features/settings/GymProfilesScreen';

export default function GymProfilesRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Gym Profiles' }} />
      <GymProfilesScreen />
    </>
  );
}
