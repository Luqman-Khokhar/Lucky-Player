import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { ScreenHeader } from '@/components/ui/screen-header';
import { StateView } from '@/components/ui/state-view';
import { Spacing } from '@/constants/theme';
import { createPlaylist, listPlaylists, type Playlist } from '@/db';
import type { LibrarySectionProps } from '@/features/library/library-section';
import { useLibraryQuery } from '@/features/library/use-library-query';
import { useTheme } from '@/hooks/use-theme';
import { useAppDispatch } from '@/store';
import { libraryChanged } from '@/store/library-slice';
import { formatCount } from '@/utils/format';

import { PlaylistRow } from './playlist-row';
import { useMiniPlayerInset } from './use-mini-player-inset';

export function PlaylistsScreen({ segments }: LibrarySectionProps) {
  const router = useRouter();
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const miniPlayerInset = useMiniPlayerInset();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const playlists = useLibraryQuery('playlists', () => listPlaylists());

  const open = useCallback(
    (playlist: Playlist) =>
      router.push({ pathname: '/playlist/[id]', params: { id: String(playlist.id), name: playlist.name } }),
    [router]
  );

  const create = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    createPlaylist(trimmed)
      .then(() => {
        setName('');
        dispatch(libraryChanged());
      })
      .catch((error: unknown) => console.warn('[playlists] could not create the playlist', error))
      .finally(() => setBusy(false));
  }, [busy, dispatch, name]);

  const renderBody = () => {
    if (playlists.data === null) {
      return playlists.error ? (
        <StateView
          icon="error"
          title="Couldn't load your playlists"
          message={playlists.error}
          action={{ label: 'Retry', onPress: playlists.reload }}
        />
      ) : (
        <StateView loading title="Loading playlists…" />
      );
    }
    if (playlists.data.length === 0) {
      return (
        <StateView
          icon="playlist_add"
          title="No playlists yet"
          message="Name one above, or use the menu on any track to start a playlist from it."
        />
      );
    }
    return (
      <FlashList
        data={playlists.data}
        keyExtractor={(playlist) => String(playlist.id)}
        renderItem={({ item }) => <PlaylistRow playlist={item} onPress={open} />}
        contentContainerStyle={[styles.list, { paddingBottom: styles.list.paddingBottom + miniPlayerInset }]}
      />
    );
  };

  return (
    <ThemedView style={styles.root}>
      <ScreenHeader
        title="Playlists"
        subtitle={playlists.data?.length ? formatCount(playlists.data.length, 'playlist') : undefined}
      />
      {segments}
      <View style={styles.create}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="New playlist name"
          placeholderTextColor={theme.textSecondary}
          accessibilityLabel="New playlist name"
          returnKeyType="done"
          onSubmitEditing={create}
          style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }]}
        />
        <Button label="Create" onPress={create} disabled={!name.trim() || busy} />
      </View>
      {renderBody()}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  create: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  input: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
  list: {
    paddingBottom: Spacing.four,
  },
});
