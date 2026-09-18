import { useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconButton } from '@/components/ui/icon-button';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Slider } from '@/components/ui/slider';
import { StateView } from '@/components/ui/state-view';
import { Elevation, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { formatTime } from '@/features/player/format-time';
import { useGoBack } from '@/hooks/use-go-back';
import { useRouter } from 'expo-router';
import { useTheme } from '@/hooks/use-theme';
import { useAppDispatch, useAppSelector } from '@/store';
import { audioScrubbed } from '@/store/audio-slice';
import VlcPlayer, { type RepeatMode } from '@modules/vlc-player';

import { AlbumArt } from './album-art';

const SEEK_STEP_MS = 1000;
const ART_MAX_WIDTH = 360;

/** Downward travel, or fling speed, that closes the player back to the mini-player. */
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 900;
/** Movement before the sheet starts following the finger, so taps and the slider are not stolen. */
const DRAG_SLOP = 16;

// The sheet animates itself in and out on the UI thread; the route itself has no transition, so
// closing never waits for a round trip to JS before the screen starts moving.
/** How dark the screen behind gets once the player is fully open. */
const SCRIM_OPACITY = 0.6;
const OPEN_SPRING = { damping: 26, stiffness: 240, mass: 0.9 } as const;
const SETTLE_SPRING = { damping: 22, stiffness: 260, mass: 0.8 } as const;
const CLOSE_DURATION_MS = 220;

const REPEAT_ORDER: RepeatMode[] = ['off', 'all', 'one'];
const REPEAT_ICON = { off: 'repeat', all: 'repeat_on', one: 'repeat_one_on' } as const;
const REPEAT_LABEL = {
  off: 'Repeat off. Tap to repeat the queue',
  all: 'Repeating the queue. Tap to repeat this track',
  one: 'Repeating this track. Tap to turn repeat off',
} as const;

function warn(scope: string) {
  return (error: unknown) => console.warn(`[audio] ${scope}`, error);
}

export function NowPlayingScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const goBack = useGoBack();
  const router = useRouter();
  const { height, width } = useWindowDimensions();
  const audio = useAppSelector((state) => state.audio);

  const artSize = Math.min(width - Spacing.four * 2, ART_MAX_WIDTH);

  // Starts off screen and springs up on mount, so opening and closing are one continuous movement.
  const offset = useSharedValue(height);

  useEffect(() => {
    offset.set(withSpring(0, OPEN_SPRING));
  }, [offset]);

  /** Slides the sheet the rest of the way down, then leaves the route once it is out of sight. */
  const close = useCallback(() => {
    offset.set(
      withTiming(height, { duration: CLOSE_DURATION_MS, easing: Easing.in(Easing.cubic) }, (finished) => {
        'worklet';
        if (finished) scheduleOnRN(goBack);
      })
    );
  }, [goBack, height, offset]);

  const swipeDown = useMemo(
    () =>
      Gesture.Pan()
        // Downward only, and never while the finger is travelling sideways across the seek slider.
        .activeOffsetY(DRAG_SLOP)
        .failOffsetY(-DRAG_SLOP)
        .failOffsetX([-DRAG_SLOP, DRAG_SLOP])
        .onUpdate((event) => {
          offset.set(Math.max(0, event.translationY));
        })
        .onEnd((event) => {
          if (event.translationY > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY) {
            // The exit starts in this same frame, carrying the fling, so the sheet never stops at the finger.
            offset.set(
              withSpring(
                height,
                { ...SETTLE_SPRING, velocity: Math.max(event.velocityY, 600), overshootClamping: true },
                (finished) => {
                  'worklet';
                  if (finished) scheduleOnRN(goBack);
                }
              )
            );
          } else {
            offset.set(withSpring(0, SETTLE_SPRING));
          }
        }),
    [goBack, height, offset]
  );

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.get() }] }));

  // The list behind darkens as the player rises and comes back as it falls, tied to the same travel.
  const scrimStyle = useAnimatedStyle(() => {
    const progress = Math.min(1, offset.get() / Math.max(1, height));
    return { opacity: (1 - progress) * SCRIM_OPACITY };
  });

  const scrub = useCallback(
    (value: number) => {
      dispatch(audioScrubbed(value));
      VlcPlayer.audioSeek(value).catch(warn('seek'));
    },
    [dispatch]
  );

  if (!audio.active) {
    return (
      <ThemedView style={styles.root}>
        <ScreenHeader title="Now playing" onBack={goBack} />
        <StateView
          icon="music_note"
          title="Nothing is playing"
          message="Pick a track in the Music tab and it appears here."
        />
      </ThemedView>
    );
  }

  const max = Math.max(audio.durationMs, 1);
  const nextRepeat = REPEAT_ORDER[(REPEAT_ORDER.indexOf(audio.repeat) + 1) % REPEAT_ORDER.length];

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: theme.shadow }, scrimStyle]}
        pointerEvents="none"
      />
      <GestureDetector gesture={swipeDown}>
        <Animated.View style={[styles.root, sheetStyle]}>
          <ThemedView style={styles.root}>
            <ScreenHeader
              title="Now playing"
              subtitle={audio.album ?? undefined}
              actions={
                <IconButton
                  icon="keyboard_arrow_down"
                  label="Close the player"
                  color={theme.textSecondary}
                  pressedColor={theme.backgroundSelected}
                  onPress={() => close()}
                />
              }
            />
            <View style={[styles.body, { paddingBottom: insets.bottom + Spacing.four }]}>
              <View
                style={[
                  styles.art,
                  Elevation.high,
                  { width: artSize, height: artSize, backgroundColor: theme.backgroundSelected, shadowColor: theme.shadow },
                ]}>
                {audio.uri ? (
                  <AlbumArt uri={audio.uri} artKey={audio.artKey ?? audio.uri} width={artSize} icon="album" />
                ) : null}
              </View>

              <View style={styles.titles}>
                <ThemedText type="subtitle" numberOfLines={2} style={styles.title}>
                  {audio.title ?? ''}
                </ThemedText>
                <ThemedText themeColor="textSecondary" numberOfLines={1}>
                  {audio.artist || 'Unknown artist'}
                </ThemedText>
              </View>

              <View style={styles.progress}>
                <Slider
                  value={Math.min(audio.positionMs, max)}
                  min={0}
                  max={max}
                  step={SEEK_STEP_MS}
                  onChange={scrub}
                  accessibilityLabel="Playback position"
                  accessibilityValueText={`${formatTime(audio.positionMs)} of ${formatTime(audio.durationMs)}`}
                />
                <View style={styles.times}>
                  <ThemedText type="caption" themeColor="textTertiary" style={styles.time}>
                    {formatTime(audio.positionMs)}
                  </ThemedText>
                  <ThemedText type="caption" themeColor="textTertiary" style={styles.time}>
                    {formatTime(audio.durationMs)}
                  </ThemedText>
                </View>
              </View>

              <View style={styles.controls}>
                <IconButton
                  icon={audio.shuffle ? 'shuffle_on' : 'shuffle'}
                  label={audio.shuffle ? 'Shuffle on. Tap to play in order' : 'Shuffle off. Tap to shuffle the queue'}
                  color={audio.shuffle ? theme.accentText : theme.textSecondary}
                  pressedColor={theme.backgroundSelected}
                  onPress={() => VlcPlayer.audioSetShuffle(!audio.shuffle).catch(warn('shuffle'))}
                />
                <IconButton
                  icon="skip_previous"
                  label="Previous track"
                  size="lg"
                  color={theme.text}
                  pressedColor={theme.backgroundSelected}
                  onPress={() => VlcPlayer.audioPrevious().catch(warn('previous'))}
                />
                <IconButton
                  icon={audio.playing ? 'pause' : 'play_arrow'}
                  label={audio.playing ? 'Pause' : 'Play'}
                  size="xl"
                  color={theme.onAccent}
                  backgroundColor={theme.accent}
                  pressedColor={theme.accent}
                  onPress={() => VlcPlayer.audioToggle().catch(warn('toggle'))}
                />
                <IconButton
                  icon="skip_next"
                  label="Next track"
                  size="lg"
                  color={theme.text}
                  pressedColor={theme.backgroundSelected}
                  onPress={() => VlcPlayer.audioNext().catch(warn('next'))}
                />
                <IconButton
                  icon={REPEAT_ICON[audio.repeat]}
                  label={REPEAT_LABEL[audio.repeat]}
                  color={audio.repeat === 'off' ? theme.textSecondary : theme.accentText}
                  pressedColor={theme.backgroundSelected}
                  onPress={() => VlcPlayer.audioSetRepeat(nextRepeat).catch(warn('repeat'))}
                />
              </View>

              <View style={styles.footer}>
                <IconButton
                  icon="queue_music"
                  label={`Open the queue, ${audio.queueSize} tracks`}
                  color={theme.textSecondary}
                  pressedColor={theme.backgroundSelected}
                  onPress={() => router.push('/queue')}
                />
                <ThemedText type="caption" themeColor="textTertiary">
                  {audio.queueSize > 1 && audio.index != null ? `Track ${audio.index + 1} of ${audio.queueSize}` : ' '}
                </ThemedText>
                <IconButton
                  icon="close"
                  label="Stop playback and clear the queue"
                  color={theme.textSecondary}
                  pressedColor={theme.backgroundSelected}
                  onPress={() => VlcPlayer.audioStop().catch(warn('stop'))}
                />
              </View>
            </View>
          </ThemedView>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  body: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
  },
  art: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  titles: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  title: {
    textAlign: 'center',
  },
  progress: {
    alignSelf: 'stretch',
    gap: Spacing.one,
  },
  times: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  time: {
    fontVariant: ['tabular-nums'],
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  footer: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
