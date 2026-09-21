import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { theme } from './theme';

type Props = {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
};

export function ListRow({ title, subtitle, right, onPress }: Props) {
  return (
    <Pressable
      // A row with no onPress is presentational, so it should not be announced
      // as something to activate.
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.main}>
        <Text>{title}</Text>
        {subtitle ? <Text variant="caption" color="textMuted">{subtitle}</Text> : null}
      </View>
      {right}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  pressed: { backgroundColor: theme.colors.surface },
  main: { flex: 1, gap: 2 },
});
