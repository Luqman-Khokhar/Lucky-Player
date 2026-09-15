import { useEffect } from 'react';

import { useAppSelector } from '@/store';
import VlcPlayer from '@modules/vlc-player';

import { subtitleRgbFor, subtitleScaleFor } from './subtitle-style';

/** Hands the subtitle style settings to libVLC whenever they change. Renders nothing. */
export function SubtitleStyleSync() {
  const size = useAppSelector((state) => state.settings.subtitleSize);
  const color = useAppSelector((state) => state.settings.subtitleColor);
  const background = useAppSelector((state) => state.settings.subtitleBackground);

  useEffect(() => {
    VlcPlayer.configureSubtitles(subtitleScaleFor(size), subtitleRgbFor(color), background).catch((error: unknown) =>
      console.warn('[subtitles] style update failed', error)
    );
  }, [size, color, background]);

  return null;
}
