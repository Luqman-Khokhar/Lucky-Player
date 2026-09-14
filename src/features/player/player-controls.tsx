import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import type { IconName } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { formatTime } from './format-time';
import { SeekBar } from './seek-bar';

const FADE_MS = 200;

const SKIP_ICONS: Record<number, readonly [IconName, IconName]> = {
  5: ['replay_5', 'forward_5'],
  10: ['replay_10', 'forward_10'],
  30: ['replay_30', 'forward_30'],
};

export type PlayerControlsProps = {
  visible: boolean;
  locked: boolean;
  title: string;
  subtitle: string;
  paused: boolean;
  position: number;
  duration: number;
  skipMs: number;
  onBack: () => void;
  onTogglePlay: () => void;
  onSkip: (deltaMs: number) => void;
  onSeek: (positionMs: number) => void;
  onOpenSettings: () => void;
  onToggleLock: () => void;
  /** Any touch on the controls; restarts the auto-hide timer. */
  onInteraction: () => void;
};

export function PlayerControls(props: PlayerControlsProps) {
  const { visible, locked, paused, position, duration, skipMs, onInteraction } = props;
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    opacity.set(withTiming(visible ? 1 : 0, { duration: reduceMotion ? 0 : FADE_MS }));
  }, [visible, reduceMotion, opacity]);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  const colors = { color: theme.playerText, pressedColor: theme.playerPressed };
  const skipSeconds = Math.round(skipMs / 1000);
  const [rewindIcon, forwardIcon] = SKIP_ICONS[skipSeconds] ?? SKIP_ICONS[10];
  const withInteraction = (action: () => void) => () => {
    onInteraction();
    action();
  };

  return (
    <Animated.View
      pointerEvents={visible ? 'box-none' : 'none'}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      style={[
        StyleSheet.absoluteFill,
        styles.root,
        {
          paddingTop: insets.top + Spacing.two,
          paddingBottom: insets.bottom + Spacing.two,
          paddingLeft: insets.left + Spacing.three,
          paddingRight: insets.right + Spacing.three,
        },
        fadeStyle,
      ]}>
      {locked ? (
        <View pointerEvents="box-none" style={styles.locked}>
          <IconButton
            icon="lock_open"
            label="Unlock controls"
            size="lg"
            backgroundColor={theme.playerScrim}
            {...colors}
            onPress={withInteraction(props.onToggleLock)}
          />
          <ThemedText type="small" style={{ color: theme.playerTextSecondary }}>
            Controls locked
          </ThemedText>
        </View>
      ) : (
        <>
          <View style={[styles.bar, { backgroundColor: theme.playerScrim }]}>
            <IconButton icon="arrow_back" label="Back" {...colors} onPress={props.onBack} />
            <View style={styles.titleBlock}>
              <ThemedText numberOfLines={1} style={[styles.title, { color: theme.playerText }]}>
                {props.title}
              </ThemedText>
              {props.subtitle ? (
                <ThemedText type="small" numberOfLines={1} style={{ color: theme.playerTextSecondary }}>
                  {props.subtitle}
                </ThemedText>
              ) : null}
            </View>
            <IconButton icon="lock" label="Lock controls" {...colors} onPress={withInteraction(props.onToggleLock)} />
            <IconButton icon="settings" label="Settings" {...colors} onPress={props.onOpenSettings} />
          </View>

          <View pointerEvents="box-none" style={styles.center}>
            <IconButton
              icon={rewindIcon}
              label={`Rewind ${skipSeconds} seconds`}
              size="lg"
              backgroundColor={theme.playerScrim}
              {...colors}
              onPress={withInteraction(() => props.onSkip(-skipMs))}
            />
            <IconButton
              icon={paused ? 'play_arrow' : 'pause'}
              label={paused ? 'Play' : 'Pause'}
              size="xl"
              backgroundColor={theme.playerScrim}
              {...colors}
              onPress={withInteraction(props.onTogglePlay)}
            />
            <IconButton
              icon={forwardIcon}
              label={`Forward ${skipSeconds} seconds`}
              size="lg"
              backgroundColor={theme.playerScrim}
              {...colors}
              onPress={withInteraction(() => props.onSkip(skipMs))}
            />
          </View>

          <View style={[styles.bar, styles.bottomBar, { backgroundColor: theme.playerScrim }]}>
            <ThemedText type="small" style={[styles.time, { color: theme.playerText }]}>
              {formatTime(position)}
            </ThemedText>
            <SeekBar position={position} duration={duration} skipMs={skipMs} onSeek={props.onSeek} onScrub={onInteraction} />
            <ThemedText type="small" style={[styles.time, { color: theme.playerTextSecondary }]}>
              {formatTime(duration)}
            </ThemedText>
          </View>
        </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    justifyContent: 'space-between',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.five,
  },
  bottomBar: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  titleBlock: {
    flex: 1,
    paddingHorizontal: Spacing.two,
  },
  title: {
    fontWeight: 600,
  },
  center: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.five,
  },
  time: {
    minWidth: 44,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  locked: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Spacing.two,
    paddingBottom: Spacing.four,
  },
});
