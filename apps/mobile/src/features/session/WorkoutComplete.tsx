import { formatDistance, formatDuration, formatTrackedSet, formatWeight, totalVolumeKg, type PersonalRecordType } from '@overload/domain';
import { Lucide } from '@react-native-vector-icons/lucide';
import { router } from 'expo-router';
import { useEffect, useMemo, useState, type ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { muscleLoad } from '../../data/historyRepo';
import { getSessionDetail, sessionRecords, setSessionTimes, toCompletedSet, type SessionRecord, type WorkoutDetailExercise } from '../../data/sessionRepo';
import { getDistanceUnit, getProfile, getWeightUnit } from '../../data/settingsRepo';
import { db } from '../../db/client';
import { BottomSheet } from '../../ui/BottomSheet';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Fireworks } from '../../ui/Fireworks';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';
import { WheelColumn, WheelRow } from '../../ui/WheelColumn';
import { MuscleHeatmap } from '../progress/MuscleHeatmap';

type Icon = ComponentProps<typeof Lucide>['name'];

/** A muscle counts as fully worked, for this one workout's body map, at this many sets. */
const SESSION_TARGET = 3;

const RECORD: Record<PersonalRecordType, { label: string; icon: Icon }> = {
  est_1rm: { label: '1-RM Record', icon: 'medal' },
  max_reps: { label: 'Reps Record', icon: 'badge-check' },
  max_duration: { label: 'Duration Record', icon: 'badge-check' },
  max_distance: { label: 'Distance Record', icon: 'badge-check' },
  max_weight: { label: 'Weight Record', icon: 'medal' },
  max_volume: { label: 'Volume Record', icon: 'medal' },
};

/** h:mm:ss, the workout's length. */
const clock = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  return `${h}:${formatDuration(seconds % 3600).padStart(5, '0')}`;
};
const time = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const range = (n: number) => Array.from({ length: n }, (_, i) => ({ value: i, label: String(i).padStart(2, '0') }));

/**
 * After Finish: fireworks, the muscles the workout trained, the records it set,
 * its details (start and length editable) and each exercise's sets.
 */
export function WorkoutComplete({ sessionId }: { sessionId: string }) {
  const insets = useSafeAreaInsets();
  const [, setVersion] = useState(0);
  const [editing, setEditing] = useState<'start' | 'duration' | null>(null);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const detail = getSessionDetail(db, sessionId);
  const unit = getWeightUnit(db);
  const distanceUnit = getDistanceUnit(db);
  const figure = getProfile(db).gender === 'female' ? 'female' : 'male';
  const records = useMemo(() => sessionRecords(db, sessionId), [sessionId]);
  const load = useMemo(() => new Map(muscleLoad(db, 0, Number.MAX_SAFE_INTEGER, sessionId).map((m) => [m.muscle, m.sets])), [sessionId]);

  const done = () => (router.canDismiss() ? router.dismissAll() : router.replace('/'));

  if (!detail || detail.workout.endedAt === null) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <EmptyState title="Workout not found" />
        <Button title="Done" onPress={done} />
      </View>
    );
  }
  const { startedAt, endedAt } = detail.workout;
  const worked = detail.exercises.filter((e) => e.sessionSets.some((s) => s.completedAt !== null));
  const working = (e: WorkoutDetailExercise) =>
    e.sessionSets
      .filter((s) => s.completedAt !== null && s.setType !== 'warmup' && !s.parentSetId)
      .map((s) => toCompletedSet(s, e.exercise.id, e.exercise.trackingType));
  const volume = totalVolumeKg(worked.flatMap(working));
  const nameOf = (id: string) => detail.exercises.find((e) => e.exercise.id === id)?.exercise.name ?? '';
  const save = (times: { startedAt: number; endedAt: number }) => {
    setSessionTimes(db, sessionId, times, Date.now());
    setEditing(null);
    setVersion((v) => v + 1);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={done}>
          <Lucide name="x" size={24} color={theme.colors.text} />
        </Pressable>
        <Text variant="heading" style={styles.title}>Workout Complete</Text>
        <View style={styles.side} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>
        <View style={styles.body}>
          <MuscleHeatmap load={load} target={SESSION_TARGET} figure={figure} />
        </View>

        {records.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.records}>
            {records.map((r) => (
              <RecordCard key={`${r.exerciseId}-${r.type}`} record={r} name={nameOf(r.exerciseId)} unit={unit} distanceUnit={distanceUnit} />
            ))}
          </ScrollView>
        ) : null}

        <Text variant="title" style={styles.section}>Workout Details</Text>
        <DetailRow icon="shopping-bag" label="Volume" value={formatWeight(volume, unit)} />
        <DetailRow icon="log-in" label="Start Time" sub={`${new Date(startedAt).toLocaleDateString()} ${time(startedAt)}`} onEdit={() => setEditing('start')} />
        <DetailRow icon="clock" label="Duration" sub={clock(Math.round((endedAt - startedAt) / 1000))} onEdit={() => setEditing('duration')} />
        {detail.workout.workoutId ? (
          <DetailRow
            icon="dumbbell"
            label="Edit Workout"
            sub="Go to the workout editor"
            onEdit={() => router.push({ pathname: '/workouts/[id]', params: { id: detail.workout.workoutId! } })}
          />
        ) : null}

        <Text variant="title" style={styles.section}>Details</Text>
        {worked.map((e) => {
          const sets = working(e);
          const isOpen = open.has(e.sessionExercise.id);
          const record = records.find((r) => r.exerciseId === e.exercise.id);
          const reps = sets.reduce((n, s) => n + (s.reps ?? 0), 0);
          const amount =
            e.exercise.trackingType === 'weight_reps'
              ? `${formatWeight(totalVolumeKg(sets), unit)} volume`
              : e.exercise.trackingType === 'reps'
                ? `${reps} reps`
                : null;
          return (
            <View key={e.sessionExercise.id} style={styles.exercise}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpen }}
                onPress={() =>
                  setOpen((prev) => {
                    const next = new Set(prev);
                    if (!next.delete(e.sessionExercise.id)) next.add(e.sessionExercise.id);
                    return next;
                  })
                }
                style={styles.exerciseRow}
              >
                <View style={styles.thumb}>
                  <Lucide name="image" size={20} color={theme.colors.textMuted} />
                </View>
                <View style={styles.flex}>
                  <Text variant="heading">{e.exercise.name}</Text>
                  {amount ? <Text color="textMuted">{amount}</Text> : null}
                  <Text color="textMuted">{sets.length} {sets.length === 1 ? 'set' : 'sets'}</Text>
                  {record ? (
                    <View style={styles.recordLine}>
                      <Lucide name={RECORD[record.type].icon} size={14} color={theme.colors.accent} />
                      <Text color="text">{recordValue(record, unit, distanceUnit)}</Text>
                    </View>
                  ) : null}
                </View>
                <Lucide name={isOpen ? 'chevron-up' : 'chevron-down'} size={20} color={theme.colors.text} />
              </Pressable>
              {isOpen
                ? (() => {
                    let n = 0;
                    return e.sessionSets
                      .filter((s) => s.completedAt !== null)
                      .map((s) => (
                        <Text key={s.id} variant="numeric" color="textMuted" style={styles.setLine}>
                          {s.setType === 'warmup' ? 'W' : s.parentSetId ? '↳' : ++n}  {formatTrackedSet(e.exercise.trackingType, s, unit, distanceUnit)}
                        </Text>
                      ));
                  })()
                : null}
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing.lg }]}>
        <Button title="Done" onPress={done} />
      </View>

      <Fireworks />

      <StartSheet
        visible={editing === 'start'}
        startedAt={startedAt}
        onClose={() => setEditing(null)}
        onSave={(start) => save({ startedAt: start, endedAt: start + (endedAt - startedAt) })}
      />
      <DurationSheet
        visible={editing === 'duration'}
        seconds={Math.round((endedAt - startedAt) / 1000)}
        onClose={() => setEditing(null)}
        onSave={(seconds) => save({ startedAt, endedAt: startedAt + seconds * 1000 })}
      />
    </View>
  );
}

function recordValue(r: SessionRecord, unit: 'kg' | 'lb', distanceUnit: Parameters<typeof formatDistance>[1]) {
  switch (r.type) {
    case 'max_reps':
      return `${r.value} reps`;
    case 'max_duration':
      return formatDuration(r.value);
    case 'max_distance':
      return formatDistance(r.value, distanceUnit);
    default:
      return formatWeight(r.value, unit);
  }
}

function RecordCard({ record, name, unit, distanceUnit }: { record: SessionRecord; name: string; unit: 'kg' | 'lb'; distanceUnit: Parameters<typeof formatDistance>[1] }) {
  const gain = Math.round(((record.value - record.previous) / record.previous) * 100);
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Lucide name={RECORD[record.type].icon} size={30} color={theme.colors.accent} />
        <View style={styles.cardValue}>
          <Text variant="heading">{recordValue(record, unit, distanceUnit)}</Text>
          <Text variant="caption" color="textMuted">+{Math.max(gain, 1)}%</Text>
        </View>
      </View>
      <Text variant="heading" numberOfLines={2}>{name}</Text>
      <Text variant="caption" color="textMuted">{RECORD[record.type].label}</Text>
    </View>
  );
}

function DetailRow({ icon, label, sub, value, onEdit }: { icon: Icon; label: string; sub?: string; value?: string; onEdit?: () => void }) {
  return (
    <View style={styles.detail}>
      <Lucide name={icon} size={22} color={theme.colors.text} />
      <View style={[styles.flex, styles.detailMain]}>
        <View style={styles.flex}>
          <Text variant="heading">{label}</Text>
          {sub ? <Text color="textMuted">{sub}</Text> : null}
        </View>
        {value ? <Text color="textMuted">{value}</Text> : null}
        {onEdit ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${label}`} onPress={onEdit} style={styles.edit}>
            <Text variant="heading">Edit</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** The start's hour and minute, on its own day. */
function StartSheet({ visible, startedAt, onClose, onSave }: { visible: boolean; startedAt: number; onClose: () => void; onSave: (ms: number) => void }) {
  const d = new Date(startedAt);
  const [hour, setHour] = useState(d.getHours());
  const [minute, setMinute] = useState(d.getMinutes());
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!visible) return;
    setHour(new Date(startedAt).getHours());
    setMinute(new Date(startedAt).getMinutes());
  }, [visible, startedAt]);
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Start Time">
      <View style={[styles.sheet, { paddingBottom: insets.bottom + theme.spacing.lg }]}>
        <WheelRow>
          <WheelColumn accessibilityLabel="Hour" options={range(24)} value={hour} onChange={setHour} />
          <WheelColumn accessibilityLabel="Minute" options={range(60)} value={minute} onChange={setMinute} />
        </WheelRow>
        <Button
          title="Save"
          onPress={() => {
            const next = new Date(startedAt);
            next.setHours(hour, minute);
            onSave(next.getTime());
          }}
        />
      </View>
    </BottomSheet>
  );
}

function DurationSheet({ visible, seconds, onClose, onSave }: { visible: boolean; seconds: number; onClose: () => void; onSave: (seconds: number) => void }) {
  const [hours, setHours] = useState(Math.floor(seconds / 3600));
  const [minutes, setMinutes] = useState(Math.floor((seconds % 3600) / 60));
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!visible) return;
    setHours(Math.floor(seconds / 3600));
    setMinutes(Math.floor((seconds % 3600) / 60));
  }, [visible, seconds]);
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Duration">
      <View style={[styles.sheet, { paddingBottom: insets.bottom + theme.spacing.lg }]}>
        <WheelRow>
          <WheelColumn accessibilityLabel="Hours" options={range(6)} value={hours} onChange={setHours} />
          <WheelColumn accessibilityLabel="Minutes" options={range(60)} value={minutes} onChange={setMinutes} />
        </WheelRow>
        <Button title="Save" disabled={hours === 0 && minutes === 0} onPress={() => onSave(hours * 3600 + minutes * 60)} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md },
  title: { flex: 1, textAlign: 'center' },
  side: { width: 24 },
  body: { paddingHorizontal: theme.spacing.xl, paddingVertical: theme.spacing.lg },
  records: { gap: theme.spacing.md, paddingHorizontal: theme.spacing.lg },
  card: {
    width: 220,
    gap: theme.spacing.sm,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: theme.spacing.md },
  cardValue: { alignItems: 'flex-end' },
  section: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.xxl, paddingBottom: theme.spacing.md },
  detail: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xl, paddingLeft: theme.spacing.lg },
  detailMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.lg,
    paddingRight: theme.spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  edit: { paddingHorizontal: theme.spacing.xl, paddingVertical: theme.spacing.md, borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceRaised },
  exercise: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border, paddingBottom: theme.spacing.sm },
  exerciseRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg, padding: theme.spacing.lg },
  thumb: { width: 56, height: 72, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceRaised },
  recordLine: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  setLine: { paddingLeft: 56 + theme.spacing.lg * 2, paddingBottom: theme.spacing.xs },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, backgroundColor: theme.colors.background },
  sheet: { paddingHorizontal: theme.spacing.xl, gap: theme.spacing.xl },
});
