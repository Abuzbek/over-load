import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { getProgramWeek, setProgramDay } from '../../data/programRepo';
import { listRoutines } from '../../data/routineRepo';
import { db } from '../../db/client';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { ListRow } from '../../ui/ListRow';
import { Screen } from '../../ui/Screen';
import { Sheet } from '../../ui/Sheet';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';

/** Index 0 is Monday, matching how the week is stored. */
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function ProgramWeekScreen({ programId }: { programId: string }) {
  const [, setVersion] = useState(0);
  const [editing, setEditing] = useState<number | null>(null);

  useFocusEffect(useCallback(() => setVersion((v) => v + 1), []));

  const week = getProgramWeek(db, programId);
  const library = listRoutines(db);

  function assign(weekday: number, routineId: string | null) {
    setProgramDay(db, programId, weekday, routineId, Date.now());
    setEditing(null);
    setVersion((v) => v + 1);
  }

  const trainingDays = week.filter((d) => d.routine !== null).length;

  return (
    <Screen scroll>
      <Text variant="caption" color="textMuted">
        {trainingDays === 0
          ? 'No training days yet. Tap a day to put a workout on it.'
          : `${trainingDays} training ${trainingDays === 1 ? 'day' : 'days'} a week.`}
      </Text>

      <Card style={styles.rows}>
        {week.map((day) => (
          <ListRow
            key={day.weekday}
            title={WEEKDAYS[day.weekday]!}
            right={
              <Text variant="body" color={day.routine ? 'text' : 'textMuted'}>
                {day.routine?.name ?? 'Rest'}
              </Text>
            }
            onPress={() => setEditing(day.weekday)}
          />
        ))}
      </Card>

      <Sheet
        visible={editing !== null}
        onRequestClose={() => setEditing(null)}
        title={editing === null ? '' : WEEKDAYS[editing]!}
        body={
          library.length === 0
            ? 'Your workout library is empty. Create a workout first and it will show up here.'
            : 'Pick a workout for this day, or rest.'
        }
      >
        {library.map((workout) => (
          <Button
            key={workout.id}
            title={workout.name}
            variant="secondary"
            onPress={() => editing !== null && assign(editing, workout.id)}
          />
        ))}
        <Button
          title="Rest"
          variant="ghost"
          onPress={() => editing !== null && assign(editing, null)}
        />
        <Button title="Cancel" variant="secondary" onPress={() => setEditing(null)} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  rows: { paddingVertical: 0, paddingHorizontal: 0, gap: 0 },
});
