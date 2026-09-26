import { Lucide } from '@react-native-vector-icons/lucide';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { activateProgram, listPrograms } from '../../data/programRepo';
import { db } from '../../db/client';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Collapsible } from '../../ui/Collapsible';
import { ListRow } from '../../ui/ListRow';
import { Screen } from '../../ui/Screen';
import { SectionLabel } from '../../ui/SectionLabel';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';

export function ProgramsScreen() {
  const [, setVersion] = useState(0);

  useFocusEffect(useCallback(() => setVersion((v) => v + 1), []));

  const programs = listPrograms(db);
  const active = programs.find((p) => p.isActive);
  const archived = programs.filter((p) => !p.isActive);

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
              subtitle={`${active.trainingDays} ${active.trainingDays === 1 ? 'training day' : 'training days'}`}
              right={<Lucide name="check" size={18} color={theme.colors.accent} />}
              onPress={() =>
                router.push({
                  pathname: '/programs/[id]',
                  params: { id: active.program.id, name: active.program.name },
                })
              }
            />
          </Card>
        ) : (
          <Text variant="caption" color="textMuted">
            No active program.
          </Text>
        )}
      </View>

      <Collapsible title="Archived">
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
                subtitle={`${p.trainingDays} ${p.trainingDays === 1 ? 'training day' : 'training days'}`}
                right={<Text variant="caption" color="accent">Activate</Text>}
                onPress={() => activate(p.program.id)}
              />
            ))}
          </Card>
        )}
      </Collapsible>

      <Button title="New program" variant="secondary" onPress={() => router.push('/programs/new')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: theme.spacing.sm },
  rows: { paddingVertical: 0, paddingHorizontal: 0, gap: 0 },
});
