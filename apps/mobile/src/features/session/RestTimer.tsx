import { formatDuration, restRemainingSeconds } from '@overload/domain';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../ui/theme';

type Props = {
  startedAt: number;
  restSeconds: number;
  onDismiss: () => void;
};

export function RestTimer({ startedAt, restSeconds, onDismiss }: Props) {
  // The interval only triggers a re-render; the value itself comes from the clock,
  // so a missed tick during suspension corrects itself on the next render.
  const [, setTick] = useState(0);

  useEffect(() => {
    const handle = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(handle);
  }, []);

  const remaining = restRemainingSeconds(startedAt, restSeconds, Date.now());

  return (
    <View style={[styles.bar, remaining === 0 && styles.barDone]}>
      <Text style={styles.label}>{remaining === 0 ? 'Rest complete' : 'Rest'}</Text>
      <Text style={styles.time}>{formatDuration(remaining)}</Text>
      <Pressable onPress={onDismiss} accessibilityLabel="Skip rest">
        <Text style={styles.skip}>Skip</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  barDone: { backgroundColor: theme.colors.success },
  label: { ...theme.text.body, color: theme.colors.text },
  time: { ...theme.text.title, color: theme.colors.text, fontVariant: ['tabular-nums'] },
  skip: { ...theme.text.body, color: theme.colors.accent },
});
