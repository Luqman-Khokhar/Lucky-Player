import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, type AccessibilityActionEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { ThemedText } from '@/components/themed-text';
import { Elevation, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { formatTime } from './format-time';

const HIT_HEIGHT = 44;
const TRACK_HEIGHT = 6;
const THUMB_SIZE = 16;
const BUBBLE_WIDTH = 76;
const PROGRESS_TWEEN_MS = 250;

type SeekBarProps = {
  position: number;
  duration: number;
  skipMs: number;
  onSeek: (positionMs: number) => void;
  /** Called while the user drags, e.g. to keep controls visible. */
  onScrub?: () => void;
};

function toRatio(x: number, width: number) {
  'worklet';
  return Math.min(1, Math.max(0, x / Math.max(1, width)));
}

export function SeekBar({ position, duration, skipMs, onSeek, onScrub }: SeekBarProps) {
  const theme = useTheme();
  const trackWidth = useSharedValue(0);
  const progress = useSharedValue(0);
  const scrubRatio = useSharedValue(0);
  const scrubbing = useSharedValue(false);
  const [scrubMs, setScrubMs] = useState<number | null>(null);

  const ratio = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;

  useEffect(() => {
    progress.set(withTiming(ratio, { duration: PROGRESS_TWEEN_MS, easing: Easing.linear }));
  }, [ratio, progress]);

  const gesture = useMemo(() => {
    const showScrub = (value: number) => {
      setScrubMs(value * duration);
      onScrub?.();
    };
    const commit = (value: number) => {
      setScrubMs(null);
      if (duration > 0) onSeek(value * duration);
    };
    return Gesture.Pan()
      .minDistance(0)
      .hitSlop({ vertical: Spacing.two })
      .onBegin((event) => {
        scrubbing.set(true);
        scrubRatio.set(toRatio(event.x, trackWidth.get()));
        scheduleOnRN(showScrub, scrubRatio.get());
      })
      .onUpdate((event) => {
        scrubRatio.set(toRatio(event.x, trackWidth.get()));
        scheduleOnRN(showScrub, scrubRatio.get());
      })
      .onFinalize(() => {
        if (!scrubbing.get()) return;
        scrubbing.set(false);
        progress.set(scrubRatio.get());
        scheduleOnRN(commit, scrubRatio.get());
      });
  }, [duration, onSeek, onScrub, progress, scrubRatio, scrubbing, trackWidth]);

  const fillStyle = useAnimatedStyle(() => ({
    width: (scrubbing.get() ? scrubRatio.get() : progress.get()) * trackWidth.get(),
  }));

  const thumbStyle = useAnimatedStyle(() => {
    const current = scrubbing.get() ? scrubRatio.get() : progress.get();
    return {
      transform: [
        { translateX: current * trackWidth.get() - THUMB_SIZE / 2 },
        { scale: withTiming(scrubbing.get() ? 1.6 : 1, { duration: 120 }) },
      ],
    };
  });

  const bubbleStyle = useAnimatedStyle(() => {
    const x = scrubRatio.get() * trackWidth.get() - BUBBLE_WIDTH / 2;
    return { transform: [{ translateX: Math.min(Math.max(0, x), Math.max(0, trackWidth.get() - BUBBLE_WIDTH)) }] };
  });

  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'increment') onSeek(position + skipMs);
    if (event.nativeEvent.actionName === 'decrement') onSeek(position - skipMs);
  };

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={styles.hitArea}
        onLayout={(event) => trackWidth.set(event.nativeEvent.layout.width)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Playback position"
        accessibilityValue={{ text: `${formatTime(position)} of ${formatTime(duration)}` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={onAccessibilityAction}>
        <View style={[styles.track, { backgroundColor: theme.playerTrack }]}>
          <Animated.View style={[styles.fill, { backgroundColor: theme.playerAccent }, fillStyle]} />
        </View>
        <Animated.View pointerEvents="none" style={[styles.thumb, Elevation.low, { backgroundColor: theme.playerAccent, shadowColor: '#000000' }, thumbStyle]}
        />
        {scrubMs !== null ? (
          <Animated.View pointerEvents="none" style={[styles.bubble, { backgroundColor: theme.playerSheet }, bubbleStyle]}>
            <ThemedText type="smallBold" style={[styles.bubbleText, { color: theme.playerText }]}>
              {formatTime(scrubMs)}
            </ThemedText>
          </Animated.View>
        ) : null}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  hitArea: {
    flex: 1,
    height: HIT_HEIGHT,
    justifyContent: 'center',
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
  thumb: {
    position: 'absolute',
    left: 0,
    top: (HIT_HEIGHT - THUMB_SIZE) / 2,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
  },
  bubble: {
    position: 'absolute',
    left: 0,
    bottom: HIT_HEIGHT,
    width: BUBBLE_WIDTH,
    paddingVertical: Spacing.one,
    borderRadius: Radius.sm,
    alignItems: 'center',
  },
  bubbleText: {
    fontVariant: ['tabular-nums'],
  },
});
