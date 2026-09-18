import { useLocalSearchParams, useRouter } from 'expo-router';

import { TrackListScreen } from '@/features/audio/track-list-screen';

export default function AlbumRoute() {
  const { albumId, name, artist } = useLocalSearchParams<{ albumId: string; name?: string; artist?: string }>();
  const router = useRouter();
  return (
    <TrackListScreen
      key={albumId}
      title={name ?? 'Album'}
      subtitleOverride={artist || undefined}
      albumId={Number(albumId)}
      onBack={() => router.back()}
    />
  );
}
