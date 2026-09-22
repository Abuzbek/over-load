import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { theme } from './theme';

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Announced before the option label, e.g. "Metric". */
  accessibilityLabel: string;
};

/**
 * A pill switcher: one track, the selected option filled. Replaces the pairs
 * and triples of Buttons that were standing in for this — a row of Buttons
 * reads as several actions, where this reads as one choice with several states.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: Props<T>) {
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityLabel={`${accessibilityLabel}: ${option.label}`}
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.item,
              selected && styles.itemSelected,
              pressed && !selected && styles.pressed,
            ]}
          >
            <Text variant="heading" color={selected ? 'onAccent' : 'textMuted'}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.pill,
    padding: theme.spacing.xs,
    gap: theme.spacing.xs,
  },
  item: {
    // Matches Button's 40.
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.pill,
  },
  itemSelected: { backgroundColor: theme.colors.accent },
  pressed: { opacity: 0.7 },
});
