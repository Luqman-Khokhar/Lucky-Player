import type { CastPlayback } from '@modules/vlc-player';

/** One line for the phone describing what the laptop is showing. */
export function castStatusText(playback: CastPlayback): string {
  if (playback.kind === 'screen') return screenStatusText(playback);
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

function screenStatusText(playback: CastPlayback): string {
  switch (playback.status) {
    case 'loading':
      return `Starting screen sharing on ${playback.receiverName}…`;
    case 'buffering':
      return 'Catching up…';
    case 'error':
      return playback.error ?? "The laptop couldn't show the screen.";
    case 'disconnected':
      return `${playback.receiverName} lost its connection. Screen sharing carries on when it reconnects.`;
    case 'blocked':
      return 'Click "Click to play" on the laptop. The browser needs one click before it shows the screen with sound.';
    default:
      return `Your screen is showing on ${playback.receiverName}`;
  }
}

export function isCastBusy(playback: CastPlayback | null): boolean {
  return playback?.status === 'loading' || playback?.status === 'buffering';
}
