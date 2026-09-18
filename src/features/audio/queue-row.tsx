import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { Radius, Spacing } from '@/constants/theme';
import { formatTime } from '@/features/player/format-time';
import { useTheme } from '@/hooks/use-theme';
import type { AudioQueueEntry } from '@modules/vlc-player';

type QueueRowProps = {
  entry: AudioQueueEntry;
  playing: boolean;
  isFirst: boolean;
  isLast: boolean;
  onPlay: (index: number) => void;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
};

/**
 * Reordering is done with move buttons rather than dragging: they work with a screen reader and with one
 * hand, and the project has no drag-and-drop library to lean on.
 */
export const QueueRow = memo(function QueueRow({
  entry,
  playing,
  isFirst,
  isLast,
  onPlay,
  onMove,
  onRemove,
}: QueueRowProps) {
  const theme = useTheme();

  return (
    <View style={[styles.row, playing && { backgroundColor: theme.accentSoft }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: playing }}
        accessibilityLabel={`${entry.title}, ${entry.artist || 'unknown artist'}, ${formatTime(entry.duration)}`}
        accessibilityHint={playing ? 'Playing now' : 'Plays this track'}
        onPress={() => onPlay(entry.index)}
        style={({ pressed }) => [styles.main, pressed && { backgroundColor: theme.backgroundSelected }]}>
        <View style={styles.marker}>
          {playing ? (
            <Icon name="equalizer" size={18} color={theme.accentText} />
          ) : (
            <ThemedText type="small" themeColor="textSecondary" style={styles.position}>
              {entry.index + 1}
            </ThemedText>
          )}
        </View>
        <View style={styles.text}>
          <ThemedText
            type="small"
            numberOfLines={1}
            style={[styles.title, playing && { color: theme.accentText }]}>
            {entry.title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {entry.artist || 'Unknown artist'}
          </ThemedText>
        </View>
      </Pressable>
      <IconButton
        icon="arrow_upward"
        label={`Move ${entry.title} up`}
        disabled={isFirst}
        color={theme.textSecondary}
        pressedColor={theme.backgroundSelected}
        onPress={() => onMove(entry.index, entry.index - 1)}
      />
      <IconButton
        icon="arrow_downward"
        label={`Move ${entry.title} down`}
        disabled={isLast}
        color={theme.textSecondary}
        pressedColor={theme.backgroundSelected}
        onPress={() => onMove(entry.index, entry.index + 1)}
      />
      <IconButton
        icon="close"
        label={`Remove ${entry.title} from the queue`}
        color={theme.textSecondary}
        pressedColor={theme.backgroundSelected}
        onPress={() => onRemove(entry.index)}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: Spacing.one,
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.md,
  },
  marker: {
    width: 28,
    alignItems: 'center',
  },
  position: {
    fontVariant: ['tabular-nums'],
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
  title: {
    fontWeight: 600,
  },
});
