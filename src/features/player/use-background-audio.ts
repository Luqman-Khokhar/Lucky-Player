import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useAppSelector } from '@/store';
import VlcPlayer, { type AudioQueueItem } from '@modules/vlc-player';

function warn(scope: string) {
  return (error: unknown) => console.warn(`[player] ${scope}`, error);
}

type BackgroundAudioOptions = {
  uri: string;
  title: string;
  /** Reads the live position and duration; both in milliseconds. */
  getProgress: () => { position: number; duration: number };
  /** Puts the video back where the sound reached and starts it again. */
  onReturn: (positionMs: number) => void;
  paused: boolean;
};

/**
 * Keeps a video's sound going after the app leaves the screen by handing it to the music service, which already
 * owns the notification, the lock-screen controls and audio focus. Coming back does the reverse.
 *
 * The video player stops its own playback when the activity stops, so only one of the two ever holds the file.
 */
export function useBackgroundAudio({ uri, title, getProgress, onReturn, paused }: BackgroundAudioOptions) {
  const enabled = useAppSelector((state) => state.settings.backgroundAudio);
  // Read inside the listener rather than captured, so a toggle mid-playback takes effect immediately.
  const latest = useRef({ enabled, uri, title, getProgress, onReturn, paused });
  const handedOff = useRef(false);

  useEffect(() => {
    latest.current = { enabled, uri, title, getProgress, onReturn, paused };
  });

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      const { enabled: on, uri: source, title: name, getProgress: progress, onReturn: resume, paused: isPaused } =
        latest.current;

      if (next === 'background' || next === 'inactive') {
        if (!on || isPaused || handedOff.current) return;
        const { position, duration } = progress();
        const item: AudioQueueItem = {
          uri: source,
          title: name,
          artist: '',
          album: '',
          artKey: '',
          duration,
          // The picture for a video is a frame, not embedded album art.
          artwork: false,
        };
        handedOff.current = true;
        VlcPlayer.audioSetQueue(JSON.stringify([item]), 0, position, true).catch((error: unknown) => {
          handedOff.current = false;
          warn('could not hand the sound over')(error);
        });
        return;
      }

      if (next === 'active' && handedOff.current) {
        handedOff.current = false;
        VlcPlayer.getAudioState()
          .then((state) => {
            // Only take it back if the service is still on this video; the user may have started music instead.
            if (!state.active || state.uri !== source) return;
            const at = state.positionMs;
            return VlcPlayer.audioStop().then(() => resume(at));
          })
          .catch(warn('could not take the sound back'));
      }
    });

    return () => {
      subscription.remove();
      // Leaving the player screen entirely: the service keeps whatever it was given, so nothing is stopped here.
    };
  }, []);

  return { enabled };
}
