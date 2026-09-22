import { Lucide } from '@react-native-vector-icons/lucide';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { setProgramDayCompleted, type ProgramDay } from '../../data/programRepo';
import type { WorkoutSummary } from '../../data/workoutRepo';
import { db } from '../../db/client';
import { Card } from '../../ui/Card';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';
import type { useWorkoutStarter } from '../session/useWorkoutStarter';

type Props = {
  programId: string;
  programName: string;
  days: ProgramDay[];
  summaryByWorkoutId: Map<string, WorkoutSummary>;
  starter: ReturnType<typeof useWorkoutStarter>;
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
  onStart,
}: {
  day: ProgramDay;
  position: number;
  summary: WorkoutSummary | undefined;
  onToggle: () => void;
  onStart: () => void;
}) {
  const done = day.completedAt !== null;
  const title = day.workout?.name ?? 'Rest Day';
  const preview = summary?.exerciseNames.join(', ');

  return (
    <View style={styles.dayRow}>
      <Pressable
        // Rest days have nothing to start, so only a workout day is pressable.
        accessibilityRole={day.workout ? 'button' : undefined}
        accessibilityLabel={`Day ${position + 1}, ${title}`}
        onPress={day.workout ? onStart : undefined}
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
      <Checkbox checked={done} onPress={onToggle} label={`Day ${position + 1} done`} />
    </View>
  );
}

/**
 * The active program, expanded in place on the Session tab rather than behind a
 * push: this is the screen a user opens to start today's session, so tapping a
 * day starts its workout. Editing the cycle lives in the program library.
 */
export function ActiveProgramCard({
  programId,
  programName,
  days,
  summaryByWorkoutId,
  starter,
  onChanged,
}: Props) {
  const [open, setOpen] = useState(true);
  const workoutDays = days.filter((d) => d.workout !== null).length;

  return (
    <Card style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={programName}
        onPress={() => setOpen((o) => !o)}
        style={styles.header}
      >
        <View style={styles.headerText}>
          <Text variant="heading">{programName}</Text>
          <Text variant="caption" color="textMuted">
            {workoutDays} {workoutDays === 1 ? 'workout' : 'workouts'}
          </Text>
        </View>
        <Lucide
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={theme.colors.textMuted}
        />
      </Pressable>

      {open
        ? days.map((day, position) => (
            <DayRow
              key={day.dayIndex}
              day={day}
              position={position}
              summary={day.workout ? summaryByWorkoutId.get(day.workout.id) : undefined}
              onToggle={() => {
                setProgramDayCompleted(db, programId, day.dayIndex, day.completedAt === null, Date.now());
                onChanged();
              }}
              onStart={() => day.workout && starter.start(day.workout.id)}
            />
          ))
        : null}

      {open ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/programs/[id]', params: { id: programId, name: programName } })}
          style={styles.edit}
        >
          <Text variant="caption" color="accent">Edit cycle</Text>
        </Pressable>
      ) : null}
    </Card>
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
  edit: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    alignItems: 'flex-end',
  },
});
