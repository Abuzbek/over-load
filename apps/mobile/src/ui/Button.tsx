import { forwardRef } from 'react';
import { Pressable, StyleSheet, type View } from 'react-native';
import { Text } from './Text';
import { theme } from './theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type Props = { title: string; onPress?: () => void; variant?: Variant; disabled?: boolean };

// forwardRef is required: expo-router's <Link asChild> clones its child and
// passes a ref. A plain function component drops it. This previously stopped
// the app launching, and a code review looked at the pattern and called it fine.
export const Button = forwardRef<View, Props>(function Button(
  { title, onPress, variant = 'primary', disabled = false },
  ref,
) {
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text variant="heading" color={variant === 'primary' ? 'onAccent' : variant === 'destructive' ? 'danger' : 'text'}>
        {title}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  base: {
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  primary: { backgroundColor: theme.colors.accent },
  secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.colors.border },
  ghost: { backgroundColor: 'transparent' },
  destructive: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.colors.danger },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },
});
