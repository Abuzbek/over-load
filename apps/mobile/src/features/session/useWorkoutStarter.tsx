import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { discardSession, getActiveSessionId, startSessionFromWorkout } from '../../data/sessionRepo';
import { db } from '../../db/client';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';

/**
 * Starting a workout, with the one guard that must never be skipped.
 *
 * getActiveSessionId only ever returns the newest unfinished workout, so
 * silently starting a second one strands the first: no endedAt keeps it out of
 * history, and a newer sibling keeps it out of resume. Its sessionSets then sit in
 * SQLite, invisible to every screen, forever.
 *
 * This lives in one place because it has two callers — the workout builder and
 * the active program's day list — and a guard copied per caller is a guard that
 * eventually gets missed.
 */
export function useWorkoutStarter() {
  const [pendingWorkoutId, setPendingWorkoutId] = useState<string | null>(null);
  const [blockingSessionId, setBlockingWorkoutId] = useState<string | null>(null);

  const launch = useCallback((workoutId: string) => {
    setBlockingWorkoutId(null);
    setPendingWorkoutId(null);
    const sessionId = startSessionFromWorkout(db, workoutId, Date.now());
    router.push(`/session/${sessionId}`);
  }, []);

  const start = useCallback(
    (workoutId: string) => {
      const active = getActiveSessionId(db);
      if (active) {
        setPendingWorkoutId(workoutId);
        setBlockingWorkoutId(active);
        return;
      }
      launch(workoutId);
    },
    [launch],
  );

  const cancel = useCallback(() => {
    setBlockingWorkoutId(null);
    setPendingWorkoutId(null);
  }, []);

  const resume = useCallback(() => {
    const active = blockingSessionId;
    cancel();
    if (active) router.push(`/session/${active}`);
  }, [blockingSessionId, cancel]);

  const discardAndStart = useCallback(() => {
    if (blockingSessionId) discardSession(db, blockingSessionId, Date.now());
    if (pendingWorkoutId) launch(pendingWorkoutId);
    else cancel();
  }, [blockingSessionId, pendingWorkoutId, launch, cancel]);

  return { start, blockingSessionId, resume, discardAndStart, cancel };
}

/** Sheet, never Alert: Alert.prompt is iOS-only and this app ships Android. */
export function WorkoutStartSheet({ starter }: { starter: ReturnType<typeof useWorkoutStarter> }) {
  return (
    <Sheet
      visible={starter.blockingSessionId !== null}
      onRequestClose={starter.cancel}
      title="A workout is already in progress"
      body="Resume it, or discard it and start this workout instead. Discarding keeps nothing from the unfinished workout."
    >
      <Button title="Resume it" onPress={starter.resume} />
      <Button title="Discard it and start" variant="secondary" onPress={starter.discardAndStart} />
      <Button title="Cancel" variant="secondary" onPress={starter.cancel} />
    </Sheet>
  );
}
