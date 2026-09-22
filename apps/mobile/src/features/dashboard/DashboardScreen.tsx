import { formatWeight, type PersonalRecordType } from '@overload/domain';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { periodTotals } from '../../data/historyRepo';
import { listAllPersonalRecords, type PersonalRecordSummary } from '../../data/sessionRepo';
import { getWeightUnit } from '../../data/settingsRepo';
import { db } from '../../db/client';
import { Card } from '../../ui/Card';
import { ProgressRing } from '../../ui/ProgressRing';
import { Screen } from '../../ui/Screen';
import { SectionLabel } from '../../ui/SectionLabel';
import { Segmented } from '../../ui/Segmented';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';

const WEEK_MS = 7 * 86_400_000;

/**
 * Chart colours, deliberately local rather than theme tokens: three rings need
 * to be told apart, which is a charting concern, not part of the app's palette.
 */
const RING = { muscles: '#6E9BFF', sets: theme.colors.accent, exercises: '#4FD1C5' };

type Mode = 'week' | 'all';

/**
 * The reference design measures these against an "Active Program" target. This
 * app has routines, not programs — nothing defines a weekly goal. So "this
 * week" is measured against **last week**, which is real data and gives the
 * same "N left" shape. Swap the denominator when programs exist.
 */
function TotalsSlide({ width }: { width: number }) {
  const [mode, setMode] = useState<Mode>('week');
  const now = Date.now();

  const totals = periodTotals(db, mode === 'all' ? 0 : now - WEEK_MS, now);
  // Only needed for the comparison, so only queried in week mode.
  const prior = mode === 'week' ? periodTotals(db, now - 2 * WEEK_MS, now - WEEK_MS) : null;

  const ring = (value: number, target: number | undefined, size: number, color: string) => {
    const left = target && target > value ? target - value : 0;
    return (
      <ProgressRing
        value={value}
        target={target}
        size={size}
        color={color}
        caption={left > 0 ? `${left} left` : undefined}
      />
    );
  };

  const sub = (target: number | undefined) =>
    target === undefined ? ' ' : `${target} last week`;

  return (
    <View style={{ width }}>
      <Card>
        <Text variant="title">{mode === 'all' ? 'All workouts' : 'This week'}</Text>

        {/* Rings in one row so they share a centre line, labels in a second
            row so they share a baseline — a single column per metric makes the
            short columns float against the tall middle one. */}
        <View style={styles.rings}>
          {ring(totals.muscles, prior?.muscles, 86, RING.muscles)}
          {ring(totals.sets, prior?.sets, 128, RING.sets)}
          {ring(totals.exercises, prior?.exercises, 86, RING.exercises)}
        </View>
        <View style={styles.ringLabels}>
          {([['Muscles', prior?.muscles], ['Sets', prior?.sets], ['Exercises', prior?.exercises]] as const).map(
            ([label, target]) => (
              <View key={label} style={styles.ringLabel}>
                <Text variant="heading">{label}</Text>
                <Text variant="caption" color="textMuted">{sub(target)}</Text>
              </View>
            ),
          )}
        </View>

        <Segmented
          accessibilityLabel="Period"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'week', label: 'This week' },
            { value: 'all', label: 'All workouts' },
          ]}
        />
      </Card>
    </View>
  );
}

const METRICS: { type: PersonalRecordType; label: string; unit: 'weight' | 'plain' }[] = [
  { type: 'max_volume', label: 'Volume', unit: 'weight' },
  { type: 'max_reps', label: 'Reps', unit: 'plain' },
  { type: 'est_1rm', label: '1-RM', unit: 'weight' },
];

function RecordsSlide({ width }: { width: number }) {
  const [metric, setMetric] = useState<PersonalRecordType>('max_volume');
  const unit = getWeightUnit(db);
  const active = METRICS.find((m) => m.type === metric)!;

  // No query of its own: listAllPersonalRecords already holds every current
  // record, so the top seven is a filter, a sort and a slice.
  const top: PersonalRecordSummary[] = listAllPersonalRecords(db)
    .filter((r) => r.type === metric)
    .sort((a, b) => b.value - a.value)
    .slice(0, 7);

  const largest = top[0]?.value ?? 0;

  return (
    <View style={{ width }}>
      <Card>
        <Text variant="title">Recent records</Text>
        {top.length === 0 ? (
          <Text variant="caption" color="textMuted">
            Log a set and your records will show up here.
          </Text>
        ) : (
          top.map((r) => (
            <View key={`${r.exerciseName}-${r.type}`} style={styles.row}>
              <Text variant="caption" numberOfLines={1} style={styles.rowName}>
                {r.exerciseName}
              </Text>
              <View style={styles.barTrack}>
                {/* Relative to the largest of the seven, so the top bar always
                    fills. An absolute scale would leave every bar a stub. */}
                <View
                  style={[styles.barFill, { width: `${largest === 0 ? 0 : (r.value / largest) * 100}%` }]}
                />
              </View>
              <Text variant="numeric" style={styles.rowValue}>
                {active.unit === 'weight' ? formatWeight(r.value, unit) : String(r.value)}
              </Text>
            </View>
          ))
        )}
        <Segmented
          accessibilityLabel="Metric"
          value={metric}
          onChange={setMetric}
          options={METRICS.map((m) => ({ value: m.type, label: m.label }))}
        />
      </Card>
    </View>
  );
}

export function DashboardScreen() {
  // Same refresh pattern as every other screen: bump on focus so finishing a
  // workout elsewhere updates these numbers. Never key={version} — that
  // remounts and resets the carousel to slide one.
  const [, setVersion] = useState(0);
  const [slide, setSlide] = useState(0);
  useFocusEffect(useCallback(() => setVersion((v) => v + 1), []));

  const width = Dimensions.get('window').width - theme.spacing.lg * 2;

  return (
    <Screen scroll safeTop>
      <Text variant="display">Dashboard</Text>

      <ScrollView
        horizontal
        pagingEnabled
        // Screen's contentContainer sets flexGrow:1; without this the carousel
        // stretches to fill the screen and leaves a gap under the slide.
        style={styles.carousel}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) =>
          setSlide(Math.round(e.nativeEvent.contentOffset.x / width))
        }
      >
        <TotalsSlide width={width} />
        <RecordsSlide width={width} />
      </ScrollView>

      <View style={styles.dots}>
        {[0, 1].map((i) => (
          <View key={i} style={[styles.dot, i === slide && styles.dotOn]} />
        ))}
      </View>

      <SectionLabel>History</SectionLabel>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="All workouts"
        onPress={() => router.push('/history')}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <Card>
          <Text variant="heading">All workouts</Text>
          <Text variant="caption" color="textMuted">
            Every finished session, newest first.
          </Text>
        </Card>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  carousel: { flexGrow: 0 },
  rings: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm, marginVertical: theme.spacing.md },
  ringLabels: { flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm, marginBottom: theme.spacing.md },
  ringLabel: { alignItems: 'center', flex: 1, gap: theme.spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  rowName: { width: 96 },
  rowValue: { width: 82, textAlign: 'right' },
  barTrack: {
    flex: 1,
    height: 10,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.background,
    overflow: 'hidden',
  },
  barFill: { height: 10, borderRadius: theme.radius.sm, backgroundColor: theme.colors.accent },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: theme.spacing.sm },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.border },
  dotOn: { backgroundColor: theme.colors.accent },
  pressed: { opacity: 0.7 },
});
