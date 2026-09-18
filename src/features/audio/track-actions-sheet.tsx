import { BottomSheet } from '@/components/ui/bottom-sheet';
import type { LibraryTrack } from '@/db';

import { SheetAction } from './sheet-action';

type TrackActionsSheetProps = {
  track: LibraryTrack | null;
  onClose: () => void;
  onPlayNext: (track: LibraryTrack) => void;
  onAddToQueue: (track: LibraryTrack) => void;
  onAddToPlaylist: (track: LibraryTrack) => void;
  onToggleFavorite: (track: LibraryTrack) => void;
};

/** The ⋮ menu on a track row. */
export function TrackActionsSheet({
  track,
  onClose,
  onPlayNext,
  onAddToQueue,
  onAddToPlaylist,
  onToggleFavorite,
}: TrackActionsSheetProps) {
  return (
    <BottomSheet open={track !== null} title={track?.title ?? ''} onClose={onClose}>
      {track ? (
        <>
          <SheetAction
            icon="playlist_play"
            label="Play next"
            hint="Right after the track playing now"
            onPress={() => onPlayNext(track)}
          />
          <SheetAction icon="queue_music" label="Add to queue" hint="At the end" onPress={() => onAddToQueue(track)} />
          <SheetAction icon="playlist_add" label="Add to playlist" onPress={() => onAddToPlaylist(track)} />
          <SheetAction
            icon={track.favorite ? 'heart_minus' : 'heart_plus'}
            label={track.favorite ? 'Remove from favorites' : 'Add to favorites'}
            onPress={() => onToggleFavorite(track)}
          />
        </>
      ) : null}
    </BottomSheet>
  );
}
