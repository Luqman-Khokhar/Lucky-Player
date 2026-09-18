import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { ScreenHeader } from '@/components/ui/screen-header';
import { StateView } from '@/components/ui/state-view';
import { Spacing } from '@/constants/theme';
import { listAlbums, type AlbumSortKey, type LibraryAlbum, type SortDirection } from '@/db';
import type { LibrarySectionProps } from '@/features/library/library-section';
import { PermissionGate } from '@/features/library/permission-gate';
import { SortChips, type SortOption } from '@/features/library/sort-chips';
import { useLibraryActions } from '@/features/library/use-library-actions';
import { useLibraryQuery } from '@/features/library/use-library-query';
import { useAppSelector } from '@/store';
import { formatCount } from '@/utils/format';

import { AlbumRow } from './album-row';
import { useMiniPlayerInset } from './use-mini-player-inset';

const ALBUM_SORTS: SortOption<AlbumSortKey>[] = [
  { key: 'name', label: 'Name', initialDirection: 'asc' },
  { key: 'artist', label: 'Artist', initialDirection: 'asc' },
  { key: 'date', label: 'Recent', initialDirection: 'desc' },
  { key: 'count', label: 'Tracks', initialDirection: 'desc' },
];

export function AlbumListScreen({ segments }: LibrarySectionProps) {
  const router = useRouter();
  const scanning = useAppSelector((state) => state.library.scanStatus === 'scanning');
  const { rescan } = useLibraryActions();
  const miniPlayerInset = useMiniPlayerInset();
  const [sort, setSort] = useState<AlbumSortKey>('name');
  const [direction, setDirection] = useState<SortDirection>('asc');
  const albums = useLibraryQuery(`albums:${sort}:${direction}`, () => listAlbums(sort, direction));

  const openAlbum = useCallback(
    (album: LibraryAlbum) =>
      router.push({
        pathname: '/album/[albumId]',
        params: { albumId: String(album.albumId), name: album.name, artist: album.artist },
      }),
    [router]
  );

  const renderBody = () => {
    if (albums.data === null) {
      return albums.error ? (
        <StateView
          icon="error"
          title="Couldn't load your albums"
          message={albums.error}
          action={{ label: 'Retry', onPress: albums.reload }}
        />
      ) : (
        <StateView loading title="Loading albums…" />
      );
    }
    if (albums.data.length === 0) {
      return scanning ? (
        <StateView loading title="Scanning your music…" />
      ) : (
        <StateView
          icon="album"
          title="No albums yet"
          message="Albums are built from the tags on your music files."
          action={{ label: 'Scan again', onPress: rescan }}
        />
      );
    }
    return (
      <>
        <SortChips
          options={ALBUM_SORTS}
          sort={sort}
          direction={direction}
          onChange={(nextSort, nextDirection) => {
            setSort(nextSort);
            setDirection(nextDirection);
          }}
        />
        <FlashList
          data={albums.data}
          keyExtractor={(album) => String(album.albumId)}
          renderItem={({ item }) => <AlbumRow album={item} onPress={openAlbum} />}
          refreshing={scanning}
          onRefresh={rescan}
          contentContainerStyle={[styles.list, { paddingBottom: styles.list.paddingBottom + miniPlayerInset }]}
        />
      </>
    );
  };

  return (
    <ThemedView style={styles.root}>
      <ScreenHeader
        title="Albums"
        subtitle={albums.data?.length ? formatCount(albums.data.length, 'album') : undefined}
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
