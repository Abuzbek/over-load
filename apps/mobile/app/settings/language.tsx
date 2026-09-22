import { Stack } from 'expo-router';
import { LanguageScreen } from '../../src/features/settings/LanguageScreen';

export default function LanguageRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Language' }} />
      <LanguageScreen />
    </>
  );
}
