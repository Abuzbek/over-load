import { BottomSheetFooter, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { formatWeight, parseInstructions, type InstructionSection } from '@overload/domain';
import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { exerciseHistory, getExerciseDetail, type ExerciseDetail } from '../../data/exerciseRepo';
import { getWeightUnit } from '../../data/settingsRepo';
import { db } from '../../db/client';
import { BottomSheet } from '../../ui/BottomSheet';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';
import { EquipmentThumb } from './EquipmentThumb';
import { MuscleThumb } from './MuscleThumb';

type Props = {
  exerciseId: string | null;
  figure: 'male' | 'female';
  onClose: () => void;
  /** Present in a picker: the footer's "Add Exercise". */
  onAdd?: (exerciseId: string) => void;
};

const TABS = ['Instructions', 'Details', 'History'] as const;
type Tab = (typeof TABS)[number];

/** The file's type and region as the picker's Type filter names them. */
function typeLabel(type: string | null, region: string | null): string | null {
  if (!type) return null;
  if (type === 'Core') return 'Core';
  if (region === 'Full body') return 'Full Body';
  const side = region === 'Upper body' ? 'Upper' : region === 'Lower body' ? 'Lower' : null;
  if (type.startsWith('Multi-joint')) return side ? `Compound ${side}` : 'Compound';
  if (type.startsWith('Single joint')) return side ? `${side} Isolation` : 'Isolation';
  return type;
}

export function ExerciseInfoSheet({ exerciseId, figure, onClose, onAdd }: Props) {
  const [tab, setTab] = useState<Tab>('Instructions');
  const insets = useSafeAreaInsets();
  // Closing clears exerciseId before the sheet has slid away; keep showing the
  // last exercise until it has.
  const shown = useRef(exerciseId);
  if (exerciseId) shown.current = exerciseId;
  const shownId = shown.current;
  const detail = useMemo(() => (shownId ? getExerciseDetail(db, shownId) : undefined), [shownId]);

  const footer = onAdd && exerciseId
    ? (props: Parameters<typeof BottomSheetFooter>[0]) => (
        <BottomSheetFooter {...props} bottomInset={0}>
          <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing.lg }]}>
            <Button title="Add Exercise" onPress={() => onAdd(exerciseId)} />
          </View>
        </BottomSheetFooter>
      )
    : undefined;

  return (
    <BottomSheet
      visible={exerciseId !== null}
      onClose={() => {
        setTab('Instructions');
        onClose();
      }}
      title={detail?.exercise.name ?? ''}
      snapPoints={['92%']}
      footer={footer}
    >
      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable
            key={t}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t }}
            onPress={() => setTab(t)}
            style={[styles.tab, tab === t && styles.tabOn]}
          >
            <Text variant="heading" color={tab === t ? 'text' : 'textMuted'}>{t}</Text>
          </Pressable>
        ))}
      </View>
      <BottomSheetScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 110 }]}>
        {detail ? (
          tab === 'Instructions' ? (
            <Instructions markdown={detail.exercise.instructions} />
          ) : tab === 'Details' ? (
            <Details detail={detail} figure={figure} />
          ) : (
            <History exerciseId={detail.exercise.id} />
          )
        ) : null}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

function Instructions({ markdown }: { markdown: string | null }) {
  const sections = useMemo(() => (markdown ? parseInstructions(markdown) : []), [markdown]);
  if (sections.length === 0) return <EmptyState title="No instructions yet" body="This exercise has no how-to in the catalogue." />;
  return <>{sections.map((s, i) => <InstructionSectionView key={i} section={s} />)}</>;
}

function InstructionSectionView({ section }: { section: InstructionSection }) {
  const [open, setOpen] = useState(true);
  return (
    <View style={styles.section}>
      {section.title ? (
        <View style={styles.sectionHeader}>
          <Text variant="title">{section.title}</Text>
          <Pressable accessibilityRole="button" hitSlop={10} onPress={() => setOpen((o) => !o)}>
            <Text style={styles.link}>{open ? 'Collapse' : 'Expand'}</Text>
          </Pressable>
        </View>
      ) : null}
      {open
        ? section.blocks.map((b, i) =>
            b.kind === 'step' ? (
              <View key={i} style={[styles.step, { marginLeft: b.depth * 20 }]}>
                <Text style={styles.stepNumber}>{b.number}.</Text>
                <Text style={styles.flex}>{b.text}</Text>
              </View>
            ) : b.kind === 'subheading' ? (
              <Text key={i} variant="heading" style={styles.subheading}>{b.text}</Text>
            ) : (
              <Text key={i} style={styles.paragraph}>{b.text}</Text>
            ),
          )
        : null}
    </View>
  );
}

function Bars({ value }: { value: number }) {
  return (
    <View style={styles.bars}>
      {[1, 2, 3, 4, 5].map((n) => <View key={n} style={[styles.bar, n <= value && styles.barOn]} />)}
    </View>
  );
}

function Details({ detail, figure }: { detail: ExerciseDetail; figure: 'male' | 'female' }) {
  const { exercise, links } = detail;
  const join = (role: string) => (links[role]?.length ? links[role]!.join(', ') : null);
  const bodyweight = exercise.bodyweight && exercise.bodyweight > 0 ? `${Math.round(exercise.bodyweight * 100)}%` : null;
  const facts: [string, string | null][] = [
    ['Alternative Names', join('alternativeName')],
    ['Type', typeLabel(detail.type, detail.region)],
    ['Body Weight Contribution', bodyweight],
    ['Metrics', join('exerciseMetrics')],
    ['Laterality', join('laterality')],
    ['Movement Pattern', join('movementPattern')],
    ['Primary Joint Action', join('primaryJointAction')],
    ['Secondary Joint Action', join('secondaryJointAction')],
  ];

  return (
    <>
      {detail.muscles.length ? (
        <View style={styles.section}>
          <Text variant="title">Target Muscles</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cards}>
            {detail.muscles.map((m) => (
              <View key={m.id} style={styles.muscleCard}>
                <MuscleThumb figure={figure} muscle={m.name} size={64} />
                <View>
                  <Text variant="heading">{m.name}</Text>
                  <Text variant="caption" color="textMuted">{m.primary ? 'Primary' : 'Secondary'}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {exercise.rom || exercise.stability ? (
        <View style={styles.section}>
          <Text variant="title">Properties</Text>
          {([['Range of Motion', exercise.rom], ['Stability', exercise.stability]] as const).map(([label, value]) =>
            value ? (
              <View key={label} style={styles.fact}>
                <View style={styles.flex}>
                  <Text>{label}</Text>
                  <Text variant="caption" color="textMuted">{value}/5</Text>
                </View>
                <Bars value={value} />
              </View>
            ) : null,
          )}
        </View>
      ) : null}

      {(['resistance', 'support'] as const).map((need) =>
        detail.equipment[need].length ? (
          <View key={need} style={styles.section}>
            <Text variant="title">{need === 'resistance' ? 'Resistance Equipment' : 'Support Equipment'}</Text>
            {/* One card per alternative; the items on a card are needed together. */}
            {detail.equipment[need].map((items, i) => (
              <View key={i} style={styles.equipmentCard}>
                <View style={styles.equipmentImages}>
                  {items.map((item) => <EquipmentThumb key={item.id} id={item.id} size={48} />)}
                </View>
                <Text>{items.map((item) => item.name).join(', ')}</Text>
              </View>
            ))}
          </View>
        ) : null,
      )}

      <View style={styles.section}>
        <Text variant="title">Details</Text>
        {facts.map(([label, value]) =>
          value ? (
            <View key={label} style={styles.fact}>
              <View style={styles.flex}>
                <Text>{label}</Text>
                <Text variant="caption" color="textMuted">{value}</Text>
              </View>
            </View>
          ) : null,
        )}
      </View>
    </>
  );
}

function History({ exerciseId }: { exerciseId: string }) {
  const entries = useMemo(() => exerciseHistory(db, exerciseId), [exerciseId]);
  const unit = getWeightUnit(db);
  if (entries.length === 0) return <EmptyState title="No history yet" body="Sessions with this exercise will show up here." />;
  return (
    <>
      {entries.map((e) => (
        <View key={e.sessionId} style={styles.fact}>
          <View style={styles.flex}>
            <Text variant="heading">
              {new Date(e.startedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
            </Text>
            <Text color="textMuted">{e.name}</Text>
            <Text variant="caption" color="textMuted">
              {[e.volumeKg > 0 ? formatWeight(e.volumeKg, unit) : null, `${e.sets} ${e.sets === 1 ? 'set' : 'sets'}`, e.reps ? `${e.reps} reps` : null]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  tab: { flex: 1, alignItems: 'center', paddingVertical: theme.spacing.lg, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: theme.colors.text },
  content: { padding: theme.spacing.xl, gap: theme.spacing.xl },
  section: { gap: theme.spacing.md },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { textDecorationLine: 'underline' },
  step: { flexDirection: 'row', gap: theme.spacing.sm },
  stepNumber: { minWidth: 18 },
  subheading: { marginTop: theme.spacing.sm },
  paragraph: { lineHeight: 21 },
  flex: { flex: 1 },
  cards: { gap: theme.spacing.md },
  muscleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.lg,
    paddingRight: theme.spacing.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
  },
  fact: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  bars: { flexDirection: 'row', gap: 4 },
  bar: { width: 22, height: 8, backgroundColor: theme.colors.border },
  barOn: { backgroundColor: theme.colors.text },
  equipmentCard: {
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    gap: theme.spacing.md,
  },
  equipmentImages: { flexDirection: 'row', gap: theme.spacing.sm },
  footer: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
  },
});
