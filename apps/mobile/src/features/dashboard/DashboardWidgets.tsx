import {
  formatWeight,
  kgToLb,
  addWeeks,
  startOfDay,
  startOfWeek,
  weeklyRate,
  weightTrend,
  workoutStreak,
  type Unit,
} from '@overload/domain';
import { Lucide } from '@react-native-vector-icons/lucide';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  dailySets,
  exerciseTiles,
  listWeighIns,
  toPoints,
  topExercises,
  weeklyWork,
  weighInDays,
  workoutTimes,
} from '../../data/insightsRepo';
import { getWeightUnit } from '../../data/settingsRepo';
import { db } from '../../db/client';
import { Card } from '../../ui/Card';
import { BarChart, LineChart } from '../../ui/Charts';
import { SectionLabel } from '../../ui/SectionLabel';
import { Segmented } from '../../ui/Segmented';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';
import { MonthGrid } from '../../ui/MonthGrid';
import { WeightSheet } from '../body/BodySheets';

const DAY_MS = 86_400_000;
/** Volume a movement's bodyweight share lifts, stacked on the loaded volume. */
const BODYWEIGHT_COLOR = '#6E9BFF';

/** "12.4k kg": volume runs to five figures, a card has room for four. */
function formatVolume(kg: number, unit: Unit): string {
  const v = unit === 'lb' ? kgToLb(kg) : kg;
  return v >= 10_000 ? `${(v / 1000).toFixed(1)}k ${unit}` : `${Math.round(v)} ${unit}`;
}

function formatRate(kgPerWeek: number, unit: Unit): string {
  const v = unit === 'lb' ? kgToLb(kgPerWeek) : kgPerWeek;
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)} ${unit}/wk`;
}

/** Working sets a day for each shade, lightest first: a light session, a normal one, a big one, a very big one. */
const HEAT_STEPS = [1, 6, 14, 22];
const HEAT = ['#E8834A40', '#E8834A80', '#E8834AC0', '#E8834A'];
const CELL = 13;
const CELL_GAP = 3;
const LABEL_WIDTH = 16;

const heatColor = (sets: number) => {
  let level = -1;
  HEAT_STEPS.forEach((step, i) => {
    if (sets >= step) level = i;
  });
  return level < 0 ? theme.colors.surfaceRaised : HEAT[level]!;
};

/**
 * The habits heatmap, GitHub-style: a column a week, oldest on the left, a row
 * a weekday from Monday, each day shaded by its working sets. As many weeks as
 * the card is wide. Tapping it opens the Habits page's calendar.
 */
export function HabitsCard() {
  const [width, setWidth] = useState(0);
  const now = Date.now();
  const today = startOfDay(now);
  const weeks = Math.max(Math.floor((width - LABEL_WIDTH + CELL_GAP) / (CELL + CELL_GAP)), 1);
  const first = addWeeks(startOfWeek(now), -(weeks - 1));
  const sets = dailySets(db, first, now);
  const streak = workoutStreak(workoutTimes(db, 0, now), now);
  const days = [...sets.values()].filter((n) => n > 0).length;
  const columns = Array.from({ length: weeks }, (_, w) => {
    const monday = addWeeks(first, w);
    return Array.from({ length: 7 }, (_, d) => {
      const date = new Date(monday);
      date.setDate(date.getDate() + d);
      return date.getTime();
    });
  });
  // A month's name over the week its 1st falls in, if the last label is far enough back to fit.
  let lastLabel = -3;
  const labels = columns.map((col, i) => {
    const firstOfMonth = col.find((day) => new Date(day).getDate() === 1);
    if ((firstOfMonth === undefined && i > 0) || i - lastLabel < 3) return null;
    lastLabel = i;
    return new Date(firstOfMonth ?? col[0]!).toLocaleDateString(undefined, { month: 'short' });
  });

  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Habits, open the calendar" onPress={() => router.push('/habits')} style={({ pressed }) => pressed && styles.pressed}>
      <Card>
        <View style={styles.head}>
          <Text variant="title" style={styles.flex}>Habits</Text>
          <Lucide name="chevron-right" size={20} color={theme.colors.textMuted} />
        </View>
        <Text variant="caption" color="textMuted">
          {streak.current > 0 ? `${streak.current}-week streak` : 'No streak yet'} · best {streak.longest} {streak.longest === 1 ? 'week' : 'weeks'} · {days} {days === 1 ? 'day' : 'days'} trained
        </Text>
        <View onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))} style={styles.heat}>
          {width > 0 ? (
            <>
              <View style={styles.heatRow}>
                <View style={{ width: LABEL_WIDTH }} />
                {labels.map((label, i) => (
                  <View key={i} style={styles.heatCol}>
                    {label ? <Text variant="caption" color="textMuted" numberOfLines={1} style={styles.heatMonth}>{label}</Text> : null}
                  </View>
                ))}
              </View>
              <View style={styles.heatRow}>
                <View style={{ width: LABEL_WIDTH, gap: CELL_GAP }}>
                  {['M', '', 'W', '', 'F', '', ''].map((d, i) => (
                    <Text key={i} variant="caption" color="textMuted" style={styles.heatDay}>{d}</Text>
                  ))}
                </View>
                {columns.map((col, i) => (
                  <View key={i} style={[styles.heatCol, { gap: CELL_GAP }]}>
                    {col.map((day) => (
                      <View
                        key={day}
                        style={[
                          styles.heatCell,
                          { backgroundColor: day > today ? 'transparent' : heatColor(sets.get(day) ?? 0) },
                          day === today && styles.heatToday,
                        ]}
                      />
                    ))}
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </View>
        <View style={[styles.legend, styles.heatLegend]}>
          <Text variant="caption" color="textMuted">Less</Text>
          {[theme.colors.surfaceRaised, ...HEAT].map((c) => (
            <View key={c} style={[styles.heatCell, { backgroundColor: c }]} />
          ))}
          <Text variant="caption" color="textMuted">More</Text>
        </View>
      </Card>
    </Pressable>
  );
}

/**
 * A month's training days and weigh-ins, and the streak of weeks trained — the
 * Habits page. A day is filled when a workout was finished on it, dotted when
 * weight was logged; tapping a day logs weight for it.
 */
export function HabitsCalendar({ onChanged }: { onChanged: () => void }) {
  const [logDay, setLogDay] = useState<number | null>(null);
  const now = Date.now();
  const trained = new Set(workoutTimes(db, 0, now).map(startOfDay));
  const weighed = weighInDays(db, 0, now);
  const streak = workoutStreak(workoutTimes(db, 0, now), now);

  return (
    <Card>
      <MonthGrid
        action="log weight"
        mark={(day) => ({ filled: trained.has(day), dot: weighed.has(day) })}
        onPick={setLogDay}
      />
      <Text variant="caption" color="textMuted">
        {streak.current > 0 ? `${streak.current}-week streak` : 'No streak yet'} · best {streak.longest} {streak.longest === 1 ? 'week' : 'weeks'}
      </Text>
      <View style={styles.legend}>
        <View style={[styles.legendSwatch, { backgroundColor: theme.colors.accent }]} />
        <Text variant="caption" color="textMuted">Workout</Text>
        <View style={[styles.weighDot, styles.weighDotOn]} />
        <Text variant="caption" color="textMuted">Weigh-in · tap a day to log</Text>
      </View>
      <WeightSheet visible={logDay !== null} initialDay={logDay ?? undefined} onClose={() => setLogDay(null)} onSaved={onChanged} />
    </Card>
  );
}

const RANGES = [
  { value: '30', label: '1M' },
  { value: '90', label: '3M' },
  { value: '365', label: '1Y' },
  { value: 'all', label: 'All' },
] as const;
type Range = (typeof RANGES)[number]['value'];

/** The smoothed bodyweight trend, its weekly rate, and the day's weigh-ins behind it. */
export function WeightCard({ onChanged }: { onChanged: () => void }) {
  const [range, setRange] = useState<Range>('90');
  const [logging, setLogging] = useState(false);
  const unit = getWeightUnit(db);
  const now = Date.now();
  // The trend runs over everything logged, so a short range starts mid-trend rather than cold.
  const trend = weightTrend(toPoints(listWeighIns(db)));
  const since = range === 'all' ? 0 : startOfDay(now) - Number(range) * DAY_MS;
  const shown = trend.filter((p) => p.day >= since);
  const latest = trend.at(-1);
  const rate = weeklyRate(trend);

  return (
    <Card>
      <View style={styles.head}>
        <Text variant="title" style={styles.flex}>Weight trend</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Log weight" hitSlop={8} onPress={() => setLogging(true)} style={styles.iconButton}>
          <Lucide name="plus" size={18} color={theme.colors.text} />
        </Pressable>
      </View>
      {latest ? (
        <>
          <View style={styles.figures}>
            <Text variant="numeric" style={styles.big}>{formatWeight(latest.trendKg, unit)}</Text>
            <Text variant="caption" color="textMuted">{rate === null ? 'Log a few days to see a rate' : formatRate(rate, unit)}</Text>
          </View>
          <LineChart values={shown.map((p) => p.trendKg)} dots={shown.map((p) => p.kg)} />
          <Segmented accessibilityLabel="Range" value={range} onChange={setRange} options={[...RANGES]} />
        </>
      ) : (
        <Text variant="caption" color="textMuted">Log your weight and the trend shows here, smoothed so one day's water does not move it.</Text>
      )}
      <WeightSheet visible={logging} onClose={() => setLogging(false)} onSaved={onChanged} />
    </Card>
  );
}

const WEEKS = [
  { value: '5', label: '1M' },
  { value: '13', label: '3M' },
  { value: '52', label: '1Y' },
] as const;

/** Sets or volume a week, and the exercises that made up most of it. */
export function InsightsCard() {
  const [metric, setMetric] = useState<'sets' | 'volume'>('sets');
  const [weeks, setWeeks] = useState<(typeof WEEKS)[number]['value']>('13');
  const unit = getWeightUnit(db);
  const now = Date.now();
  const work = weeklyWork(db, Number(weeks), now);
  const top = topExercises(db, work[0]!.weekStart, now, metric);
  const total = work.reduce((a, w) => a + (metric === 'sets' ? w.sets : w.loadKg + w.bodyweightKg), 0);
  const perWeek = total / work.length;
  const show = (v: number) => (metric === 'sets' ? `${Math.round(v)}` : formatVolume(v, unit));

  return (
    <Card>
      <Text variant="title">Workouts</Text>
      <View style={styles.figures}>
        <Text variant="numeric" style={styles.big}>{show(perWeek)}</Text>
        <Text variant="caption" color="textMuted">{metric === 'sets' ? 'sets' : 'volume'} a week on average · {show(total)} in all</Text>
      </View>
      <BarChart values={work.map((w) => (metric === 'sets' ? [w.sets] : [w.loadKg, w.bodyweightKg]))} stackColor={BODYWEIGHT_COLOR} />
      <Text variant="caption" color="textMuted">
        {`Week of ${new Date(work[0]!.weekStart).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} to this week`}
      </Text>
      {metric === 'volume' ? (
        <View style={styles.legend}>
          <View style={[styles.legendSwatch, { backgroundColor: theme.colors.accent }]} />
          <Text variant="caption" color="textMuted">Load</Text>
          <View style={[styles.legendSwatch, { backgroundColor: BODYWEIGHT_COLOR }]} />
          <Text variant="caption" color="textMuted">Bodyweight</Text>
        </View>
      ) : null}
      <View style={styles.segments}>
        <View style={styles.flex}>
          <Segmented accessibilityLabel="Metric" value={metric} onChange={setMetric} options={[{ value: 'sets', label: 'Sets' }, { value: 'volume', label: 'Volume' }]} />
        </View>
        <View style={styles.flex}>
          <Segmented accessibilityLabel="Range" value={weeks} onChange={setWeeks} options={[...WEEKS]} />
        </View>
      </View>
      {top.length > 0 ? (
        <View style={styles.top}>
          <Text variant="label" color="textMuted">Top exercises</Text>
          {top.map((e) => (
            <Pressable
              key={e.exerciseId}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/exercise-stats/[id]', params: { id: e.exerciseId } })}
              style={({ pressed }) => [styles.topRow, pressed && styles.pressed]}
            >
              <Text numberOfLines={1} style={styles.flex}>{e.name}</Text>
              <Text variant="numeric" color="textMuted">{metric === 'sets' ? `${e.sets} sets` : formatVolume(e.volumeKg, unit)}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

/** The exercises trained most recently: each a tile with its estimated max and its last sessions' trend. */
export function ExerciseTilesRow() {
  const unit = getWeightUnit(db);
  const tiles = exerciseTiles(db, Date.now());
  if (tiles.length === 0) return null;
  return (
    <>
    <SectionLabel>Exercises</SectionLabel>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tiles}>
      {tiles.map((t) => {
        const latest = t.series.at(-1)!.oneRepMaxKg;
        const first = t.series[0]!.oneRepMaxKg;
        const change = first > 0 ? latest / first - 1 : 0;
        return (
          <Pressable
            key={t.exerciseId}
            accessibilityRole="button"
            accessibilityLabel={`${t.name}, estimated one-rep max ${formatWeight(latest, unit)}`}
            onPress={() => router.push({ pathname: '/exercise-stats/[id]', params: { id: t.exerciseId } })}
            style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
          >
            <Text variant="heading" numberOfLines={2} style={styles.tileName}>{t.name}</Text>
            <Text variant="numeric">{formatWeight(latest, unit)}</Text>
            <Text variant="caption" color={change > 0 ? 'success' : 'textMuted'}>
              e1RM {t.series.length > 1 ? `${change >= 0 ? '+' : '−'}${Math.abs(change * 100).toFixed(1)}%` : ''}
            </Text>
            <LineChart values={t.series.map((p) => p.oneRepMaxKg)} height={40} bare />
          </Pressable>
        );
      })}
    </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: theme.spacing.sm },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', paddingBottom: theme.spacing.xs },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 3, gap: 2 },
  dayCircle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  dayTrained: { backgroundColor: theme.colors.accent },
  dayToday: { borderWidth: 1.5, borderColor: theme.colors.text },
  weighDot: { width: 5, height: 5, borderRadius: 2.5 },
  weighDotOn: { backgroundColor: BODYWEIGHT_COLOR },
  legend: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  legendSwatch: { width: 10, height: 10, borderRadius: 5 },
  iconButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  figures: { gap: 2 },
  big: { fontSize: 26, lineHeight: 32 },
  segments: { flexDirection: 'row', gap: theme.spacing.sm },
  top: { gap: theme.spacing.xs, marginTop: theme.spacing.sm },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingVertical: 6 },
  tiles: { gap: theme.spacing.md },
  tile: { width: 150, backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: theme.spacing.lg, gap: theme.spacing.xs },
  tileName: { minHeight: 40 },
  pressed: { opacity: 0.7 },
  heat: { marginTop: theme.spacing.sm, gap: CELL_GAP },
  heatRow: { flexDirection: 'row', gap: CELL_GAP },
  heatCol: { width: CELL },
  heatMonth: { width: 40, fontSize: 11 },
  heatDay: { height: CELL, fontSize: 9, lineHeight: CELL },
  heatCell: { width: CELL, height: CELL, borderRadius: 3 },
  heatToday: { borderWidth: 1, borderColor: theme.colors.text },
  heatLegend: { justifyContent: 'flex-end', gap: CELL_GAP },
});
