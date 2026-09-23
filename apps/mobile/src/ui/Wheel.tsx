import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Text } from './Text';
import { theme } from './theme';

const ITEM_HEIGHT = 44;
/** Rows visible above and below the selected one. */
const SIDE_ROWS = 2;
const HEIGHT = ITEM_HEIGHT * (SIDE_ROWS * 2 + 1);

type Props = {
  options: string[];
  index: number;
  onChange: (index: number) => void;
  accessibilityLabel: string;
  /** Widths differ per column — a year needs more room than a month. */
  flex?: number;
};

/**
 * A scroll-snapping picker column, rather than a platform date/number picker.
 * The native pickers do not agree across platforms — iOS shows a wheel and
 * Android a dialog — and this app ships both, so the control is built once
 * from a ScrollView and looks the same in either place.
 */
export function Wheel({ options, index, onChange, accessibilityLabel, flex = 1 }: Props) {
  const ref = useRef<ScrollView>(null);
  // What the list is showing, so a scroll we caused is not answered with
  // another scrollTo — that fights the finger mid-gesture.
  const shown = useRef(index);
  const laidOut = useRef(false);

  useEffect(() => {
    if (shown.current === index) return;
    shown.current = index;
    ref.current?.scrollTo({ y: index * ITEM_HEIGHT, animated: true });
  }, [index]);

  function settle(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(event.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(next, options.length - 1));
    shown.current = clamped;
    if (clamped !== index) onChange(clamped);
  }

  return (
    <View style={[styles.column, { flex }]}>
      <ScrollView
        ref={ref}
        accessibilityLabel={accessibilityLabel}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        // Positioned on layout rather than through contentOffset, which iOS
        // re-applies on every render and can drag the list back mid-gesture.
        onLayout={() => {
          if (laidOut.current) return;
          laidOut.current = true;
          ref.current?.scrollTo({ y: index * ITEM_HEIGHT, animated: false });
        }}
        onMomentumScrollEnd={settle}
        // A slow drag that stops without momentum never fires the momentum
        // event; without this the wheel lands between two values.
        onScrollEndDrag={settle}
        contentContainerStyle={styles.content}
      >
        {options.map((option, i) => (
          <View key={option} style={styles.item}>
            <Text
              variant={i === index ? 'heading' : 'body'}
              color={i === index ? 'text' : 'textMuted'}
            >
              {option}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * The two hairlines marking the selected row. Drawn once behind a whole row of
 * wheels rather than per column, so they line up across them.
 */
export function WheelWindow({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.window}>
      <View pointerEvents="none" style={styles.marker} />
      <View style={styles.row}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  window: { height: HEIGHT, justifyContent: 'center' },
  row: { flexDirection: 'row', height: HEIGHT },
  marker: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
    top: SIDE_ROWS * ITEM_HEIGHT,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  column: { height: HEIGHT },
  content: { paddingVertical: SIDE_ROWS * ITEM_HEIGHT },
  item: { height: ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
});
