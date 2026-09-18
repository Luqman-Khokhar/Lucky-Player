import type { PropsWithChildren } from 'react';
import { useEffect } from 'react';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { IconButton } from './icon-button';

const OPEN_MS = 260;
const CLOSE_MS = 200;
const SHEET_TRAVEL = 320;

type BottomSheetProps = PropsWithChildren<{
  open: boolean;
  title: string;
  onClose: () => void;
}>;

/** A panel that rises from the bottom edge, for short lists of actions. Back and the scrim both close it. */
export function BottomSheet({ open, title, onClose, children }: BottomSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.set(
      withTiming(open ? 1 : 0, {
        duration: reduceMotion ? 0 : open ? OPEN_MS : CLOSE_MS,
        easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      })
    );
  }, [open, reduceMotion, progress]);

  useEffect(() => {
    if (!open) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [open, onClose]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.get()) * SHEET_TRAVEL }],
  }));

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents={open ? 'auto' : 'none'}
      importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.playerBackdrop }, backdropStyle]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel={`Close ${title}`}
          onPress={onClose}
        />
      </Animated.View>

      <Animated.View
        accessibilityViewIsModal
        style={[
          styles.sheet,
          {
            backgroundColor: theme.background,
            paddingBottom: insets.bottom + Spacing.two,
          },
          sheetStyle,
        ]}>
        <View style={styles.header}>
          <ThemedText type="subtitle" accessibilityRole="header" numberOfLines={1} style={styles.title}>
            {title}
          </ThemedText>
          <IconButton
            icon="close"
            label={`Close ${title}`}
            color={theme.textSecondary}
            pressedColor={theme.backgroundSelected}
            onPress={onClose}
          />
        </View>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingLeft: Spacing.four,
    paddingRight: Spacing.two,
    paddingTop: Spacing.three,
  },
  title: {
    flex: 1,
  },
});
