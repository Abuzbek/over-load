import { Stack } from 'expo-router';
import { SyncScreen } from '../../src/features/settings/SyncScreen';

export default function SyncRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Backup & sync' }} />
      <SyncScreen />
    </>
  );
}
