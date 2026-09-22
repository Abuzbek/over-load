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
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    // 40, down from 48. Every button in this app is either full width or a
    // labelled chip in a row, so the tappable AREA stays large even as the
    // height drops; 40 is the shortest that still reads as a button rather
    // than a link. The small square targets keep their own floors: the set
    // checkmark is 34 + hitSlop 7 = 48, and NumericField stays 48 because it
    // is a narrow box in a crowded row.
    minHeight: 40,
  },
  primary: { backgroundColor: theme.colors.accent },
  secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.colors.border },
  ghost: { backgroundColor: 'transparent' },
  destructive: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.colors.danger },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },
});
