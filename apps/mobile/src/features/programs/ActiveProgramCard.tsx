import { blockPosition, isDeloadCycle, type DeloadAt } from '@overload/domain';
import { Lucide } from '@react-native-vector-icons/lucide';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setProgramDayCompleted, type ProgramDay } from '../../data/programRepo';
import type { WorkoutSummary } from '../../data/workoutRepo';
import { db } from '../../db/client';
import { BottomSheet } from '../../ui/BottomSheet';
import { Card } from '../../ui/Card';
import { SectionLabel } from '../../ui/SectionLabel';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';

type Props = {
  programId: string;
  programName: string;
  cycleNumber: number;
  cycleCount: number;
  deload: DeloadAt;
  days: ProgramDay[];
  summaryByWorkoutId: Map<string, WorkoutSummary>;
  onChanged: () => void;
};

function Checkbox({ checked, onPress, label }: { checked: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      hitSlop={10}
      onPress={onPress}
      style={[styles.checkbox, checked && styles.checkboxOn]}
    >
      {checked ? <Lucide name="check" size={14} color={theme.colors.onAccent} /> : null}
    </Pressable>
  );
}

function DayRow({
  day,
  position,
  summary,
  onToggle,
  onOpen,
}: {
  day: ProgramDay;
  position: number;
  summary: WorkoutSummary | undefined;
  /** Null while another cycle is previewed: it can be looked at, not ticked off. */
  onToggle: (() => void) | null;
  onOpen: () => void;
}) {
  const done = onToggle !== null && day.completedAt !== null;
  const title = day.workout?.name ?? 'Rest Day';
  const preview = summary?.exerciseNames.join(', ');

  return (
    <View style={styles.dayRow}>
      <Pressable
        // Rest days have no workout to open, so only a workout day is pressable.
        accessibilityRole={day.workout ? 'button' : undefined}
        accessibilityLabel={`Day ${position + 1}, ${title}`}
        onPress={day.workout ? onOpen : undefined}
        style={({ pressed }) => [styles.dayMain, pressed && day.workout ? styles.pressed : null]}
      >
        <Text variant="heading" color={done ? 'textMuted' : 'text'}>{title}</Text>
        {preview ? (
          <Text variant="caption" color="textMuted" numberOfLines={2}>{preview}</Text>
        ) : null}
        {summary && summary.primaryMuscles.length > 0 ? (
          <View style={styles.tags}>
            {summary.primaryMuscles.map((muscle) => (
              <View key={muscle} style={styles.tag}>
                <Text variant="caption" color="textMuted">{muscle}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </Pressable>
      {onToggle ? <Checkbox checked={done} onPress={onToggle} label={`Day ${position + 1} done`} /> : null}
    </View>
  );
}

/**
 * The active program, under its section label (with the cycle link beside it),
 * expanded in place on the Workout tab. The header opens the program's editor;
 * only the chevron collapses it. Tapping a day opens its workout's overview,
 * where Start Workout begins the session: a tap on a list row must never start
 * one by itself.
 */
export function ActiveProgramCard({
  programId,
  programName,
  cycleNumber,
  cycleCount,
  deload,
  days,
  summaryByWorkoutId,
  onChanged,
}: Props) {
  const [open, setOpen] = useState(true);
  const workoutDays = days.filter((d) => d.workout !== null).length;
  // Cycles are shown by their place in the block (1…count, the deload by name);
  // another one can be previewed, but only the current one is trained.
  const current = blockPosition(cycleNumber, cycleCount);
  // Null follows the current cycle, so a roll-over while mounted is not mistaken for a preview.
  const [viewing, setViewing] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const insets = useSafeAreaInsets();
  const shown = viewing !== null && viewing <= cycleCount ? viewing : current;
  const preview = shown !== current;
  const cycleName = (position: number) => (isDeloadCycle(position, deload, cycleCount) ? 'Deload' : `Cycle ${position}`);

  return (
    <>
      <View style={styles.sectionRow}>
        <SectionLabel>Active program</SectionLabel>
        <Pressable accessibilityRole="button" accessibilityLabel={`${cycleName(shown)}, go to another cycle`} hitSlop={8} onPress={() => setPicking(true)}>
          <Text color="text" style={styles.link}>{cycleName(shown)}</Text>
        </Pressable>
      </View>
      <Card style={styles.card}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${programName}, edit program`}
            onPress={() => router.push({ pathname: '/programs/[id]', params: { id: programId, name: programName } })}
            style={({ pressed }) => [styles.headerText, pressed && styles.pressed]}
          >
            <Text variant="heading">{programName}</Text>
            <Text variant="caption" color="textMuted">
              {workoutDays} {workoutDays === 1 ? 'workout' : 'workouts'}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            accessibilityLabel={open ? 'Collapse program' : 'Expand program'}
            hitSlop={8}
            onPress={() => setOpen((o) => !o)}
            style={styles.chevron}
          >
            <Lucide name={open ? 'chevron-up' : 'chevron-down'} size={20} color={theme.colors.text} />
          </Pressable>
        </View>

        {open && preview ? (
          <View style={styles.previewBar}>
            <Text variant="caption" color="textMuted" style={styles.flex}>
              {shown < current ? 'A past cycle' : 'A future cycle'}, to look at. Workouts start from {cycleName(current).toLowerCase()}.
            </Text>
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setViewing(null)}>
              <Text variant="caption" color="accent">Back</Text>
            </Pressable>
          </View>
        ) : null}

        {open
          ? days.map((day, position) => (
              <DayRow
                key={day.dayIndex}
                day={day}
                position={position}
                summary={day.workout ? summaryByWorkoutId.get(day.workout.id) : undefined}
                onToggle={
                  preview
                    ? null
                    : () => {
                        setProgramDayCompleted(db, programId, day.dayIndex, day.completedAt === null, Date.now());
                        onChanged();
                      }
                }
                onOpen={() =>
                  day.workout &&
                  router.push(preview ? { pathname: '/workouts/[id]', params: { id: day.workout.id, cycle: String(shown) } } : `/workouts/${day.workout.id}`)
                }
              />
            ))
          : null}

        <BottomSheet visible={picking} onClose={() => setPicking(false)} title="Go to…">
          <View style={{ paddingBottom: insets.bottom + theme.spacing.xxl }}>
            {Array.from({ length: cycleCount }, (_, i) => i + 1).map((position) => (
              <Pressable
                key={position}
                accessibilityRole="button"
                accessibilityLabel={cycleName(position)}
                onPress={() => {
                  setViewing(position === current ? null : position);
                  setPicking(false);
                }}
                style={({ pressed }) => [styles.goRow, pressed && styles.pressed]}
              >
                <Lucide
                  name={position === current ? 'map-pin' : position < current ? 'arrow-left' : 'arrow-right'}
                  size={22}
                  color={position === shown ? theme.colors.accent : theme.colors.text}
                />
                <View style={[styles.goMain, position > 1 && styles.goDivider]}>
                  <Text style={styles.goTitle}>{cycleName(position)}</Text>
                  <Lucide name="chevron-right" size={18} color={theme.colors.textMuted} />
                </View>
              </Pressable>
            ))}
          </View>
        </BottomSheet>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: 0, paddingHorizontal: 0, gap: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
  },
  headerText: { flex: 1, gap: 2 },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  dayMain: { flex: 1, gap: theme.spacing.xs },
  pressed: { opacity: 0.6 },
  flex: { flex: 1 },
  link: { textDecorationLine: 'underline' },
  goRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xl, paddingLeft: theme.spacing.xl },
  // The divider starts at the title, not the icon.
  goMain: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 22, paddingRight: theme.spacing.xl },
  goDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border },
  goTitle: { flex: 1, fontSize: 18 },
  previewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  tag: {
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: theme.radius.sm,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chevron: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
