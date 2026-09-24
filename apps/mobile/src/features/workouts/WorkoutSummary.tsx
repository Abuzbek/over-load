import { Lucide } from '@react-native-vector-icons/lucide';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';
import { MuscleThumb } from '../library/MuscleThumb';
import type { MuscleVolume } from './workoutTargets';

/**
 * The pieces a workout is shown with, wherever it is shown: the workout
 * overview reads them from a saved workout, onboarding's preview from a plan
 * not yet written. Presentational only; nothing here reads the database.
 */

type Figure = 'male' | 'female';
export type SummaryMuscle = { id: string; name: string; primary: boolean };
/** One set line: "7–9 reps", and the reps to leave in reserve. */
export type SummarySet = { key: string; label: string; rir: number | null };

/** RIR 0–6+, hardest to easiest: red, amber, green, blue. The session screen uses the same scale. */
export const RIR_COLORS = ['#E5484D', '#E5484D', '#F2B84B', '#F2B84B', '#3DD68C', '#3DD68C', '#3E8CF0'];

export function RirBadge({ rir }: { rir: number }) {
  return (
    <View accessibilityLabel={`${rir} reps in reserve`} style={[styles.rir, { backgroundColor: RIR_COLORS[Math.min(rir, 6)] }]}>
      <Text variant="caption" color="onAccent">{rir >= 6 ? '6+' : rir}</Text>
    </View>
  );
}

export function TargetMuscleCards({ volumes, figure, selected, onSelect }: {
  volumes: MuscleVolume[];
  figure: Figure;
  /** The muscle picked; its tags are lit on every exercise. */
  selected?: string | null;
  onSelect?: (id: string | null) => void;
}) {
  if (volumes.length === 0) return null;
  return (
    <View style={styles.targets}>
      <Text variant="title">Target Muscles</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cards}>
        {volumes.map((v) => (
          <Pressable
            key={v.id}
            accessibilityRole="button"
            accessibilityState={{ selected: v.id === selected }}
            disabled={!onSelect}
            onPress={() => onSelect?.(v.id === selected ? null : v.id)}
            style={[styles.card, v.id === selected && styles.cardOn]}
          >
            <MuscleThumb figure={figure} muscle={v.name} size={80} />
            <View style={styles.cardText}>
              <Text variant="heading">{v.name}</Text>
              <Text variant="caption" color="textMuted">{v.exercises} {v.exercises === 1 ? 'exercise' : 'exercises'}</Text>
              <Text variant="caption" color="textMuted">{v.sets} {v.sets === 1 ? 'set' : 'sets'}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

export function ExerciseSummaryRow({ name, sets, muscles, highlight, onPress, onMenu }: {
  name: string;
  sets: SummarySet[];
  muscles: SummaryMuscle[];
  highlight?: string | null;
  onPress?: () => void;
  onMenu?: () => void;
}) {
  return (
    <View style={styles.row}>
      {/* Placeholder until the catalogue ships exercise images. */}
      <Pressable accessibilityRole="button" accessibilityLabel={`${name} info`} disabled={!onPress} onPress={onPress} style={styles.thumb}>
        <Lucide name="image" size={22} color={theme.colors.textMuted} />
      </Pressable>
      <Pressable accessibilityRole="button" disabled={!onPress} onPress={onPress} style={styles.main}>
        <Text variant="heading">{name}</Text>
        {sets.map((set, index) => (
          <View key={set.key} style={styles.setLine}>
            <View style={styles.setNumber}>
              <Text variant="caption">{index + 1}</Text>
            </View>
            <Text color="textMuted" style={styles.flex}>{set.label}</Text>
            {set.rir !== null ? <RirBadge rir={set.rir} /> : null}
          </View>
        ))}
        {muscles.length > 0 ? (
          <View style={styles.tags}>
            {muscles.map((m) => {
              const lit = m.id === highlight;
              return (
                <View key={m.id} style={[styles.tag, m.primary ? styles.tagPrimary : styles.tagSecondary, lit && styles.tagLit]}>
                  <Text variant="caption" color={lit ? 'onAccent' : 'text'}>{m.name}</Text>
                </View>
              );
            })}
          </View>
        ) : null}
      </Pressable>
      {onMenu ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${name} options`} hitSlop={10} onPress={onMenu}>
          <Lucide name="ellipsis-vertical" size={22} color={theme.colors.text} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** "5 Exercises · Estimated workout time is 34 min". */
export function WorkoutHeading({ count, minutes }: { count: number; minutes: number }) {
  return (
    <View style={styles.flex}>
      <Text variant="title">{count} {count === 1 ? 'Exercise' : 'Exercises'}</Text>
      {minutes > 0 ? <Text color="textMuted">Estimated workout time is {minutes} min</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  targets: { gap: theme.spacing.md, paddingBottom: theme.spacing.xl },
  cards: { gap: theme.spacing.md },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.lg,
    paddingRight: theme.spacing.xl,
    borderWidth: 2,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
  },
  cardOn: { borderColor: theme.colors.text },
  cardText: { gap: 2 },
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
  main: { flex: 1, gap: theme.spacing.xs },
  setLine: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  setNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceRaised,
  },
  rir: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs, marginTop: theme.spacing.xs },
  tag: { borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing.sm, paddingVertical: 3, borderWidth: 1 },
  tagPrimary: { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.surfaceRaised },
  tagSecondary: { borderColor: theme.colors.border },
  tagLit: { backgroundColor: theme.colors.text, borderColor: theme.colors.text },
});
