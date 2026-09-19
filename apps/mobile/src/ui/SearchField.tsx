import { StyleSheet, TextInput } from 'react-native';
import { theme } from './theme';

type Props = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
};

export function SearchField({ value, onChangeText, placeholder = 'Search' }: Props) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={theme.colors.textMuted}
      autoCorrect={false}
      autoCapitalize="none"
      clearButtonMode="while-editing"
      style={styles.input}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    margin: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    ...theme.text.body,
  },
});
