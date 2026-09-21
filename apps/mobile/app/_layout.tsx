import { Newsreader_600SemiBold } from '@expo-google-fonts/newsreader/600SemiBold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { initializeDatabase } from '../src/db/bootstrap';
import { FontsProvider } from '../src/ui/FontsContext';
import { Text } from '../src/ui/Text';
import { theme } from '../src/ui/theme';

type BootstrapError = Error & { restored?: boolean };

export default function RootLayout() {
  const [state, setState] = useState<{ ready: boolean; error?: BootstrapError }>({ ready: false });
  const [fontsLoaded, fontError] = useFonts({ Newsreader_600SemiBold });

  useEffect(() => {
    initializeDatabase()
      .then(() => setState({ ready: true }))
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
  if (!state.ready || (!fontsLoaded && !fontError)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.text} />
      </View>
    );
  }

  return (
    <FontsProvider serifLoaded={fontsLoaded && !fontError}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.text,
          headerTitleStyle: { color: theme.colors.text },
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        {/* headerShown: false is load-bearing. Without it the root Stack draws its
            own header above the Tabs navigator's, stacking two headers ("(tabs)"
            then the tab title) — seen on both iOS and Android. No test or bundle
            check catches this; it only shows up in a screenshot. */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </FontsProvider>
  );
}

const styles = StyleSheet.create({
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
