import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import type { LibraryAudioFolder } from '@/db';
import { useTheme } from '@/hooks/use-theme';
import { formatBytes, formatCount } from '@/utils/format';

import { AlbumArt, ROW_ART_WIDTH } from './album-art';

type AudioFolderRowProps = {
  folder: LibraryAudioFolder;
  onPress: (folder: LibraryAudioFolder) => void;
};

export const AudioFolderRow = memo(function AudioFolderRow({ folder, onPress }: AudioFolderRowProps) {
  const theme = useTheme();
  const count = formatCount(folder.trackCount, 'track');
  const path = folder.path.replace(/\/$/, '');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${folder.name}, ${count}`}
      accessibilityHint="Opens the folder"
      onPress={() => onPress(folder)}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.backgroundElement }]}>
      <AlbumArt
        uri={folder.coverUri}
        artKey={folder.coverKey}
        width={ROW_ART_WIDTH}
        icon="folder"
        badge={String(folder.trackCount)}
      />
      <View style={styles.text}>
        <View style={styles.titleRow}>
          <Icon name="folder" size={18} color={theme.accentText} />
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
    borderRadius: Radius.md,
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
