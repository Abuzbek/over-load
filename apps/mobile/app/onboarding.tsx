import { Stack } from 'expo-router';
import { OnboardingFlow } from '../src/features/onboarding/OnboardingFlow';

export default function OnboardingRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <OnboardingFlow />
    </>
  );
}
