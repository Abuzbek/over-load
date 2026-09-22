import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { discardWorkout, getActiveWorkoutId, startWorkoutFromRoutine } from '../../data/sessionRepo';
import { db } from '../../db/client';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';

/**
 * Starting a workout, with the one guard that must never be skipped.
 *
 * getActiveWorkoutId only ever returns the newest unfinished workout, so
 * silently starting a second one strands the first: no endedAt keeps it out of
 * history, and a newer sibling keeps it out of resume. Its sets then sit in
 * SQLite, invisible to every screen, forever.
 *
 * This lives in one place because it has two callers — the workout builder and
 * the active program's day list — and a guard copied per caller is a guard that
 * eventually gets missed.
 */
export function useWorkoutStarter() {
  const [pendingRoutineId, setPendingRoutineId] = useState<string | null>(null);
  const [blockingWorkoutId, setBlockingWorkoutId] = useState<string | null>(null);

  const launch = useCallback((routineId: string) => {
    setBlockingWorkoutId(null);
    setPendingRoutineId(null);
    const workoutId = startWorkoutFromRoutine(db, routineId, Date.now());
    router.push(`/session/${workoutId}`);
  }, []);

  const start = useCallback(
    (routineId: string) => {
      const active = getActiveWorkoutId(db);
      if (active) {
        setPendingRoutineId(routineId);
        setBlockingWorkoutId(active);
        return;
      }
      launch(routineId);
    },
    [launch],
  );

  const cancel = useCallback(() => {
    setBlockingWorkoutId(null);
    setPendingRoutineId(null);
  }, []);

  const resume = useCallback(() => {
    const active = blockingWorkoutId;
    cancel();
    if (active) router.push(`/session/${active}`);
  }, [blockingWorkoutId, cancel]);

  const discardAndStart = useCallback(() => {
    if (blockingWorkoutId) discardWorkout(db, blockingWorkoutId, Date.now());
    if (pendingRoutineId) launch(pendingRoutineId);
    else cancel();
  }, [blockingWorkoutId, pendingRoutineId, launch, cancel]);

  return { start, blockingWorkoutId, resume, discardAndStart, cancel };
}

/** Sheet, never Alert: Alert.prompt is iOS-only and this app ships Android. */
export function WorkoutStartSheet({ starter }: { starter: ReturnType<typeof useWorkoutStarter> }) {
  return (
    <Sheet
      visible={starter.blockingWorkoutId !== null}
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
