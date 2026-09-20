import { Link, router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getActiveWorkoutId } from '../src/data/sessionRepo';
import { db } from '../src/db/client';
import { Button } from '../src/ui/Button';
import { theme } from '../src/ui/theme';

export default function HomeScreen() {
  // A local counter is the refresh signal: bumping it forces a re-read of
  // getActiveWorkoutId. useFocusEffect bumps it whenever this screen regains
  // focus, since starting or finishing a workout happens on another screen
  // that navigates back here via router.back()/push, leaving this screen
  // mounted underneath rather than remounting it.
  const [, setVersion] = useState(0);
  const activeWorkoutId = getActiveWorkoutId(db);

  useFocusEffect(
    useCallback(() => {
      setVersion((v) => v + 1);
    }, []),
  );

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Workouts' }} />

      {activeWorkoutId ? (
        <View style={styles.resume}>
          <Text style={styles.resumeText}>You have a workout in progress.</Text>
          <Button title="Resume workout" onPress={() => router.push(`/session/${activeWorkoutId}`)} />
        </View>
      ) : null}

      <Link href="/routines" asChild>
        <Button title="Routines" onPress={() => {}} />
      </Link>
      <Link href="/history" asChild>
        <Button title="History" onPress={() => {}} />
      </Link>
      <Link href="/exercises" asChild>
        <Button title="Browse exercises" onPress={() => {}} />
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: theme.spacing.lg, gap: theme.spacing.md },
  resume: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  resumeText: { ...theme.text.body, color: theme.colors.text },
});
