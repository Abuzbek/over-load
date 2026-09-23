import {
  birthDateParts,
  cmToFeetInches,
  daysInMonth,
  feetInchesToCm,
  formatBirthDate,
  formatHeight,
  formatWeight,
  kgToLb,
  MONTHS,
  toBirthDate,
  toStorageKg,
} from '@overload/domain';
import type { ExperienceLevel, Gender, Profile } from '@overload/schema';
import { Lucide } from '@react-native-vector-icons/lucide';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { getHeightUnit, getProfile, getWeightUnit, setProfile } from '../../data/settingsRepo';
import { db } from '../../db/client';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { ListRow } from '../../ui/ListRow';
import { NumericField } from '../../ui/NumericField';
import { Screen } from '../../ui/Screen';
import { SectionLabel } from '../../ui/SectionLabel';
import { Sheet } from '../../ui/Sheet';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';
import { Wheel, WheelWindow } from '../../ui/Wheel';

/** Which field's editor is open. */
type Field = 'name' | 'birthDate' | 'gender' | 'bodyweightKg' | 'heightCm'
  | 'liftingExperience' | 'cardioExperience';

const TITLES: Record<Field, string> = {
  name: 'Name',
  birthDate: 'Birthday',
  gender: 'Gender',
  bodyweightKg: 'Weight',
  heightCm: 'Height',
  liftingExperience: 'Lifting experience',
  cardioExperience: 'Cardio experience',
};

const GENDER_OPTIONS: Option<Gender>[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

/**
 * `null` is the "None" row, not an unanswered question: someone who does no
 * cardio at all has answered, and the column simply has nothing to store.
 */
function experienceOptions(activity: string): Option<ExperienceLevel | null>[] {
  // The activity opens three of the four sentences and ends the fourth, so it
  // is lower-cased there rather than kept in two spellings.
  const lower = activity.charAt(0).toLowerCase() + activity.slice(1);
  return [
    { value: null, label: 'None', detail: `Currently not ${lower}`, icon: 'signal-zero' },
    { value: 'beginner', label: 'Beginner', detail: `${activity} for the past year or less`, icon: 'signal-low' },
    {
      value: 'intermediate',
      label: 'Intermediate',
      detail: `${activity} for more than the past year, but less than 4 years`,
      icon: 'signal-medium',
    },
    { value: 'advanced', label: 'Advanced', detail: `${activity} for the past 4 years or more`, icon: 'signal-high' },
  ];
}

const LIFTING_OPTIONS = experienceOptions('Lifting');
const CARDIO_OPTIONS = experienceOptions('Doing cardio');

const YEARS = (() => {
  const thisYear = new Date().getUTCFullYear();
  // Oldest first, so the wheel scrolls the way a date does.
  return Array.from({ length: thisYear - 1900 + 1 }, (_, i) => 1900 + i);
})();

/** The default a wheel opens on when nothing is stored yet. */
const DEFAULT_BIRTH_YEAR = 2000;
const DEFAULT_HEIGHT_CM = 175;

const CM_RANGE = Array.from({ length: 151 }, (_, i) => 100 + i);
// 3'0" to 8'0", as total inches — one wheel, because a height is one value.
const INCH_RANGE = Array.from({ length: 61 }, (_, i) => 36 + i);

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function closestIndex(values: number[], target: number): number {
  let best = 0;
  for (let i = 1; i < values.length; i += 1) {
    if (Math.abs(values[i]! - target) < Math.abs(values[best]! - target)) best = i;
  }
  return best;
}

export function AccountScreen() {
  // Read through the repo on every render, per the rule that only the
  // repository owns these values; a version bump is what re-reads them.
  const [, setVersion] = useState(0);
  const profile = getProfile(db);
  const weightUnit = getWeightUnit(db);
  const heightUnit = getHeightUnit(db);

  const [editing, setEditing] = useState<Field | null>(null);
  const [text, setText] = useState('');
  const [date, setDate] = useState({ day: 1, month: 1, year: DEFAULT_BIRTH_YEAR });
  const [heightIndex, setHeightIndex] = useState(0);

  useFocusEffect(useCallback(() => setVersion((v) => v + 1), []));

  const heightValues = heightUnit === 'ft' ? INCH_RANGE : CM_RANGE;
  const heightLabels = heightUnit === 'ft'
    ? INCH_RANGE.map((inches) => `${Math.floor(inches / 12)}'${inches % 12}"`)
    : CM_RANGE.map((cm) => `${cm} cm`);

  function save(patch: Partial<Profile>) {
    setProfile(db, patch, Date.now());
    setVersion((v) => v + 1);
    setEditing(null);
  }

  function open(field: Field) {
    // Pre-fill with what is stored, in the unit it will be shown in.
    if (field === 'name') setText(profile.name ?? '');
    if (field === 'bodyweightKg') {
      const shown = profile.bodyweightKg === null
        ? null
        : weightUnit === 'lb' ? kgToLb(profile.bodyweightKg) : profile.bodyweightKg;
      setText(shown === null ? '' : String(Number(shown.toFixed(1))));
    }
    if (field === 'heightCm') {
      const cm = profile.heightCm ?? DEFAULT_HEIGHT_CM;
      const target = heightUnit === 'ft'
        ? cmToFeetInches(cm).feet * 12 + cmToFeetInches(cm).inches
        : cm;
      setHeightIndex(closestIndex(heightValues, target));
    }
    if (field === 'birthDate') {
      setDate(profile.birthDate === null
        ? { day: 1, month: 1, year: DEFAULT_BIRTH_YEAR }
        : birthDateParts(profile.birthDate));
    }
    setEditing(field);
  }

  function saveName() {
    const trimmed = text.trim();
    save({ name: trimmed === '' ? null : trimmed });
  }

  function saveBodyweight() {
    if (text.trim() === '') return save({ bodyweightKg: null });
    const entered = Number(text.replace(',', '.'));
    if (!Number.isFinite(entered) || entered <= 0) return;
    save({ bodyweightKg: toStorageKg(entered, weightUnit) });
  }

  function saveHeight() {
    const value = heightValues[heightIndex]!;
    save({ heightCm: heightUnit === 'ft' ? feetInchesToCm(0, value) : value });
  }

  function saveBirthDate() {
    save({ birthDate: toBirthDate(date.day, date.month, date.year) });
  }

  /** February cannot hold the 31st, so a month or year change clamps the day. */
  function setDatePart(part: Partial<typeof date>) {
    const next = { ...date, ...part };
    next.day = Math.min(next.day, daysInMonth(next.month, next.year));
    setDate(next);
  }

  return (
    <Screen scroll>
      <View style={styles.section}>
        <SectionLabel>Profile</SectionLabel>
        <Card style={styles.rows}>
          <ValueRow title="Name" value={profile.name ?? '—'} onPress={() => open('name')} />
          <ValueRow
            title="Birthday"
            value={formatBirthDate(profile.birthDate)}
            onPress={() => open('birthDate')}
          />
          <ValueRow
            title="Gender"
            value={profile.gender ? titleCase(profile.gender) : '—'}
            onPress={() => open('gender')}
          />
          <ValueRow
            title="Weight"
            value={formatWeight(profile.bodyweightKg, weightUnit)}
            onPress={() => open('bodyweightKg')}
          />
          <ValueRow
            title="Height"
            value={formatHeight(profile.heightCm, heightUnit)}
            onPress={() => open('heightCm')}
          />
          <ValueRow
            title="Lifting experience"
            value={profile.liftingExperience ? titleCase(profile.liftingExperience) : 'None'}
            onPress={() => open('liftingExperience')}
          />
          <ValueRow
            title="Cardio experience"
            value={profile.cardioExperience ? titleCase(profile.cardioExperience) : 'None'}
            onPress={() => open('cardioExperience')}
          />
        </Card>
        <Text variant="caption" color="textMuted">
          Yours alone — this stays on the phone and is never sent anywhere.
          Weight and height follow the units set under Units.
        </Text>
      </View>

      <View style={styles.section}>
        <SectionLabel>Security</SectionLabel>
        <Card style={styles.rows}>
          <ListRow title="Email" right={<Muted>—</Muted>} />
          <ListRow title="Password" right={<Muted>••••••••</Muted>} />
        </Card>
        <Text variant="caption" color="textMuted">
          There are no accounts yet, so there is nothing to sign in or out of.
        </Text>
        {/* Disabled, not silently inert: a Log out that looks live and does
            nothing is the worst version of this row. */}
        <Button title="Log out" variant="destructive" disabled onPress={() => {}} />
      </View>

      <Sheet
        visible={editing !== null}
        onRequestClose={() => setEditing(null)}
        anchor="bottom"
        title={editing ? TITLES[editing] : ''}
      >
        {editing === 'name' ? (
          <>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Your name"
              placeholderTextColor={theme.colors.textMuted}
              onSubmitEditing={saveName}
              autoFocus
              style={styles.input}
            />
            <Button title="Save" onPress={saveName} />
          </>
        ) : null}

        {editing === 'bodyweightKg' ? (
          <>
            <View style={styles.fields}>
              <NumericField
                value={text}
                onChangeText={setText}
                placeholder="0"
                keyboard="decimal-pad"
                accessibilityLabel={`Weight in ${weightUnit}`}
              />
              <Text variant="body" color="textMuted">{weightUnit}</Text>
            </View>
            <Button title="Save" onPress={saveBodyweight} />
          </>
        ) : null}

        {editing === 'heightCm' ? (
          <>
            <WheelWindow>
              <Wheel
                options={heightLabels}
                index={heightIndex}
                onChange={setHeightIndex}
                accessibilityLabel="Height"
              />
            </WheelWindow>
            <Button title="Save" onPress={saveHeight} />
          </>
        ) : null}

        {editing === 'birthDate' ? (
          <>
            <WheelWindow>
              <Wheel
                options={MONTHS}
                index={date.month - 1}
                onChange={(i) => setDatePart({ month: i + 1 })}
                accessibilityLabel="Month"
              />
              <Wheel
                options={Array.from(
                  { length: daysInMonth(date.month, date.year) },
                  (_, i) => String(i + 1),
                )}
                index={date.day - 1}
                onChange={(i) => setDatePart({ day: i + 1 })}
                accessibilityLabel="Day"
              />
              <Wheel
                options={YEARS.map(String)}
                index={YEARS.indexOf(date.year)}
                onChange={(i) => setDatePart({ year: YEARS[i]! })}
                accessibilityLabel="Year"
              />
            </WheelWindow>
            <Button title="Save" onPress={saveBirthDate} />
          </>
        ) : null}

        {editing === 'gender' ? (
          <Options
            options={GENDER_OPTIONS}
            selected={profile.gender}
            clearable
            onSelect={(value) => save({ gender: value })}
          />
        ) : null}

        {editing === 'liftingExperience' ? (
          <Options
            options={LIFTING_OPTIONS}
            selected={profile.liftingExperience}
            onSelect={(value) => save({ liftingExperience: value })}
          />
        ) : null}

        {editing === 'cardioExperience' ? (
          <Options
            options={CARDIO_OPTIONS}
            selected={profile.cardioExperience}
            onSelect={(value) => save({ cardioExperience: value })}
          />
        ) : null}

        <Button title="Cancel" variant="secondary" onPress={() => setEditing(null)} />
      </Sheet>
    </Screen>
  );
}

function Muted({ children }: { children: string }) {
  return <Text variant="body" color="textMuted">{children}</Text>;
}

function ValueRow({ title, value, onPress }: { title: string; value: string; onPress: () => void }) {
  return <ListRow title={title} right={<Muted>{value}</Muted>} onPress={onPress} />;
}

type Option<T> = {
  value: T;
  label: string;
  detail?: string;
  icon?: 'signal-zero' | 'signal-low' | 'signal-medium' | 'signal-high';
};

/**
 * A radio list that saves on tap — one fewer press than picking then saving.
 * `clearable` adds a "Not set" row for the fields where no answer is different
 * from an answer; without it, gender would be permanent once chosen.
 */
function Options<T extends string | null>({ options, selected, onSelect, clearable = false }: {
  options: Option<T>[];
  selected: T | null;
  onSelect: (value: T | null) => void;
  clearable?: boolean;
}) {
  const rows: Option<T | null>[] = clearable
    ? [{ value: null, label: 'Not set' }, ...options]
    : options;

  return (
    <View style={styles.optionRows}>
      {rows.map((option) => (
        <ListRow
          key={option.label}
          title={option.label}
          subtitle={option.detail}
          leading={
            option.icon ? (
              <View style={styles.optionIcon}>
                <Lucide name={option.icon} size={16} color={theme.colors.background} />
              </View>
            ) : undefined
          }
          right={
            <View style={[styles.radio, selected === option.value && styles.radioOn]}>
              {selected === option.value ? <View style={styles.radioDot} /> : null}
            </View>
          }
          onPress={() => onSelect(option.value)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: theme.spacing.sm },
  rows: { paddingVertical: 0, paddingHorizontal: 0, gap: 0 },
  optionRows: { marginHorizontal: -theme.spacing.lg },
  fields: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  input: {
    minHeight: 44,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
  },
  optionIcon: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: theme.radius.pill,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: theme.colors.accent },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.accent,
  },
});
