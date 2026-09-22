import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { getActiveSession } from '../../data/sessionRepo';
import { db } from '../../db/client';

/**
 * The active workout plus a live elapsed time.
 *
 * Elapsed is derived from startedAt on every tick rather than accumulated,
 * for the same reason the rest timer is: an interval stops when the OS
 * suspends the app, a timestamp does not.
 *
 * The interval only runs while a workout exists. An always-on ticker behind
 * every tab is battery spend for nothing.
 */
export function useActiveWorkout() {
  // Unbound state value — the setter only needs to trigger a re-render so
  // getActiveSession below re-queries on focus; nothing reads the count itself.
  const [, refresh] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useFocusEffect(
    useCallback(() => {
      refresh((v) => v + 1);
    }, []),
  );

  const workout = getActiveSession(db);

  useEffect(() => {
    if (!workout) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [workout?.id]);

  return { workout, elapsedMs: workout ? nowMs - workout.startedAt : 0 };
}
