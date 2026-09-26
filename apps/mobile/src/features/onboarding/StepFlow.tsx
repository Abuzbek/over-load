import { Lucide } from '@react-native-vector-icons/lucide';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../ui/Button';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';
import type { Step } from './steps';

type Props = {
  steps: Step[];
  index: number;
  onIndex: (index: number) => void;
  /** The header over a question step. */
  title: (step: Step) => string;
  /** The last step's button. */
  lastLabel: string;
  onFinish: () => void;
  /** An × on the first step, to leave the flow. */
  onClose?: () => void;
  /** Progress over the step's phase (onboarding) or over the whole flow. */
  progressBy: 'phase' | 'flow';
};

/**
 * A run of steps, one screen each: back (or ×), a title and progress bar, the
 * step's question and body, and a pinned Next. Onboarding and Create Program
 * both walk their steps through this.
 */
export function StepFlow({ steps, index, onIndex, title, lastLabel, onFinish, onClose, progressBy }: Props) {
  const insets = useSafeAreaInsets();
  const step = steps[index]!;
  const last = index === steps.length - 1;

  const next = () => {
    step.onNext?.();
    if (last) onFinish();
    else onIndex(index + 1);
  };

  const counted = steps.filter((s) => s.kind === 'question' && (progressBy === 'flow' || s.phase === step.phase));
  const progress = step.kind === 'question' ? (counted.indexOf(step) + 1) / counted.length : 0;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.root, { paddingTop: insets.top }]}
    >
      <View style={styles.header}>
        {index > 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={12} onPress={() => onIndex(index - 1)}>
            <Lucide name="chevron-left" size={26} color={theme.colors.text} />
          </Pressable>
        ) : onClose ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} onPress={onClose}>
            <Lucide name="x" size={26} color={theme.colors.text} />
          </Pressable>
        ) : (
          <View style={styles.headerSide} />
        )}
        <Text variant="heading" style={styles.headerTitle}>
          {step.kind === 'question' ? title(step) : ''}
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
        <Button title={last ? lastLabel : step.next ?? 'Next'} disabled={!step.ready} onPress={next} />
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
  footer: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, gap: theme.spacing.sm },
});
