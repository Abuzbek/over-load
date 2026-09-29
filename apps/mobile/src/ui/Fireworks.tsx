import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming, type SharedValue } from 'react-native-reanimated';
import { theme } from './theme';

const COLORS = [theme.colors.accent, '#FFD166', theme.colors.success, '#6E9BFF', '#F5F0E8', '#FF6B9A'];
const SPARKS = 18;
const DURATION = 1500;

/** Where each burst goes off, as fractions of the screen, and when (ms). */
const BURSTS = [
  { x: 0.5, y: 0.22, delay: 0 },
  { x: 0.22, y: 0.32, delay: 350 },
  { x: 0.78, y: 0.28, delay: 650 },
  { x: 0.35, y: 0.16, delay: 1000 },
  { x: 0.68, y: 0.4, delay: 1300 },
];

function Spark({ t, angle, reach, color }: { t: SharedValue<number>; angle: number; reach: number; color: string }) {
  const style = useAnimatedStyle(() => ({
    // A spark only shows once its burst has gone off, then fades as it falls.
    opacity: t.value === 0 ? 0 : 1 - t.value,
    transform: [
      { translateX: Math.cos(angle) * reach * t.value },
      { translateY: Math.sin(angle) * reach * t.value + 70 * t.value * t.value },
      { scale: 1 - 0.6 * t.value },
    ],
  }));
  return <Animated.View style={[styles.spark, { backgroundColor: color }, style]} />;
}

function Burst({ x, y, delay, index }: { x: number; y: number; delay: number; index: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withTiming(1, { duration: DURATION, easing: Easing.out(Easing.cubic) }));
  }, [delay, t]);
  return (
    <View style={[styles.burst, { left: x, top: y }]}>
      {Array.from({ length: SPARKS }, (_, i) => (
        <Spark
          key={i}
          t={t}
          angle={(i / SPARKS) * Math.PI * 2 + index}
          reach={80 + (i % 3) * 25}
          color={COLORS[(i + index) % COLORS.length]!}
        />
      ))}
    </View>
  );
}

/** A few bursts of sparks over the screen, once, on mount. Touches pass through. */
export function Fireworks() {
  const { width, height } = useWindowDimensions();
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {BURSTS.map((b, i) => (
        <Burst key={i} index={i} x={b.x * width} y={b.y * height} delay={b.delay} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  burst: { position: 'absolute', width: 0, height: 0 },
  spark: { position: 'absolute', width: 7, height: 7, borderRadius: 3.5, marginLeft: -3.5, marginTop: -3.5 },
});
