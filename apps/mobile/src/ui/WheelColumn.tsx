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
        // WheelRow draws one band across every column instead.
        renderOverlay={null}
      />
    </View>
  );
}

/** Wheels side by side (month, day, year), sharing one selection band. */
export function WheelRow({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <View pointerEvents="none" style={styles.band} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', marginTop: theme.spacing.xxl * 2 },
  column: { flex: 1 },
  item: { ...textStyle('title', true), color: theme.colors.text },
  // The selection band: hairlines above and below the middle row, across every column.
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: ((VISIBLE - 1) / 2) * ITEM_HEIGHT,
    height: ITEM_HEIGHT,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.textMuted,
  },
});
