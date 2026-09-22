import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { muscleLoad } from '../../data/historyRepo';
import { db } from '../../db/client';
import { Card } from '../../ui/Card';
import { Screen } from '../../ui/Screen';
import { SectionLabel } from '../../ui/SectionLabel';
import { Segmented } from '../../ui/Segmented';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';
import { MuscleHeatmap } from './MuscleHeatmap';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Sets per muscle per week that count as fully trained. Mid-range of the usual
 * hypertrophy recommendation, and the anchor the heatmap's colour is measured
 * against — it scales with the window so a month is not permanently red.
 */
const WEEKLY_TARGET_SETS = 12;

const WINDOWS = [
  { value: '7', label: '7 days', days: 7 },
  { value: '30', label: '30 days', days: 30 },
] as const;

export function ProgressScreen() {
  const [, setVersion] = useState(0);
  const [windowKey, setWindowKey] = useState<'7' | '30'>('7');

  useFocusEffect(useCallback(() => setVersion((v) => v + 1), []));

  const days = WINDOWS.find((w) => w.value === windowKey)!.days;
  const now = Date.now();
  const rows = muscleLoad(db, now - days * DAY_MS, now);
  const load = new Map(rows.map((r) => [r.muscle, r.sets]));
  const target = WEEKLY_TARGET_SETS * (days / 7);
  const hardest = rows[0]?.sets ?? 0;

  return (
    <Screen scroll safeTop>
      <Text variant="display">Progress</Text>

      <View style={styles.header}>
        <SectionLabel>Muscles worked</SectionLabel>
        <Segmented
          accessibilityLabel="Time window"
          value={windowKey}
          onChange={(v) => setWindowKey(v)}
          options={WINDOWS.map(({ value, label }) => ({ value, label }))}
        />
      </View>

      <Card>
        <MuscleHeatmap load={load} target={target} />
        <Text variant="caption" color="textMuted">
          {rows.length === 0
            ? 'Nothing logged in this window yet.'
            : `Full colour is ${Math.round(target)} sets. A secondary muscle counts half a set.`}
        </Text>
      </Card>

      {rows.length > 0 ? (
        <>
          <SectionLabel>By muscle</SectionLabel>
          <Card style={styles.list}>
            {rows.map((row) => (
              <View key={row.muscle} style={styles.bar}>
                <Text variant="body" style={styles.name}>{row.muscle}</Text>
                <View style={styles.track}>
                  <View
                    style={[
                      styles.fill,
                      { width: `${Math.max((row.sets / Math.max(hardest, 1)) * 100, 2)}%` },
                    ]}
                  />
                </View>
                <Text variant="caption" color="textMuted" style={styles.count}>
                  {row.sets % 1 === 0 ? row.sets : row.sets.toFixed(1)}
                </Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  list: { gap: theme.spacing.md },
  bar: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  name: { width: 96 },
  track: {
    flex: 1,
    height: 8,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceRaised,
    overflow: 'hidden',
  },
  fill: { height: 8, borderRadius: theme.radius.pill, backgroundColor: theme.colors.accent },
  count: { width: 32, textAlign: 'right' },
});
