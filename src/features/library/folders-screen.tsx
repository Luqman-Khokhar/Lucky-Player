import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { IconButton } from '@/components/ui/icon-button';
import { ScreenHeader } from '@/components/ui/screen-header';
import { StateView } from '@/components/ui/state-view';
import { Spacing } from '@/constants/theme';
import { listFolders, type FolderSortKey, type LibraryFolder, type SortDirection } from '@/db';
import { useTheme } from '@/hooks/use-theme';
import { useAppSelector } from '@/store';
import { formatCount, formatScanTime } from '@/utils/format';

import { FolderRow } from './folder-row';
import { PermissionGate } from './permission-gate';
import { SortChips, type SortOption } from './sort-chips';
import { useLibraryActions } from './use-library-actions';
import { useLibraryQuery } from './use-library-query';
import { useOpenFile } from './use-open-file';

const FOLDER_SORTS: SortOption<FolderSortKey>[] = [
  { key: 'name', label: 'Name', initialDirection: 'asc' },
  { key: 'date', label: 'Recent', initialDirection: 'desc' },
  { key: 'count', label: 'Videos', initialDirection: 'desc' },
  { key: 'size', label: 'Size', initialDirection: 'desc' },
];

export function FoldersScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { scanStatus, scanError, videoCount, lastScanAt } = useAppSelector((state) => state.library);
  const { rescan } = useLibraryActions();
  const { openFile, picking } = useOpenFile();
  const [sort, setSort] = useState<FolderSortKey>('name');
  const [direction, setDirection] = useState<SortDirection>('asc');
  const folders = useLibraryQuery(`folders:${sort}:${direction}`, () => listFolders(sort, direction));

  const openFolder = useCallback(
    (folder: LibraryFolder) =>
      router.push({ pathname: '/folder/[bucketId]', params: { bucketId: folder.bucketId, name: folder.name } }),
    [router]
  );

  const scanning = scanStatus === 'scanning';
  const subtitle = scanning
    ? 'Scanning for videos…'
    : scanStatus === 'error'
      ? 'Last scan failed · pull down to retry'
      : `${formatCount(videoCount, 'video')} · ${formatScanTime(lastScanAt)}`;

  const renderBody = () => {
    if (folders.data === null) {
      return folders.error ? (
        <StateView
          icon="error"
          title="Couldn't load your folders"
          message={folders.error}
          action={{ label: 'Retry', onPress: folders.reload }}
        />
      ) : (
        <StateView loading title="Loading your library…" />
      );
    }
    if (folders.data.length === 0) {
      if (scanning) return <StateView loading title="Scanning your videos…" message="The first scan can take a moment." />;
      if (scanStatus === 'error') {
        return (
          <StateView
            icon="error"
            title="Scan failed"
            message={scanError ?? undefined}
            action={{ label: 'Try again', onPress: rescan }}
          />
        );
      }
      return (
        <StateView
          icon="video_library"
          title="No videos found"
          message="Videos saved on this phone show up here, grouped by folder."
          action={{ label: 'Scan again', onPress: rescan }}
          secondaryAction={{ label: 'Open a file', onPress: openFile }}
        />
      );
    }
    return (
      <>
        <SortChips
          options={FOLDER_SORTS}
          sort={sort}
          direction={direction}
          onChange={(nextSort, nextDirection) => {
            setSort(nextSort);
            setDirection(nextDirection);
          }}
        />
        <FlashList
          data={folders.data}
          keyExtractor={(folder) => folder.bucketId}
          renderItem={({ item }) => <FolderRow folder={item} onPress={openFolder} />}
          refreshing={scanning}
          onRefresh={rescan}
          contentContainerStyle={styles.list}
        />
      </>
    );
  };

  return (
    <ThemedView style={styles.root}>
      <ScreenHeader
        title="Folders"
        subtitle={subtitle}
        actions={
          <>
            <IconButton
              icon="file_open"
              label="Open a video file"
              disabled={picking}
              color={theme.text}
              pressedColor={theme.backgroundSelected}
              onPress={openFile}
            />
            <IconButton
              icon="refresh"
              label="Scan for new videos"
              disabled={scanning}
              color={theme.text}
              pressedColor={theme.backgroundSelected}
              onPress={rescan}
            />
          </>
        }
      />
      <PermissionGate>{renderBody()}</PermissionGate>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  list: {
    paddingBottom: Spacing.four,
  },
});
