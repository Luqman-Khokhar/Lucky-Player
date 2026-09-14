import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const DOUBLE_TAP_MAX_DELAY_MS = 250;
const FEEDBACK_MS = 650;
const FEEDBACK_SIZE = 104;

type PlayerGestureLayerProps = {
  locked: boolean;
  skipMs: number;
  onToggleControls: () => void;
  onSkip: (deltaMs: number) => void;
};

type Feedback = { side: 'left' | 'right'; id: number };

/** Tap toggles controls; double-tap on the left/right half seeks back/forward. */
export function PlayerGestureLayer({ locked, skipMs, onToggleControls, onSkip }: PlayerGestureLayerProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  useEffect(() => {
    if (!feedback) return;
    const id = setTimeout(() => setFeedback(null), FEEDBACK_MS);
    return () => clearTimeout(id);
  }, [feedback]);

  const gesture = useMemo(() => {
    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDelay(DOUBLE_TAP_MAX_DELAY_MS)
      .enabled(!locked)
      .runOnJS(true)
      .onEnd((event, success) => {
        if (!success || width === 0) return;
        const side = event.x < width / 2 ? 'left' : 'right';
        onSkip(side === 'left' ? -skipMs : skipMs);
        setFeedback({ side, id: Date.now() });
      });
    const singleTap = Gesture.Tap()
      .runOnJS(true)
      .onEnd((_event, success) => {
        if (success) onToggleControls();
      });
    return Gesture.Exclusive(doubleTap, singleTap);
  }, [locked, width, skipMs, onSkip, onToggleControls]);

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={StyleSheet.absoluteFill}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Show or hide player controls"
        onAccessibilityTap={onToggleControls}>
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
              {`${Math.round(skipMs / 1000)}s`}
            </ThemedText>
          </Animated.View>
        ) : null}
      </View>
    </GestureDetector>
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
