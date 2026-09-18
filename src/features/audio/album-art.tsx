import { Image } from 'expo-image';
import { PixelRatio, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useThumbnail } from '@/features/library/use-thumbnail';
import { useTheme } from '@/hooks/use-theme';

const PIXEL_RATIO_CAP = 2;

export const ROW_ART_WIDTH = 56;

type AlbumArtProps = {
  uri: string;
  artKey: string;
  width: number;
  /** Fallback glyph when the track carries no embedded art. */
  icon?: 'music_note' | 'album' | 'folder' | 'playlist_play';
  badge?: string;
};

/** Square album art for a track, album or music folder, with a themed placeholder while it loads. */
export function AlbumArt({ uri, artKey, width, icon = 'music_note', badge }: AlbumArtProps) {
  const theme = useTheme();
  const pixelWidth = Math.round(width * Math.min(PixelRatio.get(), PIXEL_RATIO_CAP));
  const path = useThumbnail(uri, artKey, pixelWidth, 'albumArt');

  return (
    <View style={[styles.frame, { width, backgroundColor: theme.backgroundSelected }]}>
      {path ? (
        <Image
          source={{ uri: path }}
          recyclingKey={artKey}
          contentFit="cover"
          transition={150}
          style={StyleSheet.absoluteFill}
          accessible={false}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
          <Icon name={icon} size={Math.round(width / 2.5)} color={theme.textSecondary} />
        </View>
      )}
      {badge ? (
        <View style={[styles.badge, { backgroundColor: theme.playerScrim }]}>
          <ThemedText type="smallBold" style={[styles.badgeText, { color: theme.playerText }]}>
            {badge}
          </ThemedText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    aspectRatio: 1,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: Spacing.one,
    left: Spacing.one,
    paddingHorizontal: Spacing.one,
    borderRadius: Radius.xs,
  },
  badgeText: {
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
});
