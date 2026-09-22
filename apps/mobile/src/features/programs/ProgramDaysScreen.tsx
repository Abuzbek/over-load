import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';
import {
  addProgramDay,
  getProgramDays,
  removeProgramDay,
  setProgramDay,
} from '../../data/programRepo';
import { createRoutine, listRoutines } from '../../data/routineRepo';
import { db } from '../../db/client';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { ListRow } from '../../ui/ListRow';
import { Screen } from '../../ui/Screen';
import { Sheet } from '../../ui/Sheet';
import { Text } from '../../ui/Text';

export function ProgramDaysScreen({ programId, programName }: { programId: string; programName: string }) {
  const [, setVersion] = useState(0);
  const [editing, setEditing] = useState<number | null>(null);

  useFocusEffect(useCallback(() => setVersion((v) => v + 1), []));

  const days = getProgramDays(db, programId);
  const library = listRoutines(db);

  // Day rows are numbered by position, not by dayIndex: a gap in the indexes
  // (a day tombstoned later) should still read Day 1, Day 2, Day 3.
  const labelFor = (position: number) => `Day ${position + 1}`;

  function assign(dayIndex: number, routineId: string | null) {
    setProgramDay(db, programId, dayIndex, routineId, Date.now());
    setEditing(null);
    setVersion((v) => v + 1);
  }

  function removeDay(dayIndex: number) {
    removeProgramDay(db, programId, dayIndex, Date.now());
    setEditing(null);
    setVersion((v) => v + 1);
  }

  function addDay() {
    addProgramDay(db, programId, Date.now());
    setVersion((v) => v + 1);
  }

  /** Builds this day its own workout and opens the builder to fill it. */
  function addExercises(dayIndex: number, position: number) {
    const workout = createRoutine(db, `${programName} · ${labelFor(position)}`);
    setProgramDay(db, programId, dayIndex, workout.id, Date.now());
    setEditing(null);
    router.push(`/routines/${workout.id}`);
  }

  const trainingDays = days.filter((d) => d.routine !== null).length;
  const editingPosition = days.findIndex((d) => d.dayIndex === editing);

  return (
    <Screen scroll>
      <Text variant="caption" color="textMuted">
        {days.length} {days.length === 1 ? 'day' : 'days'} in the cycle
        {trainingDays > 0 ? ` · ${trainingDays} with a workout` : ''}
      </Text>

      <Card style={styles.rows}>
        {days.map((day, position) => (
          <ListRow
            key={day.dayIndex}
            title={labelFor(position)}
            right={
              <Text variant="body" color={day.routine ? 'text' : 'textMuted'}>
                {day.routine?.name ?? 'Rest'}
              </Text>
            }
            onPress={() => setEditing(day.dayIndex)}
          />
        ))}
      </Card>

      <Button title="+ Add day" variant="secondary" onPress={addDay} />

      <Sheet
        visible={editing !== null}
        onRequestClose={() => setEditing(null)}
        title={editingPosition >= 0 ? labelFor(editingPosition) : ''}
        body={
          library.length === 0
            ? 'Add exercises to build this day its own workout, or rest.'
            : 'Pick a workout from your library, build a new one for this day, or rest.'
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
          title="Add exercises"
          onPress={() => editing !== null && addExercises(editing, editingPosition)}
        />
        <Button
          title="Rest"
          variant="ghost"
          onPress={() => editing !== null && assign(editing, null)}
        />
        <Button
          title="Remove day"
          variant="destructive"
          onPress={() => editing !== null && removeDay(editing)}
        />
        <Button title="Cancel" variant="secondary" onPress={() => setEditing(null)} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  rows: { paddingVertical: 0, paddingHorizontal: 0, gap: 0 },
});
