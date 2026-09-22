import { TRACKING_TYPES, type Exercise, type TrackingType } from '@overload/schema';
import { useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { createCustomExercise, listExercises as listExercisesRepo } from '../../data/exerciseRepo';
import { getActiveGym } from '../../data/gymRepo';
import { db } from '../../db/client';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { ListRow } from '../../ui/ListRow';
import { SearchField } from '../../ui/SearchField';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';
import { textStyle } from '../../ui/typography';

type Props = {
  /** Supplying onSelect turns the list into a picker. */
  onSelect?: (exercise: Exercise) => void;
};

const TRACKING_TYPE_LABELS: Record<TrackingType, string> = {
  weight_reps: 'Weight + reps',
  reps: 'Reps only',
  duration: 'Duration',
  distance_duration: 'Distance + duration',
};

export function ExerciseList({ onSelect }: Props) {
  const [search, setSearch] = useState('');
  // Bumping this forces the list below to re-query after a custom exercise
  // is created, since listExercises is read fresh on every render.
  const [version, setVersion] = useState(0);
  const [formVisible, setFormVisible] = useState(false);
  // Default to the active gym, with a way out: a user standing somewhere else
  // must be able to reach an exercise the filter hides.
  const [gymOnly, setGymOnly] = useState(true);
  const gym = getActiveGym(db);

  // The library is static during a session, so re-query only as the search
  // changes. `version` is bumped after a custom exercise is created and is
  // otherwise unused — it forces this memo to re-run against the same search.
  const availableEquipment = gymOnly && gym ? gym.equipment : null;
  const exercises = useMemo(
    () => listExercisesRepo(db, { search: search.trim() || undefined, availableEquipment }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [search, version, gymOnly, gym?.id, gym?.equipment.length],
  );

  return (
    <View style={styles.container}>
      <SearchField value={search} onChangeText={setSearch} placeholder="Search exercises" />
      {gym ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ checked: gymOnly }}
          onPress={() => setGymOnly((v) => !v)}
          style={styles.gymFilter}
        >
          <Text variant="caption" color={gymOnly ? 'accent' : 'textMuted'}>
            {gymOnly ? `Showing what you can do at ${gym.name}` : 'Showing every exercise'}
          </Text>
          <Text variant="caption" color="textMuted">
            {gymOnly ? 'Show all' : `Only ${gym.name}`}
          </Text>
        </Pressable>
      ) : null}
      <View style={styles.newExerciseContainer}>
        <Button title="New exercise" variant="secondary" onPress={() => setFormVisible(true)} />
      </View>
      <FlatList
        data={exercises}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.emptyContent}
        ListEmptyComponent={
          <EmptyState
            title="No exercises match"
            body={
              gymOnly && gym
                ? `Nothing here matches at ${gym.name}. Tap "Show all" to see every exercise.`
                : 'Try a different name or equipment.'
            }
          />
        }
        renderItem={({ item }) => (
          <ListRow
            title={item.name}
            subtitle={`${item.primaryMuscle} · ${item.equipment}`}
            onPress={onSelect ? () => onSelect(item) : undefined}
          />
        )}
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
                style={[styles.chip, trackingType === type && styles.chipSelected]}
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
  gymFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  newExerciseContainer: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.md },
  // Matches HistoryList/Screen: without flexGrow the EmptyState (itself
  // flex: 1) top-aligns instead of centering, since a FlatList's content
  // container only grows to fill the list when told to.
  emptyContent: { flexGrow: 1 },
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
  chip: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  chipSelected: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  chipLabelSelected: { color: theme.colors.onAccent, fontWeight: '600' },
});
