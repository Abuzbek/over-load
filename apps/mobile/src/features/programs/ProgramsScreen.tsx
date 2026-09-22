import { Lucide } from '@react-native-vector-icons/lucide';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { activateProgram, createProgram, listPrograms } from '../../data/programRepo';
import { db } from '../../db/client';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { ListRow } from '../../ui/ListRow';
import { Screen } from '../../ui/Screen';
import { SectionLabel } from '../../ui/SectionLabel';
import { Sheet } from '../../ui/Sheet';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';

export function ProgramsScreen() {
  const [, setVersion] = useState(0);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  useFocusEffect(useCallback(() => setVersion((v) => v + 1), []));

  const programs = listPrograms(db);
  const active = programs.find((p) => p.isActive);
  const archived = programs.filter((p) => !p.isActive);

  function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    // Created but NOT activated: switching what you train is a deliberate act,
    // not a side effect of adding one.
    createProgram(db, { name: trimmed }, Date.now());
    setName('');
    setNaming(false);
    setVersion((v) => v + 1);
  }

  function activate(id: string) {
    activateProgram(db, id, Date.now());
    setVersion((v) => v + 1);
  }

  return (
    <Screen scroll>
      <View style={styles.section}>
        <SectionLabel>Active</SectionLabel>
        {active ? (
          <Card style={styles.rows}>
            <ListRow
              title={active.program.name}
              subtitle={`${active.workoutCount} ${active.workoutCount === 1 ? 'workout' : 'workouts'}`}
              right={<Lucide name="check" size={18} color={theme.colors.accent} />}
            />
          </Card>
        ) : (
          <Text variant="caption" color="textMuted">
            No active program.
          </Text>
        )}
      </View>

      <View style={styles.section}>
        <SectionLabel>Archived</SectionLabel>
        {archived.length === 0 ? (
          <Text variant="caption" color="textMuted">
            Programs you are not training show up here. Activating one archives the
            current one — only ever one is active.
          </Text>
        ) : (
          <Card style={styles.rows}>
            {archived.map((p) => (
              <ListRow
                key={p.program.id}
                title={p.program.name}
                subtitle={`${p.workoutCount} ${p.workoutCount === 1 ? 'workout' : 'workouts'}`}
                right={<Text variant="caption" color="accent">Activate</Text>}
                onPress={() => activate(p.program.id)}
              />
            ))}
          </Card>
        )}
      </View>

      <Button title="New program" variant="secondary" onPress={() => setNaming(true)} />

      <Sheet
        visible={naming}
        onRequestClose={() => setNaming(false)}
        title="New program"
        body="Name it now; add workouts to it afterwards."
      >
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Program name"
          placeholderTextColor={theme.colors.textMuted}
          autoFocus
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
  input: {
    minHeight: 44,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
  },
});
