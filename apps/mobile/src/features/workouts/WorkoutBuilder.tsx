import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { BLOCK_CYCLES, blockPosition, DEFAULT_REST_SECONDS, isDeloadCycle, toStorageKg, type Unit } from '@overload/domain';
import { Lucide } from '@react-native-vector-icons/lucide';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getExerciseDetail } from '../../data/exerciseRepo';
import { cycleFor, cycleSetLabel, cycleSets } from '../../data/periodizationRepo';
import { getProfile, getWeightUnit } from '../../data/settingsRepo';
import type { WorkoutDetailExercise } from '../../data/workoutRepo';
import { addWorkoutSet, getWorkoutDetail, reorderWorkoutExercises } from '../../data/workoutRepo';
import { db } from '../../db/client';
import { BottomSheet } from '../../ui/BottomSheet';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';
import { textStyle } from '../../ui/typography';
import { ExerciseInfoSheet } from '../library/ExerciseInfoSheet';
import { parseDecimalInput, parseIntegerInput } from '../session/setInputs';
import { useWorkoutStarter, WorkoutStartSheet } from '../session/useWorkoutStarter';
import {
  estimateWorkoutMinutes,
  formatWorkoutTarget,
  targetInputsFor,
  targetMuscles,
  type WorkoutTargetField,
} from './workoutTargets';
import { ExerciseSummaryRow, TargetMuscleCards, WorkoutHeading } from './WorkoutSummary';

type Props = { workoutId: string };

const EMPTY_DRAFT: Record<WorkoutTargetField, string> = { weightKg: '', reps: '' };

/**
 * One exercise's edits: add a set with its targets, or move it. Opened from
 * the row's ⋮ so the overview reads as a plan, not a form.
 */
function ExerciseMenu({ entry, unit, onClose, onChanged, onMove }: {
  entry: WorkoutDetailExercise | null;
  unit: Unit;
  onClose: () => void;
  onChanged: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const insets = useSafeAreaInsets();
  // A duration exercise gets no inputs: workout_sets has no column for a target
  // duration or distance, so a box for one would discard what was typed.
  const inputs = entry ? targetInputsFor(entry.exercise.trackingType, unit) : [];

  const addSet = () => {
    if (!entry) return;
    const offers = (field: WorkoutTargetField) => inputs.some((i) => i.field === field);
    // Only a field this tracking type offers gets a target; reps default to 8.
    const weight = offers('weightKg') && draft.weightKg ? parseDecimalInput(draft.weightKg) : undefined;
    const reps = offers('reps') ? (draft.reps ? parseIntegerInput(draft.reps) : null) ?? 8 : undefined;
    addWorkoutSet(db, entry.workoutExercise.id, {
      targetReps: reps,
      targetWeightKg: weight != null ? toStorageKg(weight, unit) : undefined,
    });
    setDraft(EMPTY_DRAFT);
    onChanged();
  };

  return (
    <BottomSheet
      visible={entry !== null}
      onClose={() => {
        setDraft(EMPTY_DRAFT);
        onClose();
      }}
      title={entry?.exercise.name ?? ''}
    >
      <View style={[styles.menu, { paddingBottom: insets.bottom + theme.spacing.lg }]}>
        {inputs.length > 0 ? (
          <View style={styles.inputs}>
            {inputs.map((input) => (
              <BottomSheetTextInput
                key={input.field}
                value={draft[input.field]}
                onChangeText={(text) => setDraft((d) => ({ ...d, [input.field]: text }))}
                placeholder={input.placeholder}
                placeholderTextColor={theme.colors.textMuted}
                keyboardType={input.keyboard}
                accessibilityLabel={input.placeholder}
                style={styles.input}
              />
            ))}
          </View>
        ) : null}
        <Button title="Add set" onPress={addSet} />
        <View style={styles.moveRow}>
          <View style={styles.flex}>
            <Button title="Move up" variant="secondary" onPress={() => onMove(-1)} />
          </View>
          <View style={styles.flex}>
            <Button title="Move down" variant="secondary" onPress={() => onMove(1)} />
          </View>
        </View>
      </View>
    </BottomSheet>
  );
}

/**
 * What a workout holds and roughly how long it takes: its target muscles, then
 * each exercise with its sets, a ⋮ menu to edit and the info sheet. No scroll
 * view of its own — the workout overview and the program editor both put it in
 * theirs.
 */
export function WorkoutPlan({ workoutId }: { workoutId: string }) {
  // Bumped to re-read getWorkoutDetail: by an edit here, and on focus, since
  // add-exercise mutates this workout and navigates back to a still-mounted
  // screen. Do NOT switch this to key={version} — that remounts and resets
  // scroll (6b249e9's failure mode).
  const [, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);
  useFocusEffect(useCallback(() => setVersion((v) => v + 1), []));

  const [infoId, setInfoId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [focusMuscle, setFocusMuscle] = useState<string | null>(null);
  const detail = getWorkoutDetail(db, workoutId);
  const unit = getWeightUnit(db);
  const figure = getProfile(db).gender === 'female' ? 'female' : 'male';

  if (!detail) {
    return <EmptyState title="Workout not found" body="It may have been deleted." />;
  }

  const count = detail.exercises.length;
  // A periodized program's workout shows this cycle's sets, not the first cycle's.
  const cycle = cycleFor(db, workoutId);
  const shown = detail.exercises.map((e) => {
    if (!cycle) return null;
    const warmups = e.sessionSets.filter((s) => s.setType === 'warmup').length;
    return { warmups, sets: cycleSets(db, e.exercise, e.sessionSets, cycle) };
  });
  const setCount = (i: number) => (shown[i] ? shown[i]!.warmups + shown[i]!.sets.length : detail.exercises[i]!.sessionSets.length);
  const details = detail.exercises.map((e) => getExerciseDetail(db, e.exercise.id));
  const musclesOf = details.map((d) => d?.muscles ?? []);
  const minutes = estimateWorkoutMinutes(
    detail.exercises.map((e, i) => ({
      sets: setCount(i),
      restSeconds: e.workoutExercise.restSeconds,
      unilateral: details[i]?.links.laterality?.includes('Unilateral') ?? false,
    })),
    DEFAULT_REST_SECONDS,
  );
  const volumes = targetMuscles(detail.exercises.map((e, i) => ({ sets: setCount(i), main: e.exercise.primaryMuscle, muscles: musclesOf[i]! })));
  const menuIndex = detail.exercises.findIndex((e) => e.workoutExercise.id === menuId);

  // Swaps the exercise with its neighbour and persists the whole live order.
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (index < 0 || target < 0 || target >= count) return;
    const ids = detail.exercises.map((e) => e.workoutExercise.id);
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    reorderWorkoutExercises(db, workoutId, ids, Date.now());
    refresh();
  };

  return (
    <>
      {cycle ? (
        <Text variant="caption" color="textMuted">
          {isDeloadCycle(cycle.cycle, cycle.deload) ? 'Deload cycle' : `Cycle ${blockPosition(cycle.cycle)} of ${BLOCK_CYCLES}`}
        </Text>
      ) : null}
      <TargetMuscleCards volumes={volumes} figure={figure} selected={focusMuscle} onSelect={setFocusMuscle} />

      <View style={styles.summary}>
        <WorkoutHeading count={count} minutes={minutes} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add exercises"
          onPress={() => router.push(`/workouts/${workoutId}/add-exercise`)}
          style={styles.addButton}
        >
          <Lucide name="plus" size={24} color={theme.colors.text} />
        </Pressable>
      </View>

      {count === 0 ? (
        <EmptyState title="No exercises yet" body="Add some with the + button." />
      ) : (
        detail.exercises.map((entry, i) => (
          <ExerciseSummaryRow
            key={entry.workoutExercise.id}
            name={entry.exercise.name}
            sets={
              shown[i]
                ? shown[i]!.sets.map((set, n) => ({
                    key: String(n),
                    label: cycleSetLabel(set),
                    rir: set.rir,
                    badge: set.setType === 'failure' ? 'F' : undefined,
                  }))
                : entry.sessionSets.map((set) => ({
                    key: set.id,
                    // null: this tracking type has no target to show.
                    label: formatWorkoutTarget(entry.exercise.trackingType, set, unit) ?? 'Set',
                    rir: set.targetRir,
                  }))
            }
            muscles={musclesOf[i]!}
            highlight={focusMuscle}
            onPress={() => setInfoId(entry.exercise.id)}
            onMenu={() => setMenuId(entry.workoutExercise.id)}
          />
        ))
      )}

      <ExerciseMenu
        entry={detail.exercises[menuIndex] ?? null}
        unit={unit}
        onClose={() => setMenuId(null)}
        onChanged={refresh}
        onMove={(direction) => move(menuIndex, direction)}
      />
      <ExerciseInfoSheet exerciseId={infoId} figure={figure} onClose={() => setInfoId(null)} />
    </>
  );
}

/**
 * A workout's overview: its plan, with Start Workout pinned to the bottom.
 * Opening a workout never starts it — only that button does, through
 * useWorkoutStarter's in-progress guard.
 */
export function WorkoutBuilder({ workoutId }: Props) {
  const [, setVersion] = useState(0);
  useFocusEffect(useCallback(() => setVersion((v) => v + 1), []));
  const insets = useSafeAreaInsets();
  const starter = useWorkoutStarter();
  const detail = getWorkoutDetail(db, workoutId);

  return (
    <View style={styles.container}>
      {/* The workout's own name: a program day's workout is "<program> · Day N",
          and the header is the only thing that says which one this is. */}
      {detail ? <Stack.Screen options={{ title: detail.workout.name }} /> : null}
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}>
        <WorkoutPlan workoutId={workoutId} />
      </ScrollView>

      <View style={[styles.startBar, { paddingBottom: insets.bottom + theme.spacing.md }]}>
        <Button title="Start Workout" onPress={() => starter.start(workoutId)} disabled={!detail || detail.exercises.length === 0} />
      </View>
      <WorkoutStartSheet starter={starter} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg },
  flex: { flex: 1 },
  targets: { gap: theme.spacing.md, paddingBottom: theme.spacing.xl },
  targetCards: { gap: theme.spacing.md },
  targetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.lg,
    paddingRight: theme.spacing.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
  },
  targetCardOn: { borderColor: theme.colors.text, borderWidth: 2 },
  targetText: { gap: 2 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingBottom: theme.spacing.lg },
  addButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceRaised,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.lg,
    paddingVertical: theme.spacing.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  thumb: {
    width: 64,
    height: 80,
    borderRadius: theme.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceRaised,
  },
  rowMain: { flex: 1, gap: theme.spacing.xs },
  setLine: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  setNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceRaised,
  },
  rpe: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accent,
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs, marginTop: theme.spacing.xs },
  tag: { borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing.sm, paddingVertical: 3, borderWidth: 1 },
  tagPrimary: { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.surfaceRaised },
  tagSecondary: { borderColor: theme.colors.border },
  tagLit: { backgroundColor: theme.colors.text, borderColor: theme.colors.text },
  startBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    backgroundColor: theme.colors.background,
  },
  menu: { padding: theme.spacing.lg, gap: theme.spacing.md },
  inputs: { flexDirection: 'row', gap: theme.spacing.md },
  input: {
    ...textStyle('numeric', true),
    flex: 1,
    minHeight: 48,
    color: theme.colors.text,
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.lg,
  },
  moveRow: { flexDirection: 'row', gap: theme.spacing.md },
});
