// apps/mobile/src/ui/Screen.tsx
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from './theme';

type Props = {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  /**
   * Pad for the status bar. Opt-in, and only the four tab screens want it:
   * they render their own `display` title with `headerShown: false`, so nothing
   * else reserves that space and the title collides with the clock.
   *
   * Screens pushed on the stack (routine builder, workout detail) keep their
   * native header, which already reserves it — turning this on there would
   * inset twice. Bottom insets are deliberately still nobody's job here; the
   * tab bar and the pinned rest timer handle their own.
   */
  safeTop?: boolean;
};

export function Screen({ children, scroll = false, padded = true, safeTop = false }: Props) {
  const insets = useSafeAreaInsets();
  // Added to the base padding, not substituted for it. A bare `insets.top`
  // would win the style merge and leave the title hugging the status bar, and
  // it would also disagree with HistoryList, which pads its FlatList the same
  // way but is not built on Screen.
  const top = safeTop ? { paddingTop: insets.top + theme.spacing.lg } : undefined;
  const inner = padded ? styles.padded : undefined;

  if (scroll) {
    return (
      <ScrollView style={styles.root} contentContainerStyle={[inner, top, styles.grow]}>
        {children}
      </ScrollView>
    );
  }
  return <View style={[styles.root, inner, top]}>{children}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  padded: { padding: theme.spacing.lg, gap: theme.spacing.lg },
  grow: { flexGrow: 1 },
});
