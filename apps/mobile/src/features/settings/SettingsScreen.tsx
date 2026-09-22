import type { DistanceUnit, Unit } from '@overload/domain';
import Constants from 'expo-constants';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  getDistanceUnit,
  getWeightUnit,
  setDistanceUnit,
  setWeightUnit,
} from '../../data/settingsRepo';
import { db } from '../../db/client';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { ListRow } from '../../ui/ListRow';
import { Screen } from '../../ui/Screen';
import { SectionLabel } from '../../ui/SectionLabel';
import { Segmented } from '../../ui/Segmented';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';

/**
 * A field with no store behind it yet. Rendered without an `onPress` on
 * purpose: ListRow then omits the button role, so it is not announced as
 * something to activate and does not look tappable. A row that appears to
 * work and does not is worse than one that plainly does not.
 */
function PlaceholderRow({ title, value }: { title: string; value: string }) {
  return (
    <ListRow
      title={title}
      right={
        <Text variant="body" color="textMuted">
          {value}
        </Text>
      }
    />
  );
}

const PROFILE_FIELDS = [
  'Name',
  'Birthday',
  'Gender',
  'Weight',
  'Height',
  'Lifting experience',
  'Cardio experience',
];

export function SettingsScreen() {
  // Same pattern as every other screen in this app: a version bump forces a
  // re-read of the preference from SQLite rather than caching a local copy
  // of it, per the rule that only settingsRepo owns this value.
  const [, setVersion] = useState(0);
  const unit = getWeightUnit(db);
  const distanceUnit = getDistanceUnit(db);

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

  function selectDistanceUnit(next: DistanceUnit) {
    if (next === distanceUnit) return;
    setDistanceUnit(db, next, Date.now());
    setVersion((v) => v + 1);
  }

  const appName = Constants.expoConfig?.name ?? 'Overload';
  const appVersion = Constants.expoConfig?.version;

  return (
    <Screen scroll safeTop>
      <Text variant="display">More</Text>

      <View style={styles.section}>
        <SectionLabel>Account</SectionLabel>
        <Text variant="caption" color="textMuted">
          Laid out, not wired up. These need accounts, which do not exist yet.
        </Text>
        <Card style={styles.rows}>
          {PROFILE_FIELDS.map((field) => (
            <PlaceholderRow key={field} title={field} value="—" />
          ))}
        </Card>
      </View>

      <View style={styles.section}>
        <SectionLabel>Security</SectionLabel>
        <Card style={styles.rows}>
          <PlaceholderRow title="Email" value="—" />
          <PlaceholderRow title="Password" value="••••••••" />
        </Card>
        {/* Disabled rather than silently inert: a Logout that looks live and
            does nothing is the worst version of this row. */}
        <Button title="Log out" variant="destructive" disabled onPress={() => {}} />
      </View>

      <View style={styles.section}>
        <SectionLabel>Units</SectionLabel>
        <Card style={styles.rows}>
          <ListRow
            title="Weight"
            right={
              <Segmented
                accessibilityLabel="Weight unit"
                value={unit}
                onChange={selectUnit}
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
                onChange={selectDistanceUnit}
                options={[
                  { value: 'km', label: 'km' },
                  { value: 'mi', label: 'mi' },
                ]}
              />
            }
          />
          {/* Static: there is no height stored anywhere to convert. */}
          <PlaceholderRow title="Height" value="cm" />
        </Card>
        <Text variant="caption" color="textMuted">
          Weight is always stored in kilograms and distance in metres. These only change how they are displayed.
        </Text>
      </View>

      <View style={styles.section}>
        <SectionLabel>Language</SectionLabel>
        <Card style={styles.rows}>
          <PlaceholderRow title="Language" value="English" />
        </Card>
      </View>

      <View style={styles.section}>
        <SectionLabel>About</SectionLabel>
        <Card style={styles.rows}>
          <PlaceholderRow title={appName} value={appVersion ? `Version ${appVersion}` : '—'} />
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: theme.spacing.sm },
  rows: { paddingVertical: 0, paddingHorizontal: 0, gap: 0 },
});
