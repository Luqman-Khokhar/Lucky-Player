import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { ScreenHeader } from '@/components/ui/screen-header';
import { StateView } from '@/components/ui/state-view';
import { Spacing } from '@/constants/theme';
import { listAudioFolders, type AudioFolderSortKey, type LibraryAudioFolder, type SortDirection } from '@/db';
import type { LibrarySectionProps } from '@/features/library/library-section';
import { PermissionGate } from '@/features/library/permission-gate';
import { SortChips, type SortOption } from '@/features/library/sort-chips';
import { useLibraryActions } from '@/features/library/use-library-actions';
import { useLibraryQuery } from '@/features/library/use-library-query';
import { useAppSelector } from '@/store';
import { formatCount } from '@/utils/format';

import { AudioFolderRow } from './audio-folder-row';

const FOLDER_SORTS: SortOption<AudioFolderSortKey>[] = [
  { key: 'name', label: 'Name', initialDirection: 'asc' },
  { key: 'date', label: 'Recent', initialDirection: 'desc' },
  { key: 'count', label: 'Tracks', initialDirection: 'desc' },
  { key: 'size', label: 'Size', initialDirection: 'desc' },
];

export function AudioFoldersScreen({ segments }: LibrarySectionProps) {
  const router = useRouter();
  const scanning = useAppSelector((state) => state.library.scanStatus === 'scanning');
  const { rescan } = useLibraryActions();
  const [sort, setSort] = useState<AudioFolderSortKey>('name');
  const [direction, setDirection] = useState<SortDirection>('asc');
  const folders = useLibraryQuery(`audio-folders:${sort}:${direction}`, () => listAudioFolders(sort, direction));

  const openFolder = useCallback(
    (folder: LibraryAudioFolder) =>
      router.push({ pathname: '/music-folder/[bucketId]', params: { bucketId: folder.bucketId, name: folder.name } }),
    [router]
  );

  const renderBody = () => {
    if (folders.data === null) {
      return folders.error ? (
        <StateView
          icon="error"
          title="Couldn't load your music folders"
          message={folders.error}
          action={{ label: 'Retry', onPress: folders.reload }}
        />
      ) : (
        <StateView loading title="Loading folders…" />
      );
    }
    if (folders.data.length === 0) {
      return scanning ? (
        <StateView loading title="Scanning your music…" />
      ) : (
        <StateView
          icon="folder"
          title="No music folders found"
          message="Music saved on this phone shows up here, grouped by folder."
          action={{ label: 'Scan again', onPress: rescan }}
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
          renderItem={({ item }) => <AudioFolderRow folder={item} onPress={openFolder} />}
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
        title="Music folders"
        subtitle={folders.data?.length ? formatCount(folders.data.length, 'folder') : undefined}
      />
      {segments}
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
