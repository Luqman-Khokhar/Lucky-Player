import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { ScreenHeader } from '@/components/ui/screen-header';
import { StateView } from '@/components/ui/state-view';
import { Spacing } from '@/constants/theme';
import { listRecent, type LibraryVideo } from '@/db';
import { formatCount } from '@/utils/format';

import type { LibrarySectionProps } from './library-section';
import { PermissionGate } from './permission-gate';
import { useLibraryActions } from './use-library-actions';
import { useLibraryQuery } from './use-library-query';
import { usePlayVideo } from './use-play-video';
import { VideoRow } from './video-row';

const RECENT_LIMIT = 50;

type RecentScreenProps = LibrarySectionProps & {
  /** Where the empty state sends the user; defaults to the library tab. */
  onBrowseFolders?: () => void;
};

export function RecentScreen({ segments, onBrowseFolders }: RecentScreenProps) {
  const router = useRouter();
  const { toggleFavorite } = useLibraryActions();
  const recent = useLibraryQuery('recent', () => listRecent(RECENT_LIMIT));
  const playVideo = usePlayVideo();

  const play = useCallback((video: LibraryVideo) => playVideo(video, recent.data ?? []), [playVideo, recent.data]);

  const renderBody = () => {
    if (recent.data === null) {
      return recent.error ? (
        <StateView
          icon="error"
          title="Couldn't load your history"
          message={recent.error}
          action={{ label: 'Retry', onPress: recent.reload }}
        />
      ) : (
        <StateView loading title="Loading…" />
      );
    }
    if (recent.data.length === 0) {
      return (
        <StateView
          icon="history"
          title="Nothing to continue yet"
          message="Videos you start watching appear here, ready to pick up where you left off."
          action={{ label: 'Browse folders', onPress: onBrowseFolders ?? (() => router.navigate('/')) }}
        />
      );
    }
    return (
      <FlashList
        data={recent.data}
        keyExtractor={(video) => video.uri}
        renderItem={({ item }) => (
          <VideoRow video={item} showFolder onPress={play} onToggleFavorite={toggleFavorite} />
        )}
        contentContainerStyle={styles.list}
      />
    );
  };

  return (
    <ThemedView style={styles.root}>
      <ScreenHeader
        title="Continue watching"
        subtitle={recent.data?.length ? formatCount(recent.data.length, 'video') : undefined}
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
