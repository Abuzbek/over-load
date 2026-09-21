import { formatDuration, formatWeight, type PersonalRecordType, type Unit } from '@overload/domain';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { listAllPersonalRecords, type PersonalRecordSummary } from '../../data/sessionRepo';
import { getWeightUnit } from '../../data/settingsRepo';
import { db } from '../../db/client';
import { Card } from '../../ui/Card';
import { EmptyState } from '../../ui/EmptyState';
import { Screen } from '../../ui/Screen';
import { StatTile } from '../../ui/StatTile';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';

const RECORD_TYPE_LABELS: Record<PersonalRecordType, string> = {
  max_weight: 'Max weight',
  est_1rm: 'Est. 1RM',
  max_volume: 'Max volume',
  max_reps: 'Max reps',
  max_duration: 'Longest duration',
  max_distance: 'Max distance',
};

// Fixed display order within an exercise's group — independent of the
// alphabetical `type` ordering the query uses, which exists only to make
// results deterministic, not to be shown as-is.
const RECORD_TYPE_ORDER: PersonalRecordType[] = [
  'max_weight',
  'est_1rm',
  'max_volume',
  'max_reps',
  'max_duration',
  'max_distance',
];

function formatRecordValue(record: PersonalRecordSummary, unit: Unit): string {
  switch (record.type) {
    case 'max_weight':
    case 'est_1rm':
    case 'max_volume':
      return formatWeight(record.value, unit);
    case 'max_duration':
      return formatDuration(record.value);
    case 'max_distance':
      return `${record.value} m`;
    case 'max_reps':
      return `${record.value}`;
  }
}

type Section = { title: string; data: PersonalRecordSummary[] };

/** Groups the already exercise-name-sorted rows into sections, then puts each
 * exercise's own records into a fixed, sensible order rather than the
 * alphabetical-by-type order the underlying query used only for determinism. */
function groupByExercise(records: PersonalRecordSummary[]): Section[] {
  const sections: Section[] = [];

  for (const record of records) {
    const current = sections[sections.length - 1];
    if (current && current.title === record.exerciseName) {
      current.data.push(record);
    } else {
      sections.push({ title: record.exerciseName, data: [record] });
    }
  }

  for (const section of sections) {
    section.data.sort(
      (a, b) => RECORD_TYPE_ORDER.indexOf(a.type) - RECORD_TYPE_ORDER.indexOf(b.type),
    );
  }

  return sections;
}

// Which metrics render, and how many tiles a card has, follows entirely from
// which record types exist for that exercise (METRICS_BY_TRACKING_TYPE in
// @overload/domain): a duration exercise only ever has a max_duration
// record, so it only ever gets a duration tile, never a weight one.
function ExerciseRecordsCard({ section, unit }: { section: Section; unit: Unit }) {
  return (
    <Card>
      <Text variant="heading">{section.title}</Text>
      <View style={styles.tiles}>
        {section.data.map((record) => (
          <StatTile
            key={record.type}
            label={RECORD_TYPE_LABELS[record.type]}
            value={formatRecordValue(record, unit)}
            caption={new Date(record.achievedAt).toLocaleDateString()}
          />
        ))}
      </View>
    </Card>
  );
}

export function RecordsList() {
  // A local counter is the refresh signal: bumping it forces a re-read of
  // both the records and the weight-unit preference, since finishing a
  // workout or changing units elsewhere must show up here on return, and
  // this screen stays mounted underneath the stack rather than remounting.
  const [, setVersion] = useState(0);
  const records = listAllPersonalRecords(db);
  const unit = getWeightUnit(db);
  const sections = groupByExercise(records);

  useFocusEffect(
    useCallback(() => {
      setVersion((v) => v + 1);
    }, []),
  );

  return (
    <Screen scroll>
      <Text variant="display">Progress</Text>
      {sections.length === 0 ? (
        <EmptyState
          title="No records yet"
          body="Log a set and your personal records will show up here."
        />
      ) : (
        <View style={styles.list}>
          {sections.map((section) => (
            <ExerciseRecordsCard key={section.title} section={section} unit={unit} />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: theme.spacing.md },
  tiles: { flexDirection: 'row', gap: theme.spacing.sm },
});
