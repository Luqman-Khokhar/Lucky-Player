import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { ScreenHeader } from '@/components/ui/screen-header';
import { StateView } from '@/components/ui/state-view';
import { Spacing } from '@/constants/theme';
import {
  deletePlaylist,
  listPlaylistTracks,
  removeFromPlaylist,
  reorderPlaylist,
  type LibraryTrack,
} from '@/db';
import { useLibraryQuery } from '@/features/library/use-library-query';
import { useGoBack } from '@/hooks/use-go-back';
import { useTheme } from '@/hooks/use-theme';
import { useAppDispatch } from '@/store';
import { libraryChanged } from '@/store/library-slice';
import { formatCount } from '@/utils/format';

import { PlaylistTrackRow } from './playlist-track-row';
import { useAudioActions } from './use-audio-actions';
import { useMiniPlayerInset } from './use-mini-player-inset';

function warn(scope: string) {
  return (error: unknown) => console.warn(`[playlists] ${scope}`, error);
}

type PlaylistDetailScreenProps = {
  playlistId: number;
  name: string;
};

export function PlaylistDetailScreen({ playlistId, name }: PlaylistDetailScreenProps) {
  const theme = useTheme();
  const router = useRouter();
  const goBack = useGoBack();
  const dispatch = useAppDispatch();
  const miniPlayerInset = useMiniPlayerInset();
  const { playTrack, queueTracks, toggleFavorite } = useAudioActions();
  const [editing, setEditing] = useState(false);
  const tracks = useLibraryQuery(`playlist:${playlistId}`, () => listPlaylistTracks(playlistId));

  const play = useCallback(
    (track: LibraryTrack) => playTrack(track, tracks.data ?? []),
    [playTrack, tracks.data]
  );

  /** Reorder rewrites the whole order from the list on screen, so one move is one write. */
  const move = useCallback(
    (from: number, to: number) => {
      const current = tracks.data;
      if (!current || to < 0 || to >= current.length) return;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      reorderPlaylist(
        playlistId,
        next.map((track) => track.uri)
      )
        .then(() => dispatch(libraryChanged()))
        .catch(warn('could not reorder'));
    },
    [dispatch, playlistId, tracks.data]
  );

  const remove = useCallback(
    (track: LibraryTrack) => {
      removeFromPlaylist(playlistId, track.uri)
        .then(() => dispatch(libraryChanged()))
        .catch(warn('could not remove the track'));
    },
    [dispatch, playlistId]
  );

  const confirmDelete = useCallback(() => {
    Alert.alert('Delete this playlist?', `“${name}” will be removed. The tracks themselves stay on your phone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deletePlaylist(playlistId)
            .then(() => {
              dispatch(libraryChanged());
              goBack();
            })
            .catch(warn('could not delete the playlist'));
        },
      },
    ]);
  }, [dispatch, goBack, name, playlistId]);

  const renderBody = () => {
    if (tracks.data === null) {
      return tracks.error ? (
        <StateView
          icon="error"
          title="Couldn't load this playlist"
          message={tracks.error}
          action={{ label: 'Retry', onPress: tracks.reload }}
        />
      ) : (
        <StateView loading title="Loading…" />
      );
    }
    if (tracks.data.length === 0) {
      return (
        <StateView
          icon="playlist_add"
          title="This playlist is empty"
          message="Use the menu on any track to add it here."
          action={{ label: 'Browse music', onPress: () => router.navigate('/music') }}
        />
      );
    }
    const list = tracks.data;
    return (
      <>
        <View style={styles.actions}>
          <Button label="Play all" onPress={() => play(list[0])} />
          <Button label="Add to queue" variant="secondary" onPress={() => queueTracks(list, false)} />
        </View>
        <FlashList
          data={list}
          extraData={editing}
          keyExtractor={(track) => track.uri}
          renderItem={({ item, index }) => (
            <PlaylistTrackRow
              track={item}
              position={index}
              editing={editing}
              isFirst={index === 0}
              isLast={index === list.length - 1}
              onPress={play}
              onToggleFavorite={toggleFavorite}
              onMove={move}
              onRemove={remove}
            />
          )}
          contentContainerStyle={[styles.list, { paddingBottom: styles.list.paddingBottom + miniPlayerInset }]}
        />
      </>
    );
  };

  return (
    <ThemedView style={styles.root}>
      <ScreenHeader
        title={name}
        subtitle={tracks.data ? formatCount(tracks.data.length, 'track') : undefined}
        onBack={goBack}
        actions={
          <>
            <IconButton
              icon={editing ? 'check' : 'edit'}
              label={editing ? 'Done reordering' : 'Reorder and remove tracks'}
              color={editing ? theme.accent : theme.text}
              pressedColor={theme.backgroundSelected}
              onPress={() => setEditing((value) => !value)}
            />
            <IconButton
              icon="delete"
              label="Delete this playlist"
              color={theme.text}
              pressedColor={theme.backgroundSelected}
              onPress={confirmDelete}
            />
          </>
        }
      />
      {renderBody()}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  list: {
    paddingBottom: Spacing.four,
  },
});
