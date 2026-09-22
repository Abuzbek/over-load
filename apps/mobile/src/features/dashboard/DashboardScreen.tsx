import { formatWeight, type PersonalRecordType } from '@overload/domain';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { periodTotals } from '../../data/historyRepo';
import { listAllPersonalRecords, type PersonalRecordSummary } from '../../data/sessionRepo';
import { getWeightUnit } from '../../data/settingsRepo';
import { db } from '../../db/client';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Screen } from '../../ui/Screen';
import { SectionLabel } from '../../ui/SectionLabel';
import { StatTile } from '../../ui/StatTile';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';

const WEEK_MS = 7 * 86_400_000;

/**
 * The reference design shows these three as progress rings against an "Active
 * Program" target. This app has routines but no program, so nothing defines a
 * weekly target and a ring would read 100% forever. Numbers until targets
 * exist; the ring is the easy part to add afterwards.
 */
function TotalsSlide({ width }: { width: number }) {
  const [allTime, setAllTime] = useState(false);
  const now = Date.now();
  const totals = periodTotals(db, allTime ? 0 : now - WEEK_MS, now);

  return (
    <View style={{ width }}>
      <Card>
        <Text variant="title">{allTime ? 'All workouts' : 'This week'}</Text>
        <View style={styles.tiles}>
          <StatTile label="Muscles" value={String(totals.muscles)} />
          <StatTile label="Sets" value={String(totals.sets)} />
          <StatTile label="Exercises" value={String(totals.exercises)} />
        </View>
        <View style={styles.toggle}>
          <Button
            title="This week"
            variant={allTime ? 'secondary' : 'primary'}
            onPress={() => setAllTime(false)}
          />
          <Button
            title="All workouts"
            variant={allTime ? 'primary' : 'secondary'}
            onPress={() => setAllTime(true)}
          />
        </View>
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
        <View style={styles.toggle}>
          {METRICS.map((m) => (
            <Button
              key={m.type}
              title={m.label}
              variant={m.type === metric ? 'primary' : 'secondary'}
              onPress={() => setMetric(m.type)}
            />
          ))}
        </View>
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
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  toggle: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.sm },
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
