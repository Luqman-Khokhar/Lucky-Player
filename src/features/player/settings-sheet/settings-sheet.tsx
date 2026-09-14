import { useEffect, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { IconButton } from '@/components/ui/icon-button';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { PAGE_TITLES, SettingsPageContent } from './settings-pages';
import type { PlayerSettingsActions, PlayerSettingsValues, SettingsPage } from './settings-types';

const SHEET_MAX_WIDTH = 380;
const SHEET_SCREEN_RATIO = 0.86;
const OPEN_MS = 280;
const CLOSE_MS = 220;

type SettingsSheetProps = {
  open: boolean;
  values: PlayerSettingsValues;
  actions: PlayerSettingsActions;
  onClose: () => void;
};

/** Side panel anchored to the right edge. Remount with a new key on each open to start at the main page. */
export function SettingsSheet({ open, values, actions, onClose }: SettingsSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const [page, setPage] = useState<SettingsPage>('main');
  const progress = useSharedValue(0);

  const sheetWidth = Math.min(SHEET_MAX_WIDTH, Math.round(width * SHEET_SCREEN_RATIO)) + insets.right;

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
      if (page === 'main') onClose();
      else setPage('main');
      return true;
    });
    return () => subscription.remove();
  }, [open, page, onClose]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - progress.get()) * (sheetWidth + Spacing.four) }],
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
          accessibilityLabel="Close settings"
          onPress={onClose}
        />
      </Animated.View>

      <Animated.View
        accessibilityViewIsModal
        style={[
          styles.sheet,
          {
            width: sheetWidth,
            backgroundColor: theme.playerSheet,
            paddingTop: insets.top + Spacing.two,
            paddingBottom: insets.bottom + Spacing.two,
            paddingRight: insets.right,
          },
          sheetStyle,
        ]}>
        <View style={[styles.header, { borderBottomColor: theme.playerDivider }]}>
          {page !== 'main' ? (
            <IconButton
              icon="arrow_back"
              label="Back to settings"
              color={theme.playerText}
              pressedColor={theme.playerPressed}
              onPress={() => setPage('main')}
            />
          ) : null}
          <ThemedText
            accessibilityRole="header"
            numberOfLines={1}
            style={[styles.title, page === 'main' && styles.titleMain, { color: theme.playerText }]}>
            {PAGE_TITLES[page]}
          </ThemedText>
          <IconButton
            icon="close"
            label="Close settings"
            color={theme.playerText}
            pressedColor={theme.playerPressed}
            onPress={onClose}
          />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Animated.View key={page} entering={reduceMotion ? undefined : FadeIn.duration(180)}>
            <SettingsPageContent page={page} values={values} actions={actions} onOpen={setPage} />
          </Animated.View>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: Spacing.four,
    borderBottomLeftRadius: Spacing.four,
    overflow: 'hidden',
  },
  header: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    flex: 1,
    fontWeight: 600,
  },
  titleMain: {
    paddingLeft: Spacing.two,
  },
  content: {
    padding: Spacing.two,
    paddingBottom: Spacing.four,
  },
});
