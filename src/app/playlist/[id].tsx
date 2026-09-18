import { useLocalSearchParams } from 'expo-router';

import { PlaylistDetailScreen } from '@/features/audio/playlist-detail-screen';

export default function PlaylistRoute() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  return <PlaylistDetailScreen key={id} playlistId={Number(id)} name={name ?? 'Playlist'} />;
}
