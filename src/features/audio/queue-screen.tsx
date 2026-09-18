import { FlashList } from '@shopify/flash-list';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { ScreenHeader } from '@/components/ui/screen-header';
import { StateView } from '@/components/ui/state-view';
import { Spacing } from '@/constants/theme';
import { useGoBack } from '@/hooks/use-go-back';
import { useAppSelector } from '@/store';
import VlcPlayer, { type AudioQueueEntry } from '@modules/vlc-player';

import { QueueRow } from './queue-row';

function warn(scope: string) {
  return (error: unknown) => console.warn(`[audio] ${scope}`, error);
}

/** What is playing and what comes next. The native service owns the queue; this reads and edits it. */
export function QueueScreen() {
  const goBack = useGoBack();
  const { index, queueVersion, queueSize } = useAppSelector((state) => state.audio);
  const [queue, setQueue] = useState<AudioQueueEntry[] | null>(null);

  // The queue is re-read whenever the service says it changed, rather than shipped on every position tick.
  useEffect(() => {
    let cancelled = false;
    VlcPlayer.getAudioQueue()
      .then((entries) => {
        if (!cancelled) setQueue(entries);
      })
      .catch(warn('could not read the queue'));
    return () => {
      cancelled = true;
    };
  }, [queueVersion, queueSize]);

  const play = useCallback((at: number) => VlcPlayer.audioPlayIndex(at).catch(warn('play')), []);
  const move = useCallback((from: number, to: number) => VlcPlayer.audioQueueMove(from, to).catch(warn('move')), []);
  const remove = useCallback((at: number) => VlcPlayer.audioQueueRemove(at).catch(warn('remove')), []);

  const renderBody = () => {
    if (queue === null) return <StateView loading title="Loading the queue…" />;
    if (queue.length === 0) {
      return (
        <StateView
          icon="queue_music"
          title="The queue is empty"
          message="Tracks you play, queue or add from a playlist show up here."
        />
      );
    }
    return (
      <FlashList
        data={queue}
        extraData={index}
        keyExtractor={(entry) => `${entry.index}-${entry.uri}`}
        renderItem={({ item }) => (
          <QueueRow
            entry={item}
            playing={item.index === index}
            isFirst={item.index === 0}
            isLast={item.index === queue.length - 1}
            onPlay={play}
            onMove={move}
            onRemove={remove}
          />
        )}
        contentContainerStyle={styles.list}
      />
    );
  };

  return (
    <ThemedView style={styles.root}>
      <ScreenHeader
        title="Queue"
        subtitle={queue?.length ? `${(index ?? 0) + 1} of ${queue.length}` : undefined}
        onBack={goBack}
      />
      {renderBody()}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  list: {
    paddingBottom: Spacing.four,
  },
});
