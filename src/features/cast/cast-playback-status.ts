import type { CastPlayback } from '@modules/vlc-player';

/** One line for the phone describing what the laptop's video is doing. */
export function castStatusText(playback: CastPlayback): string {
  switch (playback.status) {
    case 'loading':
      return `Starting on ${playback.receiverName}…`;
    case 'blocked':
      return 'Click "Click to play" on the laptop. The browser needs one click before it plays with sound.';
    case 'buffering':
      return 'Buffering…';
    case 'playing':
      return `Playing on ${playback.receiverName}`;
    case 'paused':
      return `Paused on ${playback.receiverName}`;
    case 'ended':
      return 'Finished';
    case 'error':
      return playback.error ?? "The laptop couldn't play this video.";
    case 'disconnected':
      return `${playback.receiverName} lost its connection. It picks up again when it reconnects.`;
  }
}

export function isCastBusy(playback: CastPlayback | null): boolean {
  return playback?.status === 'loading' || playback?.status === 'buffering';
}
