import { Lucide } from '@react-native-vector-icons/lucide';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RIR_COLORS } from './rirColors';
import { Text } from './Text';
import { theme } from './theme';

type Props = {
  /** Offer a decimal point: weights and distances take one, reps do not. */
  decimal: boolean;
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onHide: () => void;
  /** ✓: on to the next field. */
  onNext: () => void;
  /** The RIR row above the keys, for a reps field. */
  rir?: { value: number | null; onChange: (rir: number) => void; onHelp: () => void };
  /** Full / partial reps, for a reps field. */
  partial?: { on: boolean; onChange: (on: boolean) => void };
  /** − / +: a weight a plate pair lighter or heavier. */
  step?: { onMinus: () => void; onPlus: () => void };
};

const RIRS = [0, 1, 2, 3, 4, 5, 6];

/**
 * The logger's own number pad, in place of the system keyboard: digits only,
 * the same on both platforms, with the set's RIR and full/partial switch within
 * reach of the thumb that types the reps.
 */
export function Keypad({ decimal, onDigit, onBackspace, onHide, onNext, rir, partial, step }: Props) {
  const insets = useSafeAreaInsets();
  const key = (label: string, onPress: () => void, content?: React.ReactNode) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.key, pressed && styles.pressed]}
    >
      {content ?? <Text variant="title">{label}</Text>}
    </Pressable>
  );

  return (
    <View style={[styles.pad, { paddingBottom: insets.bottom + theme.spacing.sm }]}>
      {rir ? (
        <View style={styles.rirRow}>
          {RIRS.map((n) => {
            const on = rir.value === n;
            return (
              <Pressable
                key={n}
                accessibilityRole="button"
                accessibilityLabel={`${n === 6 ? '6 or more' : n} reps in reserve`}
                accessibilityState={{ selected: on }}
                hitSlop={6}
                onPress={() => rir.onChange(n)}
                style={[styles.rir, { backgroundColor: RIR_COLORS[n] }, on && styles.rirOn]}
              >
                <Text variant="caption" color="onAccent">{n === 6 ? '6+' : n}</Text>
              </Pressable>
            );
          })}
          <Pressable accessibilityRole="button" accessibilityLabel="What is RIR?" hitSlop={6} onPress={rir.onHelp} style={styles.help}>
            <Text variant="caption">?</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.body}>
        <View style={styles.digits}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => key(d, () => onDigit(d)))}
          {decimal ? key('.', () => onDigit('.')) : <View style={styles.key} />}
          {key('0', () => onDigit('0'))}
          {key('Delete', onBackspace, <Lucide name="delete" size={24} color={theme.colors.text} />)}
        </View>
        <View style={styles.side}>
          <Pressable accessibilityRole="button" accessibilityLabel="Hide keypad" onPress={onHide} style={({ pressed }) => [styles.sideKey, pressed && styles.pressed]}>
            <Lucide name="chevron-down" size={26} color={theme.colors.text} />
          </Pressable>
          {partial ? (
            <View style={styles.switch}>
              {([false, true] as const).map((on) => (
                <Pressable
                  key={String(on)}
                  accessibilityRole="button"
                  accessibilityLabel={on ? 'Partial reps' : 'Full reps'}
                  accessibilityState={{ selected: partial.on === on }}
                  onPress={() => partial.onChange(on)}
                  style={[styles.switchSide, partial.on === on && styles.switchOn]}
                >
                  <Text variant="heading" color={partial.on === on ? 'onAccent' : 'text'}>{on ? 'P' : 'F'}</Text>
                </Pressable>
              ))}
            </View>
          ) : step ? (
            <View style={styles.steps}>
              <Pressable accessibilityRole="button" accessibilityLabel="Lighter" onPress={step.onMinus} style={({ pressed }) => [styles.stepKey, pressed && styles.pressed]}>
                <Lucide name="minus" size={20} color={theme.colors.text} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Heavier" onPress={step.onPlus} style={({ pressed }) => [styles.stepKey, pressed && styles.pressed]}>
                <Lucide name="plus" size={20} color={theme.colors.text} />
              </Pressable>
            </View>
          ) : (
            <View style={styles.sideKey} />
          )}
          <Pressable accessibilityRole="button" accessibilityLabel="Next" onPress={onNext} style={({ pressed }) => [styles.done, pressed && styles.pressed]}>
            <Lucide name="check" size={26} color={theme.colors.onAccent} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const KEY_HEIGHT = 52;

const styles = StyleSheet.create({
  pad: {
    backgroundColor: theme.colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    gap: theme.spacing.md,
  },
  rirRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  rir: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  rirOn: { borderWidth: 2, borderColor: theme.colors.text },
  help: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceRaised },
  body: { flexDirection: 'row', gap: theme.spacing.sm },
  digits: { flex: 3, flexDirection: 'row', flexWrap: 'wrap' },
  key: { width: '33.33%', height: KEY_HEIGHT, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.md },
  pressed: { opacity: 0.5 },
  side: { flex: 1.3, gap: theme.spacing.sm },
  sideKey: { height: KEY_HEIGHT - 6, borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  steps: { height: KEY_HEIGHT - 6, flexDirection: 'row', gap: theme.spacing.sm },
  stepKey: { flex: 1, borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  switch: { height: KEY_HEIGHT - 6, flexDirection: 'row', borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceRaised, padding: 3 },
  switchSide: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.sm },
  switchOn: { backgroundColor: theme.colors.text },
  done: { flex: 1, borderRadius: theme.radius.md, backgroundColor: theme.colors.text, alignItems: 'center', justifyContent: 'center' },
});
