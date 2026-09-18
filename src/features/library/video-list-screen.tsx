import { FlashList } from '@shopify/flash-list';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { Chip } from '@/components/ui/chip';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SearchField } from '@/components/ui/search-field';
import { StateView } from '@/components/ui/state-view';
import { Spacing } from '@/constants/theme';
import { listVideos, type LibraryVideo, type SortDirection, type VideoSortKey } from '@/db';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useAppSelector } from '@/store';
import { formatCount } from '@/utils/format';

import type { LibrarySectionProps } from './library-section';
import { PermissionGate } from './permission-gate';
import { SortChips, type SortOption } from './sort-chips';
import { useLibraryActions } from './use-library-actions';
import { useLibraryQuery } from './use-library-query';
import { usePlayVideo } from './use-play-video';
import { VideoRow } from './video-row';

const SEARCH_DEBOUNCE_MS = 200;

const VIDEO_SORTS: SortOption<VideoSortKey>[] = [
  { key: 'date', label: 'Recent', initialDirection: 'desc' },
  { key: 'name', label: 'Name', initialDirection: 'asc' },
  { key: 'duration', label: 'Length', initialDirection: 'desc' },
  { key: 'size', label: 'Size', initialDirection: 'desc' },
];

type VideoListScreenProps = LibrarySectionProps & {
  title: string;
  /** Limit to one MediaStore folder. */
  bucketId?: string;
  onBack?: () => void;
  allowFavoritesFilter?: boolean;
};

export function VideoListScreen({
  title,
  bucketId,
  onBack,
  allowFavoritesFilter = false,
  segments,
}: VideoListScreenProps) {
  const playVideo = usePlayVideo();
  const scanning = useAppSelector((state) => state.library.scanStatus === 'scanning');
  const { rescan, toggleFavorite } = useLibraryActions();
  const [search, setSearch] = useState('');
  const term = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sort, setSort] = useState<VideoSortKey>('date');
  const [direction, setDirection] = useState<SortDirection>('desc');

  const query = { bucketId, favoritesOnly, search: term, sort, direction };
  const videos = useLibraryQuery(`videos:${JSON.stringify(query)}`, () => listVideos(query));

  const play = useCallback((video: LibraryVideo) => playVideo(video, videos.data ?? []), [playVideo, videos.data]);

  const subtitle = videos.data
    ? `${formatCount(videos.data.length, 'video')}${term ? ` matching “${term}”` : ''}`
    : undefined;

  const renderList = () => {
    if (videos.data === null) {
      return videos.error ? (
        <StateView
          icon="error"
          title="Couldn't load videos"
          message={videos.error}
          action={{ label: 'Retry', onPress: videos.reload }}
        />
      ) : (
        <StateView loading title="Loading videos…" />
      );
    }
    if (videos.data.length === 0) {
      if (term) {
        return (
          <StateView
            icon="search_off"
            title={`No videos match “${term}”`}
            message="Check the spelling or try part of the file name."
            action={{ label: 'Clear search', onPress: () => setSearch('') }}
          />
        );
      }
      if (favoritesOnly) {
        return (
          <StateView
            icon="favorite"
            title="No favorites yet"
            message="Tap the heart on any video to keep it here."
            action={{ label: 'Show all videos', onPress: () => setFavoritesOnly(false) }}
          />
        );
      }
      return scanning ? (
        <StateView loading title="Scanning your videos…" />
      ) : (
        <StateView
          icon="video_library"
          title="No videos here"
          message="New videos appear after the next scan."
          action={{ label: 'Scan again', onPress: rescan }}
        />
      );
    }
    return (
      <FlashList
        data={videos.data}
        keyExtractor={(video) => video.uri}
        renderItem={({ item }) => (
          <VideoRow video={item} showFolder={!bucketId} onPress={play} onToggleFavorite={toggleFavorite} />
        )}
        refreshing={scanning}
        onRefresh={rescan}
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.list}
      />
    );
  };

  return (
    <ThemedView style={styles.root}>
      <ScreenHeader title={title} subtitle={subtitle} onBack={onBack} />
      {segments}
      <PermissionGate>
        <View style={styles.search}>
          <SearchField
            value={search}
            onChangeText={setSearch}
            placeholder={bucketId ? 'Search this folder' : 'Search videos'}
          />
        </View>
        <SortChips
          options={VIDEO_SORTS}
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
