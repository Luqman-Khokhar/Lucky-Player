import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { PlayerGestureHud } from './player-gesture-hud';
import { usePlayerGestures } from './use-player-gestures';
import { useSystemControls } from './use-system-controls';

const FEEDBACK_SIZE = 104;

type PlayerGestureLayerProps = {
  locked: boolean;
  skipMs: number;
  zoom: number;
  getProgress: () => { position: number; duration: number };
  onToggleControls: () => void;
  onSkip: (deltaMs: number) => void;
  onSeek: (positionMs: number) => void;
  onZoom: (zoom: number) => void;
  onBoost: (active: boolean) => void;
};

/** Full-screen touch surface for the player; see usePlayerGestures for the gesture map. */
export function PlayerGestureLayer(props: PlayerGestureLayerProps) {
  const theme = useTheme();
  const system = useSystemControls();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { gesture, hud, feedback } = usePlayerGestures({ ...props, ...size, system });

  return (
    <>
      <GestureDetector gesture={gesture}>
        <View
          style={StyleSheet.absoluteFill}
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            setSize({ width, height });
          }}
          accessible
          accessibilityRole="button"
          accessibilityLabel="Show or hide player controls"
          accessibilityHint="Swipe on the left for brightness, on the right for volume, sideways to seek"
          onAccessibilityTap={props.onToggleControls}>
          {feedback ? (
            <Animated.View
              key={feedback.id}
              entering={FadeIn.duration(120)}
              exiting={FadeOut.duration(250)}
              pointerEvents="none"
              style={[
                styles.feedback,
                feedback.side === 'left' ? styles.left : styles.right,
                { backgroundColor: theme.playerScrim },
              ]}>
              <Icon name={feedback.side === 'left' ? 'fast_rewind' : 'fast_forward'} size={36} color={theme.playerText} />
              <ThemedText type="smallBold" style={{ color: theme.playerText }}>
                {`${Math.round(props.skipMs / 1000)}s`}
              </ThemedText>
            </Animated.View>
          ) : null}
        </View>
      </GestureDetector>
      <PlayerGestureHud hud={hud} />
    </>
  );
}

const styles = StyleSheet.create({
  feedback: {
    position: 'absolute',
    top: '50%',
    marginTop: -FEEDBACK_SIZE / 2,
    width: FEEDBACK_SIZE,
    height: FEEDBACK_SIZE,
    borderRadius: FEEDBACK_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.half,
  },
  left: {
    left: '12%',
  },
  right: {
    right: '12%',
  },
});
