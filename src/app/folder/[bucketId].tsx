import { useLocalSearchParams, useRouter } from 'expo-router';

import { VideoListScreen } from '@/features/library/video-list-screen';

export default function FolderRoute() {
  const { bucketId, name } = useLocalSearchParams<{ bucketId: string; name?: string }>();
  const router = useRouter();
  return <VideoListScreen key={bucketId} title={name ?? 'Folder'} bucketId={bucketId} onBack={() => router.back()} />;
}
