import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { IconButton } from '@/components/ui/icon-button';
import { Spacing } from '@/constants/theme';
import type { LibraryVideo } from '@/db';
import { formatTime } from '@/features/player/format-time';
import { useTheme } from '@/hooks/use-theme';
import { formatBytes, formatDate, resolutionLabel } from '@/utils/format';

import { VideoThumbnail } from './video-thumbnail';

export const ROW_THUMBNAIL_WIDTH = 132;

type VideoRowProps = {
  video: LibraryVideo;
  /** Show the folder name instead of the date, for lists that mix folders. */
  showFolder?: boolean;
  onPress: (video: LibraryVideo) => void;
  onToggleFavorite: (video: LibraryVideo) => void;
};

export const VideoRow = memo(function VideoRow({ video, showFolder = false, onPress, onToggleFavorite }: VideoRowProps) {
  const theme = useTheme();
  const progress = video.duration > 0 ? video.position / video.duration : 0;
  const meta = [
    resolutionLabel(video.width, video.height),
    formatBytes(video.size),
    showFolder ? video.folderName : formatDate(video.modifiedAt),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${video.name}, ${formatTime(video.duration)}`}
        accessibilityHint={video.position > 0 ? 'Resumes playback' : 'Plays the video'}
        onPress={() => onPress(video)}
        style={({ pressed }) => [styles.main, pressed && { backgroundColor: theme.backgroundElement }]}>
        <VideoThumbnail
          uri={video.uri}
          thumbnailKey={video.thumbnailKey}
          width={ROW_THUMBNAIL_WIDTH}
          duration={video.duration}
          progress={progress}
        />
        <View style={styles.text}>
          <ThemedText type="small" numberOfLines={2} style={styles.name}>
            {video.name}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {meta}
          </ThemedText>
        </View>
      </Pressable>
      <IconButton
        icon={video.favorite ? 'favorite' : 'heart_plus'}
        label={video.favorite ? `Remove ${video.name} from favorites` : `Add ${video.name} to favorites`}
        color={video.favorite ? theme.danger : theme.textSecondary}
        pressedColor={theme.backgroundSelected}
        onPress={() => onToggleFavorite(video)}
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
  text: {
    flex: 1,
    gap: Spacing.half,
  },
  name: {
    fontWeight: 600,
  },
});
