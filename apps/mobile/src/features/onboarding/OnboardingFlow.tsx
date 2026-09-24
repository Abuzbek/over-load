import { Lucide } from '@react-native-vector-icons/lucide';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { completeOnboarding, createProgramFromPlan } from '../../data/onboardingRepo';
import { db } from '../../db/client';
import { Button } from '../../ui/Button';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';
import { markOnboarded } from '../../sync/syncService';
import { buildSteps, INITIAL_ANSWERS, PHASES, preferencesOf, type Answers } from './steps';

/**
 * First run for a new account, in three phases — Basics, Gym & Equipment,
 * Program — each opened by an overview of where you are. Answers stay in
 * memory until the last step, except the profile and the gym, which the
 * equipment step needs to exist; the program is written only on finishing.
 */
export function OnboardingFlow() {
  const insets = useSafeAreaInsets();
  const [answers, setAnswers] = useState<Answers>(INITIAL_ANSWERS);
  const [index, setIndex] = useState(0);
  const set = (patch: Partial<Answers>) => setAnswers((a) => ({ ...a, ...patch }));

  const steps = buildSteps(answers, set);
  const step = steps[index]!;
  const last = index === steps.length - 1;

  const finish = () => {
    const at = Date.now();
    if (answers.plan) {
      createProgramFromPlan(db, answers.plan, { name: answers.programName.trim() || 'My Program', icon: answers.icon, color: answers.color }, at);
    }
    completeOnboarding(db, preferencesOf(answers), at);
    markOnboarded();
    router.replace('/');
  };

  const next = () => {
    step.onNext?.();
    if (last) finish();
    else setIndex((i) => i + 1);
  };

  // The phase's own question steps, for its progress bar.
  const phaseSteps = steps.filter((s) => s.phase === step.phase && s.kind === 'question');
  const progress = step.kind === 'question' ? (phaseSteps.indexOf(step) + 1) / phaseSteps.length : 0;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.root, { paddingTop: insets.top }]}
    >
      <View style={styles.header}>
        {index > 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={12} onPress={() => setIndex((i) => i - 1)}>
            <Lucide name="chevron-left" size={26} color={theme.colors.text} />
          </Pressable>
        ) : (
          <View style={styles.headerSide} />
        )}
        <Text variant="heading" style={styles.headerTitle}>
          {step.kind === 'question' ? PHASES[step.phase] : ''}
        </Text>
        <View style={styles.headerSide} />
      </View>
      {step.kind === 'question' ? (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progress * 100}%` }]} />
        </View>
      ) : null}

      {step.scroll === false ? (
        <View style={styles.flex}>
          <View style={styles.fixedHeading}>
            <Heading title={step.title} subtitle={step.subtitle} />
          </View>
          {step.body}
        </View>
      ) : (
        <ScrollView style={styles.flex} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Heading title={step.title} subtitle={step.subtitle} />
          {step.body}
        </ScrollView>
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing.md }]}>
        {step.footer}
        <Button title={last ? 'Start training' : step.next ?? 'Next'} disabled={!step.ready} onPress={next} />
      </View>
    </KeyboardAvoidingView>
  );
}

function Heading({ title, subtitle }: { title?: string; subtitle?: string }): ReactNode {
  if (!title) return null;
  return (
    <View style={styles.heading}>
      <Text variant="title" style={styles.title}>{title}</Text>
      {subtitle ? <Text color="textMuted">{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  headerSide: { width: 26 },
  headerTitle: { flex: 1, textAlign: 'center' },
  track: { height: 3, marginHorizontal: theme.spacing.lg, backgroundColor: theme.colors.border, borderRadius: 2 },
  fill: { height: 3, backgroundColor: theme.colors.text, borderRadius: 2 },
  body: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl, gap: theme.spacing.md },
  heading: { gap: theme.spacing.sm, paddingBottom: theme.spacing.md },
  fixedHeading: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg },
  title: { fontSize: 24, lineHeight: 30 },
  footer: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md },
});
