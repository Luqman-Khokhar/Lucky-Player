import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import type { Playlist } from '@/db';
import { formatTime } from '@/features/player/format-time';
import { useTheme } from '@/hooks/use-theme';
import { formatCount } from '@/utils/format';

import { AlbumArt, ROW_ART_WIDTH } from './album-art';

type PlaylistRowProps = {
  playlist: Playlist;
  onPress: (playlist: Playlist) => void;
};

export const PlaylistRow = memo(function PlaylistRow({ playlist, onPress }: PlaylistRowProps) {
  const theme = useTheme();
  const count = formatCount(playlist.trackCount, 'track');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${playlist.name}, ${count}`}
      accessibilityHint="Opens the playlist"
      onPress={() => onPress(playlist)}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.backgroundElement }]}>
      <AlbumArt
        uri={playlist.coverUri}
        artKey={playlist.coverKey}
        width={ROW_ART_WIDTH}
        icon="playlist_play"
      />
      <View style={styles.text}>
        <ThemedText type="small" numberOfLines={1} style={styles.name}>
          {playlist.name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {playlist.trackCount > 0 ? `${count} · ${formatTime(playlist.totalDuration)}` : 'Empty'}
        </ThemedText>
      </View>
      <Icon name="chevron_right" size={22} color={theme.textSecondary} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.md,
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
  name: {
    fontWeight: 600,
  },
});
