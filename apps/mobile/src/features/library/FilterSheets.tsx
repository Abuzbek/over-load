import { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { Lucide } from '@react-native-vector-icons/lucide';
import { EQUIPMENT_CATEGORIES } from '@overload/schema';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BODYWEIGHT_ONLY, type EquipmentOption } from '../../data/exerciseRepo';
import type { GymSummary } from '../../data/gymRepo';
import { BottomSheet } from '../../ui/BottomSheet';
import { Button } from '../../ui/Button';
import { RangeSlider } from '../../ui/RangeSlider';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';
import { textStyle } from '../../ui/typography';
import { CATEGORY_LABELS } from '../settings/GymDetailScreen';
import { EquipmentThumb } from './EquipmentThumb';

function Radio({ on }: { on: boolean }) {
  return <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>;
}

function OptionRow({ label, subtitle, leading, on, onPress, right }: {
  label: string;
  subtitle?: string;
  leading?: ReactNode;
  on?: boolean;
  onPress: () => void;
  right?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {leading}
      <View style={styles.rowMain}>
        <Text>{label}</Text>
        {subtitle ? <Text variant="caption" color="textMuted">{subtitle}</Text> : null}
      </View>
      {right ?? <Radio on={Boolean(on)} />}
    </Pressable>
  );
}

function useBottomPad() {
  return useSafeAreaInsets().bottom + theme.spacing.lg;
}

/** One choice from a short list, "Any" first. Choosing closes the sheet. */
export function ChoiceSheet<T extends string>({ visible, onClose, title, options, value, onChange }: {
  visible: boolean;
  onClose: () => void;
  title: string;
  options: { value: T; label: string }[];
  value: T | undefined;
  onChange: (value: T | undefined) => void;
}) {
  const pad = useBottomPad();
  const pick = (next: T | undefined) => {
    onChange(next);
    onClose();
  };
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      <View style={{ paddingBottom: pad }}>
        <OptionRow label="Any" on={value === undefined} onPress={() => pick(undefined)} />
        {options.map((o) => (
          <OptionRow key={o.value} label={o.label} on={value === o.value} onPress={() => pick(o.value)} />
        ))}
      </View>
    </BottomSheet>
  );
}

/**
 * One piece of equipment, grouped by category, with a name filter. Items the
 * chosen gym lacks stay choosable — the filter answers "what uses this?" — but
 * say so.
 */
export function EquipmentSheet({ visible, onClose, title, options, value, onChange, bodyweight = false }: {
  visible: boolean;
  onClose: () => void;
  title: string;
  options: EquipmentOption[];
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  /** Offer "Bodyweight only" (resistance, not support). */
  bodyweight?: boolean;
}) {
  const [query, setQuery] = useState('');
  const pad = useBottomPad();
  useEffect(() => {
    if (!visible) setQuery('');
  }, [visible]);

  const pick = (next: string | undefined) => {
    onChange(next);
    onClose();
  };
  const q = query.trim().toLowerCase();
  const matching = options.filter((o) => o.name.toLowerCase().includes(q));

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title} snapPoints={['90%']}>
      <BottomSheetTextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Filter equipment by name"
        placeholderTextColor={theme.colors.textMuted}
        autoCorrect={false}
        style={styles.filter}
      />
      <BottomSheetScrollView contentContainerStyle={{ paddingBottom: pad }} keyboardShouldPersistTaps="handled">
        {!q ? <OptionRow label="Any" on={value === undefined} onPress={() => pick(undefined)} /> : null}
        {bodyweight && 'bodyweight only'.includes(q) ? (
          <>
            <Text variant="heading" style={styles.group}>Bodyweight</Text>
            <OptionRow
              label="Bodyweight only"
              leading={
                <View style={styles.thumbSlot}>
                  <Lucide name="person-standing" size={26} color={theme.colors.textMuted} />
                </View>
              }
              on={value === BODYWEIGHT_ONLY}
              onPress={() => pick(BODYWEIGHT_ONLY)}
            />
          </>
        ) : null}
        {EQUIPMENT_CATEGORIES.map((category) => {
          const items = matching.filter((o) => o.category === category);
          if (items.length === 0) return null;
          return (
            <View key={category}>
              <Text variant="heading" style={styles.group}>{CATEGORY_LABELS[category]}</Text>
              {items.map((o) => (
                <OptionRow
                  key={o.id}
                  label={o.name}
                  subtitle={o.available ? undefined : 'Not available in this gym'}
                  leading={<EquipmentThumb id={o.id} size={40} />}
                  on={value === o.id}
                  onPress={() => pick(o.id)}
                />
              ))}
            </View>
          );
        })}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

/** An inclusive range on a 1–5 scale; Save applies it, the full range clears it. */
export function RangeSheet({ visible, onClose, title, value, onChange }: {
  visible: boolean;
  onClose: () => void;
  title: string;
  value: [number, number] | undefined;
  onChange: (value: [number, number] | undefined) => void;
}) {
  const pad = useBottomPad();
  const [draft, setDraft] = useState<[number, number]>(value ?? [1, 5]);
  useEffect(() => {
    if (visible) setDraft(value ?? [1, 5]);
  }, [visible, value]);

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      <View style={[styles.range, { paddingBottom: pad }]}>
        <RangeSlider min={1} max={5} value={draft} onChange={setDraft} />
        <Button
          title="Save"
          onPress={() => {
            onChange(draft[0] === 1 && draft[1] === 5 ? undefined : draft);
            onClose();
          }}
        />
      </View>
    </BottomSheet>
  );
}

/** Which gym's equipment the list is limited to, or none. Reset goes back to the active gym. */
export function GymSheet({ visible, onClose, gyms, counts, value, onChange }: {
  visible: boolean;
  onClose: () => void;
  gyms: GymSummary[];
  counts: Map<string, number>;
  value: string | null;
  onChange: (gymId: string | null) => void;
}) {
  const pick = (next: string | null) => {
    onChange(next);
    onClose();
  };
  const pad = useBottomPad();
  const active = gyms.find((g) => g.isActive)?.gym.id ?? null;
  const gymIcon = (name: string) => <Lucide name={name as 'dumbbell'} size={22} color={theme.colors.text} style={styles.icon} />;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Gym Options"
      subtitle="Impacts exercise selection"
      headerRight={
        <Pressable accessibilityRole="button" accessibilityLabel="Reset to active gym" hitSlop={12} onPress={() => pick(active)}>
          <Lucide name="rotate-ccw" size={20} color={theme.colors.text} />
        </Pressable>
      }
    >
      <View style={{ paddingBottom: pad }}>
        {gyms.map(({ gym }) => {
          const count = counts.get(gym.id) ?? 0;
          return (
            <OptionRow
              key={gym.id}
              label={gym.name}
              subtitle={`${count} ${count === 1 ? 'piece' : 'pieces'} of equipment`}
              leading={gymIcon(gym.icon)}
              on={value === gym.id}
              onPress={() => pick(gym.id)}
            />
          );
        })}
        <OptionRow
          label="Any equipment"
          subtitle="Show every exercise"
          leading={gymIcon('infinity')}
          on={value === null}
          onPress={() => pick(null)}
        />
        <OptionRow
          label="Manage Gym Profiles"
          subtitle="Add, edit, and remove gyms"
          leading={gymIcon('settings')}
          onPress={() => {
            onClose();
            router.push('/settings/gym');
          }}
          right={<Lucide name="chevron-right" size={20} color={theme.colors.textMuted} />}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  pressed: { backgroundColor: theme.colors.surfaceRaised },
  rowMain: { flex: 1, gap: 2 },
  icon: { width: 26, textAlign: 'center' },
  thumbSlot: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: theme.colors.text, backgroundColor: theme.colors.text },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.surface },
  group: { paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.xl, paddingBottom: theme.spacing.xs },
  filter: {
    ...textStyle('body', true),
    color: theme.colors.text,
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    margin: theme.spacing.lg,
  },
  range: { paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.lg, gap: theme.spacing.xl },
});
