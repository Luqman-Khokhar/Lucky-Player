import { FlashList } from '@shopify/flash-list';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { Chip } from '@/components/ui/chip';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SearchField } from '@/components/ui/search-field';
import { StateView } from '@/components/ui/state-view';
import { Spacing } from '@/constants/theme';
import { listTracks, type LibraryTrack, type SortDirection, type TrackSortKey } from '@/db';
import type { LibrarySectionProps } from '@/features/library/library-section';
import { PermissionGate } from '@/features/library/permission-gate';
import { SortChips, type SortOption } from '@/features/library/sort-chips';
import { useLibraryActions } from '@/features/library/use-library-actions';
import { useLibraryQuery } from '@/features/library/use-library-query';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useAppSelector } from '@/store';
import { formatCount } from '@/utils/format';

import { TrackRow } from './track-row';
import { useAudioActions } from './use-audio-actions';
import { useMiniPlayerInset } from './use-mini-player-inset';

const SEARCH_DEBOUNCE_MS = 200;

const TRACK_SORTS: SortOption<TrackSortKey>[] = [
  { key: 'name', label: 'Title', initialDirection: 'asc' },
  { key: 'artist', label: 'Artist', initialDirection: 'asc' },
  { key: 'album', label: 'Album', initialDirection: 'asc' },
  { key: 'date', label: 'Recent', initialDirection: 'desc' },
  { key: 'duration', label: 'Length', initialDirection: 'desc' },
];

type TrackListScreenProps = LibrarySectionProps & {
  title: string;
  subtitleOverride?: string;
  /** Limit to one music folder. */
  bucketId?: string;
  /** Limit to one album, which also fixes the order to disc order. */
  albumId?: number;
  onBack?: () => void;
  allowFavoritesFilter?: boolean;
};

export function TrackListScreen({
  title,
  subtitleOverride,
  bucketId,
  albumId,
  onBack,
  allowFavoritesFilter = false,
  segments,
}: TrackListScreenProps) {
  const { playTrack, toggleFavorite } = useAudioActions();
  const scanning = useAppSelector((state) => state.library.scanStatus === 'scanning');
  const { rescan } = useLibraryActions();
  const miniPlayerInset = useMiniPlayerInset();
  const [search, setSearch] = useState('');
  const term = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sort, setSort] = useState<TrackSortKey>('name');
  const [direction, setDirection] = useState<SortDirection>('asc');

  const inAlbum = albumId != null;
  const query = { bucketId, albumId, favoritesOnly, search: term, sort, direction };
  const tracks = useLibraryQuery(`tracks:${JSON.stringify(query)}`, () => listTracks(query));

  const play = useCallback((track: LibraryTrack) => playTrack(track, tracks.data ?? []), [playTrack, tracks.data]);

  const subtitle =
    subtitleOverride ??
    (tracks.data ? `${formatCount(tracks.data.length, 'track')}${term ? ` matching “${term}”` : ''}` : undefined);

  const renderList = () => {
    if (tracks.data === null) {
      return tracks.error ? (
        <StateView
          icon="error"
          title="Couldn't load your music"
          message={tracks.error}
          action={{ label: 'Retry', onPress: tracks.reload }}
        />
      ) : (
        <StateView loading title="Loading music…" />
      );
    }
    if (tracks.data.length === 0) {
      if (term) {
        return (
          <StateView
            icon="search_off"
            title={`No tracks match “${term}”`}
            message="Check the spelling, or try an artist or album name."
            action={{ label: 'Clear search', onPress: () => setSearch('') }}
          />
        );
      }
      if (favoritesOnly) {
        return (
          <StateView
            icon="favorite"
            title="No favorites yet"
            message="Tap the heart on any track to keep it here."
            action={{ label: 'Show all tracks', onPress: () => setFavoritesOnly(false) }}
          />
        );
      }
      return scanning ? (
        <StateView loading title="Scanning your music…" />
      ) : (
        <StateView
          icon="music_note"
          title="No music here"
          message="Audio files saved on this phone show up here after the next scan."
          action={{ label: 'Scan again', onPress: rescan }}
        />
      );
    }
    return (
      <FlashList
        data={tracks.data}
        keyExtractor={(track) => track.uri}
        renderItem={({ item }) => (
          <TrackRow
            track={item}
            showFolder={!bucketId && !inAlbum}
            showTrackNumber={inAlbum}
            onPress={play}
            onToggleFavorite={toggleFavorite}
          />
        )}
        refreshing={scanning}
        onRefresh={rescan}
        keyboardDismissMode="on-drag"
        contentContainerStyle={[styles.list, { paddingBottom: styles.list.paddingBottom + miniPlayerInset }]}
      />
    );
  };

  return (
    <ThemedView style={styles.root}>
      <ScreenHeader title={title} subtitle={subtitle} onBack={onBack} />
      {segments}
      <PermissionGate>
        {inAlbum ? null : (
          <>
            <View style={styles.search}>
              <SearchField
                value={search}
                onChangeText={setSearch}
                placeholder={bucketId ? 'Search this folder' : 'Search title, artist or album'}
              />
            </View>
            <SortChips
              options={TRACK_SORTS}
              sort={sort}
              direction={direction}
              onChange={(nextSort, nextDirection) => {
                setSort(nextSort);
                setDirection(nextDirection);
              }}
              leading={
                allowFavoritesFilter ? (
                  <Chip
                    label="Favorites"
                    icon="favorite"
                    selected={favoritesOnly}
                    onPress={() => setFavoritesOnly((value) => !value)}
                  />
                ) : undefined
              }
            />
          </>
        )}
        {renderList()}
      </PermissionGate>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  search: {
    paddingHorizontal: Spacing.three,
  },
  list: {
    paddingBottom: Spacing.four,
  },
});
