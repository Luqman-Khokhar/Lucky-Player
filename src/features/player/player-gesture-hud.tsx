import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Icon, type IconName } from '@/components/ui/icon';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { formatTime } from './format-time';
import type { GestureHud } from './use-player-gestures';

const LEVEL_BAR_WIDTH = 120;
const LEVEL_BAR_HEIGHT = 4;

function describe(hud: GestureHud): { icon: IconName; label: string; level?: number } {
  switch (hud.kind) {
    case 'brightness':
      return { icon: 'brightness_medium', label: `${Math.round(hud.value * 100)}%`, level: hud.value };
    case 'volume':
      return {
        icon: hud.value === 0 ? 'volume_off' : 'volume_up',
        label: `${Math.round(hud.value * 100)}%`,
        level: hud.value,
      };
    case 'zoom':
      return { icon: 'zoom_in', label: `Zoom ${Math.round(hud.value * 100)}%` };
    case 'seek': {
      const seconds = Math.round(hud.delta / 1000);
      const sign = seconds < 0 ? '-' : '+';
      return {
        icon: seconds < 0 ? 'fast_rewind' : 'fast_forward',
        label: `${formatTime(hud.target)}  (${sign}${formatTime(Math.abs(hud.delta))})`,
      };
    }
    case 'boost':
      return { icon: 'speed', label: '2x speed' };
  }
}

/** Live readout for swipe, pinch and hold gestures, pinned near the top so the finger never covers it. */
export function PlayerGestureHud({ hud }: { hud: GestureHud | null }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  if (!hud) return null;
  const { icon, label, level } = describe(hud);

  return (
    <Animated.View
      entering={FadeIn.duration(120)}
      exiting={FadeOut.duration(200)}
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[styles.hud, { top: insets.top + Spacing.six, backgroundColor: theme.playerScrim }]}>
      <View style={styles.row}>
        <Icon name={icon} size={22} color={theme.playerText} />
        <ThemedText type="smallBold" style={[styles.label, { color: theme.playerText }]}>
          {label}
        </ThemedText>
      </View>
      {level !== undefined ? (
        <View style={[styles.track, { backgroundColor: theme.playerTrack }]}>
          <View style={[styles.fill, { width: `${Math.round(level * 100)}%`, backgroundColor: theme.playerAccent }]} />
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  hud: {
    position: 'absolute',
    alignSelf: 'center',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.five,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  label: {
    fontVariant: ['tabular-nums'],
  },
  track: {
    width: LEVEL_BAR_WIDTH,
    height: LEVEL_BAR_HEIGHT,
    borderRadius: LEVEL_BAR_HEIGHT / 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
});
