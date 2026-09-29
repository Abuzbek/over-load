import { Lucide } from '@react-native-vector-icons/lucide';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { theme } from './theme';

const midnight = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

type Props = {
  /** A day in the month to open on (local midnight); today when left out. */
  initial?: number;
  /** Filled: a workout; dot: something logged; selected: the day being edited. */
  mark?: (day: number) => { filled?: boolean; dot?: boolean };
  selected?: number;
  onPick: (day: number) => void;
  /** Accessibility hint appended to each day, e.g. "log weight". */
  action: string;
};

/**
 * A Monday-first month of days with arrows to page months, no further than
 * this one. Days after today are shown but cannot be picked.
 */
export function MonthGrid({ initial, mark, selected, onPick, action }: Props) {
  const now = Date.now();
  const today = midnight(now);
  const start = new Date(initial ?? now);
  const [offset, setOffset] = useState(0);
  const base = new Date(start.getFullYear(), start.getMonth() + offset, 1);
  const atLatest = base.getFullYear() === new Date(now).getFullYear() && base.getMonth() === new Date(now).getMonth();
  const lead = (base.getDay() + 6) % 7;
  const count = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: count }, (_, i) => new Date(base.getFullYear(), base.getMonth(), i + 1).getTime()),
  ];

  return (
    <View>
      <View style={styles.head}>
        <Text variant="title" style={styles.flex}>{base.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous month" hitSlop={8} onPress={() => setOffset((m) => m - 1)}>
          <Lucide name="chevron-left" size={22} color={theme.colors.text} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Next month" hitSlop={8} disabled={atLatest} onPress={() => setOffset((m) => m + 1)}>
          <Lucide name="chevron-right" size={22} color={atLatest ? theme.colors.border : theme.colors.text} />
        </Pressable>
      </View>
      <View style={styles.grid}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <Text key={i} variant="caption" color="textMuted" style={styles.weekday}>{d}</Text>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <View key={i} style={styles.cell} />;
          const m = mark?.(day) ?? {};
          const future = day > today;
          return (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityState={{ selected: day === selected, disabled: future }}
              accessibilityLabel={`${new Date(day).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}, ${action}`}
              disabled={future}
              onPress={() => onPick(day)}
              style={styles.cell}
            >
              <View style={[styles.day, m.filled && styles.filled, day === today && styles.today, day === selected && styles.selected]}>
                <Text variant="caption" color={m.filled ? 'onAccent' : future ? 'textMuted' : 'text'}>{new Date(day).getDate()}</Text>
              </View>
              <View style={[styles.dot, m.dot && styles.dotOn]} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export const DOT_COLOR = '#6E9BFF';

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: theme.spacing.sm },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', paddingBottom: theme.spacing.xs },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 3, gap: 2 },
  day: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  filled: { backgroundColor: theme.colors.accent },
  today: { borderWidth: 1.5, borderColor: theme.colors.text },
  selected: { borderWidth: 2, borderColor: theme.colors.accent },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  dotOn: { backgroundColor: DOT_COLOR },
});
