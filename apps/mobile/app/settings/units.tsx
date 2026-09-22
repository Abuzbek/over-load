import { Stack } from 'expo-router';
import { UnitsScreen } from '../../src/features/settings/UnitsScreen';

export default function UnitsRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Units' }} />
      <UnitsScreen />
    </>
  );
}
