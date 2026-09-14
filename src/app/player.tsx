import { useLocalSearchParams } from 'expo-router';

import { PlayerScreen } from '@/features/player/player-screen';

export default function PlayerRoute() {
  const { uri, title } = useLocalSearchParams<{ uri?: string; title?: string }>();
  return <PlayerScreen uri={uri} title={title} />;
}
