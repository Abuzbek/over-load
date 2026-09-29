import { formatWeight, kgToLb, repMaxes, startOfDay, type Unit } from '@overload/domain';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { exerciseStats } from '../../data/insightsRepo';
import { getWeightUnit } from '../../data/settingsRepo';
import { db } from '../../db/client';
import { Card } from '../../ui/Card';
import { LineChart } from '../../ui/Charts';
import { EmptyState } from '../../ui/EmptyState';
import { Segmented } from '../../ui/Segmented';
import { StatTile } from '../../ui/StatTile';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';

const DAY_MS = 86_400_000;
const RANGES = [
  { value: '30', label: '1M' },
  { value: '90', label: '3M' },
  { value: '365', label: '1Y' },
  { value: 'all', label: 'All' },
] as const;
type Range = (typeof RANGES)[number]['value'];
type Series = 'oneRepMaxKg' | 'volumeKg' | 'heaviestKg';

const volume = (kg: number, unit: Unit) => {
  const v = unit === 'lb' ? kgToLb(kg) : kg;
  return v >= 10_000 ? `${(v / 1000).toFixed(1)}k ${unit}` : `${Math.round(v)} ${unit}`;
};

/** One exercise over time: estimated rep maxes, a chart per session, and its totals for the range. */
export function ExerciseStatsScreen({ exerciseId }: { exerciseId: string }) {
  const insets = useSafeAreaInsets();
  const [range, setRange] = useState<Range>('all');
  const [series, setSeries] = useState<Series>('oneRepMaxKg');
  const unit = getWeightUnit(db);
  const now = Date.now();
  const since = range === 'all' ? 0 : startOfDay(now) - Number(range) * DAY_MS;
  const stats = exerciseStats(db, exerciseId, since, now);
  if (!stats) return <EmptyState title="Exercise not found" body="It may have been deleted." />;

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + theme.spacing.xxl }]}>
      <Stack.Screen options={{ title: stats.name }} />
      <Segmented accessibilityLabel="Range" value={range} onChange={setRange} options={[...RANGES]} />
      {stats.totalSets === 0 ? (
        <EmptyState title="Nothing in this range" body="Sessions with this exercise will show up here." />
      ) : (
        <>
          <Card>
            <Text variant="label" color="textMuted">Estimated maxes</Text>
            <View style={styles.row}>
              {repMaxes(stats.bestOneRepMaxKg).map((r) => (
                <StatTile key={r.reps} label={`${r.reps}RM`} value={formatWeight(r.kg, unit)} />
              ))}
            </View>
          </Card>
          <Card>
            <Segmented
              accessibilityLabel="Chart"
              value={series}
              onChange={setSeries}
              options={[
                { value: 'oneRepMaxKg', label: 'e1RM' },
                { value: 'heaviestKg', label: 'Heaviest' },
                { value: 'volumeKg', label: 'Volume' },
              ]}
            />
            <LineChart values={stats.series.map((p) => p[series])} height={160} />
            <Text variant="caption" color="textMuted">
              {stats.series.length} {stats.series.length === 1 ? 'session' : 'sessions'}, best per session
            </Text>
          </Card>
          <View style={styles.row}>
            <StatTile label="Total volume" value={volume(stats.totalVolumeKg, unit)} />
            <StatTile label="Best set volume" value={volume(stats.bestSetVolumeKg, unit)} />
          </View>
          <View style={styles.row}>
            <StatTile label="Heaviest" value={formatWeight(stats.heaviestKg, unit)} />
            <StatTile label="Best set reps" value={String(stats.bestSetReps)} />
          </View>
          <View style={styles.row}>
            <StatTile label="Total reps" value={String(stats.totalReps)} />
            <StatTile label="Total sets" value={String(stats.totalSets)} />
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: theme.spacing.lg, gap: theme.spacing.md },
  row: { flexDirection: 'row', gap: theme.spacing.md },
});
