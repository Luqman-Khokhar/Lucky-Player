import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Spacing } from '@/constants/theme';
import type { LibraryFolder } from '@/db';
import { useTheme } from '@/hooks/use-theme';
import { formatBytes, formatCount } from '@/utils/format';

import { ROW_THUMBNAIL_WIDTH } from './video-row';
import { VideoThumbnail } from './video-thumbnail';

type FolderRowProps = {
  folder: LibraryFolder;
  onPress: (folder: LibraryFolder) => void;
};

export const FolderRow = memo(function FolderRow({ folder, onPress }: FolderRowProps) {
  const theme = useTheme();
  const count = formatCount(folder.videoCount, 'video');
  const path = folder.path.replace(/\/$/, '');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${folder.name}, ${count}`}
      accessibilityHint="Opens the folder"
      onPress={() => onPress(folder)}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.backgroundElement }]}>
      <VideoThumbnail
        uri={folder.coverUri}
        thumbnailKey={folder.coverKey}
        width={ROW_THUMBNAIL_WIDTH}
        badge={String(folder.videoCount)}
      />
      <View style={styles.text}>
        <View style={styles.titleRow}>
          <Icon name="folder" size={18} color={theme.accent} />
          <ThemedText type="small" numberOfLines={1} style={styles.name}>
            {folder.name}
          </ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {`${count} · ${formatBytes(folder.totalSize)}`}
        </ThemedText>
        {path ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {path}
          </ThemedText>
        ) : null}
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  name: {
    flex: 1,
    fontWeight: 600,
  },
});
