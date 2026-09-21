import { formatDuration, restRemainingSeconds } from '@overload/domain';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../ui/theme';
import { textStyle } from '../../ui/typography';

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
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.bar,
        remaining === 0 && styles.barDone,
        { paddingBottom: theme.spacing.md + insets.bottom },
      ]}
    >
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
    paddingTop: theme.spacing.md,
  },
  barDone: { backgroundColor: theme.colors.success },
  label: { ...textStyle('body', true), color: theme.colors.text },
  time: { ...textStyle('title', true), color: theme.colors.text, fontVariant: ['tabular-nums'] },
  skip: { ...textStyle('body', true), color: theme.colors.accent },
});
