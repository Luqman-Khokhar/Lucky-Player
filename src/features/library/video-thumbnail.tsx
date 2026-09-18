import { Image } from 'expo-image';
import { PixelRatio, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { formatTime } from '@/features/player/format-time';
import { useTheme } from '@/hooks/use-theme';

import { useThumbnail } from './use-thumbnail';

const PIXEL_RATIO_CAP = 2;

type VideoThumbnailProps = {
  uri: string;
  thumbnailKey: string;
  width: number;
  duration?: number;
  /** 0–1 resume progress */
  progress?: number;
  badge?: string;
};

export function VideoThumbnail({ uri, thumbnailKey, width, duration, progress = 0, badge }: VideoThumbnailProps) {
  const theme = useTheme();
  const pixelWidth = Math.round(width * Math.min(PixelRatio.get(), PIXEL_RATIO_CAP));
  const path = useThumbnail(uri, thumbnailKey, pixelWidth);

  return (
    <View style={[styles.frame, { width, backgroundColor: theme.backgroundSelected }]}>
      {path ? (
        <Image
          source={{ uri: path }}
          recyclingKey={thumbnailKey}
          contentFit="cover"
          transition={150}
          style={StyleSheet.absoluteFill}
          accessible={false}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
          <Icon name="movie" size={Math.round(width / 5)} color={theme.textSecondary} />
        </View>
      )}
      {badge ? (
        <View style={[styles.badge, styles.topLeft, { backgroundColor: theme.playerScrim }]}>
          <ThemedText type="smallBold" style={[styles.badgeText, { color: theme.playerText }]}>
            {badge}
          </ThemedText>
        </View>
      ) : null}
      {duration ? (
        <View style={[styles.badge, styles.bottomRight, { backgroundColor: theme.playerScrim }]}>
          <ThemedText type="smallBold" style={[styles.badgeText, { color: theme.playerText }]}>
            {formatTime(duration)}
          </ThemedText>
        </View>
      ) : null}
      {progress > 0 ? (
        <View style={[styles.progressTrack, { backgroundColor: theme.playerTrack }]}>
          <View
            style={[styles.progressFill, { width: `${Math.min(100, progress * 100)}%`, backgroundColor: theme.playerAccent }]}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    aspectRatio: 16 / 9,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    paddingHorizontal: Spacing.two,
    paddingVertical: 1,
    borderRadius: Radius.xs,
  },
  topLeft: {
    top: Spacing.one,
    left: Spacing.one,
  },
  bottomRight: {
    bottom: Spacing.two,
    right: Spacing.one,
  },
  badgeText: {
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 4,
  },
  progressFill: {
    height: '100%',
  },
});
