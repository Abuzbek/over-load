import { Lucide } from '@react-native-vector-icons/lucide';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { getActiveProgram, getProgramDays } from '../../data/programRepo';
import { createWorkout, listWorkoutSummaries } from '../../data/workoutRepo';
import { db } from '../../db/client';
import { Button } from '../../ui/Button';
import { ListRow } from '../../ui/ListRow';
import { Sheet } from '../../ui/Sheet';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';
import { MetricsSheet, WeightSheet } from '../body/BodySheets';
import { PhotosSheet } from '../body/PhotosSheet';

type IconName = 'route' | 'dumbbell';

function Shortcut({ icon, title, onPress }: { icon: IconName; title: string; onPress: () => void }) {
  return (
    <ListRow
      title={title}
      leading={<Lucide name={icon} size={20} color={theme.colors.text} />}
      right={<Lucide name="chevron-right" size={18} color={theme.colors.textMuted} />}
      onPress={onPress}
    />
  );
}

type Entry = 'weight' | 'photos' | 'metrics' | null;
/** How long the shortcuts Modal takes to slide away. */
const MODAL_CLOSE_MS = 350;

/** A round shortcut: an icon in a disc, its name under it. */
function Action({ icon, label, onPress }: { icon: 'weight' | 'camera' | 'ruler' | 'history'; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
      <View style={styles.disc}>
        <Lucide name={icon} size={22} color={theme.colors.text} />
      </View>
      <Text variant="caption">{label}</Text>
    </Pressable>
  );
}

/** The active program's next day still to do this cycle, with what it trains. */
function upNext() {
  const program = getActiveProgram(db);
  if (!program) return null;
  const day = getProgramDays(db, program.id).find((d) => d.workout && d.completedAt === null);
  if (!day?.workout) return null;
  const summary = listWorkoutSummaries(db).find((s) => s.workout.id === day.workout!.id);
  return { workout: day.workout, exercises: summary?.exerciseNames ?? [], muscles: summary?.primaryMuscles ?? [] };
}

/**
 * The tab bar's centre button: log the body (weight, photos, measurements),
 * jump to history or the next workout, and the only place a program or
 * workout is created.
 *
 * New Program opens the Create Program flow (/programs/new). New Workout names the workout here instead:
 * the workout library is the Workout tab's own section, not a page to route
 * to, so there is nowhere else for the naming to live.
 */
export function ShortcutsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const inputRef = useRef<TextInput>(null);
  const [entry, setEntry] = useState<Entry>(null);
  const next = visible ? upNext() : null;

  // Not Sheet's onShow: the naming step swaps the contents of a Modal that is
  // already on screen, so the Modal never "shows" again and onShow never fires.
  // The input carries autoFocus for iOS, where it mounts fresh and that is
  // enough; this deferred focus is the Android fallback, where autoFocus inside
  // a Modal is unreliable. Focusing in the same tick as the state change does
  // not take — the input is not attached yet.
  useEffect(() => {
    if (!naming) return;
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [naming]);

  // Whatever dismissed the sheet, it must not reopen mid-flow: `visible` is
  // owned by the tab layout, so a close that skips close() would otherwise
  // leave `naming` true and the next + press would land on the name field.
  useEffect(() => {
    if (!visible) {
      setNaming(false);
      setName('');
    }
  }, [visible]);

  function close() {
    setNaming(false);
    setName('');
    onClose();
  }

  // A body sheet opens once this Modal has animated away: presented while it
  // is still closing, iOS drops the second. (Modal's onDismiss would say when,
  // but it is iOS-only.)
  function open(kind: Exclude<Entry, null>) {
    close();
    setTimeout(() => setEntry(kind), MODAL_CLOSE_MS);
  }

  function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const workout = createWorkout(db, trimmed);
    close();
    // Straight into the builder: a workout with no exercises is not useful yet,
    // and it is already in the library for the Workout tab to list.
    router.push(`/workouts/${workout.id}`);
  }

  // ONE Sheet, contents switched inside it. Returning a different <Sheet>
  // element for the naming step unmounts this Modal and mounts another in the
  // same frame, and the sheet simply disappears.
  return (
    <>
    <Sheet
      visible={visible}
      onRequestClose={close}
      anchor="bottom"
      title={naming ? 'New workout' : 'Shortcuts'}
    >
      {naming ? (
        <>
          <TextInput
            ref={inputRef}
            value={name}
            onChangeText={setName}
            placeholder="Workout name"
            placeholderTextColor={theme.colors.textMuted}
            autoFocus
            onSubmitEditing={create}
            style={styles.input}
          />
          <Button title="Create" onPress={create} />
          <Button title="Cancel" variant="secondary" onPress={close} />
        </>
      ) : (
        <>
          <View style={styles.actions}>
            <Action icon="weight" label="Weight" onPress={() => open('weight')} />
            <Action icon="camera" label="Photos" onPress={() => open('photos')} />
            <Action icon="ruler" label="Metrics" onPress={() => open('metrics')} />
            <Action
              icon="history"
              label="History"
              onPress={() => {
                close();
                router.push('/history');
              }}
            />
          </View>
          {next ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Up next, ${next.workout.name}`}
              onPress={() => {
                close();
                router.push(`/workouts/${next.workout.id}`);
              }}
              style={({ pressed }) => [styles.upNext, pressed && styles.pressed]}
            >
              <View style={styles.upNextText}>
                <Text variant="heading">Up Next · {next.workout.name}</Text>
                {next.exercises.length > 0 ? (
                  <Text variant="caption" color="textMuted" numberOfLines={2}>{next.exercises.join(', ')}</Text>
                ) : null}
                {next.muscles.length > 0 ? (
                  <View style={styles.tags}>
                    {next.muscles.slice(0, 5).map((m) => (
                      <View key={m} style={styles.tag}>
                        <Text variant="caption" color="textMuted">{m}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
              <Lucide name="chevron-right" size={18} color={theme.colors.textMuted} />
            </Pressable>
          ) : null}
          <View style={styles.rows}>
            <Shortcut
              icon="route"
              title="New Program"
              onPress={() => {
                onClose();
                router.push('/programs/new');
              }}
            />
            <Shortcut icon="dumbbell" title="New Workout" onPress={() => setNaming(true)} />
          </View>
          <Button title="Close" variant="secondary" onPress={close} />
        </>
      )}
    </Sheet>
    <WeightSheet visible={entry === 'weight'} onClose={() => setEntry(null)} />
    <PhotosSheet visible={entry === 'photos'} onClose={() => setEntry(null)} />
    <MetricsSheet visible={entry === 'metrics'} onClose={() => setEntry(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  // Cancel the Sheet card's horizontal padding so the rows and their dividers
  // run the full width, as list rows do everywhere else.
  rows: { marginHorizontal: -theme.spacing.lg },
  actions: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: theme.spacing.sm },
  action: { flex: 1, alignItems: 'center', gap: theme.spacing.sm },
  disc: { width: 52, height: 52, borderRadius: 26, backgroundColor: theme.colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
  upNext: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  upNextText: { flex: 1, gap: theme.spacing.xs },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  tag: { backgroundColor: theme.colors.surfaceRaised, borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing.sm, paddingVertical: 2 },
  input: {
    minHeight: 44,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
  },
});
