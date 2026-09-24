import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Text } from './Text';
import { theme } from './theme';

type Props = {
  min: number;
  max: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
};

const THUMB = 28;

/**
 * Two thumbs on whole-number steps. A touch moves whichever thumb is nearer,
 * so a tap on the track works as well as a drag. Steps are coarse (ROM and
 * stability run 1–5), so this runs on the JS thread with plain state rather
 * than as a Reanimated worklet.
 */
export function RangeSlider({ min, max, value, onChange }: Props) {
  const [width, setWidth] = useState(0);
  const dragging = useRef<0 | 1>(0);
  const [lo, hi] = value;
  const span = max - min;

  const stepAt = (x: number) => {
    const ratio = width > 0 ? Math.min(Math.max((x - THUMB / 2) / (width - THUMB), 0), 1) : 0;
    return min + Math.round(ratio * span);
  };
  const xOf = (step: number) => ((step - min) / span) * (width - THUMB);

  const move = (x: number) => {
    const step = stepAt(x);
    if (dragging.current === 0) onChange([Math.min(step, hi), hi]);
    else onChange([lo, Math.max(step, lo)]);
  };

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onBegin((e) => {
      const step = stepAt(e.x);
      // Equal distance (both thumbs on one step): move the one with room to go.
      dragging.current = Math.abs(step - lo) < Math.abs(step - hi) || (lo === hi && step < lo) ? 0 : 1;
      move(e.x);
    })
    .onUpdate((e) => move(e.x));

  return (
    <GestureDetector gesture={pan}>
      <View
        accessibilityRole="adjustable"
        accessibilityValue={{ min, max, text: `${lo} to ${hi}` }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={styles.container}
      >
        <View style={styles.track} />
        {width > 0 ? (
          <>
            <View style={[styles.active, { left: xOf(lo) + THUMB / 2, width: xOf(hi) - xOf(lo) }]} />
            {[lo, hi].map((step, i) => (
              <View key={i} style={[styles.thumbColumn, { left: xOf(step) }]} pointerEvents="none">
                <View style={styles.bubble}>
                  <Text variant="numeric" color="onAccent">
                    {step}
                  </Text>
                </View>
                <View style={styles.stem} />
                <View style={styles.thumb} />
              </View>
            ))}
          </>
        ) : null}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: { height: 96, justifyContent: 'flex-end', paddingBottom: THUMB / 2 },
  track: {
    height: 3,
    marginHorizontal: THUMB / 2,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    marginBottom: -1.5,
  },
  active: { position: 'absolute', bottom: THUMB / 2 - 1.5, height: 3, backgroundColor: theme.colors.text },
  thumbColumn: { position: 'absolute', bottom: 0, width: THUMB, alignItems: 'center' },
  bubble: {
    minWidth: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.text,
  },
  stem: { width: 3, height: 18, backgroundColor: theme.colors.text },
  thumb: { width: THUMB, height: THUMB, borderRadius: THUMB / 2, backgroundColor: theme.colors.text },
});
