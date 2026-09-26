import { Lucide } from '@react-native-vector-icons/lucide';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  activateProgram,
  addProgramDay,
  getActiveProgram,
  getProgramDays,
  isGenerated,
  removeProgramDay,
  setProgramDay,
} from '../../data/programRepo';
import { createWorkout, listWorkouts, renameWorkout } from '../../data/workoutRepo';
import { db } from '../../db/client';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';
import { WorkoutPlan } from '../workouts/WorkoutBuilder';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

type Props = { programId: string; programName: string };

/**
 * A program's cycle, day by day: a tab per day and Add Day, and the chosen
 * day's workout — or a rest day, which becomes a workout day by adding
 * exercises. A scratch program grows its cycle here; a generated one keeps its
 * seven days. Save to Library or Activate Program at the foot, until active.
 */
export function ProgramEditor({ programId, programName }: Props) {
  const insets = useSafeAreaInsets();
  const [, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);
  useFocusEffect(useCallback(() => setVersion((v) => v + 1), []));

  const days = getProgramDays(db, programId);
  const fixed = isGenerated(db, programId);
  const active = getActiveProgram(db)?.id === programId;
  const [selected, setSelected] = useState(0);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  const position = Math.min(selected, Math.max(days.length - 1, 0));
  const day = days[position];
  const workout = day?.workout ?? null;

  /** A rest day made a workout day: its own workout, named after the next free letter. */
  const workoutFor = () => {
    const taken = new Set(days.map((d) => d.workout?.name));
    const letter = [...LETTERS].find((l) => !taken.has(`Workout ${l}`)) ?? String(days.length);
    const created = createWorkout(db, `Workout ${letter}`);
    setProgramDay(db, programId, day!.dayIndex, created.id, Date.now());
    return created.id;
  };

  const addDay = () => {
    const index = addProgramDay(db, programId, Date.now());
    if (index !== null) setSelected(days.length);
    refresh();
  };

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: programName }} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabs}>
        {days.map((d, i) => (
          <Pressable
            key={d.dayIndex}
            accessibilityRole="tab"
            accessibilityState={{ selected: i === position }}
            onPress={() => setSelected(i)}
            style={[styles.tab, i === position && styles.tabOn]}
          >
            <Text variant="heading" color={i === position ? 'text' : 'textMuted'}>{d.workout?.name ?? 'Rest'}</Text>
          </Pressable>
        ))}
        {fixed ? null : (
          <Pressable accessibilityRole="button" accessibilityLabel="Add day" onPress={addDay} style={styles.tab}>
            <Text variant="heading" color="textMuted">Add Day</Text>
            <View style={styles.plus}>
              <Lucide name="plus" size={14} color={theme.colors.text} />
            </View>
          </Pressable>
        )}
      </ScrollView>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 140 }]}>
        {day ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {fixed ? null : (
              <Chip
                icon="circle-minus"
                label="Remove"
                disabled={days.length <= 1}
                onPress={() => {
                  removeProgramDay(db, programId, day.dayIndex, Date.now());
                  setSelected(Math.max(position - 1, 0));
                  refresh();
                }}
              />
            )}
            <Chip icon="square-pen" label="Rename" disabled={!workout} onPress={() => workout && setRenaming(workout.name)} />
            <Chip icon="dumbbell" label="Use a workout" onPress={() => setPicking(true)} />
            {workout ? (
              <Chip
                icon="bed"
                label="Make rest day"
                onPress={() => {
                  setProgramDay(db, programId, day.dayIndex, null, Date.now());
                  refresh();
                }}
              />
            ) : null}
          </ScrollView>
        ) : null}

        {workout ? (
          <WorkoutPlan key={workout.id} workoutId={workout.id} />
        ) : day ? (
          <>
            <Text variant="title">Rest Day</Text>
            <View style={styles.restCard}>
              <Lucide name="armchair" size={28} color={theme.colors.textMuted} />
              <Text color="textMuted" style={styles.flex}>You can turn this rest day into a workout day by adding exercises below.</Text>
            </View>
            <View style={styles.summary}>
              <Text variant="title">0 Exercises</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  const id = workoutFor();
                  refresh();
                  router.push(`/workouts/${id}/add-exercise`);
                }}
              >
                <Text variant="heading" style={styles.link}>Add Exercises</Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </ScrollView>

      {active ? null : (
        <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing.md }]}>
          <Button title="Save to Library" variant="secondary" onPress={() => router.back()} />
          <Button
            title="Activate Program"
            onPress={() => {
              activateProgram(db, programId, Date.now());
              router.back();
            }}
          />
        </View>
      )}

      <Sheet visible={renaming !== null} onRequestClose={() => setRenaming(null)} title="Rename workout">
        <TextInput
          value={renaming ?? ''}
          onChangeText={setRenaming}
          placeholder="Workout name"
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
        />
        <Button
          title="Save"
          disabled={!renaming?.trim()}
          onPress={() => {
            if (workout && renaming?.trim()) renameWorkout(db, workout.id, renaming.trim(), Date.now());
            setRenaming(null);
            refresh();
          }}
        />
        <Button title="Cancel" variant="secondary" onPress={() => setRenaming(null)} />
      </Sheet>

      <Sheet visible={picking} onRequestClose={() => setPicking(false)} title="Use a workout" body="This day trains a workout from your library.">
        {listWorkouts(db).map((w) => (
          <Button
            key={w.id}
            title={w.name}
            variant="secondary"
            onPress={() => {
              if (day) setProgramDay(db, programId, day.dayIndex, w.id, Date.now());
              setPicking(false);
              refresh();
            }}
          />
        ))}
        <Button title="Cancel" variant="ghost" onPress={() => setPicking(false)} />
      </Sheet>
    </View>
  );
}

function Chip({ icon, label, disabled = false, onPress }: {
  icon: 'circle-minus' | 'square-pen' | 'dumbbell' | 'bed';
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, disabled && styles.dim, pressed && styles.pressed]}
    >
      <Lucide name={icon} size={16} color={theme.colors.text} />
      <Text variant="heading">{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  tabBar: { flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  tabs: { paddingHorizontal: theme.spacing.lg, gap: theme.spacing.xl },
  tab: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.md, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: theme.colors.text },
  plus: { width: 20, height: 20, borderRadius: 10, backgroundColor: theme.colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  content: { padding: theme.spacing.lg, gap: theme.spacing.lg },
  chips: { gap: theme.spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceRaised,
  },
  dim: { opacity: 0.4 },
  pressed: { opacity: 0.6 },
  restCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.lg,
    padding: theme.spacing.xl,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  summary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { textDecorationLine: 'underline' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    backgroundColor: theme.colors.background,
  },
  input: {
    minHeight: 44,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
  },
});
