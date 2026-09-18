import { useLocalSearchParams, useRouter } from 'expo-router';

import { TrackListScreen } from '@/features/audio/track-list-screen';

export default function MusicFolderRoute() {
  const { bucketId, name } = useLocalSearchParams<{ bucketId: string; name?: string }>();
  const router = useRouter();
  return <TrackListScreen key={bucketId} title={name ?? 'Folder'} bucketId={bucketId} onBack={() => router.back()} />;
}
