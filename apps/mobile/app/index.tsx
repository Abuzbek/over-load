import { Link, router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { discardWorkout, getActiveWorkoutId, startEmptyWorkout } from '../src/data/sessionRepo';
import { db } from '../src/db/client';
import { Button } from '../src/ui/Button';
import { Text } from '../src/ui/Text';
import { theme } from '../src/ui/theme';

export default function HomeScreen() {
  // A local counter is the refresh signal: bumping it forces a re-read of
  // getActiveWorkoutId. useFocusEffect bumps it whenever this screen regains
  // focus, since starting or finishing a workout happens on another screen
  // that navigates back here via router.back()/push, leaving this screen
  // mounted underneath rather than remounting it.
  const [, setVersion] = useState(0);
  const activeWorkoutId = getActiveWorkoutId(db);

  // The unfinished workout that blocks starting a new empty one — same
  // stranding hazard RoutineBuilder guards against: getActiveWorkoutId only
  // ever returns the newest unfinished workout, so starting a second one
  // silently strands the first. Mirrors RoutineBuilder's resume/discard/cancel
  // modal rather than Alert.alert, since Alert's button semantics are iOS-shaped.
  const [blockingWorkoutId, setBlockingWorkoutId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      setVersion((v) => v + 1);
    }, []),
  );

  const startEmpty = useCallback(() => {
    setBlockingWorkoutId(null);
    const workoutId = startEmptyWorkout(db, 'Empty workout', Date.now());
    router.push(`/session/${workoutId}`);
  }, []);

  const onStartEmptyPressed = useCallback(() => {
    const active = getActiveWorkoutId(db);
    if (active) {
      setBlockingWorkoutId(active);
      return;
    }
    startEmpty();
  }, [startEmpty]);

  const onResume = useCallback(() => {
    const active = blockingWorkoutId;
    setBlockingWorkoutId(null);
    if (active) router.push(`/session/${active}`);
  }, [blockingWorkoutId]);

  const onDiscardAndStart = useCallback(() => {
    if (blockingWorkoutId) discardWorkout(db, blockingWorkoutId, Date.now());
    startEmpty();
  }, [blockingWorkoutId, startEmpty]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Overload' }} />

      {activeWorkoutId ? (
        <View style={styles.resume}>
          <Text>You have a workout in progress.</Text>
          <Button title="Resume workout" onPress={() => router.push(`/session/${activeWorkoutId}`)} />
        </View>
      ) : null}

      <Link href="/routines" asChild>
        <Button title="Routines" onPress={() => {}} />
      </Link>
      <Button title="Start empty workout" variant="secondary" onPress={onStartEmptyPressed} />
      <Link href="/history" asChild>
        <Button title="History" onPress={() => {}} />
      </Link>
      <Link href="/records" asChild>
        <Button title="Records" onPress={() => {}} />
      </Link>
      <Link href="/exercises" asChild>
        <Button title="Browse exercises" onPress={() => {}} />
      </Link>
      <Link href="/settings" asChild>
        <Button title="Settings" variant="secondary" onPress={() => {}} />
      </Link>

      <Modal
        visible={blockingWorkoutId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setBlockingWorkoutId(null)}
      >
        <View style={styles.backdrop}>
          <View style={styles.modalCard}>
            <Text variant="title">A workout is already in progress</Text>
            <Text color="textMuted">
              Resume it, or discard it and start an empty workout instead. Discarding keeps
              nothing from the unfinished workout.
            </Text>
            <Button title="Resume it" onPress={onResume} />
            <Button title="Discard it and start" variant="secondary" onPress={onDiscardAndStart} />
            <Button title="Cancel" variant="secondary" onPress={() => setBlockingWorkoutId(null)} />
          </View>
        </View>
      </Modal>
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
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  modalCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
});
