import { Lucide } from '@react-native-vector-icons/lucide';
import { EQUIPMENT } from '@overload/schema';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import {
  activateGym,
  createGym,
  listGyms,
  removeGym,
  setGymEquipment,
} from '../../data/gymRepo';
import { db } from '../../db/client';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { ListRow } from '../../ui/ListRow';
import { Screen } from '../../ui/Screen';
import { SectionLabel } from '../../ui/SectionLabel';
import { Sheet } from '../../ui/Sheet';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';

export function GymScreen() {
  const [, setVersion] = useState(0);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const inputRef = useRef<TextInput>(null);

  useFocusEffect(useCallback(() => setVersion((v) => v + 1), []));
  const bump = () => setVersion((v) => v + 1);

  const gyms = listGyms(db);
  const active = gyms.find((g) => g.isActive);

  function toggleEquipment(item: string) {
    if (!active) return;
    const has = active.gym.equipment.includes(item);
    const next = has
      ? active.gym.equipment.filter((e) => e !== item)
      : [...active.gym.equipment, item];
    setGymEquipment(db, active.gym.id, next, Date.now());
    bump();
  }

  function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    // A new gym starts empty: you tick what is actually there. The everything
    // default only exists so upgrading users keep the catalogue they had.
    const gym = createGym(db, trimmed, [], Date.now());
    activateGym(db, gym.id, Date.now());
    setName('');
    setNaming(false);
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
              subtitle={`${g.gym.equipment.length} of ${EQUIPMENT.length} · bodyweight always`}
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
        <View style={styles.section}>
          <SectionLabel>{`Equipment at ${active.gym.name}`}</SectionLabel>
          <Card style={styles.rows}>
            {EQUIPMENT.map((item) => {
              const on = active.gym.equipment.includes(item);
              return (
                <ListRow
                  key={item}
                  title={item}
                  right={
                    <View style={[styles.box, on && styles.boxOn]}>
                      {on ? <Lucide name="check" size={14} color={theme.colors.onAccent} /> : null}
                    </View>
                  }
                  onPress={() => toggleEquipment(item)}
                />
              );
            })}
          </Card>
          <Text variant="caption" color="textMuted">
            The exercise list shows only what you can do here. Bodyweight movements
            always show, whatever is ticked.
          </Text>
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
        </View>
      ) : null}

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
