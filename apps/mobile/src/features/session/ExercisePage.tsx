import { formatTrackedSet, formatWeight, type CompletedSet, type DistanceUnit, type Unit } from '@overload/domain';
import type { SessionSet } from '@overload/schema';
import { Lucide } from '@react-native-vector-icons/lucide';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { NativeGesture } from 'react-native-gesture-handler';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { WorkoutDetailExercise } from '../../data/sessionRepo';
import { RIR_COLORS } from '../../ui/rirColors';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';
import { formatDurationInput, inputsFor, type SetField } from './setInputs';
import { repsPlaceholder, setProgress, setTableRows, targetLines, type SetTableRow } from './setTable';

/** A field of a set, as the logger addresses it; partial reps sit beside reps. */
export type LogField = SetField | 'partialReps';
export type Focus = { setId: string; field: LogField };

/** The fields a set is typed into, in order: reps split in two once partial reps are on. */
export function fieldsOf(set: SessionSet, trackingType: WorkoutDetailExercise['exercise']['trackingType']): LogField[] {
  return inputsFor(trackingType).flatMap((i) => (i.field === 'reps' && set.partialReps !== null ? ['reps', 'partialReps'] : [i.field]));
}

/** A stored value as it is typed: weight in the display unit, without its suffix. */
export function fieldText(set: SessionSet, field: LogField, unit: Unit): string {
  switch (field) {
    case 'weightKg':
      return set.weightKg === null ? '' : weightText(set.weightKg, unit);
    case 'durationSeconds':
      return formatDurationInput(set.durationSeconds);
    case 'distanceM':
      return set.distanceM?.toString() ?? '';
    case 'reps':
      return set.reps?.toString() ?? '';
    case 'partialReps':
      return set.partialReps?.toString() ?? '';
  }
}

const weightText = (kg: number, unit: Unit) => formatWeight(kg, unit).replace(/\s\S+$/, '');

type Props = {
  entry: WorkoutDetailExercise;
  /** Last time's working sets, in order. */
  previous: CompletedSet[];
  unit: Unit;
  distanceUnit: DistanceUnit;
  width: number;
  /** "Superset 1 of 2", when this exercise is in one. */
  superset: { position: number; count: number } | null;
  focus: Focus | null;
  /** The pager's scroll: a row's swipe blocks it, so the row gets the drag. */
  pagerGesture: NativeGesture;
  /** The text being typed into the focused field. */
  draft: string;
  onFocus: (focus: Focus) => void;
  onToggle: (set: SessionSet) => void;
  onBadge: (set: SessionSet) => void;
  onDelete: (set: SessionSet) => void;
  onAddSet: () => void;
  onAddRound: (parent: SessionSet) => void;
  onInfo: () => void;
  onWarmup: () => void;
  onSuperset: () => void;
  /** A tap on the page that is not on a control: the keypad closes. */
  onBlank: () => void;
};

/** A set on its own, or a drop or myo set with its rounds: one block of the table. */
type Block = { head: SetTableRow; rounds: SetTableRow[] };

function blocksOf(rows: SetTableRow[]): Block[] {
  const blocks: Block[] = [];
  for (const row of rows) {
    if (row.round && blocks.length > 0) blocks[blocks.length - 1]!.rounds.push(row);
    else blocks.push({ head: row, rounds: [] });
  }
  return blocks;
}

/**
 * One exercise of the session, a page of the logger: its name and progress,
 * the actions, and the set table — badge, plan (or last time), the inputs,
 * the tick. A drop or myo set and its rounds share one tall badge, with the
 * button that adds a round at its foot; any row swipes left to delete.
 */
export function ExercisePage(given: Props) {
  // A row swiped open closes before anything else on the page reacts: a sheet
  // opened over an open row was left stuck, and the tap was meant for the page anyway.
  const openRow = useRef<SwipeableMethods | null>(null);
  const closing =
    <A extends unknown[]>(fn: (...args: A) => void) =>
    (...args: A) => {
      openRow.current?.close();
      openRow.current = null;
      fn(...args);
    };
  const props: Props = {
    ...given,
    onFocus: closing(given.onFocus),
    onToggle: closing(given.onToggle),
    onBadge: closing(given.onBadge),
    onAddSet: closing(given.onAddSet),
    onAddRound: closing(given.onAddRound),
    onInfo: closing(given.onInfo),
    onWarmup: closing(given.onWarmup),
    onSuperset: closing(given.onSuperset),
  };
  const { entry, previous, unit, distanceUnit, width, superset, onBadge, onAddSet, onAddRound, onInfo, onWarmup, onSuperset } = props;
  const [showPrevious, setShowPrevious] = useState(false);
  const { exercise } = entry;
  const rows = setTableRows(entry.sessionSets);
  const progress = setProgress(entry.sessionSets);
  const inputs = inputsFor(exercise.trackingType);

  // The same working set last time: warm-ups and rounds have no counterpart.
  let working = -1;
  const previousOf = new Map<string, CompletedSet | undefined>();
  for (const row of rows) {
    if (row.round || row.set.setType === 'warmup') continue;
    working += 1;
    previousOf.set(row.set.id, previous[working]);
  }

  const line = (row: SetTableRow, prior: SessionSet | null) => (
    <SetLine
      key={row.set.id}
      {...props}
      row={row}
      last={previousOf.get(row.set.id)}
      showPrevious={showPrevious}
      onOpen={(row) => {
        if (openRow.current !== row) openRow.current?.close();
        openRow.current = row;
      }}
      // A round waits for the one before it; ticking out of order would log a drop that never happened.
      waiting={prior !== null && prior.completedAt === null}
    />
  );

  return (
    <ScrollView style={{ width }} contentContainerStyle={styles.pageScroll} keyboardShouldPersistTaps="handled">
      {/* Behind everything on the page: a tap that no control takes closes the keypad. */}
      <Pressable accessible={false} onPress={closing(given.onBlank)} style={styles.page}>
      <Text variant="title">{exercise.name}</Text>
      <Text color="textMuted">
        {progress.total === 0
          ? 'No sets yet'
          : superset
            ? `Superset ${superset.position} of ${superset.count} • Round ${progress.current} of ${progress.total}`
            : `Set ${progress.current} of ${progress.total}`}
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipBar} contentContainerStyle={styles.chips}>
        <Chip icon="chart-no-axes-column" label="Info" onPress={onInfo} />
        <Chip icon="flame" label="Warm Up" onPress={onWarmup} />
        <Chip icon="repeat-2" label="Superset" onPress={onSuperset} on={superset !== null} />
      </ScrollView>

      <View style={styles.headRow}>
        <Text variant="caption" color="textMuted" style={styles.badgeCol}>Set</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={showPrevious ? 'Show targets' : 'Show last time'}
          onPress={() => setShowPrevious((p) => !p)}
          style={styles.planHead}
        >
          <Text variant="caption" color="textMuted">{showPrevious ? 'Previous' : 'Target'}</Text>
          <Lucide name="arrow-left-right" size={12} color={theme.colors.textMuted} />
        </Pressable>
        {inputs.map((i) => (
          <Text key={i.field} variant="caption" color="textMuted" style={styles.inputHead}>
            {i.field === 'weightKg' ? unit : i.field === 'reps' ? 'Reps' : i.placeholder}
          </Text>
        ))}
        <View style={styles.checkCol} />
      </View>

      {blocksOf(rows).map(({ head, rounds }) => {
        const done = head.set.completedAt !== null;
        const badge = (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Set ${head.badge}, change set type`}
            onPress={() => onBadge(head.set)}
            style={[styles.badge, done && styles.badgeDone]}
          >
            <Text variant="heading" color={done ? 'onAccent' : 'text'}>{head.badge}</Text>
          </Pressable>
        );
        if (head.set.setType !== 'drop' && head.set.setType !== 'myo') {
          return (
            <View key={head.set.id} style={styles.block}>
              <View style={styles.badgeCol}>{badge}</View>
              <View style={styles.flex}>{line(head, null)}</View>
            </View>
          );
        }
        const lines = [head, ...rounds];
        return (
          <View key={head.set.id} style={styles.block}>
            <View style={[styles.badgeCol, styles.pill]}>
              {badge}
              <View style={styles.flex} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={head.set.setType === 'drop' ? 'Add a drop' : 'Add a round'}
                onPress={() => onAddRound(head.set)}
                style={styles.badge}
              >
                <Lucide name="plus" size={20} color={theme.colors.text} />
              </Pressable>
            </View>
            <View style={styles.flex}>{lines.map((row, i) => line(row, i === 0 ? null : lines[i - 1]!.set))}</View>
          </View>
        );
      })}

      <Pressable accessibilityRole="button" accessibilityLabel="Add set" onPress={onAddSet} style={styles.addSet}>
        <Lucide name="plus" size={22} color={theme.colors.text} />
      </Pressable>
      </Pressable>
    </ScrollView>
  );
}

/** One row of the table, less its badge: the plan, the inputs, the tick. */
function SetLine({ row, last, showPrevious, waiting, onOpen, entry, unit, distanceUnit, focus, draft, pagerGesture, onFocus, onToggle, onDelete }: Props & {
  onOpen: (row: SwipeableMethods) => void;
  row: SetTableRow;
  last: CompletedSet | undefined;
  showPrevious: boolean;
  waiting: boolean;
}) {
  const { set } = row;
  const done = set.completedAt !== null;
  const [main, sub] = showPrevious && !row.round
    ? [last ? formatTrackedSet(last.trackingType, last, unit, distanceUnit) : '—', null]
    : targetLines(set, unit);
  // A myo round is done at its set's weight: shown, not typed.
  const rir = set.setType === 'warmup' || (row.round && set.setType === 'myo') ? null : (set.rir ?? set.targetRir);

  const cell = (field: LogField, placeholder: string) => {
    const focused = focus?.setId === set.id && focus.field === field;
    const text = focused ? draft : fieldText(set, field, unit);
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${field}${text ? `, ${text}` : ''}`}
        disabled={done}
        onPress={() => onFocus({ setId: set.id, field })}
        style={[styles.cell, focused && styles.cellFocused, done && styles.cellDone]}
      >
        <Text variant="numeric" color={text ? 'text' : 'textMuted'} style={styles.cellText}>
          {text || placeholder}
          {focused ? <Text color="accent">|</Text> : null}
        </Text>
      </Pressable>
    );
  };

  const swipe = useRef<SwipeableMethods>(null);
  return (
    <ReanimatedSwipeable
      ref={swipe}
      onSwipeableWillOpen={() => swipe.current && onOpen(swipe.current)}
      blocksExternalGesture={pagerGesture}
      friction={2}
      rightThreshold={40}
      // Only a deliberate drag from the row reveals it; a quick swipe still turns the page.
      dragOffsetFromRightEdge={20}
      renderRightActions={() => (
        <Pressable accessibilityRole="button" accessibilityLabel="Delete set" onPress={() => onDelete(set)} style={styles.delete}>
          <Lucide name="circle-minus" size={24} color={theme.colors.text} />
        </Pressable>
      )}
    >
      <View style={styles.row}>
        <View style={styles.plan}>
          <Text variant="caption" numberOfLines={1}>{main}</Text>
          {sub ? <Text variant="caption" color="textMuted">{sub}</Text> : null}
        </View>
        {fieldsOf(set, entry.exercise.trackingType).map((field) => {
          const placeholder =
            field === 'weightKg'
              ? set.targetWeightKg !== null
                ? weightText(set.targetWeightKg, unit)
                : last?.weightKg != null ? weightText(last.weightKg, unit) : unit
              : field === 'reps'
                ? String(repsPlaceholder(set) ?? (row.round ? '' : (last?.reps ?? '')))
                : field === 'partialReps' ? 'P' : field === 'durationSeconds' ? 'mm:ss' : 'm';
          const half = set.partialReps !== null && (field === 'reps' || field === 'partialReps');
          return (
            <View key={field} style={half ? styles.halfWrap : styles.cellWrap}>
              {cell(field, placeholder)}
              {field === 'reps' && rir !== null ? (
                <View style={[styles.rir, { backgroundColor: RIR_COLORS[Math.min(rir, 6)] }]}>
                  <Text variant="caption" color="onAccent">{rir >= 6 ? '6+' : rir}</Text>
                </View>
              ) : null}
            </View>
          );
        })}
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel={done ? 'Mark set incomplete' : 'Complete set'}
          accessibilityState={{ checked: done, disabled: waiting }}
          disabled={waiting}
          hitSlop={7}
          onPress={() => onToggle(set)}
          style={[styles.check, done && styles.checkOn, waiting && styles.checkWaiting]}
        >
          {done ? <Lucide name="check" size={18} color={theme.colors.onAccent} /> : null}
        </Pressable>
      </View>
    </ReanimatedSwipeable>
  );
}

function Chip({ icon, label, on = false, onPress }: { icon: 'flame' | 'chart-no-axes-column' | 'repeat-2'; label: string; on?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}>
      <Lucide name={icon} size={16} color={on ? theme.colors.onAccent : theme.colors.text} />
      <Text variant="heading" color={on ? 'onAccent' : 'text'}>{label}</Text>
    </Pressable>
  );
}

const ROW = 56;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pageScroll: { flexGrow: 1 },
  page: { flexGrow: 1, padding: theme.spacing.lg, gap: theme.spacing.sm, paddingBottom: theme.spacing.xxl * 2 },
  // Its own height, not the page's: the page grows to take taps below the table.
  chipBar: { flexGrow: 0 },
  chips: { gap: theme.spacing.sm, paddingVertical: theme.spacing.md },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceRaised,
  },
  chipOn: { backgroundColor: theme.colors.text },
  pressed: { opacity: 0.6 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.sm },
  badgeCol: { width: 40, alignItems: 'center', justifyContent: 'center', textAlign: 'center' },
  planHead: { flex: 1.4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  inputHead: { flex: 1, textAlign: 'center' },
  checkCol: { width: 30 },
  block: { flexDirection: 'row', gap: theme.spacing.sm, paddingVertical: theme.spacing.xs },
  // A drop or myo set's badge runs the height of its rounds.
  // Its ends are the circles themselves: inset from the block rather than padded
  // inside, so the badge and the + still sit level with their rows.
  pill: { borderRadius: 20, backgroundColor: theme.colors.surface, justifyContent: 'flex-start', marginVertical: (ROW - 40) / 2 },
  row: { height: ROW, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, backgroundColor: theme.colors.background },
  badge: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  badgeDone: { backgroundColor: theme.colors.success },
  plan: { flex: 1.4, alignItems: 'center' },
  cellWrap: { flex: 1, flexDirection: 'row' },
  halfWrap: { flex: 0.5, flexDirection: 'row' },
  cell: { flex: 1, height: 44, borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  cellFocused: { borderWidth: 2, borderColor: theme.colors.text },
  cellDone: { opacity: 0.6 },
  cellText: { textAlign: 'center' },
  rir: { position: 'absolute', right: -4, bottom: -6, minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  check: { width: 30, height: 30, borderRadius: theme.radius.sm, borderWidth: 2, borderColor: theme.colors.textMuted, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: theme.colors.success, borderColor: theme.colors.success },
  checkWaiting: { opacity: 0.35 },
  // Clear of the tick it slides in beside, so the two never read as one control.
  delete: { width: 72, marginLeft: theme.spacing.lg, backgroundColor: theme.colors.danger, alignItems: 'center', justifyContent: 'center' },
  addSet: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.surfaceRaised, alignItems: 'center', justifyContent: 'center', marginTop: theme.spacing.md },
});
