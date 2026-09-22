import { Lucide } from '@react-native-vector-icons/lucide';
import equipmentSeed from '../../../../../tools/seed-equipment/equipment.json';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import {
  activateGym,
  countOwnedEquipment,
  createGymFromPreset,
  listGyms,
} from '../../data/gymRepo';
import { db } from '../../db/client';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { ListRow } from '../../ui/ListRow';
import { Screen } from '../../ui/Screen';
import { Sheet } from '../../ui/Sheet';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';

type Preset = { key: string; name: string; items: string[] };

const pieces = (n: number) => `${n} ${n === 1 ? 'piece' : 'pieces'} of equipment`;
const PRESETS = equipmentSeed.presets as Preset[];

/** The icons a gym can wear. Lucide names, so nothing new ships. */
export const GYM_ICONS = ['dumbbell', 'building-2', 'warehouse', 'house', 'store', 'tent'] as const;

export function GymProfilesScreen() {
  const [, setVersion] = useState(0);
  const [adding, setAdding] = useState(false);
  const [pickingPreset, setPickingPreset] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string>(GYM_ICONS[0]);
  const [preset, setPreset] = useState<Preset>(PRESETS[0]!);
  const inputRef = useRef<TextInput>(null);

  useFocusEffect(useCallback(() => setVersion((v) => v + 1), []));

  const gyms = listGyms(db);
  const counts = countOwnedEquipment(db);

  function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const gym = createGymFromPreset(db, trimmed, icon, preset.items, Date.now());
    activateGym(db, gym.id, Date.now());
    setName('');
    setIcon(GYM_ICONS[0]);
    setPreset(PRESETS[0]!);
    setAdding(false);
    setVersion((v) => v + 1);
  }

  return (
    <Screen scroll>
      <Text variant="title">{`${gyms.length} ${gyms.length === 1 ? 'gym' : 'gyms'}`}</Text>

      <Card style={styles.rows}>
        {gyms.map((g) => (
          <ListRow
            key={g.gym.id}
            title={g.gym.name}
            subtitle={`${pieces(counts.get(g.gym.id) ?? 0)}${g.isActive ? '\nDefault' : ''}`}
            leading={<Lucide name={g.gym.icon as 'dumbbell'} size={22} color={theme.colors.textMuted} />}
            right={<Lucide name="pencil" size={16} color={theme.colors.textMuted} />}
            onPress={() =>
              router.push({ pathname: '/settings/gym/[id]', params: { id: g.gym.id, name: g.gym.name } })
            }
          />
        ))}
      </Card>

      <Text variant="caption" color="textMuted">
        Tap a gym to edit it. The one marked Default is what the exercise list is
        filtered to.
      </Text>

      <Button title="Add New Gym Profile" onPress={() => setAdding(true)} />

      <Sheet
        visible={adding}
        onRequestClose={() => {
          setPickingPreset(false);
          setAdding(false);
        }}
        anchor="bottom"
        title={pickingPreset ? 'Pre-fill equipment?' : 'New Gym Profile'}
      >
        {pickingPreset ? (
          <>
            <View style={styles.presetRows}>
              {PRESETS.map((option) => (
                <ListRow
                  key={option.key}
                  title={option.name}
                  subtitle={pieces(option.items.length)}
                  right={
                    <View style={[styles.radio, preset.key === option.key && styles.radioOn]}>
                      {preset.key === option.key ? <View style={styles.radioDot} /> : null}
                    </View>
                  }
                  onPress={() => {
                    setPreset(option);
                    setPickingPreset(false);
                  }}
                />
              ))}
            </View>
            <Button title="Back" variant="secondary" onPress={() => setPickingPreset(false)} />
          </>
        ) : (
          <>
            <Text variant="caption" color="textMuted">Icon</Text>
            <View style={styles.icons}>
              {GYM_ICONS.map((option) => (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityLabel={option}
                  accessibilityState={{ selected: icon === option }}
                  onPress={() => setIcon(option)}
                  style={[styles.iconChoice, icon === option && styles.iconChosen]}
                >
                  <Lucide
                    name={option}
                    size={20}
                    color={icon === option ? theme.colors.onAccent : theme.colors.textMuted}
                  />
                </Pressable>
              ))}
            </View>

            <Text variant="caption" color="textMuted">Name</Text>
            <TextInput
              ref={inputRef}
              value={name}
              onChangeText={setName}
              placeholder="Gym name"
              placeholderTextColor={theme.colors.textMuted}
              onSubmitEditing={create}
              style={styles.input}
            />

            <Text variant="caption" color="textMuted">Pre-fill equipment?</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Choose what to pre-fill"
              onPress={() => setPickingPreset(true)}
              style={styles.select}
            >
              <Text variant="body">{preset.name}</Text>
              <Lucide name="chevron-down" size={18} color={theme.colors.textMuted} />
            </Pressable>

            <Button title="Save" onPress={create} />
            <Button title="Cancel" variant="secondary" onPress={() => setAdding(false)} />
          </>
        )}
      </Sheet>

    </Screen>
  );
}

const styles = StyleSheet.create({
  rows: { paddingVertical: 0, paddingHorizontal: 0, gap: 0 },
  presetRows: { marginHorizontal: -theme.spacing.lg },
  icons: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  iconChoice: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconChosen: { backgroundColor: theme.colors.accent },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.background,
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
  input: {
    minHeight: 44,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
  },
});
