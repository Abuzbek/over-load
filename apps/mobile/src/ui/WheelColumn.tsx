import WheelPicker from '@quidone/react-native-wheel-picker';
import { StyleSheet, View } from 'react-native';
import { theme } from './theme';
import { textStyle } from './typography';

type Props<T extends string | number> = {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
};

const ITEM_HEIGHT = 40;
const VISIBLE = 5;

/**
 * One wheel of a picker, in the iOS style: rows fade and curve away from the
 * middle. @quidone/react-native-wheel-picker is JS-only (no native module), so
 * it looks the same on Android. Put several side by side in a WheelRow.
 */
export function WheelColumn<T extends string | number>({ options, value, onChange, accessibilityLabel }: Props<T>) {
  return (
    <View accessibilityLabel={accessibilityLabel} style={styles.column}>
      <WheelPicker
        data={options}
        value={value}
        onValueChanged={({ item }) => onChange(item.value)}
        itemHeight={ITEM_HEIGHT}
        visibleItemCount={VISIBLE}
        width="100%"
        enableScrollByTapOnItem
        itemTextStyle={styles.item}
        overlayItemStyle={styles.band}
      />
    </View>
  );
}

/** Wheels side by side (month, day, year). */
export function WheelRow({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.row}>{children}</View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', marginTop: theme.spacing.xxl * 2 },
  column: { flex: 1 },
  // lineHeight = the row: with the title's own 23 iOS sets the glyphs high in the band.
  item: { ...textStyle('title', true), lineHeight: ITEM_HEIGHT, color: theme.colors.text },
  // The selection band, on the library's own overlay so it sits exactly on the
  // selected row. Its default is a 5%-opacity grey fill, hence opacity: 1. The
  // columns abut, so the hairlines read as one band across the row.
  band: {
    opacity: 1,
    backgroundColor: 'transparent',
    borderRadius: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.textMuted,
  },
});
