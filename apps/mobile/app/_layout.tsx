import { Newsreader_600SemiBold } from '@expo-google-fonts/newsreader/600SemiBold';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { useDrizzleStudio } from 'expo-drizzle-studio-plugin';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initializeDatabase } from '../src/db/bootstrap';
import { expoDb } from '../src/db/client';
import { SignInScreen } from '../src/features/auth/SignInScreen';
import { startSync, useSyncStatus } from '../src/sync/syncService';
import { FontsProvider } from '../src/ui/FontsContext';
import { Text } from '../src/ui/Text';
import { theme } from '../src/ui/theme';

/** Drizzle Studio on the device's database: press shift+m in `expo start`. */
function DrizzleStudio() {
  useDrizzleStudio(expoDb);
  return null;
}

type BootstrapError = Error & { restored?: boolean };

export default function RootLayout() {
  const [state, setState] = useState<{ ready: boolean; error?: BootstrapError }>({ ready: false });
  const [fontsLoaded, fontError] = useFonts({ Newsreader_600SemiBold });
  const sync = useSyncStatus();

  useEffect(() => {
    initializeDatabase()
      .then(() => {
        // After the database, never before: the first sync reads and writes it.
        startSync();
        setState({ ready: true });
      })
      .catch((error: BootstrapError) => setState({ ready: false, error }));
  }, []);

  if (state.error) {
    return (
      <View style={styles.center}>
        <Text variant="heading">Database error</Text>
        <Text color="textMuted" style={styles.errorBody}>
          {state.error.message}
        </Text>
        <Text color="textMuted" style={styles.errorBody}>
          {state.error.restored
            ? 'Your previous data was restored. Please restart the app.'
            : 'Please restart the app.'}
        </Text>
      </View>
    );
  }

  // Hold the splash only until the font resolves OR fails. A font is cosmetic;
  // it must never be able to brick launch, for the same reason the personal-record
  // rebuild is wrapped — see bd63d5b.
  // An account is required: with Firebase in the build, nothing shows until
  // someone is signed in. Waiting on authResolved keeps a signed-in user from
  // seeing the sign-in screen flash past on launch.
  const needsAccount = sync.enabled && !sync.account;
  // Firebase decides whether this account still onboards (syncService); wait
  // for that answer rather than flash the app or onboarding at it.
  const onboard = state.ready && !needsAccount && sync.onboarding === 'needed';
  const awaitingAccount = state.ready && !needsAccount && sync.onboarding === 'unknown';
  if (!state.ready || (!fontsLoaded && !fontError) || (sync.enabled && !sync.authResolved) || awaitingAccount) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.text} />
      </View>
    );
  }

  if (needsAccount) {
    return (
      <GestureHandlerRootView style={styles.root}>
        <FontsProvider serifLoaded={fontsLoaded && !fontError}>
          <SignInScreen />
        </FontsProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    // Gesture root and sheet provider wrap everything: a BottomSheetModal
    // presents above whichever screen asked for it.
    <GestureHandlerRootView style={styles.root}>
    <BottomSheetModalProvider>
    <FontsProvider serifLoaded={fontsLoaded && !fontError}>
      {__DEV__ && <DrizzleStudio />}
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.text,
          headerTitleStyle: { color: theme.colors.text },
          contentStyle: { backgroundColor: theme.colors.background },
          // The chevron alone: iOS otherwise labels it with the screen behind,
          // which for anything pushed from a tab is the group name "(tabs)".
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        {/* headerShown: false is load-bearing. Without it the root Stack draws its
            own header above the Tabs navigator's, stacking two headers ("(tabs)"
            then the tab title) — seen on both iOS and Android. No test or bundle
            check catches this; it only shows up in a screenshot. */}
        <Stack.Protected guard={!onboard}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        {/* Presentation is fixed when a native screen mounts, so it is declared
            here: set from inside the screen, the options were dropped whole. */}
        <Stack.Screen name="session/[id]/add-exercise" options={{ presentation: 'modal', title: 'Add exercises' }} />
        <Stack.Screen name="workouts/[id]/add-exercise" options={{ presentation: 'modal', title: 'Add exercises' }} />
        </Stack.Protected>
        {/* Until the account has onboarded, onboarding is the only way in. */}
        <Stack.Protected guard={onboard}>
          <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
        </Stack.Protected>
      </Stack>
    </FontsProvider>
    </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
    backgroundColor: theme.colors.background,
  },
  errorBody: { textAlign: 'center' },
});
