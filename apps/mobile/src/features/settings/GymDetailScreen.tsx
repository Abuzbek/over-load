import { Lucide } from '@react-native-vector-icons/lucide';
import {
  EQUIPMENT_CATEGORIES,
  type Equipment,
  type EquipmentCategory,
  type EquipmentConfig,
} from '@overload/schema';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import {
  duplicateGym,
  listGymEquipment,
  listGyms,
  removeGym,
  renameGym,
  setGymEquipmentConfig,
  setGymEquipmentOwned,
  setGymEquipmentOwnedBulk,
  setGymIcon,
  type GymEquipmentRow,
} from '../../data/gymRepo';
import { db } from '../../db/client';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Collapsible } from '../../ui/Collapsible';
import { ListRow } from '../../ui/ListRow';
import { Screen } from '../../ui/Screen';
import { SearchField } from '../../ui/SearchField';
import { Segmented } from '../../ui/Segmented';
import { Sheet } from '../../ui/Sheet';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';
import { EquipmentEditor } from './EquipmentEditor';
import { GYM_ICONS } from './GymProfilesScreen';

export const CATEGORY_LABELS: Record<EquipmentCategory, string> = {
  free_weights: 'Free weights',
  loaded_bars: 'Loaded bars',
  fixed_weight_bars: 'Fixed weight bars',
  bands_ropes: 'Bands & ropes',
  body_weights: 'Body weight',
  benches_racks: 'Benches & racks',
  accessories_functional: 'Accessories & functional',
  loaded_accessories: 'Loaded accessories',
  cable_machines: 'Cable machines',
  plate_loaded_machines: 'Plate loaded machines',
  pin_loaded_machines: 'Pin loaded machines',
  cardio: 'Cardio',
  other: 'Other',
};

/** The weights, on one line, so they are readable without opening the editor. */
function describe(config: EquipmentConfig): string | undefined {
  switch (config.kind) {
    case 'list':
      if (config.values.length === 0) return 'No weights set';
      return config.values.map((v) => `${v.kg} kg`).join(', ');
    case 'base':
      return `${config.baseKg} kg`;
    case 'range':
      return `${config.minKg}–${config.maxKg} kg, ${config.incrementKg} kg steps`;
    case 'labels':
      return config.labels.length === 0 ? 'No resistances set' : config.labels.join(', ');
    default:
      return undefined;
  }
}

const EDIT_LABEL: Record<EquipmentConfig['kind'], string> = {
  list: 'Edit weights',
  base: 'Edit base weight',
  range: 'Edit range',
  labels: 'Edit resistances',
  none: '',
};

export function GymDetailScreen({ gymId }: { gymId: string }) {
  const [, setVersion] = useState(0);
  const [editing, setEditing] = useState<GymEquipmentRow | null>(null);
  const [showAll, setShowAll] = useState(true);
  const [filter, setFilter] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [pickingIcon, setPickingIcon] = useState(false);
  const [name, setName] = useState('');
  const inputRef = useRef<TextInput>(null);

  useFocusEffect(useCallback(() => setVersion((v) => v + 1), []));
  const bump = () => setVersion((v) => v + 1);

  const gym = listGyms(db).find((g) => g.gym.id === gymId)?.gym;
  const all = gym ? listGymEquipment(db, gym.id) : [];

  const needle = filter.trim().toLowerCase();
  const rows = all.filter(
    (r) =>
      (showAll || r.owned) &&
      (needle === '' || r.equipment.name.toLowerCase().includes(needle)),
  );

  const byCategory = new Map<EquipmentCategory, GymEquipmentRow[]>();
  for (const row of rows) {
    const list = byCategory.get(row.equipment.category) ?? [];
    list.push(row);
    byCategory.set(row.equipment.category, list);
  }

  if (!gym) {
    return (
      <Screen>
        <Text color="textMuted">Gym not found.</Text>
      </Screen>
    );
  }

  function save(item: Equipment, config: EquipmentConfig) {
    setGymEquipmentConfig(db, gymId, item.id, config, Date.now());
    setEditing(null);
    bump();
  }

  return (
    <Screen scroll>
      <View style={styles.actions}>
        <Button title="Edit icon" variant="secondary" onPress={() => setPickingIcon(true)} />
        <Button
          title="Rename"
          variant="secondary"
          onPress={() => {
            setName(gym!.name);
            setRenaming(true);
          }}
        />
        <Button
          title="Duplicate"
          variant="secondary"
          onPress={() => {
            const copy = duplicateGym(db, gymId, `${gym!.name} copy`, Date.now());
            if (copy) router.replace({ pathname: '/settings/gym/[id]', params: { id: copy.id, name: copy.name } });
          }}
        />
      </View>

      <View style={styles.filterRow}>
        <Text variant="heading">Equipment</Text>
        <Segmented
          accessibilityLabel="Which equipment to show"
          value={showAll ? 'all' : 'selected'}
          onChange={(v) => setShowAll(v === 'all')}
          options={[
            { value: 'selected', label: 'Selected' },
            { value: 'all', label: 'All' },
          ]}
        />
      </View>

      <SearchField value={filter} onChangeText={setFilter} placeholder="Filter equipment by name" />

      {EQUIPMENT_CATEGORIES.map((category) => {
        const items = byCategory.get(category) ?? [];
        if (items.length === 0) return null;
        const owned = items.filter((i) => i.owned).length;
        const allOwned = owned === items.length;
        return (
          <Collapsible
            key={category}
            title={`${CATEGORY_LABELS[category]}  (${owned}/${items.length})`}
            defaultOpen={needle !== '' || !showAll}
          >
            <Card style={styles.rows}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${allOwned ? 'Deselect' : 'Select'} all ${CATEGORY_LABELS[category]}`}
                onPress={() => {
                  setGymEquipmentOwnedBulk(db, gymId, items.map((i) => i.equipment.id), !allOwned, Date.now());
                  bump();
                }}
                style={({ pressed }) => [styles.bulk, pressed && styles.pressed]}
              >
                <Text variant="caption" color="accent">
                  {allOwned ? 'Deselect all' : 'Select all'}
                </Text>
              </Pressable>

              {items.map((row) => (
                <ListRow
                  key={row.equipment.id}
                  title={row.equipment.name}
                  subtitle={describe(row.config)}
                  right={
                    <View style={styles.rowRight}>
                      {row.equipment.kind === 'none' ? null : (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`${EDIT_LABEL[row.equipment.kind]} for ${row.equipment.name}`}
                          hitSlop={10}
                          onPress={() => setEditing(row)}
                        >
                          <Text variant="caption" color="accent">{EDIT_LABEL[row.equipment.kind]}</Text>
                        </Pressable>
                      )}
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: row.owned }}
                        accessibilityLabel={`${row.equipment.name} available here`}
                        hitSlop={12}
                        onPress={() => {
                          setGymEquipmentOwned(db, gymId, row.equipment.id, !row.owned, Date.now());
                          bump();
                        }}
                        style={[styles.box, row.owned && styles.boxOn]}
                      >
                        {row.owned ? <Lucide name="check" size={14} color={theme.colors.onAccent} /> : null}
                      </Pressable>
                    </View>
                  }
                />
              ))}
            </Card>
          </Collapsible>
        );
      })}

      {rows.length === 0 ? (
        <Text variant="caption" color="textMuted">
          {needle ? `Nothing matches “${filter}”.` : 'Nothing selected here yet.'}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          removeGym(db, gymId, Date.now());
          router.back();
        }}
        style={styles.remove}
      >
        <Text variant="caption" color="danger">{`Remove ${gym.name}`}</Text>
      </Pressable>

      <EquipmentEditor
        item={editing?.equipment ?? null}
        config={editing?.config ?? { kind: 'none' }}
        onSave={(config) => editing && save(editing.equipment, config)}
        onClose={() => setEditing(null)}
      />

      <Sheet
        visible={renaming}
        onRequestClose={() => setRenaming(false)}
        title="Rename gym"
        onShow={() => inputRef.current?.focus()}
      >
        <TextInput
          ref={inputRef}
          value={name}
          onChangeText={setName}
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
        />
        <Button
          title="Save"
          onPress={() => {
            const trimmed = name.trim();
            if (!trimmed) return;
            renameGym(db, gymId, trimmed, Date.now());
            setRenaming(false);
            bump();
          }}
        />
        <Button title="Cancel" variant="secondary" onPress={() => setRenaming(false)} />
      </Sheet>

      <Sheet
        visible={pickingIcon}
        onRequestClose={() => setPickingIcon(false)}
        anchor="bottom"
        title="Gym icon"
      >
        <View style={styles.icons}>
          {GYM_ICONS.map((option) => (
            <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityLabel={option}
              onPress={() => {
                setGymIcon(db, gymId, option, Date.now());
                setPickingIcon(false);
                bump();
              }}
              style={[styles.iconChoice, gym!.icon === option && styles.iconChosen]}
            >
              <Lucide
                name={option}
                size={20}
                color={gym!.icon === option ? theme.colors.onAccent : theme.colors.textMuted}
              />
            </Pressable>
          ))}
        </View>
        <Button title="Close" variant="secondary" onPress={() => setPickingIcon(false)} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: theme.spacing.sm },
  filterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rows: { paddingVertical: 0, paddingHorizontal: 0, gap: 0 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  bulk: {
    alignItems: 'flex-end',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  pressed: { opacity: 0.6 },
  box: {
    width: 22,
    height: 22,
    borderRadius: theme.radius.sm,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
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
  remove: { alignItems: 'center', paddingVertical: theme.spacing.md },
  input: {
    minHeight: 44,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
  },
});
