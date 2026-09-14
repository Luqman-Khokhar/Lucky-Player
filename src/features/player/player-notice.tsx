import { StyleSheet } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Sits below the top control bar.
const TOP_OFFSET = Spacing.six + Spacing.four;

export function PlayerNotice({ message }: { message: string | null }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  if (!message) return null;

  return (
    <Animated.View
      entering={FadeInDown.duration(220)}
      exiting={FadeOut.duration(200)}
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[styles.notice, { top: insets.top + TOP_OFFSET, backgroundColor: theme.playerSheet }]}>
      <ThemedText type="small" style={{ color: theme.playerText }}>
        {message}
      </ThemedText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  notice: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: '90%',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.five,
  },
});
