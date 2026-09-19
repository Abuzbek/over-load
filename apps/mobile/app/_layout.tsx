import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { initializeDatabase } from '../src/db/bootstrap';

export default function RootLayout() {
  const [state, setState] = useState<{ ready: boolean; error?: Error }>({ ready: false });

  useEffect(() => {
    initializeDatabase()
      .then(() => setState({ ready: true }))
      .catch((error: Error) => setState({ ready: false, error }));
  }, []);

  if (state.error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Database error</Text>
        <Text style={styles.errorBody}>{state.error.message}</Text>
        <Text style={styles.errorBody}>Your previous data was restored. Please restart the app.</Text>
      </View>
    );
  }

  if (!state.ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return <Stack />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  errorTitle: { fontSize: 18, fontWeight: '600' },
  errorBody: { textAlign: 'center', opacity: 0.7 },
});
