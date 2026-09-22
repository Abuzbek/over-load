import { Lucide } from '@react-native-vector-icons/lucide';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SectionLabel } from './SectionLabel';
import { theme } from './theme';

type Props = {
  title: string;
  /** Sections start open; a section that is usually noise can start closed. */
  defaultOpen?: boolean;
  children: ReactNode;
};

export function Collapsible({ title, defaultOpen = true, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.section}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        // The header is only as tall as its label text, which is small — hitSlop
        // is what makes it a real touch target.
        hitSlop={10}
        onPress={() => setOpen((o) => !o)}
        style={styles.header}
      >
        <SectionLabel>{title}</SectionLabel>
        <Lucide
          name={open ? 'chevron-down' : 'chevron-right'}
          size={16}
          color={theme.colors.textMuted}
        />
      </Pressable>
      {open ? children : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: theme.spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
