import { forwardRef } from 'react';
import { Pressable, StyleSheet, Text, type View } from 'react-native';
import { theme } from './theme';
import { textStyle } from './typography';

type Props = {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary';
};

// forwardRef is required: expo-router's <Link asChild> clones its child and
// passes a ref. A plain function component drops it, which React warns about
// and which leaves Link unable to measure or focus the element.
export const Button = forwardRef<View, Props>(function Button(
  { title, onPress, variant = 'primary' },
  ref,
) {
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' ? styles.primary : styles.secondary,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.label, variant === 'secondary' && styles.labelSecondary]}>{title}</Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  base: {
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md,
    alignItems: 'center',
  },
  primary: { backgroundColor: theme.colors.accent },
  secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.colors.border },
  pressed: { opacity: 0.7 },
  label: { ...textStyle('body', true), color: '#FFFFFF', fontWeight: '600' },
  labelSecondary: { color: theme.colors.text },
});
