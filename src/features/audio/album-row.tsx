import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Spacing } from '@/constants/theme';
import type { LibraryAlbum } from '@/db';
import { formatTime } from '@/features/player/format-time';
import { useTheme } from '@/hooks/use-theme';
import { formatCount } from '@/utils/format';

import { AlbumArt, ROW_ART_WIDTH } from './album-art';

type AlbumRowProps = {
  album: LibraryAlbum;
  onPress: (album: LibraryAlbum) => void;
};

export const AlbumRow = memo(function AlbumRow({ album, onPress }: AlbumRowProps) {
  const theme = useTheme();
  const count = formatCount(album.trackCount, 'track');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${album.name}, ${album.artist || 'unknown artist'}, ${count}`}
      accessibilityHint="Opens the album"
      onPress={() => onPress(album)}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.backgroundElement }]}>
      <AlbumArt uri={album.coverUri} artKey={album.coverKey} width={ROW_ART_WIDTH} icon="album" />
      <View style={styles.text}>
        <ThemedText type="small" numberOfLines={1} style={styles.name}>
          {album.name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {`${album.artist || 'Unknown artist'} · ${count} · ${formatTime(album.totalDuration)}`}
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
    borderRadius: Spacing.three,
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
  name: {
    fontWeight: 600,
  },
});
