import { Lucide } from '@react-native-vector-icons/lucide';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
  type BottomSheetFooterProps,
} from '@gorhom/bottom-sheet';
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { FullWindowOverlay } from 'react-native-screens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { theme } from './theme';

/**
 * iOS draws native-stack screens — above all a `presentation: 'modal'` route
 * like add-exercise — over ordinary React views, so a sheet hosted by the root
 * provider would open invisibly behind them. FullWindowOverlay draws above
 * everything; it is its own native window, so gestures need their own root.
 */
function OverlayContainer({ children }: { children?: ReactNode }) {
  return (
    <FullWindowOverlay>
      <GestureHandlerRootView style={StyleSheet.absoluteFill}>{children}</GestureHandlerRootView>
    </FullWindowOverlay>
  );
}

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Top-right of the header, opposite the close button. */
  headerRight?: ReactNode;
  /** Omitted, the sheet sizes to its content; a long list passes ['90%']. */
  snapPoints?: string[];
  footer?: (props: BottomSheetFooterProps) => ReactNode;
  /**
   * With snapPoints, scroll with BottomSheetScrollView / BottomSheetFlatList.
   * Sized to content, pass plain views: they are measured inside a BottomSheetView.
   */
  children: ReactNode;
};

/**
 * A draggable sheet (@gorhom/bottom-sheet) with the app's header: close on the
 * left, title centred. Driven by `visible` like a Modal, so callers keep plain
 * state instead of refs. Dragging down or tapping the backdrop closes it.
 */
export function BottomSheet({ visible, onClose, title, subtitle, headerRight, snapPoints, footer, children }: Props) {
  const ref = useRef<BottomSheetModal>(null);
  const insets = useSafeAreaInsets();

  // Dismiss only what was presented: dismiss() on a never-presented modal
  // leaves it stuck mid-dismiss, and its first present() then closes at once.
  const presented = useRef(false);
  useEffect(() => {
    if (visible) {
      presented.current = true;
      ref.current?.present();
    } else if (presented.current) {
      presented.current = false;
      ref.current?.dismiss();
    }
  }, [visible]);

  const backdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.6}
      />
    ),
    // Stable on purpose: a new backdrop component remounts it above the sheet.
    [],
  );

  const header = (
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} onPress={() => ref.current?.dismiss()}>
        <Lucide name="x" size={22} color={theme.colors.text} />
      </Pressable>
      <View style={styles.titles}>
        <Text variant="title" style={styles.center} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="textMuted" style={styles.center}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.side}>{headerRight}</View>
    </View>
  );

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={snapPoints}
      enableDynamicSizing={!snapPoints}
      topInset={insets.top}
      onDismiss={() => {
        presented.current = false;
        onClose();
      }}
      containerComponent={Platform.OS === 'ios' ? OverlayContainer : undefined}
      backdropComponent={backdrop}
      footerComponent={footer}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
    >
      {snapPoints ? (
        <>
          {header}
          {children}
        </>
      ) : (
        // Sized to content: header and body must be measured as one view.
        <BottomSheetView>
          {header}
          {children}
        </BottomSheetView>
      )}
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  background: { backgroundColor: theme.colors.surface },
  handle: { backgroundColor: theme.colors.textMuted, width: 40 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  titles: { flex: 1 },
  center: { textAlign: 'center' },
  side: { width: 22, alignItems: 'flex-end' },
});
