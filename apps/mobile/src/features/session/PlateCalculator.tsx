import { kgToLb, plateLoading, type Unit } from '@overload/domain';
import { StyleSheet, View } from 'react-native';
import type { BarLoading } from '../../data/gymRepo';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';

/** Plate colours by the label the gym gives them; unlabelled plates are grey. */
const PLATE_COLORS: Record<string, string> = {
  red: '#E5484D',
  blue: '#3E8CF0',
  yellow: '#F2B84B',
  green: '#3DD68C',
  silver: '#C9C9C9',
  white: '#EDEDED',
  black: '#4A4A4A',
  grey: '#8A8A8A',
  gray: '#8A8A8A',
};

/**
 * Above the keypad while a barbell weight is typed: the plates for one side of
 * the bar, drawn and listed, and the sum that makes the total — so nobody
 * does plate maths between sets. A weight the gym's plates cannot make is
 * still fine: the rest shows as an extra plate each side (a lifter may own a
 * 0.5 kg the gym list lacks). The maths is in kilograms. Plates show in the
 * unit they are marked in — a kg gym's plates are whole quarter-kilos, a lb
 * gym's are not — and the total in the user's unit as well when that differs.
 */
export function PlateCalculator({ totalKg, loading, unit }: { totalKg: number | null; loading: BarLoading; unit: Unit }) {
  const plateUnit: Unit = [loading.barKg, ...loading.plates.map((p) => p.kg)].every((kg) => Math.abs(kg * 4 - Math.round(kg * 4)) < 0.01)
    ? 'kg'
    : 'lb';
  // Two decimals, not formatWeight's one: a 1.25 kg plate must not read 1.3.
  const inUnit = (kg: number, u: Unit) => `${Number((u === 'lb' ? kgToLb(kg) : kg).toFixed(u === 'lb' ? 1 : 2))}`;
  const w = (kg: number) => inUnit(kg, plateUnit);
  const result = totalKg === null ? null : plateLoading(totalKg, loading.barKg, loading.plates.map((p) => p.kg));
  const extraKg = result ? result.shortKg / 2 : 0;
  const underBar = totalKg !== null && totalKg < loading.barKg;
  // The heaviest plates carry the colour: a gym labels its 20s blue whichever set they are from.
  const colorOf = (kg: number) => {
    const label = loading.plates.find((p) => p.kg === kg && p.label)?.label?.toLowerCase();
    return (label && PLATE_COLORS[label]) || PLATE_COLORS.grey!;
  };

  return (
    <View style={styles.box}>
      <View style={styles.top}>
        <View style={styles.bar}>
          <View style={styles.shaft} />
          <View style={styles.collar} />
          {result?.perSide.flatMap((p) =>
            Array.from({ length: p.count }, (_, i) => (
              <View key={`${p.kg}-${i}`} style={[styles.plate, { height: Math.min(14 + p.kg * 1.7, 50), backgroundColor: colorOf(p.kg) }]} />
            )),
          )}
          {extraKg > 0 ? <View style={[styles.plate, styles.extra]} /> : null}
          <View style={styles.sleeve} />
        </View>
        <View style={styles.legend}>
          {result?.perSide.map((p) => (
            <View key={p.kg} style={styles.legendRow}>
              <View style={[styles.swatch, { backgroundColor: colorOf(p.kg) }]} />
              <Text variant="caption">{p.count} × {w(p.kg)}</Text>
            </View>
          ))}
          {extraKg > 0 ? (
            <View style={styles.legendRow}>
              <View style={[styles.swatch, styles.extra]} />
              <Text variant="caption">{w(extraKg)} extra</Text>
            </View>
          ) : null}
          {!result || (result.perSide.length === 0 && extraKg === 0) ? (
            <Text variant="caption" color="textMuted">Just the bar</Text>
          ) : null}
        </View>
      </View>
      <Text variant="caption" color="textMuted" style={styles.sum}>
        {result === null || underBar
          ? `${loading.barName}: ${w(loading.barKg)} ${plateUnit}${underBar ? ' · the weight is under the bar' : ''}`
          : `${w(result.sideKg + extraKg)} ${plateUnit} on both sides + ${w(loading.barKg)} ${plateUnit} bar = ${w(totalKg!)} ${plateUnit}` +
            (plateUnit === unit ? '' : ` (${inUnit(totalKg!, unit)} ${unit})`)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: theme.colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border },
  top: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xl, paddingHorizontal: theme.spacing.xl, paddingVertical: theme.spacing.md },
  bar: { flexDirection: 'row', alignItems: 'center', height: 54, width: 140 },
  shaft: { width: 28, height: 6, borderRadius: 2, backgroundColor: theme.colors.textMuted },
  collar: { width: 5, height: 18, borderRadius: 1, backgroundColor: theme.colors.textMuted },
  plate: { width: 7, marginLeft: 2, borderRadius: 2 },
  sleeve: { flex: 1, height: 6, marginLeft: 2, borderRadius: 2, backgroundColor: theme.colors.textMuted },
  legend: { gap: 4 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  // A plate outside the gym's list: outlined, not coloured.
  extra: { height: 12, backgroundColor: 'transparent', borderWidth: 1.5, borderColor: theme.colors.text },
  sum: {
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
});
