// apps/mobile/src/ui/Screen.tsx
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { theme } from './theme';

type Props = { children: ReactNode; scroll?: boolean; padded?: boolean };

export function Screen({ children, scroll = false, padded = true }: Props) {
  const inner = padded ? styles.padded : undefined;
  if (scroll) {
    return (
      <ScrollView style={styles.root} contentContainerStyle={[inner, styles.grow]}>
        {children}
      </ScrollView>
    );
  }
  return <View style={[styles.root, inner]}>{children}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  padded: { padding: theme.spacing.lg, gap: theme.spacing.lg },
  grow: { flexGrow: 1 },
});
