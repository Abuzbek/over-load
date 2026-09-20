import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { initializeDatabase } from '../src/db/bootstrap';
import { theme } from '../src/ui/theme';

type BootstrapError = Error & { restored?: boolean };

export default function RootLayout() {
  const [state, setState] = useState<{ ready: boolean; error?: BootstrapError }>({ ready: false });

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

  if (!state.ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.text} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.text,
        headerTitleStyle: { color: theme.colors.text },
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    />
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
  errorTitle: { fontSize: 18, fontWeight: '600', color: theme.colors.text },
  errorBody: { textAlign: 'center', opacity: 0.7, color: theme.colors.textMuted },
});
