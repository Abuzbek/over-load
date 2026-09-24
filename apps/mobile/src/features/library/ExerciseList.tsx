import { Lucide } from '@react-native-vector-icons/lucide';
import { TRACKING_TYPES, type TrackingType } from '@overload/schema';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState, type ComponentProps } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BODYWEIGHT_ONLY,
  createCustomExercise,
  EXERCISE_GROUPS,
  EXERCISE_TYPE_FILTERS,
  exerciseFilterOptions,
  listExercises,
  type ExerciseFilters,
  type ExerciseGroup,
  type ExerciseListItem,
  type ExerciseTypeFilter,
} from '../../data/exerciseRepo';
import { countOwnedEquipment, getActiveGym, listGyms } from '../../data/gymRepo';
import { getProfile } from '../../data/settingsRepo';
import { db } from '../../db/client';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';
import { textStyle } from '../../ui/typography';
import { ExerciseInfoSheet } from './ExerciseInfoSheet';
import { ChoiceSheet, EquipmentSheet, GymSheet, RangeSheet } from './FilterSheets';
import { MuscleThumb } from './MuscleThumb';

type Props = {
  /**
   * Supplying onAdd turns the list into a picker: rows get a + to collect
   * several, Done hands them over in the order they were picked.
   */
  onAdd?: (exerciseIds: string[]) => void;
};

type Filters = Omit<ExerciseFilters, 'search' | 'limit' | 'gymId' | 'muscleIds'> & { muscleIds: string[] };
type SheetName = 'gym' | 'type' | 'laterality' | 'resistance' | 'support' | 'rom' | 'stability';

const TRACKING_TYPE_LABELS: Record<TrackingType, string> = {
  weight_reps: 'Weight + reps',
  reps: 'Reps only',
  duration: 'Duration',
  distance_duration: 'Distance + duration',
};

const TYPE_OPTIONS = (Object.keys(EXERCISE_TYPE_FILTERS) as ExerciseTypeFilter[]).map((value) => ({
  value,
  label: EXERCISE_TYPE_FILTERS[value],
}));

/** Groups longer than this show their first rows and a "Show N more". */
const GROUP_PREVIEW = 5;

const GROUP_ORDER = Object.keys(EXERCISE_GROUPS) as ExerciseGroup[];

/** An exercise's worse recommendation level, 1 (best) to 9; unrated counts as 10. */
const levelOf = (e: ExerciseListItem) =>
  Math.max(e.recommendationStrength ?? 10, e.recommendationHypertrophy ?? 10);

/**
 * A group ranks by the mean level of the rows it shows first — the list is
 * already best-first — so with Quads picked, machines outrank bodyweight when
 * their best quad exercises are better. Ties keep GROUP_ORDER.
 */
const groupScore = (rows: ExerciseListItem[]) => {
  const top = rows.slice(0, GROUP_PREVIEW);
  return top.reduce((sum, e) => sum + levelOf(e), 0) / top.length;
};

const rangeLabel = (name: string, range?: [number, number]) => (range ? `${name} ${range[0]}–${range[1]}` : name);

export function ExerciseList({ onAdd }: Props) {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Filters>({ muscleIds: [] });
  // Default to the active gym, with a way out ("Any equipment"): a user standing
  // somewhere else must be able to reach an exercise the filter hides.
  const [gymId, setGymId] = useState<string | null>(() => getActiveGym(db)?.id ?? null);
  const [sheet, setSheet] = useState<SheetName | null>(null);
  const [infoId, setInfoId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [formVisible, setFormVisible] = useState(false);
  // Bumped on focus (gyms edited under "Manage Gym Profiles") and after a custom
  // exercise is created: both change what the queries below return.
  const [version, setVersion] = useState(0);
  useFocusEffect(useCallback(() => setVersion((v) => v + 1), []));

  const figure = getProfile(db).gender === 'female' ? 'female' : 'male';
  const gyms = useMemo(() => listGyms(db), [version]);
  const counts = useMemo(() => countOwnedEquipment(db), [version]);
  const options = useMemo(() => exerciseFilterOptions(db, gymId), [gymId, version]);
  const exercises = useMemo(
    () => listExercises(db, { ...filters, search: search.trim() || undefined, gymId }),
    [filters, search, gymId, version],
  );

  // Grouped in GROUP_ORDER, each group keeping the list's own order (most
  // searched-for first). Expanding is per group and survives filtering.
  const [expanded, setExpanded] = useState<ReadonlySet<ExerciseGroup>>(new Set());
  const sections = useMemo(() => {
    const byGroup = new Map<ExerciseGroup, ExerciseListItem[]>();
    for (const e of exercises) {
      const rows = byGroup.get(e.group);
      if (rows) rows.push(e);
      else byGroup.set(e.group, [e]);
    }
    const ranked = GROUP_ORDER.filter((g) => byGroup.has(g)).sort(
      (a, b) => groupScore(byGroup.get(a)!) - groupScore(byGroup.get(b)!),
    );
    return ranked.map((group) => {
      const all = byGroup.get(group)!;
      const open = expanded.has(group) || all.length <= GROUP_PREVIEW;
      return { group, total: all.length, hidden: open ? 0 : all.length - GROUP_PREVIEW, data: open ? all : all.slice(0, GROUP_PREVIEW) };
    });
  }, [exercises, expanded]);
  const toggleGroup = (group: ExerciseGroup) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(group)) next.add(group);
      return next;
    });

  const set = <K extends keyof Filters>(key: K) => (value: Filters[K]) => setFilters((f) => ({ ...f, [key]: value }));
  const toggleMuscle = (id: string) =>
    setFilters((f) => ({ ...f, muscleIds: f.muscleIds.includes(id) ? f.muscleIds.filter((m) => m !== id) : [...f.muscleIds, id] }));
  const toggleSelected = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const reset = () => {
    setFilters({ muscleIds: [] });
    setGymId(getActiveGym(db)?.id ?? null);
  };

  const gymName = gyms.find((g) => g.gym.id === gymId)?.gym.name ?? 'Any equipment';
  const equipmentName = (value: string | undefined, list: { id: string; name: string }[]) =>
    value === BODYWEIGHT_ONLY ? 'Bodyweight' : list.find((o) => o.id === value)?.name;
  const chips: { key: SheetName; icon: ComponentProps<typeof Lucide>['name']; label: string; on: boolean }[] = [
    { key: 'gym', icon: 'building-2', label: gymName, on: gymId !== null },
    { key: 'type', icon: 'shapes', label: filters.type ? EXERCISE_TYPE_FILTERS[filters.type] : 'Type', on: Boolean(filters.type) },
    {
      key: 'laterality',
      icon: 'columns-2',
      label: options.lateralities.find((o) => o.id === filters.lateralityId)?.name ?? 'Laterality',
      on: Boolean(filters.lateralityId),
    },
    { key: 'resistance', icon: 'dumbbell', label: equipmentName(filters.resistance, options.resistance) ?? 'Resistance', on: Boolean(filters.resistance) },
    { key: 'support', icon: 'armchair', label: equipmentName(filters.support, options.support) ?? 'Support', on: Boolean(filters.support) },
    { key: 'rom', icon: 'move-horizontal', label: rangeLabel('Range of Motion', filters.rom), on: Boolean(filters.rom) },
    { key: 'stability', icon: 'scale', label: rangeLabel('Stability', filters.stability), on: Boolean(filters.stability) },
  ];
  const close = () => setSheet(null);

  return (
    <View style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={12}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 90 }]}
        ListHeaderComponent={
          <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              <Pressable accessibilityRole="button" accessibilityLabel="Reset filters" onPress={reset} style={styles.resetChip}>
                <Lucide name="rotate-ccw" size={18} color={theme.colors.text} />
              </Pressable>
              {chips.map((chip) => (
                <Pressable
                  key={chip.key}
                  accessibilityRole="button"
                  onPress={() => setSheet(chip.key)}
                  style={[styles.chip, chip.on && styles.chipOn]}
                >
                  <Lucide name={chip.icon} size={16} color={chip.on ? theme.colors.onAccent : theme.colors.text} />
                  <Text color={chip.on ? 'onAccent' : 'text'} variant="heading">{chip.label}</Text>
                  <Lucide name="chevron-down" size={16} color={chip.on ? theme.colors.onAccent : theme.colors.textMuted} />
                </Pressable>
              ))}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.muscles}>
              {options.muscles.map((m) => {
                const on = filters.muscleIds.includes(m.id);
                return (
                  <Pressable
                    key={m.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={m.name}
                    onPress={() => toggleMuscle(m.id)}
                    style={styles.muscle}
                  >
                    <MuscleThumb figure={figure} muscle={m.name} size={72} selected={on} />
                    <Text variant="caption" color={on ? 'accent' : 'textMuted'} numberOfLines={1}>{m.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.countRow}>
              <Text variant="heading">
                {exercises.length} {exercises.length === 1 ? 'exercise' : 'exercises'}
              </Text>
              <Pressable accessibilityRole="button" hitSlop={10} onPress={() => setFormVisible(true)}>
                <Text style={styles.link}>New exercise</Text>
              </Pressable>
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title="No exercises match"
            body={gymId ? `Try other filters, or choose "Any equipment" under ${gymName}.` : 'Try other filters or another name.'}
          />
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text variant="title">{EXERCISE_GROUPS[section.group]}</Text>
            {section.hidden > 0 || (expanded.has(section.group) && section.total > GROUP_PREVIEW) ? (
              <Pressable accessibilityRole="button" hitSlop={10} onPress={() => toggleGroup(section.group)}>
                <Text style={styles.link}>{section.hidden > 0 ? `Show ${section.hidden} more` : 'Show less'}</Text>
              </Pressable>
            ) : null}
          </View>
        )}
        renderItem={({ item }) => (
          <ExerciseRow
            item={item}
            selected={selected.includes(item.id)}
            onPress={() => setInfoId(item.id)}
            onToggle={onAdd ? () => toggleSelected(item.id) : undefined}
          />
        )}
      />

      {/* The inset goes on the inner row: behavior="padding" owns the
          KeyboardAvoidingView's own paddingBottom and resets it to 0. */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.bottomBar}>
        <View style={[styles.bottomRow, { paddingBottom: insets.bottom + theme.spacing.md }]}>
          <View style={styles.search}>
            <Lucide name="search" size={18} color={theme.colors.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search for an exercise"
              placeholderTextColor={theme.colors.textMuted}
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode="while-editing"
              style={styles.searchInput}
            />
          </View>
          {onAdd ? (
            <Pressable accessibilityRole="button" onPress={() => onAdd(selected)} style={styles.done}>
              <Text variant="heading" color="onAccent">
                {selected.length ? `Add ${selected.length}` : 'Done'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </KeyboardAvoidingView>

      <GymSheet visible={sheet === 'gym'} onClose={close} gyms={gyms} counts={counts} value={gymId} onChange={setGymId} />
      <ChoiceSheet visible={sheet === 'type'} onClose={close} title="Type" options={TYPE_OPTIONS} value={filters.type} onChange={set('type')} />
      <ChoiceSheet
        visible={sheet === 'laterality'}
        onClose={close}
        title="Laterality"
        options={options.lateralities.map((o) => ({ value: o.id, label: o.name }))}
        value={filters.lateralityId}
        onChange={set('lateralityId')}
      />
      <EquipmentSheet
        visible={sheet === 'resistance'}
        onClose={close}
        title="Resistance"
        options={options.resistance}
        value={filters.resistance}
        onChange={set('resistance')}
        bodyweight
      />
      <EquipmentSheet
        visible={sheet === 'support'}
        onClose={close}
        title="Support"
        options={options.support}
        value={filters.support}
        onChange={set('support')}
      />
      <RangeSheet visible={sheet === 'rom'} onClose={close} title="Range of Motion" value={filters.rom} onChange={set('rom')} />
      <RangeSheet visible={sheet === 'stability'} onClose={close} title="Stability" value={filters.stability} onChange={set('stability')} />

      <ExerciseInfoSheet
        exerciseId={infoId}
        figure={figure}
        onClose={() => setInfoId(null)}
        onAdd={onAdd ? (id) => onAdd(selected.includes(id) ? selected : [...selected, id]) : undefined}
      />

      <NewExerciseModal
        visible={formVisible}
        onClose={() => setFormVisible(false)}
        onCreated={() => {
          setFormVisible(false);
          setVersion((v) => v + 1);
        }}
      />
    </View>
  );
}

function ExerciseRow({ item, selected, onPress, onToggle }: {
  item: ExerciseListItem;
  selected: boolean;
  onPress: () => void;
  onToggle?: () => void;
}) {
  // primaryMuscle is a display fallback for rows with no muscle links (a custom
  // exercise's free text); some seeded exercises list secondaries only.
  const muscles =
    item.primaryMuscles || item.secondaryMuscles
      ? [item.primaryMuscles, item.secondaryMuscles].filter(Boolean).join(' • ')
      : item.primaryMuscle;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${muscles}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {/* Placeholder until the catalogue ships exercise images. */}
      <View style={styles.thumb}>
        <Lucide name="image" size={20} color={theme.colors.textMuted} />
      </View>
      <View style={styles.rowMain}>
        <Text variant="heading">{item.name}</Text>
        <Text variant="caption" color="textMuted">{muscles}</Text>
      </View>
      {onToggle ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selected }}
          accessibilityLabel={`${selected ? 'Remove' : 'Add'} ${item.name}`}
          hitSlop={8}
          onPress={onToggle}
          style={[styles.add, selected && styles.addOn]}
        >
          <Lucide name={selected ? 'check' : 'plus'} size={20} color={selected ? theme.colors.onAccent : theme.colors.text} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

type NewExerciseModalProps = {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
};

function NewExerciseModal({ visible, onClose, onCreated }: NewExerciseModalProps) {
  const [name, setName] = useState('');
  const [trackingType, setTrackingType] = useState<TrackingType | null>(null);
  const [primaryMuscle, setPrimaryMuscle] = useState('');
  const [equipment, setEquipment] = useState('');

  const canSave = name.trim().length > 0 && trackingType !== null && primaryMuscle.trim().length > 0 && equipment.trim().length > 0;

  const reset = () => {
    setName('');
    setTrackingType(null);
    setPrimaryMuscle('');
    setEquipment('');
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        reset();
        onClose();
      }}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.modalCard}>
          <Text variant="title">New exercise</Text>

          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Name"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
          />

          <Text variant="caption" color="textMuted">
            Tracking type
          </Text>
          <View style={styles.trackingTypeRow}>
            {TRACKING_TYPES.map((type) => (
              <Pressable
                key={type}
                accessibilityRole="button"
                accessibilityLabel={TRACKING_TYPE_LABELS[type]}
                onPress={() => setTrackingType(type)}
                style={[styles.typeChip, trackingType === type && styles.chipSelected]}
              >
                <Text variant="caption" style={trackingType === type && styles.chipLabelSelected}>
                  {TRACKING_TYPE_LABELS[type]}
                </Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            value={primaryMuscle}
            onChangeText={setPrimaryMuscle}
            placeholder="Primary muscle"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
          />

          <TextInput
            value={equipment}
            onChangeText={setEquipment}
            placeholder="Equipment"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
          />

          <Button
            title="Save"
            onPress={() => {
              if (!canSave || trackingType === null) return;
              createCustomExercise(db, {
                name: name.trim(),
                trackingType,
                primaryMuscle: primaryMuscle.trim(),
                equipment: equipment.trim(),
              });
              reset();
              onCreated();
            }}
          />
          <Button
            title="Cancel"
            variant="secondary"
            onPress={() => {
              reset();
              onClose();
            }}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  listContent: { flexGrow: 1 },
  chips: { gap: theme.spacing.md, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.lg },
  resetChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceRaised,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    height: 40,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceRaised,
  },
  chipOn: { backgroundColor: theme.colors.text },
  muscles: { gap: theme.spacing.lg, paddingHorizontal: theme.spacing.lg },
  muscle: { alignItems: 'center', gap: theme.spacing.xs, width: 76 },
  countRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.sm,
  },
  link: { textDecorationLine: 'underline' },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  pressed: { backgroundColor: theme.colors.surface },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceRaised,
  },
  rowMain: { flex: 1, gap: 2 },
  add: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceRaised,
  },
  addOn: { backgroundColor: theme.colors.accent },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  bottomRow: {
    // Solid, so rows scrolling under the bar don't show in the gap below it.
    backgroundColor: theme.colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    height: 50,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  searchInput: { flex: 1, color: theme.colors.text, ...textStyle('body', true) },
  done: {
    height: 50,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.text,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.md,
    borderTopRightRadius: theme.radius.md,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  input: {
    ...textStyle('body', true),
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  trackingTypeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  typeChip: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  chipSelected: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  chipLabelSelected: { color: theme.colors.onAccent, fontWeight: '600' },
});
