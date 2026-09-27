import { Lucide } from '@react-native-vector-icons/lucide';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  archiveProgram,
  deleteProgram,
  duplicateProgram,
  getProgram,
  updateProgramSettings,
  type ProgramSettings,
} from '../../data/programRepo';
import { getTrainingPreferences } from '../../data/settingsRepo';
import { db } from '../../db/client';
import { Button } from '../../ui/Button';
import { SectionLabel } from '../../ui/SectionLabel';
import { Sheet } from '../../ui/Sheet';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';
import { Choices, GOALS, ToggleCard } from '../onboarding/steps';

/**
 * How a program's blocks run — cycles, the deload, periodization and the goal
 * it follows — and what to do with the program: duplicate, archive, delete.
 * Every change saves at once.
 */
export function ProgramSettingsScreen({ programId }: { programId: string }) {
  const insets = useSafeAreaInsets();
  const [, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);
  useFocusEffect(useCallback(() => setVersion((v) => v + 1), []));
  const [copyName, setCopyName] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const program = getProgram(db, programId);
  if (!program) return null;
  const save = (patch: Partial<ProgramSettings>) => {
    updateProgramSettings(db, programId, patch, Date.now());
    refresh();
  };
  const goal = program.goal ?? getTrainingPreferences(db)?.goal ?? null;

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + theme.spacing.xxl }]}>
      <SectionLabel>Cycles</SectionLabel>
      <View style={styles.stepper}>
        <Step icon="minus" disabled={program.cycleCount <= 1} onPress={() => save({ cycleCount: program.cycleCount - 1 })} />
        <View style={styles.stepperValue}>
          <Text style={styles.bigNumber}>{program.cycleCount}</Text>
          <Text color="textMuted">{program.cycleCount === 1 ? 'cycle' : 'cycles'} before the block repeats</Text>
        </View>
        <Step icon="plus" disabled={program.cycleCount >= 52} onPress={() => save({ cycleCount: program.cycleCount + 1 })} />
      </View>

      <SectionLabel>Deload</SectionLabel>
      <Choices
        options={[
          { value: 'none' as const, label: 'None', note: 'Train continuously, no lighter cycle', icon: 'circle-off' },
          { value: 'first' as const, label: 'First cycle', note: 'Start each block with a lighter cycle to ease into the work', icon: 'sunrise' },
          { value: 'last' as const, label: 'Last cycle', note: 'End each block with a lighter cycle to recover. Recommended.', icon: 'sunset' },
        ]}
        value={program.deload}
        onChange={(deload) => save({ deload })}
      />

      <SectionLabel>Periodization</SectionLabel>
      <ToggleCard
        icon="chart-no-axes-combined"
        title="Change the plan cycle to cycle"
        body="Rep ranges, reps in reserve and set types move through the block by your goal, with failure sets towards its end. Off, every cycle trains the plan as written."
        value={program.periodized}
        onChange={(periodized) => save({ periodized })}
      />
      {program.periodized ? (
        <Choices
          options={GOALS.map((g) => ({ value: g.value, label: g.label, note: g.note, icon: g.icon }))}
          value={goal}
          onChange={(value) => save({ goal: value })}
        />
      ) : null}

      <SectionLabel>Program</SectionLabel>
      <Button title="Duplicate program" variant="secondary" onPress={() => setCopyName(`${program.name} (copy)`)} />
      <Button
        title="Archive program"
        variant="secondary"
        onPress={() => {
          archiveProgram(db, programId, Date.now());
          router.dismissTo('/workout');
        }}
      />
      <Button title="Delete program" variant="destructive" onPress={() => setConfirmDelete(true)} />

      <Sheet visible={copyName !== null} onRequestClose={() => setCopyName(null)} title="Duplicate program" body="A copy to change without touching this one.">
        <TextInput
          value={copyName ?? ''}
          onChangeText={setCopyName}
          placeholder="Program name"
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
        />
        <Button
          title="Save & go to duplicate"
          disabled={!copyName?.trim()}
          onPress={() => {
            const copy = duplicateProgram(db, programId, copyName!.trim(), Date.now());
            setCopyName(null);
            if (copy) router.replace({ pathname: '/programs/[id]', params: { id: copy.id, name: copy.name } });
          }}
        />
        <Button title="Cancel" variant="secondary" onPress={() => setCopyName(null)} />
      </Sheet>

      <Sheet
        visible={confirmDelete}
        onRequestClose={() => setConfirmDelete(false)}
        title={`Delete ${program.name}?`}
        body="Its days and the workouts only it uses are deleted. Your workout history stays."
      >
        <Button
          title="Delete program"
          variant="destructive"
          onPress={() => {
            deleteProgram(db, programId, Date.now());
            setConfirmDelete(false);
            router.dismissTo('/workout');
          }}
        />
        <Button title="Cancel" variant="secondary" onPress={() => setConfirmDelete(false)} />
      </Sheet>
    </ScrollView>
  );
}

function Step({ icon, disabled, onPress }: { icon: 'minus' | 'plus'; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={icon === 'plus' ? 'More cycles' : 'Fewer cycles'}
      disabled={disabled}
      onPress={onPress}
      style={[styles.step, disabled && styles.dim]}
    >
      <Lucide name={icon} size={22} color={theme.colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: theme.spacing.lg, gap: theme.spacing.md },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.xl, paddingVertical: theme.spacing.md },
  stepperValue: { alignItems: 'center', minWidth: 140 },
  bigNumber: { fontSize: 40, lineHeight: 46, fontWeight: '600' },
  step: { width: 52, height: 52, borderRadius: 26, backgroundColor: theme.colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.35 },
  input: {
    minHeight: 44,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
  },
});
