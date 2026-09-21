import { Newsreader_600SemiBold, useFonts } from '@expo-google-fonts/newsreader';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { initializeDatabase } from '../src/db/bootstrap';
import { FontsProvider } from '../src/ui/FontsContext';
import { theme } from '../src/ui/theme';
import { textStyle } from '../src/ui/typography';

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
        <Text style={styles.errorTitle}>Database error</Text>
        <Text style={styles.errorBody}>{state.error.message}</Text>
        <Text style={styles.errorBody}>
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
      />
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
  errorTitle: { ...textStyle('heading', false), color: theme.colors.text },
  errorBody: { ...textStyle('body', false), textAlign: 'center', color: theme.colors.textMuted },
});
