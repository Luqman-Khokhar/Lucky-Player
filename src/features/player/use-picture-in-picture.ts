import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import VlcPlayer, { type VlcPlayerViewProps } from '@modules/vlc-player';

// Leaving picture-in-picture is reported before the app resumes; wait before deciding the window was closed.
const CLOSE_CHECK_MS = 600;

type Options = {
  playing: boolean;
  paused: boolean;
  width: number;
  height: number;
  skipSeconds: number;
  /** The picture-in-picture window was dismissed instead of expanded back into the app. */
  onClosed: () => void;
  /** Mirrors a play/pause the native player already applied from the window buttons. */
  onPausedChange: (paused: boolean) => void;
};

function warn(scope: string) {
  return (error: unknown) => console.warn(`[picture-in-picture] ${scope}`, error);
}

/**
 * Auto-enters picture-in-picture when the user leaves the app mid-playback, keeps the window's back, play/pause and
 * forward buttons in sync, and tracks whether the window is showing.
 */
export function usePictureInPicture(options: Options) {
  const { playing, paused, width, height, skipSeconds, onClosed, onPausedChange } = options;
  const [supported] = useState(() => VlcPlayer.isPictureInPictureSupported());
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!supported) return;
    VlcPlayer.setAutoPictureInPicture(playing, width, height).catch(warn('auto-enter'));
  }, [supported, playing, width, height]);

  useEffect(() => {
    if (!supported) return;
    VlcPlayer.setPictureInPicturePlayback(paused, skipSeconds).catch(warn('controls'));
  }, [supported, paused, skipSeconds]);

  useEffect(() => {
    if (!supported) return;
    return () => {
      VlcPlayer.setAutoPictureInPicture(false, 0, 0).catch(warn('auto-enter off'));
    };
  }, [supported]);

  const enter = useCallback(
    () => VlcPlayer.enterPictureInPicture(width, height).catch(() => false),
    [width, height]
  );

  const onChange: NonNullable<VlcPlayerViewProps['onPictureInPictureChange']> = ({ nativeEvent }) => {
    setActive(nativeEvent.active);
    if (nativeEvent.active) return;
    setTimeout(() => {
      if (AppState.currentState !== 'active') onClosed();
    }, CLOSE_CHECK_MS);
  };

  // Skips need no mirroring: the next progress event carries the new position.
  const onAction: NonNullable<VlcPlayerViewProps['onPictureInPictureAction']> = ({ nativeEvent }) => {
    if (nativeEvent.action === 'toggle') onPausedChange(nativeEvent.paused);
  };

  return { supported, active, enter, onChange, onAction };
}
