import { Stack } from 'expo-router';
import { AccountScreen } from '../../src/features/settings/AccountScreen';

export default function AccountRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Account' }} />
      <AccountScreen />
    </>
  );
}
