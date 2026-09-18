import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { StateView } from '@/components/ui/state-view';
import { Spacing } from '@/constants/theme';
import { addToPlaylist, createPlaylist, listPlaylists, playlistsContaining, type LibraryTrack } from '@/db';
import { useLibraryQuery } from '@/features/library/use-library-query';
import { useTheme } from '@/hooks/use-theme';
import { useAppDispatch } from '@/store';
import { libraryChanged } from '@/store/library-slice';
import { formatCount } from '@/utils/format';

import { SheetAction } from './sheet-action';

type AddToPlaylistSheetProps = {
  /** The tracks to add; a whole album or folder is added in one go. */
  tracks: readonly LibraryTrack[];
  open: boolean;
  onClose: () => void;
};

export function AddToPlaylistSheet({ tracks, open, onClose }: AddToPlaylistSheetProps) {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const single = tracks.length === 1 ? tracks[0] : null;
  const playlists = useLibraryQuery(`playlists:${open}`, () => listPlaylists());
  const already = useLibraryQuery(`playlists-with:${single?.uri ?? ''}`, () =>
    single ? playlistsContaining(single.uri) : Promise.resolve<number[]>([])
  );

  const add = useCallback(
    (playlistId: number) => {
      if (busy) return;
      setBusy(true);
      addToPlaylist(playlistId, tracks.map((track) => track.uri))
        .then(() => {
          dispatch(libraryChanged());
          onClose();
        })
        .catch((error: unknown) => console.warn('[playlists] could not add tracks', error))
        .finally(() => setBusy(false));
    },
    [busy, dispatch, onClose, tracks]
  );

  const createAndAdd = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    createPlaylist(trimmed)
      .then((id) => addToPlaylist(id, tracks.map((track) => track.uri)))
      .then(() => {
        setName('');
        dispatch(libraryChanged());
        onClose();
      })
      .catch((error: unknown) => console.warn('[playlists] could not create the playlist', error))
      .finally(() => setBusy(false));
  }, [busy, dispatch, name, onClose, tracks]);

  const title = single ? 'Add to playlist' : `Add ${formatCount(tracks.length, 'track')}`;

  return (
    <BottomSheet open={open} title={title} onClose={onClose}>
      <View style={styles.create}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="New playlist name"
          placeholderTextColor={theme.textSecondary}
          accessibilityLabel="New playlist name"
          returnKeyType="done"
          onSubmitEditing={createAndAdd}
          style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }]}
        />
        <Button label="Create" onPress={createAndAdd} disabled={!name.trim() || busy} />
      </View>

      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
        {playlists.data === null ? (
          <StateView loading title="Loading playlists…" />
        ) : playlists.data.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
            No playlists yet. Name one above to make your first.
          </ThemedText>
        ) : (
          playlists.data.map((playlist) => (
            <SheetAction
              key={playlist.id}
              icon="playlist_play"
              label={playlist.name}
              hint={formatCount(playlist.trackCount, 'track')}
              selected={already.data?.includes(playlist.id) ?? false}
              onPress={() => add(playlist.id)}
            />
          ))
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  create: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  input: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
  list: {
    maxHeight: 320,
    marginTop: Spacing.two,
  },
  empty: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
});
