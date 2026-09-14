import type { AspectMode, HwDecodingMode, PlayerTracks } from '@modules/vlc-player';

export type SettingsPage = 'main' | 'audio' | 'subtitles' | 'speed' | 'aspect' | 'decoder';

export type PlayerSettingsValues = {
  tracks: PlayerTracks | null;
  speed: number;
  aspect: AspectMode;
  hwMode: HwDecodingMode;
  /** Decoder actually running, which can differ from hwMode after an automatic fallback. */
  hardwareDecoding: boolean;
  audioDelay: number;
  subtitleDelay: number;
};

export type PlayerSettingsActions = {
  selectAudio: (id: number) => void;
  selectSubtitle: (id: number) => void;
  selectSpeed: (speed: number) => void;
  selectAspect: (aspect: AspectMode) => void;
  selectDecoder: (mode: HwDecodingMode) => void;
  changeAudioDelay: (ms: number) => void;
  changeSubtitleDelay: (ms: number) => void;
};
