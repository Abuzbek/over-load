import {
  cmToFeetInches,
  feetInchesToCm,
  formatBirthDate,
  formatHeight,
  formatWeight,
  isRealDate,
  kgToLb,
  toBirthDate,
  toStorageKg,
  birthDateParts,
} from '@overload/domain';
import type { ExperienceLevel, Gender, Profile } from '@overload/schema';
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

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

const EXPERIENCE_OPTIONS: { value: ExperienceLevel; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function AccountScreen() {
  // Read through the repo on every render, per the rule that only the
  // repository owns these values; a version bump is what re-reads them.
  const [, setVersion] = useState(0);
  const profile = getProfile(db);
  const weightUnit = getWeightUnit(db);
  const heightUnit = getHeightUnit(db);

  const [editing, setEditing] = useState<Field | null>(null);
  // One draft per shape of editor: text, a number, and the three date boxes.
  const [text, setText] = useState('');
  const [second, setSecond] = useState('');
  const [third, setThird] = useState('');

  useFocusEffect(useCallback(() => setVersion((v) => v + 1), []));

  function save(patch: Partial<Profile>) {
    setProfile(db, patch, Date.now());
    setVersion((v) => v + 1);
    setEditing(null);
  }

  function open(field: Field) {
    // Pre-fill with what is stored, in the unit it will be typed in.
    if (field === 'name') setText(profile.name ?? '');
    if (field === 'bodyweightKg') {
      const shown = profile.bodyweightKg === null
        ? null
        : weightUnit === 'lb' ? kgToLb(profile.bodyweightKg) : profile.bodyweightKg;
      setText(shown === null ? '' : String(Number(shown.toFixed(1))));
    }
    if (field === 'heightCm') {
      if (profile.heightCm === null) {
        setText('');
        setSecond('');
      } else if (heightUnit === 'ft') {
        const { feet, inches } = cmToFeetInches(profile.heightCm);
        setText(String(feet));
        setSecond(String(inches));
      } else {
        setText(String(Math.round(profile.heightCm)));
      }
    }
    if (field === 'birthDate') {
      const parts = profile.birthDate === null ? null : birthDateParts(profile.birthDate);
      setText(parts ? String(parts.day) : '');
      setSecond(parts ? String(parts.month) : '');
      setThird(parts ? String(parts.year) : '');
    }
    setEditing(field);
  }

  function saveName() {
    const trimmed = text.trim();
    save({ name: trimmed === '' ? null : trimmed });
  }

  function saveBodyweight() {
    const entered = Number(text.replace(',', '.'));
    if (text.trim() === '') return save({ bodyweightKg: null });
    if (!Number.isFinite(entered) || entered <= 0) return;
    save({ bodyweightKg: toStorageKg(entered, weightUnit) });
  }

  function saveHeight() {
    if (text.trim() === '' && second.trim() === '') return save({ heightCm: null });
    if (heightUnit === 'ft') {
      const feet = Number(text);
      const inches = second.trim() === '' ? 0 : Number(second);
      if (!Number.isFinite(feet) || !Number.isFinite(inches) || feet <= 0) return;
      return save({ heightCm: feetInchesToCm(feet, inches) });
    }
    const cm = Number(text.replace(',', '.'));
    if (!Number.isFinite(cm) || cm <= 0) return;
    save({ heightCm: cm });
  }

  function saveBirthDate() {
    if (text.trim() === '' && second.trim() === '' && third.trim() === '') {
      return save({ birthDate: null });
    }
    const day = Number(text);
    const month = Number(second);
    const year = Number(third);
    // A silent no-op beats storing 31 February as 3 March. The Save button is
    // disabled for the same reason; this guards the submit-on-return path.
    if (!isRealDate(day, month, year)) return;
    save({ birthDate: toBirthDate(day, month, year) });
  }

  const dateIsValid = text.trim() === '' && second.trim() === '' && third.trim() === ''
    ? true
    : isRealDate(Number(text), Number(second), Number(third));

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
            value={profile.liftingExperience ? titleCase(profile.liftingExperience) : '—'}
            onPress={() => open('liftingExperience')}
          />
          <ValueRow
            title="Cardio experience"
            value={profile.cardioExperience ? titleCase(profile.cardioExperience) : '—'}
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
            <View style={styles.fields}>
              <NumericField
                value={text}
                onChangeText={setText}
                placeholder="0"
                keyboard={heightUnit === 'ft' ? 'number-pad' : 'decimal-pad'}
                accessibilityLabel={heightUnit === 'ft' ? 'Feet' : 'Height in centimetres'}
              />
              <Text variant="body" color="textMuted">{heightUnit === 'ft' ? 'ft' : 'cm'}</Text>
              {heightUnit === 'ft' ? (
                <>
                  <NumericField
                    value={second}
                    onChangeText={setSecond}
                    placeholder="0"
                    keyboard="number-pad"
                    accessibilityLabel="Inches"
                  />
                  <Text variant="body" color="textMuted">in</Text>
                </>
              ) : null}
            </View>
            <Button title="Save" onPress={saveHeight} />
          </>
        ) : null}

        {editing === 'birthDate' ? (
          <>
            <View style={styles.fields}>
              <NumericField
                value={text} onChangeText={setText} placeholder="DD"
                keyboard="number-pad" accessibilityLabel="Day"
              />
              <NumericField
                value={second} onChangeText={setSecond} placeholder="MM"
                keyboard="number-pad" accessibilityLabel="Month"
              />
              <NumericField
                value={third} onChangeText={setThird} placeholder="YYYY"
                keyboard="number-pad" accessibilityLabel="Year"
              />
            </View>
            {dateIsValid ? null : (
              <Text variant="caption" color="textMuted">That is not a real date.</Text>
            )}
            <Button title="Save" disabled={!dateIsValid} onPress={saveBirthDate} />
          </>
        ) : null}

        {editing === 'gender' ? (
          <Options
            options={GENDER_OPTIONS}
            selected={profile.gender}
            onSelect={(value) => save({ gender: value })}
          />
        ) : null}

        {editing === 'liftingExperience' ? (
          <Options
            options={EXPERIENCE_OPTIONS}
            selected={profile.liftingExperience}
            onSelect={(value) => save({ liftingExperience: value })}
          />
        ) : null}

        {editing === 'cardioExperience' ? (
          <Options
            options={EXPERIENCE_OPTIONS}
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

/**
 * A radio list that saves on tap — one fewer press than picking then saving.
 * "Not set" is a real choice: without it a field is one-way once answered, and
 * these are questions someone may well want to take back.
 */
function Options<T extends string>({ options, selected, onSelect }: {
  options: { value: T; label: string }[];
  selected: T | null;
  onSelect: (value: T | null) => void;
}) {
  return (
    <View style={styles.optionRows}>
      <ListRow
        title="Not set"
        right={
          <View style={[styles.radio, selected === null && styles.radioOn]}>
            {selected === null ? <View style={styles.radioDot} /> : null}
          </View>
        }
        onPress={() => onSelect(null)}
      />
      {options.map((option) => (
        <ListRow
          key={option.value}
          title={option.label}
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
