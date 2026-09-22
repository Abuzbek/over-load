import { Lucide } from '@react-native-vector-icons/lucide';
import {
  EQUIPMENT_CATEGORIES,
  type Equipment,
  type EquipmentCategory,
  type EquipmentConfig,
} from '@overload/schema';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import {
  activateGym,
  createGym,
  listGymEquipment,
  listGyms,
  removeGym,
  setGymEquipmentConfig,
  setGymEquipmentOwned,
  type GymEquipmentRow,
} from '../../data/gymRepo';
import { db } from '../../db/client';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Collapsible } from '../../ui/Collapsible';
import { ListRow } from '../../ui/ListRow';
import { Screen } from '../../ui/Screen';
import { SectionLabel } from '../../ui/SectionLabel';
import { Sheet } from '../../ui/Sheet';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';
import { EquipmentEditor } from './EquipmentEditor';

const CATEGORY_LABELS: Record<EquipmentCategory, string> = {
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

/** One line under the name, so the weights are visible without opening it. */
function describe(config: EquipmentConfig): string | undefined {
  switch (config.kind) {
    case 'list':
      if (config.values.length === 0) return 'No weights set';
      return `${config.values.length} · ${config.values[0]!.kg}–${config.values[config.values.length - 1]!.kg} kg`;
    case 'base':
      return `${config.baseKg} kg to start`;
    case 'range':
      return `${config.minKg}–${config.maxKg} kg, ${config.incrementKg} kg steps`;
    case 'labels':
      return config.labels.length === 0 ? 'No resistances set' : config.labels.join(', ');
    default:
      return undefined;
  }
}

export function GymScreen() {
  const [, setVersion] = useState(0);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<GymEquipmentRow | null>(null);
  const inputRef = useRef<TextInput>(null);

  useFocusEffect(useCallback(() => setVersion((v) => v + 1), []));
  const bump = () => setVersion((v) => v + 1);

  const gyms = listGyms(db);
  const active = gyms.find((g) => g.isActive);
  const rows = active ? listGymEquipment(db, active.gym.id) : [];
  const ownedCount = rows.filter((r) => r.owned).length;

  const byCategory = new Map<EquipmentCategory, GymEquipmentRow[]>();
  for (const row of rows) {
    const list = byCategory.get(row.equipment.category) ?? [];
    list.push(row);
    byCategory.set(row.equipment.category, list);
  }

  function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    // Starts empty: here you are describing a real room. Only the very first
    // gym owns everything, so upgrading users keep their catalogue.
    const gym = createGym(db, trimmed, Date.now());
    activateGym(db, gym.id, Date.now());
    setName('');
    setNaming(false);
    bump();
  }

  function save(item: Equipment, config: EquipmentConfig) {
    if (!active) return;
    setGymEquipmentConfig(db, active.gym.id, item.id, config, Date.now());
    setEditing(null);
    bump();
  }

  return (
    <Screen scroll>
      <View style={styles.section}>
        <SectionLabel>Where you train</SectionLabel>
        <Card style={styles.rows}>
          {gyms.map((g) => (
            <ListRow
              key={g.gym.id}
              title={g.gym.name}
              right={
                g.isActive ? (
                  <Lucide name="check" size={18} color={theme.colors.accent} />
                ) : (
                  <Text variant="caption" color="accent">Use this</Text>
                )
              }
              onPress={() => {
                activateGym(db, g.gym.id, Date.now());
                bump();
              }}
            />
          ))}
        </Card>
        <Button title="+ Add gym" variant="secondary" onPress={() => setNaming(true)} />
      </View>

      {active ? (
        <>
          <Text variant="caption" color="textMuted">
            {`${ownedCount} of ${rows.length} at ${active.gym.name}. The exercise list shows only what you can do here.`}
          </Text>

          {EQUIPMENT_CATEGORIES.map((category) => {
            const items = byCategory.get(category) ?? [];
            if (items.length === 0) return null;
            const owned = items.filter((i) => i.owned).length;
            return (
              <Collapsible
                key={category}
                title={`${CATEGORY_LABELS[category]}  (${owned}/${items.length})`}
                defaultOpen={false}
              >
                <Card style={styles.rows}>
                  {items.map((row) => (
                    <ListRow
                      key={row.equipment.id}
                      title={row.equipment.name}
                      subtitle={describe(row.config)}
                      right={
                        <Pressable
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: row.owned }}
                          accessibilityLabel={`${row.equipment.name} available here`}
                          hitSlop={12}
                          onPress={() => {
                            setGymEquipmentOwned(db, active.gym.id, row.equipment.id, !row.owned, Date.now());
                            bump();
                          }}
                          style={[styles.box, row.owned && styles.boxOn]}
                        >
                          {row.owned ? (
                            <Lucide name="check" size={14} color={theme.colors.onAccent} />
                          ) : null}
                        </Pressable>
                      }
                      onPress={
                        row.equipment.kind === 'none' ? undefined : () => setEditing(row)
                      }
                    />
                  ))}
                </Card>
              </Collapsible>
            );
          })}

          {gyms.length > 1 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                removeGym(db, active.gym.id, Date.now());
                bump();
              }}
              style={styles.remove}
            >
              <Text variant="caption" color="danger">{`Remove ${active.gym.name}`}</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}

      <EquipmentEditor
        item={editing?.equipment ?? null}
        config={editing?.config ?? { kind: 'none' }}
        onSave={(config) => editing && save(editing.equipment, config)}
        onClose={() => setEditing(null)}
      />

      <Sheet
        visible={naming}
        onRequestClose={() => setNaming(false)}
        title="New gym"
        body="Name it, then tick what is there."
        onShow={() => inputRef.current?.focus()}
      >
        <TextInput
          ref={inputRef}
          value={name}
          onChangeText={setName}
          placeholder="Gym name"
          placeholderTextColor={theme.colors.textMuted}
          onSubmitEditing={create}
          style={styles.input}
        />
        <Button title="Create" onPress={create} />
        <Button title="Cancel" variant="secondary" onPress={() => setNaming(false)} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: theme.spacing.sm },
  rows: { paddingVertical: 0, paddingHorizontal: 0, gap: 0 },
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
  remove: { alignItems: 'center', paddingVertical: theme.spacing.md },
  input: {
    minHeight: 44,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
  },
});
