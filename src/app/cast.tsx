import { useLocalSearchParams } from 'expo-router';

import { CastScreen } from '@/features/cast/cast-screen';

export default function CastRoute() {
  // Set when the player opened this screen to choose a laptop for its video.
  const { uri, title, startMs, durationMs } = useLocalSearchParams<{
    uri?: string;
    title?: string;
    startMs?: string;
    durationMs?: string;
  }>();
  const pending = uri
    ? { uri, title: title ?? 'Video', startMs: Number(startMs) || 0, durationMs: Number(durationMs) || 0 }
    : undefined;
  return <CastScreen pending={pending} />;
}
