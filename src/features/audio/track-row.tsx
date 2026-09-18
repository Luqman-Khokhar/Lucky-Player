import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { IconButton } from '@/components/ui/icon-button';
import { Spacing } from '@/constants/theme';
import type { LibraryTrack } from '@/db';
import { formatTime } from '@/features/player/format-time';
import { useTheme } from '@/hooks/use-theme';

import { AlbumArt, ROW_ART_WIDTH } from './album-art';

type TrackRowProps = {
  track: LibraryTrack;
  /** Show the folder name instead of the album, for lists that mix folders. */
  showFolder?: boolean;
  /** Show the track number instead of the art, inside a single album. */
  showTrackNumber?: boolean;
  onPress: (track: LibraryTrack) => void;
  onToggleFavorite: (track: LibraryTrack) => void;
};

export const TrackRow = memo(function TrackRow({
  track,
  showFolder = false,
  showTrackNumber = false,
  onPress,
  onToggleFavorite,
}: TrackRowProps) {
  const theme = useTheme();
  const second = [track.artist || 'Unknown artist', showFolder ? track.folderName : track.album]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${track.title}, ${track.artist || 'unknown artist'}, ${formatTime(track.duration)}`}
        accessibilityHint={track.position > 0 ? 'Resumes playback' : 'Plays the track'}
        onPress={() => onPress(track)}
        style={({ pressed }) => [styles.main, pressed && { backgroundColor: theme.backgroundElement }]}>
        {showTrackNumber ? (
          <View style={styles.number}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.numberText}>
              {track.trackNo > 0 ? String(track.trackNo) : '–'}
            </ThemedText>
          </View>
        ) : (
          <AlbumArt uri={track.uri} artKey={track.artKey} width={ROW_ART_WIDTH} />
        )}
        <View style={styles.text}>
          <ThemedText type="small" numberOfLines={1} style={styles.title}>
            {track.title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {second}
          </ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.duration}>
          {formatTime(track.duration)}
        </ThemedText>
      </Pressable>
      <IconButton
        icon={track.favorite ? 'favorite' : 'heart_plus'}
        label={track.favorite ? `Remove ${track.title} from favorites` : `Add ${track.title} to favorites`}
        color={track.favorite ? theme.danger : theme.textSecondary}
        pressedColor={theme.backgroundSelected}
        onPress={() => onToggleFavorite(track)}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: Spacing.two,
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  number: {
    width: ROW_ART_WIDTH / 2,
    alignItems: 'center',
  },
  numberText: {
    fontVariant: ['tabular-nums'],
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
  title: {
    fontWeight: 600,
  },
  duration: {
    fontVariant: ['tabular-nums'],
  },
});
