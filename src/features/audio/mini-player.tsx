import { usePathname, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppSelector } from '@/store';
import VlcPlayer from '@modules/vlc-player';

import { AlbumArt } from './album-art';

const ART_WIDTH = 40;

/** Upward travel that counts as "open the player". */
const SWIPE_DISTANCE = 24;
const SWIPE_VELOCITY = -400;

/** The tab screens the bar sits above; the full player and the video player show their own controls. */
const TAB_ROUTES = ['/', '/music', '/settings'];

function warn(scope: string) {
  return (error: unknown) => console.warn(`[audio] ${scope}`, error);
}

/** The bar above the tab bar while music is loaded. Tap it anywhere, or swipe up, to open the full player. */
export function MiniPlayer() {
  const theme = useTheme();
  const router = useRouter();
  const audio = useAppSelector((state) => state.audio);
  const pathname = usePathname();

  const open = useCallback(() => router.push('/now-playing'), [router]);

  const swipeUp = useMemo(
    () =>
      Gesture.Pan()
        // Only a clear upward drag opens the player; horizontal movement leaves the bar alone.
        .activeOffsetY(-SWIPE_DISTANCE)
        .failOffsetY(SWIPE_DISTANCE)
        .failOffsetX([-SWIPE_DISTANCE, SWIPE_DISTANCE])
        .onEnd((event) => {
          if (event.translationY < -SWIPE_DISTANCE || event.velocityY < SWIPE_VELOCITY) scheduleOnRN(open);
        }),
    [open]
  );

  if (!audio.active || !audio.uri || !TAB_ROUTES.includes(pathname)) return null;

  const progress = audio.durationMs > 0 ? Math.min(1, audio.positionMs / audio.durationMs) : 0;

  return (
    <GestureDetector gesture={swipeUp}>
      <View style={[styles.bar, { backgroundColor: theme.backgroundElement }]}>
        <View style={[styles.progressTrack, { backgroundColor: theme.backgroundSelected }]}>
          <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: theme.accent }]} />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open the player for ${audio.title ?? 'the current track'}`}
          accessibilityHint="Swipe up on the bar to open it too"
          onPress={open}
          style={({ pressed }) => [styles.content, pressed && { backgroundColor: theme.backgroundSelected }]}>
          <AlbumArt uri={audio.uri} artKey={audio.artKey ?? audio.uri} width={ART_WIDTH} />
          <View style={styles.text}>
            <ThemedText type="small" numberOfLines={1} style={styles.title}>
              {audio.title ?? ''}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {audio.artist || 'Unknown artist'}
            </ThemedText>
          </View>
          <Icon name="keyboard_arrow_up" size={20} color={theme.textSecondary} />
          <IconButton
            icon={audio.playing ? 'pause' : 'play_arrow'}
            label={audio.playing ? 'Pause' : 'Play'}
            color={theme.text}
            pressedColor={theme.backgroundSelected}
            onPress={() => VlcPlayer.audioToggle().catch(warn('toggle'))}
          />
          <IconButton
            icon="skip_next"
            label="Next track"
            color={theme.text}
            pressedColor={theme.backgroundSelected}
            onPress={() => VlcPlayer.audioNext().catch(warn('next'))}
          />
        </Pressable>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: BottomTabInset,
  },
  progressTrack: {
    height: 2,
  },
  progressFill: {
    height: '100%',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
  title: {
    fontWeight: 600,
  },
});
