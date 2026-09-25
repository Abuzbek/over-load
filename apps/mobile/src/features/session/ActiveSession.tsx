import {
  DEFAULT_REST_SECONDS,
  formatDuration,
  kgToLb,
  plateStepKg,
  restRemainingSeconds,
  toStorageKg,
  type CompletedSet,
} from '@overload/domain';
import type { SessionSet, SetType } from '@overload/schema';
import { Lucide } from '@react-native-vector-icons/lucide';
import { useKeepAwake } from 'expo-keep-awake';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  addRound,
  addSet,
  addWarmupSets,
  completeSet,
  deleteSet,
  detachSuperset,
  discardSession,
  finishSession,
  getSessionDetail,
  lastPerformance,
  pauseSession,
  resumeSession,
  setSetType,
  supersetWithNext,
  uncompleteSet,
  updateSet,
  type SetValues,
  type WorkoutDetailExercise,
} from '../../data/sessionRepo';
import { barLoadingFor, getActiveGym } from '../../data/gymRepo';
import { getDistanceUnit, getProfile, getWarmupScheme, getWeightUnit, setWarmupScheme } from '../../data/settingsRepo';
import { db } from '../../db/client';
import { BottomSheet } from '../../ui/BottomSheet';
import { EmptyState } from '../../ui/EmptyState';
import { Keypad } from '../../ui/Keypad';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';
import { ExerciseInfoSheet } from '../library/ExerciseInfoSheet';
import { ExercisePage, fieldsOf, fieldText, type Focus, type LogField } from './ExercisePage';
import { RirInfoSheet, SetTypeSheet, WarmupSheet } from './LoggerSheets';
import { PlateCalculator } from './PlateCalculator';
import { cancelRestNotification, scheduleRestNotification } from './notifications';
import { parseDecimalInput, parseDuration, parseIntegerInput } from './setInputs';
import { repsPlaceholder, setTableRows } from './setTable';

type Props = { sessionId: string };

/** The strip's exercise images: portrait, as the overview's thumbnails are. */
const THUMB = { width: 60, height: 80 };

/** A warm-up is rest for the working sets, not from them: a short pause. */
const WARMUP_REST_SECONDS = 60;

/** The typed text as the value stored for a field, or undefined when it does not parse. */
function parsed(field: LogField, text: string, unit: 'kg' | 'lb'): number | null | undefined {
  if (text.trim() === '') return null;
  const value =
    field === 'weightKg' || field === 'distanceM'
      ? parseDecimalInput(text)
      : field === 'durationSeconds'
        ? parseDuration(text)
        : parseIntegerInput(text);
  if (value === null) return undefined;
  return field === 'weightKg' ? toStorageKg(value, unit) : value;
}

/**
 * The session logger: one exercise per page, swiped or picked from the strip
 * of exercises at the top. Sets are typed on the logger's own keypad, and every
 * field is saved as soon as it is left, so a crash mid-set loses nothing.
 */
export function ActiveSession({ sessionId }: Props) {
  useKeepAwake();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);
  useFocusEffect(useCallback(() => refresh(), []));

  const detail = getSessionDetail(db, sessionId);
  const unit = getWeightUnit(db);
  const distanceUnit = getDistanceUnit(db);
  const figure = getProfile(db).gender === 'female' ? 'female' : 'male';

  const [page, setPage] = useState(0);
  // The pager's scroll as a gesture a row's swipe-to-delete can block: without
  // it the page takes every horizontal drag and a row can never be swiped.
  const pagerGesture = useMemo(() => Gesture.Native(), []);
  const pager = useRef<FlatList<WorkoutDetailExercise>>(null);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [draft, setDraft] = useState('');
  // The first key replaces what the field showed, as a selected field would.
  const fresh = useRef(true);

  const [rest, setRest] = useState<{ startedAt: number; seconds: number } | null>(null);
  const [typeFor, setTypeFor] = useState<SessionSet | null>(null);
  const [rirHelp, setRirHelp] = useState(false);
  const [warmupFor, setWarmupFor] = useState<WorkoutDetailExercise | null>(null);
  const [infoId, setInfoId] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [supersetSheet, setSupersetSheet] = useState(false);
  const [scheme, setScheme] = useState(() => getWarmupScheme(db));

  // The clock: the workout's length and the rest countdown both read Date.now().
  const [, setTick] = useState(0);
  useEffect(() => {
    const handle = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(handle);
  }, []);

  // Last time's working sets, fixed for the session: one query per exercise.
  const previousByExercise = useMemo(() => {
    const map = new Map<string, CompletedSet[]>();
    for (const entry of detail?.exercises ?? []) {
      map.set(entry.exercise.id, lastPerformance(db, entry.exercise.id, sessionId).filter((s) => s.setType !== 'warmup'));
    }
    return map;
  }, [sessionId, detail?.exercises.length]);

  // How each exercise's bar is loaded in the gym trained at: one lookup per exercise.
  const loadings = useMemo(() => {
    const gymId = getActiveGym(db)?.id;
    return new Map((detail?.exercises ?? []).map((e) => [e.exercise.id, gymId ? barLoadingFor(db, gymId, e.exercise.id) : null]));
  }, [detail?.exercises.length]);

  if (!detail) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <EmptyState title="Workout not found" />
      </View>
    );
  }

  const exercises = detail.exercises;
  const allSets = exercises.flatMap((e) => e.sessionSets.map((set) => ({ set, entry: e })));
  const find = (setId: string) => allSets.find((x) => x.set.id === setId);
  const focused = focus ? find(focus.setId) : undefined;

  /** Saves what is typed in the focused field, if it changed and parses. */
  function commit() {
    if (!focus || !focused || fresh.current) return;
    const value = parsed(focus.field, draft, unit);
    if (value === undefined) return;
    updateSet(db, focus.setId, { [focus.field]: value } as SetValues, Date.now());
  }

  function focusField(next: Focus | null) {
    commit();
    setFocus(next);
    fresh.current = true;
    if (next) {
      const target = find(next.setId);
      setDraft(target ? fieldText(target.set, next.field, unit) : '');
    }
    refresh();
  }

  /** The field after the focused one: the same set's next input, then the next set's first. */
  function nextField(): Focus | null {
    if (!focus || !focused) return null;
    const entry = focused.entry;
    const order = setTableRows(entry.sessionSets)
      .filter((r) => r.set.completedAt === null)
      .flatMap((r) => fieldsOf(r.set, entry.exercise.trackingType).map((field) => ({ setId: r.set.id, field })));
    const at = order.findIndex((f) => f.setId === focus.setId && f.field === focus.field);
    return order[at + 1] ?? null;
  }

  function type(key: string) {
    if (!focus) return;
    const current = fresh.current ? '' : draft;
    fresh.current = false;
    if (key === '.' && current.includes('.')) return;
    setDraft((current === '' && key === '.' ? '0' : current) + key);
  }

  function toggle(set: SessionSet, entry: WorkoutDetailExercise) {
    if (set.completedAt !== null) {
      uncompleteSet(db, set.id);
      refresh();
      return;
    }
    if (focus?.setId === set.id) commit();
    const saved = getSessionDetail(db, sessionId)?.exercises.flatMap((e) => e.sessionSets).find((s) => s.id === set.id) ?? set;
    const last = previousByExercise.get(entry.exercise.id) ?? [];
    const working = setTableRows(entry.sessionSets).filter((r) => !r.round && r.set.setType !== 'warmup').findIndex((r) => r.set.id === set.id);
    // An untouched box logs what it showed: last time's load, the top of the range.
    const values: SetValues = {};
    if (saved.weightKg === null) {
      // A myo round is at its set's weight; a working set at last time's.
      const load = saved.parentSetId ? saved.targetWeightKg : (last[working]?.weightKg ?? null);
      if (load !== null) values.weightKg = load;
    }
    if (saved.reps === null) values.reps = repsPlaceholder(saved) ?? last[working]?.reps ?? null;
    if (saved.rir === null && saved.setType !== 'warmup' && !saved.parentSetId) values.rir = saved.targetRir;
    completeSet(db, set.id, values, Date.now());
    setFocus(null);

    const now = getSessionDetail(db, sessionId)?.exercises ?? exercises;
    const index = now.findIndex((e) => e.sessionExercise.id === entry.sessionExercise.id);
    const pending = (e: WorkoutDetailExercise) => e.sessionSets.some((s) => s.completedAt === null);
    const startRest = () => {
      const seconds = set.setType === 'warmup' ? WARMUP_REST_SECONDS : (entry.sessionExercise.restSeconds ?? DEFAULT_REST_SECONDS);
      setRest({ startedAt: Date.now(), seconds });
      void scheduleRestNotification(seconds);
    };

    // A drop or myo set runs on without rest until its last round.
    const head = saved.parentSetId ?? saved.id;
    const roundLeft = now[index]?.sessionSets.some((s) => (s.parentSetId === head || s.id === head) && s.completedAt === null);
    if ((saved.setType === 'drop' || saved.setType === 'myo') && roundLeft) {
      refresh();
      return;
    }

    // In a superset: straight on to the next exercise of it with sets left, no
    // rest; after the last one, rest, then back to the first with sets left.
    const group = entry.sessionExercise.supersetGroup;
    if (group !== null) {
      const members = now.map((e, i) => ({ e, i })).filter(({ e }) => e.sessionExercise.supersetGroup === group);
      const after = members.find(({ e, i }) => i > index && pending(e));
      if (after) {
        goTo(after.i);
      } else {
        startRest();
        const first = members.find(({ e }) => pending(e));
        if (first && first.i !== index) goTo(first.i);
        else if (!first && members.at(-1)!.i < now.length - 1) goTo(members.at(-1)!.i + 1);
      }
      refresh();
      return;
    }

    startRest();
    // Every set done: on to the next exercise.
    if (now[index] && !pending(now[index]) && index < now.length - 1) goTo(index + 1);
    refresh();
  }

  function goTo(index: number) {
    focusField(null);
    setPage(index);
    pager.current?.scrollToIndex({ index, animated: true });
  }

  function leave(end: 'finish' | 'discard') {
    commit();
    if (end === 'finish') finishSession(db, sessionId, Date.now());
    else discardSession(db, sessionId, Date.now());
    // A scheduled rest notification outlives the screen; it must not buzz after the workout.
    setRest(null);
    void cancelRestNotification();
    router.dismissAll();
    router.replace('/');
  }

  const remaining = rest ? restRemainingSeconds(rest.startedAt, rest.seconds, Date.now()) : null;
  const paused = detail.workout.pausedAt !== null;
  const elapsed = Math.floor(((detail.workout.pausedAt ?? Date.now()) - detail.workout.startedAt) / 1000);
  const current = exercises[page];
  const next = exercises[page + 1];
  const repsFocused = focus && focused && (focus.field === 'reps' || focus.field === 'partialReps');
  const special = focused && (focused.set.setType === 'warmup' || focused.set.parentSetId);
  // The plate calculator, while a barbell weight is typed.
  const loading = focus?.field === 'weightKg' && focused ? loadings.get(focused.entry.exercise.id) : null;
  const typedKg = focus && focused ? (fresh.current ? focused.set.weightKg : (parsed('weightKg', draft, unit) ?? null)) : null;
  const stepKg = loading ? plateStepKg(loading.plates.map((p) => p.kg)) : null;
  const stepBy = (sign: 1 | -1) => {
    if (!stepKg || !loading) return;
    // From exactly what is typed, odd or not: a lifter may own a plate the gym list lacks.
    const next = Math.max((typedKg ?? loading.barKg) + sign * stepKg, loading.barKg);
    fresh.current = false;
    setDraft(String(Math.round((unit === 'lb' ? kgToLb(next) : next) * 100) / 100));
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Workout options" hitSlop={10} onPress={() => setMenu(true)}>
          <Lucide name="menu" size={24} color={theme.colors.text} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={paused ? 'Paused, resume workout' : 'Workout time'}
          disabled={!paused}
          onPress={() => {
            resumeSession(db, sessionId, Date.now());
            refresh();
          }}
          style={styles.clockRow}
        >
          <Text variant="numeric" color={paused ? 'textMuted' : 'text'} style={styles.clock}>{formatDuration(elapsed)}</Text>
          {paused ? <Text variant="caption" color="accent">Paused · tap to resume</Text> : null}
        </Pressable>
        <View style={styles.flex} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={remaining === null ? 'Rest timer' : 'Skip rest'}
          disabled={remaining === null}
          hitSlop={10}
          onPress={() => {
            setRest(null);
            void cancelRestNotification();
          }}
          style={[styles.rest, remaining === 0 && styles.restDone]}
        >
          <Lucide name="timer" size={18} color={remaining === 0 ? theme.colors.onAccent : theme.colors.text} />
          <Text variant="numeric" color={remaining === 0 ? 'onAccent' : 'text'} style={styles.clock}>
            {formatDuration(remaining ?? 0)}
          </Text>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip} style={styles.stripBar}>
        {exercises.map((entry, index) => {
          const done = entry.sessionSets.filter((s) => s.completedAt !== null).length;
          const share = entry.sessionSets.length === 0 ? 0 : done / entry.sessionSets.length;
          return (
            <Pressable key={entry.sessionExercise.id} accessibilityRole="tab" accessibilityLabel={entry.exercise.name} accessibilityState={{ selected: index === page }} onPress={() => goTo(index)}>
              {/* Placeholder until the catalogue ships exercise images, as on the overview. */}
              <View style={[styles.thumb, index === page && styles.thumbOn]}>
                <Lucide name="image" size={22} color={theme.colors.textMuted} />
              </View>
              {/* One bar under a whole superset: it reaches across the gap to its partner. */}
              <View style={[styles.track, entry.sessionExercise.supersetGroup !== null && exercises[index + 1]?.sessionExercise.supersetGroup === entry.sessionExercise.supersetGroup && styles.trackJoined]}>
                <View style={[styles.fill, { width: `${share * 100}%` }, index === page && styles.fillOn]} />
              </View>
            </Pressable>
          );
        })}
        <Pressable accessibilityRole="button" accessibilityLabel="Add exercise" onPress={() => router.push(`/session/${sessionId}/add-exercise`)} style={styles.addThumb}>
          <Lucide name="plus" size={24} color={theme.colors.textMuted} />
        </Pressable>
      </ScrollView>

      {exercises.length === 0 ? (
        <View style={styles.flex}>
          <EmptyState title="No exercises yet" body="Add one to start logging sets." />
        </View>
      ) : (
        <GestureDetector gesture={pagerGesture}>
        <FlatList
          ref={pager}
          style={styles.flex}
          data={exercises}
          keyExtractor={(e) => e.sessionExercise.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          onMomentumScrollEnd={(e) => {
            const index = Math.round(e.nativeEvent.contentOffset.x / width);
            if (index !== page) {
              focusField(null);
              setPage(index);
            }
          }}
          renderItem={({ item }) => (
            <ExercisePage
              entry={item}
              previous={previousByExercise.get(item.exercise.id) ?? []}
              unit={unit}
              distanceUnit={distanceUnit}
              width={width}
              superset={
                item.sessionExercise.supersetGroup === null
                  ? null
                  : (() => {
                      const members = exercises.filter((e) => e.sessionExercise.supersetGroup === item.sessionExercise.supersetGroup);
                      return { position: members.indexOf(item) + 1, count: members.length };
                    })()
              }
              focus={focus}
              draft={draft}
              pagerGesture={pagerGesture}
              onFocus={focusField}
              onBlank={() => focus && focusField(null)}
              onDelete={(set) => {
                if (focus?.setId === set.id) setFocus(null);
                deleteSet(db, set.id, Date.now());
                refresh();
              }}
              onSuperset={() => {
                focusField(null);
                setSupersetSheet(true);
              }}
              onToggle={(set) => toggle(set, item)}
              onBadge={(set) => {
                focusField(null);
                setTypeFor(set);
              }}
              onAddSet={() => {
                addSet(db, item.sessionExercise.id, Date.now());
                refresh();
              }}
              onAddRound={(set) => {
                addRound(db, set.id, Date.now());
                refresh();
              }}
              onInfo={() => setInfoId(item.exercise.id)}
              onWarmup={() => {
                focusField(null);
                setWarmupFor(item);
              }}
            />
          )}
          // The pager's items change height with their sets; re-render them all on any change.
          extraData={[focus, draft, detail]}
        />
        </GestureDetector>
      )}

      {loading ? <PlateCalculator totalKg={typedKg ?? null} loading={loading} unit={unit} /> : null}
      {focus && focused ? (
        <Keypad
          step={loading && stepKg ? { onMinus: () => stepBy(-1), onPlus: () => stepBy(1) } : undefined}
          decimal={focus.field === 'weightKg' || focus.field === 'distanceM'}
          onDigit={type}
          onBackspace={() => {
            const current = fresh.current ? '' : draft;
            fresh.current = false;
            setDraft(current.slice(0, -1));
          }}
          onHide={() => focusField(null)}
          onNext={() => focusField(nextField())}
          rir={
            repsFocused && !special
              ? {
                  value: focused.set.rir ?? focused.set.targetRir,
                  onChange: (rir) => {
                    updateSet(db, focused.set.id, { rir }, Date.now());
                    refresh();
                  },
                  onHelp: () => setRirHelp(true),
                }
              : undefined
          }
          partial={
            repsFocused
              ? {
                  on: focused.set.partialReps !== null,
                  onChange: (on) => {
                    commit();
                    updateSet(db, focused.set.id, { partialReps: on ? (focused.set.partialReps ?? 0) : null }, Date.now());
                    setFocus({ setId: focused.set.id, field: on ? 'partialReps' : 'reps' });
                    fresh.current = true;
                    setDraft(on ? '' : fieldText(focused.set, 'reps', unit));
                    refresh();
                  },
                }
              : undefined
          }
        />
      ) : null}

      <SetTypeSheet
        current={typeFor?.setType ?? null}
        onClose={() => setTypeFor(null)}
        onPick={(setType: SetType) => {
          if (typeFor) setSetType(db, typeFor.id, setType, Date.now());
          setTypeFor(null);
          refresh();
        }}
        onDelete={() => {
          if (typeFor) deleteSet(db, typeFor.id, Date.now());
          setTypeFor(null);
          refresh();
        }}
      />
      <RirInfoSheet visible={rirHelp} onClose={() => setRirHelp(false)} />
      <WarmupSheet
        visible={warmupFor !== null}
        workingKg={
          warmupFor
            ? (warmupFor.sessionSets.find((s) => s.setType !== 'warmup' && !s.parentSetId && s.weightKg !== null)?.weightKg ??
              previousByExercise.get(warmupFor.exercise.id)?.[0]?.weightKg ??
              null)
            : null
        }
        unit={unit}
        scheme={scheme}
        onSchemeChange={(next) => {
          setScheme(next);
          setWarmupScheme(db, next, Date.now());
        }}
        onAdd={(sets) => {
          if (warmupFor) addWarmupSets(db, warmupFor.sessionExercise.id, sets, Date.now());
          setWarmupFor(null);
          refresh();
        }}
        onAddEmpty={() => {
          if (warmupFor) addWarmupSets(db, warmupFor.sessionExercise.id, [{ weightKg: null, reps: null }], Date.now());
          setWarmupFor(null);
          refresh();
        }}
        onClose={() => setWarmupFor(null)}
      />
      <ExerciseInfoSheet exerciseId={infoId} figure={figure} onClose={() => setInfoId(null)} />

      <BottomSheet visible={menu} onClose={() => setMenu(false)} title="Workout Options">
        <View style={{ paddingBottom: insets.bottom + theme.spacing.lg }}>
          <MenuRow
            icon={paused ? 'play' : 'pause'}
            label={paused ? 'Resume workout' : 'Pause workout'}
            onPress={() => {
              if (paused) resumeSession(db, sessionId, Date.now());
              else pauseSession(db, sessionId, Date.now());
              setMenu(false);
              refresh();
            }}
          />
          <MenuRow
            icon="minimize-2"
            label="Minimize workout"
            onPress={() => {
              commit();
              setMenu(false);
              router.back();
            }}
          />
          <MenuRow icon="flag" label="Finish workout" onPress={() => leave('finish')} />
          <MenuRow
            icon="warehouse"
            label="Gym settings"
            chevron
            onPress={() => {
              commit();
              setMenu(false);
              router.push('/settings/gym');
            }}
          />
          <MenuRow icon="trash-2" label="Discard workout" danger onPress={() => leave('discard')} />
        </View>
      </BottomSheet>

      <BottomSheet visible={supersetSheet} onClose={() => setSupersetSheet(false)} title="Superset">
        <View style={{ paddingBottom: insets.bottom + theme.spacing.lg }}>
          {current && current.sessionExercise.supersetGroup !== null ? (
            <MenuRow
              icon="unlink"
              label="Detach from superset"
              onPress={() => {
                detachSuperset(db, current.sessionExercise.id, Date.now());
                setSupersetSheet(false);
                refresh();
              }}
            />
          ) : next && current ? (
            <MenuRow
              icon="link"
              label={`Superset with next: ${next.exercise.name}`}
              onPress={() => {
                supersetWithNext(db, current.sessionExercise.id, Date.now());
                setSupersetSheet(false);
                refresh();
              }}
            />
          ) : (
            <Text color="textMuted" style={styles.sheetNote}>
              A superset pairs this exercise with the next one. This is the last exercise; add another to superset it.
            </Text>
          )}
        </View>
      </BottomSheet>
    </View>
  );
}

type MenuIcon = 'pause' | 'play' | 'minimize-2' | 'flag' | 'warehouse' | 'trash-2' | 'link' | 'unlink';

function MenuRow({ icon, label, danger, chevron, onPress }: { icon: MenuIcon; label: string; danger?: boolean; chevron?: boolean; onPress: () => void }) {
  const color = danger ? theme.colors.danger : theme.colors.text;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}>
      <Lucide name={icon} size={20} color={color} />
      <Text variant="heading" style={[styles.flex, { color }]} numberOfLines={1}>{label}</Text>
      {chevron ? <Lucide name="chevron-right" size={18} color={theme.colors.textMuted} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md },
  clock: { fontSize: 20, lineHeight: 26 },
  rest: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs, borderRadius: theme.radius.pill },
  restDone: { backgroundColor: theme.colors.success },
  stripBar: { flexGrow: 0 },
  strip: { gap: theme.spacing.sm, paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.sm },
  trackJoined: { marginRight: -theme.spacing.sm },
  clockRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  sheetNote: { paddingHorizontal: theme.spacing.xl, paddingVertical: theme.spacing.lg },
  track: { height: 3, marginTop: 4, borderRadius: 2, backgroundColor: theme.colors.border, overflow: 'hidden' },
  fill: { height: 3, backgroundColor: theme.colors.textMuted },
  fillOn: { backgroundColor: theme.colors.text },
  thumb: { width: THUMB.width, height: THUMB.height, borderRadius: theme.radius.md, borderWidth: 2, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  thumbOn: { borderColor: theme.colors.accent },
  addThumb: { width: THUMB.width, height: THUMB.height, borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.lg,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  pressed: { opacity: 0.6 },
});
