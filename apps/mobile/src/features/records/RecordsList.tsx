import { formatDuration, formatWeight, type PersonalRecordType, type Unit } from '@overload/domain';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';
import { listAllPersonalRecords, type PersonalRecordSummary } from '../../data/sessionRepo';
import { getWeightUnit } from '../../data/settingsRepo';
import { db } from '../../db/client';
import { ListRow } from '../../ui/ListRow';
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
    <View style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => `${item.exerciseName}-${item.type}`}
        ListEmptyComponent={<Text style={styles.empty}>No personal records yet.</Text>}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        renderItem={({ item }) => (
          <ListRow
            title={RECORD_TYPE_LABELS[item.type]}
            subtitle={new Date(item.achievedAt).toLocaleDateString()}
            right={<Text style={styles.value}>{formatRecordValue(item, unit)}</Text>}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  empty: { ...theme.text.body, color: theme.colors.textMuted, textAlign: 'center', padding: theme.spacing.xl },
  sectionHeader: {
    ...theme.text.title,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
  },
  value: { ...theme.text.body, color: theme.colors.text, fontWeight: '600' },
});
