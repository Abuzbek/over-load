import { Stack } from 'expo-router';
import { SettingsScreen } from '../src/features/settings/SettingsScreen';

export default function Settings() {
  return (
    <>
      <Stack.Screen options={{ title: 'Settings' }} />
      <SettingsScreen />
    </>
  );
}
