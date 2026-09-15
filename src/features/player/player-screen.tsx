import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppSelector } from '@/store';
import type { QueueItem } from '@/store/play-queue-slice';

import { PlayerSession } from './player-session';
import { useImmersiveMode } from './use-immersive-mode';
import { useOrientationLock } from './use-orientation-lock';
import { useSystemControls } from './use-system-controls';

type PlayerScreenProps = { uri?: string; title?: string };

/**
 * Holds what outlives a single video (immersive mode, brightness, control and rotation locks) and
 * moves through the play queue by remounting PlayerSession.
 */
export function PlayerScreen({ uri, title }: PlayerScreenProps) {
  const router = useRouter();
  const theme = useTheme();
  const queue = useAppSelector((state) => state.playQueue.items);
  const autoPlayNext = useAppSelector((state) => state.settings.autoPlayNext);
  const [current, setCurrent] = useState<QueueItem | null>(uri ? { uri, title: title ?? 'Video' } : null);
  const [locked, setLocked] = useState(false);
  const system = useSystemControls();
  const rotation = useOrientationLock();
  useImmersiveMode();

  const goBack = useCallback(() => router.back(), [router]);
  const toggleLock = useCallback(() => setLocked((value) => !value), []);

  if (!current) {
    return (
      <View style={[styles.root, styles.centered, { backgroundColor: theme.playerBackground }]}>
        <ThemedText style={{ color: theme.playerText }}>No video was selected.</ThemedText>
        <Button label="Go back" onPress={goBack} />
      </View>
    );
  }

  // A video opened outside a list (file picker) is not in the queue, so it gets no previous or next.
  const index = queue.findIndex((item) => item.uri === current.uri);
  const previous = index > 0 ? queue[index - 1] : null;
  const next = index >= 0 && index < queue.length - 1 ? queue[index + 1] : null;

  return (
    <View style={[styles.root, { backgroundColor: theme.playerBackground }]}>
      <StatusBar hidden />
      <PlayerSession
        key={current.uri}
        uri={current.uri}
        title={current.title}
        system={system}
        locked={locked}
        rotationLocked={rotation.locked}
        onBack={goBack}
        onToggleLock={toggleLock}
        onToggleRotation={rotation.toggle}
        onPrevious={previous ? () => setCurrent(previous) : undefined}
        onNext={next ? () => setCurrent(next) : undefined}
        onEnded={next && autoPlayNext ? () => setCurrent(next) : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
});
