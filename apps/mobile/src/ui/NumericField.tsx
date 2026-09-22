import { StyleSheet, TextInput } from 'react-native';
import { useSerifLoaded } from './FontsContext';
import { theme } from './theme';
import { textStyle } from './typography';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  keyboard: 'decimal-pad' | 'number-pad';
  editable?: boolean;
  accessibilityLabel: string;
};

/**
 * Every weight, rep and duration box. Tabular figures so a value does not
 * shift its own box as digits change, and a 48pt floor so it stays tappable
 * with one thumb mid-set.
 */
export function NumericField({
  value, onChangeText, placeholder, keyboard, editable = true, accessibilityLabel,
}: Props) {
  const serifLoaded = useSerifLoaded();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      keyboardType={keyboard}
      editable={editable}
      accessibilityLabel={accessibilityLabel}
      placeholderTextColor={theme.colors.textMuted}
      style={[
        textStyle('numeric', serifLoaded),
        styles.field,
        !editable && styles.locked,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  field: {
    flex: 1,
    minHeight: 48,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
    textAlign: 'center',
  },
  // A completed set's inputs lock: an edit after checking would reach React
  // state but never the database (R22).
  locked: { color: theme.colors.textMuted, opacity: 0.7 },
});
