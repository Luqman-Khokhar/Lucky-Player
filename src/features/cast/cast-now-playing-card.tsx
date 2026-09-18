import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Radius, Spacing } from '@/constants/theme';
import type { CastPlayback } from '@modules/vlc-player';

import { castStatusText } from './cast-playback-status';

type CastNowPlayingCardProps = {
  playback: CastPlayback;
  onOpenRemote: () => void;
};

export function CastNowPlayingCard({ playback, onOpenRemote }: CastNowPlayingCardProps) {
  return (
    <ThemedView type="backgroundElement" style={styles.card} accessibilityLiveRegion="polite">
      <ThemedText type="smallBold" accessibilityRole="header">
        Now casting
      </ThemedText>
      <ThemedText numberOfLines={2}>{playback.title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {castStatusText(playback)}
      </ThemedText>
      <Button label="Open remote" onPress={onOpenRemote} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.three,
    borderRadius: Radius.md,
    gap: Spacing.two,
  },
});
