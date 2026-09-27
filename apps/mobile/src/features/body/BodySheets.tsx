import { kgToLb, startOfDay, toStorageKg } from '@overload/domain';
import { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import type { Measure, MeasureValues } from '@overload/schema';
import { Lucide } from '@react-native-vector-icons/lucide';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { deleteMeasurementOn, deleteWeighInsOn, measurementOn, saveMeasurement, saveWeighIn, weighInOn } from '../../data/bodyRepo';
import { getHeightUnit, getProfile, getWeightUnit } from '../../data/settingsRepo';
import { db } from '../../db/client';
import { BottomSheet } from '../../ui/BottomSheet';
import { Button } from '../../ui/Button';
import { MonthGrid } from '../../ui/MonthGrid';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';
import { BODY_FAT_OPTIONS } from '../onboarding/bodyFatImages';

const CM_PER_IN = 2.54;
const dateTitle = (day: number) => new Date(day).toLocaleDateString();
const parse = (text: string) => {
  const v = Number(text.replace(',', '.'));
  return text.trim() !== '' && Number.isFinite(v) && v > 0 ? v : null;
};
const show = (v: number | null | undefined, digits = 1) => (v === null || v === undefined ? '' : String(Number(v.toFixed(digits))));

/** A labelled number box with its unit inside, right-aligned — the body sheets' one field. */
function Field({ label, unit, value, onChange, flex = 1 }: { label: string; unit: string; value: string; onChange: (v: string) => void; flex?: number }) {
  return (
    <View style={[styles.field, { flex }]}>
      <Text variant="label" color="text" style={styles.fieldLabel}>{label}</Text>
      <View style={styles.box}>
        <BottomSheetTextInput
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          accessibilityLabel={`${label} in ${unit}`}
          style={styles.input}
          placeholderTextColor={theme.colors.textMuted}
        />
        <Text color="textMuted">{unit}</Text>
      </View>
    </View>
  );
}

/**
 * The frame every body sheet shares: the day as the title — tap it to pick
 * another from a month grid — what it records beneath, a bin for the day's
 * entry. Reset to today each time it opens.
 */
function DaySheet({
  visible, onClose, subtitle, day, onDay, onDelete, canDelete, snapPoints, children,
}: {
  visible: boolean;
  onClose: () => void;
  subtitle: string;
  day: number;
  onDay: (day: number) => void;
  onDelete: () => void;
  canDelete: boolean;
  snapPoints?: string[];
  children: ReactNode;
}) {
  const [picking, setPicking] = useState(false);
  useEffect(() => {
    if (!visible) setPicking(false);
  }, [visible]);
  const picker = (
    <View style={styles.picker}>
      <MonthGrid
        initial={day}
        selected={day}
        action="choose day"
        onPick={(d) => {
          onDay(d);
          setPicking(false);
        }}
      />
    </View>
  );
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={dateTitle(day)}
      subtitle={subtitle}
      onTitlePress={() => setPicking((p) => !p)}
      snapPoints={snapPoints}
      headerRight={
        <Pressable accessibilityRole="button" accessibilityLabel="Delete this day's entry" disabled={!canDelete} hitSlop={10} onPress={onDelete}>
          <Lucide name="trash-2" size={20} color={canDelete ? theme.colors.text : theme.colors.border} />
        </Pressable>
      }
    >
      {picking ? (snapPoints ? <BottomSheetScrollView>{picker}</BottomSheetScrollView> : picker) : children}
    </BottomSheet>
  );
}

/** Scale weight, and body fat if the scale reads it, for a day. */
export function WeightSheet({ visible, initialDay, onClose, onSaved }: { visible: boolean; initialDay?: number; onClose: () => void; onSaved?: () => void }) {
  const insets = useSafeAreaInsets();
  const unit = getWeightUnit(db);
  const [day, setDay] = useState(() => initialDay ?? startOfDay(Date.now()));
  const [weight, setWeight] = useState('');
  const [fat, setFat] = useState('');
  const existing = visible ? weighInOn(db, day) : undefined;

  useEffect(() => {
    if (visible) setDay(initialDay ?? startOfDay(Date.now()));
  }, [visible, initialDay]);
  useEffect(() => {
    if (!visible) return;
    const w = weighInOn(db, day);
    setWeight(show(w ? (unit === 'lb' ? kgToLb(w.weightKg) : w.weightKg) : null));
    setFat(show(w?.bodyFatPercent));
  }, [visible, day, unit]);

  const kg = parse(weight);
  const valid = kg !== null && kg > 20 && kg < 700;
  return (
    <DaySheet
      visible={visible}
      onClose={onClose}
      subtitle="Scale Weight"
      day={day}
      onDay={setDay}
      canDelete={!!existing}
      onDelete={() => {
        deleteWeighInsOn(db, day, Date.now());
        onSaved?.();
        onClose();
      }}
    >
      <View style={[styles.body, { paddingBottom: insets.bottom + theme.spacing.lg }]}>
        <View style={styles.row}>
          <Field label="Weight" unit={unit} value={weight} onChange={setWeight} flex={1.6} />
          <Field label="Body Fat" unit="%" value={fat} onChange={setFat} />
        </View>
        <Button
          title="Save"
          disabled={!valid}
          onPress={() => {
            saveWeighIn(db, day, toStorageKg(kg!, unit), parse(fat), Date.now());
            onSaved?.();
            onClose();
          }}
        />
      </View>
    </DaySheet>
  );
}

const SECTIONS: { title: string; measures: [Measure, string][] }[] = [
  {
    title: 'Upper Body',
    measures: [['neck', 'Neck'], ['shoulders', 'Shoulders'], ['bust', 'Bust'], ['chest', 'Chest'], ['waist', 'Waist'], ['hips', 'Hips']],
  },
  {
    title: 'Arms',
    measures: [
      ['leftBicep', 'Left Bicep'], ['rightBicep', 'Right Bicep'], ['leftForearm', 'Left Forearm'],
      ['rightForearm', 'Right Forearm'], ['leftWrist', 'Left Wrist'], ['rightWrist', 'Right Wrist'],
    ],
  },
  {
    title: 'Legs',
    measures: [
      ['leftThigh', 'Left Thigh'], ['rightThigh', 'Right Thigh'], ['leftCalf', 'Left Calf'],
      ['rightCalf', 'Right Calf'], ['leftAnkle', 'Left Ankle'], ['rightAnkle', 'Right Ankle'],
    ],
  },
];

/** A day's tape measurements and a visual body-fat estimate, with the reference figures to judge it by. */
export function MetricsSheet({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved?: () => void }) {
  const insets = useSafeAreaInsets();
  const inches = getHeightUnit(db) === 'ft';
  const lengthUnit = inches ? 'in' : 'cm';
  const figure = getProfile(db).gender === 'female' ? 'female' : 'male';
  const [day, setDay] = useState(() => startOfDay(Date.now()));
  const [text, setText] = useState<Partial<Record<Measure | 'visualBodyFatPercent', string>>>({});
  const [reference, setReference] = useState(false);
  const existing = visible ? measurementOn(db, day) : undefined;

  useEffect(() => {
    if (visible) setDay(startOfDay(Date.now()));
    else setReference(false);
  }, [visible]);
  useEffect(() => {
    if (!visible) return;
    const values = measurementOn(db, day)?.values ?? {};
    setText(
      Object.fromEntries(
        Object.entries(values).map(([k, v]) => [k, k === 'visualBodyFatPercent' ? show(v) : show(inches ? v / CM_PER_IN : v)]),
      ),
    );
  }, [visible, day, inches]);

  const set = (k: Measure | 'visualBodyFatPercent') => (v: string) => setText((t) => ({ ...t, [k]: v }));
  const save = () => {
    const values: MeasureValues = {};
    for (const [k, v] of Object.entries(text)) {
      const n = parse(v ?? '');
      if (n === null) continue;
      if (k === 'visualBodyFatPercent') values.visualBodyFatPercent = n;
      else values[k as Measure] = Math.round((inches ? n * CM_PER_IN : n) * 10) / 10;
    }
    saveMeasurement(db, day, values, Date.now());
    onSaved?.();
    onClose();
  };

  return (
    <DaySheet
      visible={visible}
      onClose={onClose}
      subtitle="Full Body"
      day={day}
      onDay={setDay}
      snapPoints={['90%']}
      canDelete={!!existing}
      onDelete={() => {
        deleteMeasurementOn(db, day, Date.now());
        onSaved?.();
        onClose();
      }}
    >
      <BottomSheetScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + theme.spacing.xxl }]}>
        <Text variant="title" style={styles.section}>Body Fat</Text>
        <View style={styles.row}>
          <Field label="Visual Body Fat" unit="%" value={text.visualBodyFatPercent ?? ''} onChange={set('visualBodyFatPercent')} flex={1.6} />
          <Pressable accessibilityRole="button" onPress={() => setReference((r) => !r)} style={styles.reference}>
            <Lucide name="grid-3x3" size={16} color={theme.colors.text} />
            <Text>Reference</Text>
          </Pressable>
        </View>
        {reference ? (
          <View style={styles.figures}>
            {BODY_FAT_OPTIONS[figure].map((o) => (
              <Pressable
                key={o.percent}
                accessibilityRole="button"
                accessibilityLabel={`${o.label} body fat`}
                onPress={() => {
                  set('visualBodyFatPercent')(String(o.percent));
                  setReference(false);
                }}
                style={styles.figure}
              >
                <SvgXml xml={o.svg} width="100%" height={90} />
                <Text variant="caption" color="textMuted">{o.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {SECTIONS.map((s) => (
          <View key={s.title} style={styles.group}>
            <Text variant="title" style={styles.section}>{s.title}</Text>
            {s.measures.map(([key, label]) => (
              <Field key={key} label={label} unit={lengthUnit} value={text[key] ?? ''} onChange={set(key)} />
            ))}
          </View>
        ))}
        <Button title="Save" onPress={save} />
      </BottomSheetScrollView>
    </DaySheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.lg, gap: theme.spacing.lg },
  picker: { paddingHorizontal: theme.spacing.xl, paddingVertical: theme.spacing.lg },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.md },
  field: { gap: theme.spacing.sm },
  fieldLabel: { textTransform: 'none', letterSpacing: 0 },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceRaised,
    gap: theme.spacing.sm,
  },
  input: { flex: 1, color: theme.colors.text, fontSize: 17, textAlign: 'right', paddingVertical: 12 },
  section: { marginTop: theme.spacing.sm },
  group: { gap: theme.spacing.lg },
  reference: {
    flex: 1,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceRaised,
  },
  figures: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  figure: { width: '31%', alignItems: 'center', gap: 2, paddingVertical: theme.spacing.sm, borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceRaised },
});
