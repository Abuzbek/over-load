import { formatWeight, smartWarmupScheme, warmupSets, type Unit, type WarmupStep } from '@overload/domain';
import type { SetType } from '@overload/schema';
import { Lucide } from '@react-native-vector-icons/lucide';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomSheet } from '../../ui/BottomSheet';
import { RIR_COLORS } from '../../ui/rirColors';
import { Segmented } from '../../ui/Segmented';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';

const SET_TYPES: { type: SetType; title: string; body: string }[] = [
  { type: 'normal', title: 'Standard Set', body: 'A normal set of a fixed weight and target repetitions' },
  { type: 'warmup', title: 'Warm-Up Set', body: 'A set with a lighter weight to prepare your muscles for heavier working sets' },
  { type: 'drop', title: 'Drop Set', body: 'A set where you keep repping with progressively lower weights after reaching failure at a heavier load' },
  { type: 'myo', title: 'Myo Set', body: 'A set where you keep repping with short rests and fewer reps each round, at the same weight' },
  { type: 'failure', title: 'Failure Set', body: 'A set taken until you can no longer keep proper form (compounds) or complete another rep (isolation)' },
];

function Bottom({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return <View style={{ paddingBottom: insets.bottom + theme.spacing.lg }}>{children}</View>;
}

/** Tapping a set's badge: what kind of set it is, or remove it. */
export function SetTypeSheet({ current, onPick, onDelete, onClose }: {
  /** The set being changed; null closes the sheet. */
  current: SetType | null;
  onPick: (type: SetType) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet visible={current !== null} onClose={onClose} title="Set Type">
      <Bottom>
        {SET_TYPES.map((t) => (
          <Pressable
            key={t.type}
            accessibilityRole="radio"
            accessibilityState={{ selected: t.type === current }}
            onPress={() => onPick(t.type)}
            style={styles.option}
          >
            <View style={styles.flex}>
              <Text variant="heading">{t.title}</Text>
              <Text color="textMuted">{t.body}</Text>
            </View>
            <View style={[styles.radio, t.type === current && styles.radioOn]}>
              {t.type === current ? <View style={styles.radioDot} /> : null}
            </View>
          </Pressable>
        ))}
        <Pressable accessibilityRole="button" onPress={onDelete} style={styles.option}>
          <Lucide name="trash-2" size={20} color={theme.colors.danger} />
          <Text variant="heading" style={[styles.flex, { color: theme.colors.danger }]}>Delete set</Text>
        </Pressable>
      </Bottom>
    </BottomSheet>
  );
}

/** The keypad's "?": the RIR scale and what it is for. */
export function RirInfoSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="What is RIR?">
      <Bottom>
        <View style={styles.scale}>
          <View style={styles.scaleEnds}>
            <View>
              <Text variant="heading">Hardest</Text>
              <Text variant="caption" color="textMuted">No reps in reserve</Text>
            </View>
            <View style={styles.right}>
              <Text variant="heading">Easiest</Text>
              <Text variant="caption" color="textMuted">Many reps in reserve</Text>
            </View>
          </View>
          <View style={styles.scaleDots}>
            {RIR_COLORS.map((color, n) => (
              <View key={n} style={[styles.dot, { backgroundColor: color }]}>
                <Text variant="caption" color="onAccent">{n === 6 ? '6+' : n}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={styles.copy}>
          <Text variant="heading">What you see above is an RIR scale</Text>
          <Text color="textMuted">
            RIR stands for Reps in Reserve: a simple way to describe how challenging a set felt — how many more reps you
            could have done with good form.
          </Text>
          <Text color="textMuted">
            A lower RIR (0–1) means you pushed to your limit. A higher RIR (4–6+) means the set felt easier and you had
            plenty left in the tank.
          </Text>
          <Text color="textMuted">
            You do not have to track RIR, but it is strongly recommended: how close you get to failure tells the app how
            strong you are today and how quickly you tire.
          </Text>
        </View>
      </Bottom>
    </BottomSheet>
  );
}

type Mode = 'smart' | 'scheme';

/**
 * The warm-up calculator. Smart picks the steps from the working weight;
 * Scheme uses the user's own list of % × reps, editable here and kept.
 * Each row adds that one warm-up; "Add all" adds every row.
 */
export function WarmupSheet({ visible, workingKg, unit, scheme, onSchemeChange, onAdd, onAddEmpty, onClose }: {
  visible: boolean;
  /** The first working set's load; null until one is known. */
  workingKg: number | null;
  unit: Unit;
  scheme: WarmupStep[];
  onSchemeChange: (scheme: WarmupStep[]) => void;
  onAdd: (sets: { weightKg: number; reps: number }[]) => void;
  onAddEmpty: () => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>('smart');
  const [draft, setDraft] = useState(scheme);
  useEffect(() => setDraft(scheme), [scheme]);

  const steps = mode === 'smart' ? smartWarmupScheme(workingKg ?? 0) : draft;
  const rows = workingKg ? warmupSets(workingKg, steps) : [];

  const edit = (i: number, key: keyof WarmupStep, text: string) => {
    const value = Number.parseInt(text.replace(/\D/g, ''), 10);
    setDraft((d) => d.map((s, j) => (j === i ? { ...s, [key]: Number.isFinite(value) ? value : 0 } : s)));
  };
  const save = () => onSchemeChange(draft.filter((s) => s.percent > 0 && s.percent < 100 && s.reps > 0));

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Warm Up">
      <Bottom>
        <View style={styles.calcHead}>
          <Text variant="title">Set Calculator</Text>
          <View style={styles.flex}>
            <Segmented
              accessibilityLabel="Warm-up calculator"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'smart', label: 'Smart' },
                { value: 'scheme', label: 'Scheme' },
              ]}
            />
          </View>
        </View>

        {workingKg === null ? (
          <Text color="textMuted" style={styles.note}>Enter the first working set's weight and the warm-ups are worked out from it.</Text>
        ) : null}

        {mode === 'scheme'
          ? draft.map((step, i) => {
              const row = rows.find((r) => r.percent === step.percent);
              return (
                <View key={i} style={styles.warmRow}>
                  <View style={styles.badge}><Text variant="heading">W</Text></View>
                  <Text color="textMuted" style={styles.flex}>{row ? formatWeight(row.weightKg, unit) : '—'}</Text>
                  <BottomSheetTextInput
                    accessibilityLabel={`Warm-up ${i + 1} percent`}
                    keyboardType="number-pad"
                    value={String(step.percent)}
                    onChangeText={(t) => edit(i, 'percent', t)}
                    onEndEditing={save}
                    style={styles.cell}
                  />
                  <Text color="textMuted">%</Text>
                  <BottomSheetTextInput
                    accessibilityLabel={`Warm-up ${i + 1} reps`}
                    keyboardType="number-pad"
                    value={String(step.reps)}
                    onChangeText={(t) => edit(i, 'reps', t)}
                    onEndEditing={save}
                    style={styles.cell}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove warm-up ${i + 1}`}
                    hitSlop={8}
                    onPress={() => {
                      const next = draft.filter((_, j) => j !== i);
                      setDraft(next);
                      onSchemeChange(next);
                    }}
                  >
                    <Lucide name="x" size={18} color={theme.colors.textMuted} />
                  </Pressable>
                </View>
              );
            })
          : rows.map((row, i) => (
              <View key={i} style={styles.warmRow}>
                <View style={styles.badge}><Text variant="heading">W</Text></View>
                <View style={styles.flex}>
                  <Text>{row.percent}% of working weight</Text>
                  <Text color="textMuted">{formatWeight(row.weightKg, unit)} × {row.reps}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Add warm-up ${formatWeight(row.weightKg, unit)} for ${row.reps}`}
                  hitSlop={8}
                  onPress={() => onAdd([{ weightKg: row.weightKg, reps: row.reps }])}
                  style={styles.plus}
                >
                  <Lucide name="plus" size={18} color={theme.colors.text} />
                </Pressable>
              </View>
            ))}

        {mode === 'scheme' ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              const next = [...draft, { percent: Math.min((draft.at(-1)?.percent ?? 40) + 10, 90), reps: 3 }];
              setDraft(next);
              onSchemeChange(next);
            }}
            style={styles.more}
          >
            <Lucide name="plus" size={20} color={theme.colors.text} />
            <Text>Add a step to the scheme</Text>
          </Pressable>
        ) : null}

        <View style={styles.divider} />
        <Text variant="title" style={styles.moreTitle}>More Options</Text>
        {rows.length > 0 ? (
          <Pressable accessibilityRole="button" onPress={() => onAdd(rows.map((r) => ({ weightKg: r.weightKg, reps: r.reps })))} style={styles.more}>
            <Lucide name="flame" size={20} color={theme.colors.text} />
            <View>
              <Text variant="heading">Add all {rows.length} warm-ups</Text>
              <Text variant="caption" color="textMuted">Before the working sets</Text>
            </View>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" onPress={onAddEmpty} style={styles.more}>
          <Lucide name="plus" size={20} color={theme.colors.text} />
          <View>
            <Text variant="heading">Add empty warm-up set</Text>
            <Text variant="caption" color="textMuted">Add a warm-up set to your workout</Text>
          </View>
        </Pressable>
      </Bottom>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  right: { alignItems: 'flex-end' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.lg,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: theme.colors.textMuted, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: theme.colors.text, backgroundColor: theme.colors.text },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.surface },
  scale: { padding: theme.spacing.xl, gap: theme.spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  scaleEnds: { flexDirection: 'row', justifyContent: 'space-between' },
  scaleDots: { flexDirection: 'row', justifyContent: 'space-between' },
  dot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  copy: { padding: theme.spacing.xl, gap: theme.spacing.md },
  calcHead: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg, paddingHorizontal: theme.spacing.xl, paddingVertical: theme.spacing.md },
  note: { paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.md },
  warmRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingHorizontal: theme.spacing.xl, paddingVertical: theme.spacing.sm },
  badge: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  cell: {
    width: 52,
    height: 36,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.background,
    color: theme.colors.text,
    textAlign: 'center',
    fontSize: 16,
  },
  plus: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border, marginVertical: theme.spacing.md },
  moreTitle: { paddingHorizontal: theme.spacing.xl, paddingVertical: theme.spacing.sm },
  more: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg, paddingHorizontal: theme.spacing.xl, paddingVertical: theme.spacing.md },
});
