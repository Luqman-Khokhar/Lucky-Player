import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { IconButton } from '@/components/ui/icon-button';
import { Spacing } from '@/constants/theme';
import type { LibraryTrack } from '@/db';
import { useTheme } from '@/hooks/use-theme';

import { TrackRow } from './track-row';

type PlaylistTrackRowProps = {
  track: LibraryTrack;
  position: number;
  /** In edit mode the row shows move and remove buttons instead of the favorite button. */
  editing: boolean;
  isFirst: boolean;
  isLast: boolean;
  onPress: (track: LibraryTrack) => void;
  onToggleFavorite: (track: LibraryTrack) => void;
  onMove: (from: number, to: number) => void;
  onRemove: (track: LibraryTrack) => void;
};

export const PlaylistTrackRow = memo(function PlaylistTrackRow({
  track,
  position,
  editing,
  isFirst,
  isLast,
  onPress,
  onToggleFavorite,
  onMove,
  onRemove,
}: PlaylistTrackRowProps) {
  const theme = useTheme();

  if (!editing) {
    return <TrackRow track={track} onPress={onPress} onToggleFavorite={onToggleFavorite} />;
  }

  return (
    <View style={styles.row}>
      <View style={styles.track}>
        <TrackRow track={track} onPress={onPress} onToggleFavorite={onToggleFavorite} />
      </View>
      <IconButton
        icon="arrow_upward"
        label={`Move ${track.title} up`}
        disabled={isFirst}
        color={theme.textSecondary}
        pressedColor={theme.backgroundSelected}
        onPress={() => onMove(position, position - 1)}
      />
      <IconButton
        icon="arrow_downward"
        label={`Move ${track.title} down`}
        disabled={isLast}
        color={theme.textSecondary}
        pressedColor={theme.backgroundSelected}
        onPress={() => onMove(position, position + 1)}
      />
      <IconButton
        icon="close"
        label={`Remove ${track.title} from this playlist`}
        color={theme.textSecondary}
        pressedColor={theme.backgroundSelected}
        onPress={() => onRemove(track)}
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
  track: {
    flex: 1,
  },
});
