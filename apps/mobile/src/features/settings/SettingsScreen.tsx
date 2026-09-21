import type { Unit } from '@overload/domain';
import Constants from 'expo-constants';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { getWeightUnit, setWeightUnit } from '../../data/settingsRepo';
import { db } from '../../db/client';
import { Button } from '../../ui/Button';
import { Screen } from '../../ui/Screen';
import { SectionLabel } from '../../ui/SectionLabel';
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

  const appName = Constants.expoConfig?.name ?? 'Overload';
  const appVersion = Constants.expoConfig?.version;

  return (
    <Screen scroll>
      <Text variant="display">Profile</Text>

      <View style={styles.section}>
        <SectionLabel>Units</SectionLabel>
        <View style={styles.units}>
          {UNITS.map((option) => (
            <View key={option} style={styles.unitButton}>
              <Button
                title={option}
                variant={option === unit ? 'primary' : 'secondary'}
                onPress={() => selectUnit(option)}
              />
            </View>
          ))}
        </View>
        <Text variant="caption" color="textMuted">
          Weight is always stored in kilograms. This only changes how it is displayed.
        </Text>
      </View>

      {/* Leave room below for Project B (accounts) rather than adding a fake
          sign-in row now — a door that leads nowhere is worse than no door. */}
      <View style={styles.section}>
        <SectionLabel>About</SectionLabel>
        <Text variant="body">{appName}</Text>
        {appVersion ? (
          <Text variant="caption" color="textMuted">Version {appVersion}</Text>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: theme.spacing.sm },
  units: { flexDirection: 'row', gap: theme.spacing.sm },
  unitButton: { flex: 1 },
});
