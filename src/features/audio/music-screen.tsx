import { useCallback } from 'react';

import { SegmentedControl, type Segment } from '@/components/ui/segmented-control';
import { useAppDispatch, useAppSelector } from '@/store';
import { setMusicSegment, type MusicSegment } from '@/store/ui-slice';

import { AlbumListScreen } from './album-list-screen';
import { AudioFoldersScreen } from './audio-folders-screen';
import { PlaylistsScreen } from './playlists-screen';
import { TrackListScreen } from './track-list-screen';

const SEGMENTS: Segment<MusicSegment>[] = [
  { key: 'tracks', label: 'Tracks' },
  { key: 'albums', label: 'Albums' },
  { key: 'playlists', label: 'Playlists' },
  { key: 'folders', label: 'Folders' },
];

/** The Music tab: one tab holding the three views of the music library. */
export function MusicScreen() {
  const dispatch = useAppDispatch();
  const segment = useAppSelector((state) => state.ui.musicSegment);
  const select = useCallback((next: MusicSegment) => dispatch(setMusicSegment(next)), [dispatch]);

  const segments = <SegmentedControl options={SEGMENTS} value={segment} onChange={select} label="Music view" />;

  if (segment === 'albums') return <AlbumListScreen segments={segments} />;
  if (segment === 'playlists') return <PlaylistsScreen segments={segments} />;
  if (segment === 'folders') return <AudioFoldersScreen segments={segments} />;
  return <TrackListScreen title="Music" allowFavoritesFilter segments={segments} />;
}
