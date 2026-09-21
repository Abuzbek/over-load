import type { Unit } from '@overload/domain';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { getWeightUnit, setWeightUnit } from '../../data/settingsRepo';
import { db } from '../../db/client';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';

const UNITS: Unit[] = ['kg', 'lb'];

export function SettingsScreen() {
  // Same pattern as every other screen in this app: a version bump forces a
  // re-read of the preference from SQLite rather than caching a local copy
  // of it, per the rule that only settingsRepo owns this value.
  const [, setVersion] = useState(0);
  const unit = getWeightUnit(db);

  useFocusEffect(
    useCallback(() => {
      setVersion((v) => v + 1);
    }, []),
  );

  function selectUnit(next: Unit) {
    if (next === unit) return;
    setWeightUnit(db, next, Date.now());
    setVersion((v) => v + 1);
  }

  return (
    <View style={styles.container}>
      <Text>Weight unit</Text>
      <View style={styles.segmented}>
        {UNITS.map((option) => {
          const active = option === unit;
          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={option === 'kg' ? 'Kilograms' : 'Pounds'}
              onPress={() => selectUnit(option)}
              style={[styles.segment, active && styles.segmentActive]}
            >
              <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>
                {option}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text variant="caption" color="textMuted">
        Weight is always stored in kilograms. This only changes how it is displayed.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: theme.spacing.lg, gap: theme.spacing.md },
  segmented: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.xs,
    gap: theme.spacing.xs,
  },
  segment: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.sm,
    alignItems: 'center',
  },
  segmentActive: { backgroundColor: theme.colors.accent },
  segmentLabel: { color: theme.colors.textMuted, fontWeight: '600' },
  segmentLabelActive: { color: '#FFFFFF' },
});
