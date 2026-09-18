import { useEffect, useMemo } from 'react';
import { StyleSheet, View, type AccessibilityActionEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Elevation, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const TRACK_THICKNESS = 8;
const THUMB_SIZE = 22;
const HIT_SIZE = 44;

type SliderProps = {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  accessibilityLabel: string;
  /** Spoken value, e.g. "+40 percent". */
  accessibilityValueText: string;
  orientation?: 'horizontal' | 'vertical';
  /** Fill starts from this value instead of `min`, e.g. 0 dB on an equalizer band. */
  origin?: number;
  disabled?: boolean;
};

function snap(ratio: number, min: number, max: number, step: number): number {
  'worklet';
  const raw = min + Math.min(1, Math.max(0, ratio)) * (max - min);
  return Math.min(max, Math.max(min, Math.round(raw / step) * step));
}

/** Touch and screen-reader slider. Vertical sliders put `max` at the top. */
export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  accessibilityLabel,
  accessibilityValueText,
  orientation = 'horizontal',
  origin = min,
  disabled = false,
}: SliderProps) {
  const theme = useTheme();
  const vertical = orientation === 'vertical';
  const length = useSharedValue(0);
  const ratio = useSharedValue(0);
  const dragging = useSharedValue(false);
  const range = Math.max(1e-6, max - min);

  useEffect(() => {
    if (!dragging.get()) ratio.set((value - min) / range);
  }, [value, min, range, ratio, dragging]);

  const gesture = useMemo(() => {
    const update = (position: number) => {
      'worklet';
      const size = Math.max(1, length.get());
      const next = vertical ? 1 - position / size : position / size;
      const stepped = snap(next, min, max, step);
      ratio.set((stepped - min) / (max - min));
      scheduleOnRN(onChange, stepped);
    };
    return Gesture.Pan()
      .enabled(!disabled)
      .minDistance(0)
      .onBegin((event) => {
        dragging.set(true);
        update(vertical ? event.y : event.x);
      })
      .onUpdate((event) => update(vertical ? event.y : event.x))
      .onFinalize(() => dragging.set(false));
  }, [disabled, vertical, min, max, step, onChange, length, ratio, dragging]);

  const originRatio = (origin - min) / range;

  const fillStyle = useAnimatedStyle(() => {
    const size = length.get();
    const start = Math.min(ratio.get(), originRatio) * size;
    const extent = Math.abs(ratio.get() - originRatio) * size;
    return vertical ? { bottom: start, height: extent } : { left: start, width: extent };
  });

  const thumbStyle = useAnimatedStyle(() => {
    const offset = ratio.get() * length.get() - THUMB_SIZE / 2;
    return vertical ? { transform: [{ translateY: -offset }] } : { transform: [{ translateX: offset }] };
  });

  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    const delta = event.nativeEvent.actionName === 'increment' ? step : -step;
    onChange(Math.min(max, Math.max(min, value + delta)));
  };

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={[vertical ? styles.verticalHit : styles.horizontalHit, disabled && styles.disabled]}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          length.set(vertical ? height : width);
        }}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ text: accessibilityValueText }}
        accessibilityState={{ disabled }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={onAccessibilityAction}>
        <View
          style={[
            vertical ? styles.verticalTrack : styles.horizontalTrack,
            { backgroundColor: theme.backgroundSelected },
          ]}>
          <Animated.View
            style={[vertical ? styles.verticalFill : styles.horizontalFill, { backgroundColor: theme.accent }, fillStyle]}
          />
        </View>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.thumb,
            vertical ? styles.verticalThumb : styles.horizontalThumb,
            Elevation.low,
            { backgroundColor: theme.accent, borderColor: theme.background, shadowColor: theme.shadow },
            thumbStyle,
          ]}
        />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  horizontalHit: {
    height: HIT_SIZE,
    justifyContent: 'center',
  },
  verticalHit: {
    width: HIT_SIZE,
    flex: 1,
    alignItems: 'center',
  },
  horizontalTrack: {
    height: TRACK_THICKNESS,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  verticalTrack: {
    width: TRACK_THICKNESS,
    flex: 1,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  horizontalFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  verticalFill: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    borderWidth: 3,
  },
  horizontalThumb: {
    left: 0,
    top: (HIT_SIZE - THUMB_SIZE) / 2,
  },
  verticalThumb: {
    bottom: 0,
  },
  disabled: {
    opacity: 0.4,
  },
});
