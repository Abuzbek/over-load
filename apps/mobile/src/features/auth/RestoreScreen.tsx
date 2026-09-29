import { SYNCED_TABLES, type SyncedTable } from '@overload/schema';
import { Lucide } from '@react-native-vector-icons/lucide';
import { useEffect, useState, type ComponentProps } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RestoreProgress } from '../../sync/syncEngine';
import { restoreAccount, skipRestore, type RestoreState } from '../../sync/syncService';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';

type IconName = ComponentProps<typeof Lucide>['name'];

/** What the person waiting sees: several tables to one line, in the order they arrive. */
const STAGES: { label: string; icon: IconName; tables: SyncedTable[] }[] = [
  { label: 'Gyms', icon: 'dumbbell', tables: ['gyms', 'gym_equipment'] },
  { label: 'Custom exercises', icon: 'book-open', tables: ['exercises'] },
  { label: 'Programs', icon: 'calendar-range', tables: ['programs', 'program_days', 'cycle_plans'] },
  { label: 'Workouts', icon: 'clipboard-list', tables: ['workouts', 'workout_exercises', 'workout_sets'] },
  { label: 'History', icon: 'history', tables: ['sessions', 'session_exercises', 'session_sets'] },
  { label: 'Body metrics', icon: 'ruler', tables: ['weigh_ins', 'measurements', 'progress_photos'] },
  { label: 'Settings', icon: 'settings', tables: ['app_settings'] },
];

/** After this long, the way into the app without waiting appears. */
const SKIP_AFTER_MS = 10_000;

type StageStatus = 'done' | 'active' | 'waiting';

type StageRow = { label: string; icon: IconName; status: StageStatus; done: number; total: number };

/** Stages with something to restore, each finished, arriving now, or still to come. */
function stageRows(progress: RestoreProgress): StageRow[] {
  const current = SYNCED_TABLES.indexOf(progress.table);
  return STAGES.map((stage) => {
    const done = stage.tables.reduce((n, t) => n + progress.tables[t].done, 0);
    const total = stage.tables.reduce((n, t) => n + progress.tables[t].total, 0);
    const positions = stage.tables.map((t) => SYNCED_TABLES.indexOf(t));
    const status: StageStatus = Math.max(...positions) < current ? 'done' : Math.min(...positions) <= current ? 'active' : 'waiting';
    return { label: stage.label, icon: stage.icon, status, done, total };
  }).filter((row) => row.total > 0);
}

type Props = { restore: Exclude<RestoreState, { state: 'idle' }> };

/**
 * Shown after signing in on a phone that has no copy of the account yet,
 * while the first sync brings it all down. Never a dead end: it can be left
 * after a few seconds, or after a failure, and sync carries on as usual.
 */
export function RestoreScreen({ restore }: Props) {
  const insets = useSafeAreaInsets();
  const [canSkip, setCanSkip] = useState(false);

  useEffect(() => {
    if (restore.state !== 'restoring') return;
    setCanSkip(false);
    const id = setTimeout(() => setCanSkip(true), SKIP_AFTER_MS);
    return () => clearTimeout(id);
  }, [restore.state]);

  const padding = { paddingTop: insets.top + theme.spacing.xxl, paddingBottom: insets.bottom + theme.spacing.xl };

  if (restore.state === 'failed') {
    return (
      <View style={[styles.root, padding]}>
        <View style={styles.hero}>
          <Text variant="display">Couldn't reach your account</Text>
          <Text color="textMuted">
            Your training is safe in your account, but it could not be brought to this phone just now. Check the
            connection and try again, or continue and it will arrive once you are back online.
          </Text>
          <Text variant="caption" color="textMuted">{restore.error}</Text>
        </View>
        <View style={styles.buttons}>
          <Button title="Try again" onPress={() => void restoreAccount()} />
          <Button title="Continue offline" variant="secondary" onPress={skipRestore} />
        </View>
      </View>
    );
  }

  const progress = restore.progress;
  const fraction = progress && progress.total > 0 ? Math.min(progress.done / progress.total, 1) : null;
  const rows = progress ? stageRows(progress) : [];

  return (
    <View style={[styles.root, padding]}>
      <View style={styles.hero}>
        <Text variant="display">Restoring your training</Text>
        <Text color="textMuted">Bringing everything in your account to this phone. This only happens once.</Text>
      </View>

      <View style={styles.middle}>
        <View
          style={styles.meter}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Restoring your training"
          accessibilityValue={fraction === null ? undefined : { min: 0, max: 100, now: Math.round(fraction * 100) }}
        >
          {fraction === null ? (
            <ActivityIndicator color={theme.colors.text} />
          ) : (
            <>
              <Text variant="display" style={styles.percent}>{Math.round(fraction * 100)}%</Text>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${fraction * 100}%` }]} />
              </View>
              <Text variant="caption" color="textMuted">
                {progress!.done.toLocaleString()} of {progress!.total.toLocaleString()} items
              </Text>
            </>
          )}
        </View>

        {rows.length > 0 ? (
          <Card style={styles.stages}>
            {rows.map((row) => (
              <View key={row.label} style={styles.stage}>
                <Lucide name={row.icon} size={18} color={row.status === 'waiting' ? theme.colors.textMuted : theme.colors.text} />
                <Text style={styles.stageLabel} color={row.status === 'waiting' ? 'textMuted' : 'text'}>{row.label}</Text>
                {row.status === 'done' ? (
                  <Lucide name="circle-check" size={18} color={theme.colors.success} accessibilityLabel="Done" />
                ) : row.status === 'active' ? (
                  <Text variant="numeric" color="accent">{row.done.toLocaleString()} / {row.total.toLocaleString()}</Text>
                ) : (
                  <Text variant="numeric" color="textMuted">{row.total.toLocaleString()}</Text>
                )}
              </View>
            ))}
          </Card>
        ) : null}
      </View>

      <View style={styles.buttons}>
        {canSkip ? <Button title="Continue in the background" variant="secondary" onPress={skipRestore} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.xl,
    backgroundColor: theme.colors.background,
  },
  hero: { gap: theme.spacing.md },
  middle: { gap: theme.spacing.xxl },
  meter: { gap: theme.spacing.md, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  percent: { fontSize: 56, lineHeight: 64 },
  track: {
    alignSelf: 'stretch',
    height: 8,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceRaised,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: theme.radius.pill, backgroundColor: theme.colors.accent },
  stages: { gap: theme.spacing.lg },
  stage: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  stageLabel: { flex: 1 },
  buttons: { gap: theme.spacing.sm, minHeight: 48 },
});
