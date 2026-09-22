import type { DistanceUnit, Unit } from '@overload/domain';
import type { HeightUnit } from '@overload/schema';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  getDistanceUnit,
  getHeightUnit,
  getWeightUnit,
  setDistanceUnit,
  setHeightUnit,
  setWeightUnit,
} from '../../data/settingsRepo';
import { db } from '../../db/client';
import { Card } from '../../ui/Card';
import { ListRow } from '../../ui/ListRow';
import { Screen } from '../../ui/Screen';
import { Segmented } from '../../ui/Segmented';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';

export function UnitsScreen() {
  // A version bump forces a re-read from SQLite rather than caching a local
  // copy, per the rule that only settingsRepo owns these values.
  const [, setVersion] = useState(0);
  const unit = getWeightUnit(db);
  const distanceUnit = getDistanceUnit(db);
  const heightUnit = getHeightUnit(db);

  useFocusEffect(
    useCallback(() => {
      setVersion((v) => v + 1);
    }, []),
  );

  function selectWeight(next: Unit) {
    if (next === unit) return;
    setWeightUnit(db, next, Date.now());
    setVersion((v) => v + 1);
  }

  function selectHeight(next: HeightUnit) {
    if (next === heightUnit) return;
    setHeightUnit(db, next, Date.now());
    setVersion((v) => v + 1);
  }

  function selectDistance(next: DistanceUnit) {
    if (next === distanceUnit) return;
    setDistanceUnit(db, next, Date.now());
    setVersion((v) => v + 1);
  }

  return (
    <Screen scroll>
      <View style={styles.section}>
        <Card style={styles.rows}>
          <ListRow
            title="Weight"
            right={
              <Segmented
                accessibilityLabel="Weight unit"
                value={unit}
                onChange={selectWeight}
                options={[
                  { value: 'kg', label: 'kg' },
                  { value: 'lb', label: 'lb' },
                ]}
              />
            }
          />
          <ListRow
            title="Distance"
            right={
              <Segmented
                accessibilityLabel="Distance unit"
                value={distanceUnit}
                onChange={selectDistance}
                options={[
                  { value: 'km', label: 'km' },
                  { value: 'mi', label: 'mi' },
                ]}
              />
            }
          />
          <ListRow
            title="Height"
            right={
              <Segmented
                accessibilityLabel="Height unit"
                value={heightUnit}
                onChange={selectHeight}
                options={[
                  { value: 'cm', label: 'cm' },
                  { value: 'ft', label: 'ft/in' },
                ]}
              />
            }
          />
        </Card>
        <Text variant="caption" color="textMuted">
          Weight is always stored in kilograms, distance in metres and height in
          centimetres. These only change how they are displayed.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: theme.spacing.sm },
  rows: { paddingVertical: 0, paddingHorizontal: 0, gap: 0 },
});
