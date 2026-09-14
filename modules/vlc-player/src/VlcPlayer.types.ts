import type { StyleProp, ViewStyle } from 'react-native';

export type AspectMode = 'fit' | 'fill' | 'fitScreen' | '16:9' | '4:3' | 'original';
export type HwDecodingMode = 'auto' | 'hw' | 'sw';
export type PlaybackState = 'opening' | 'playing' | 'paused' | 'stopped' | 'ended';

export type TrackDescription = { id: number; name: string };

export type PlayerTracks = {
  audio: TrackDescription[];
  subtitle: TrackDescription[];
  selectedAudio: number;
  selectedSubtitle: number;
};

export type LoadEventPayload = {
  duration: number;
  seekable: boolean;
  width: number;
  height: number;
  videoCodec: string;
  hardwareDecoding: boolean;
  tracks: PlayerTracks;
};

export type ProgressEventPayload = { position: number; duration: number };
export type BufferingEventPayload = { percent: number };
export type PlaybackStateEventPayload = { state: PlaybackState };
export type ErrorEventPayload = { code: 'open_failed' | 'permission_denied' | 'playback_error'; message: string };
export type DecoderFallbackEventPayload = {
  reason: 'playback_error' | 'no_video_output';
  codec: string;
  position: number;
};

type NativeEventHandler<T> = (event: { nativeEvent: T }) => void;

export type VlcPlayerViewRef = {
  seek(positionMs: number): Promise<void>;
  addSubtitle(uri: string): Promise<boolean>;
};

export type VlcPlayerViewProps = {
  source: string | null;
  /** Milliseconds. Read only when the source loads. */
  startPosition?: number;
  paused?: boolean;
  /** 0.25 – 4 */
  rate?: number;
  /** 0 – 200 */
  volume?: number;
  aspect?: AspectMode;
  hwDecoding?: HwDecodingMode;
  audioTrack?: number;
  /** -1 disables subtitles */
  subtitleTrack?: number;
  /** Milliseconds, positive delays audio */
  audioDelay?: number;
  /** Milliseconds, positive delays subtitles */
  subtitleDelay?: number;
  onLoad?: NativeEventHandler<LoadEventPayload>;
  onProgress?: NativeEventHandler<ProgressEventPayload>;
  onBuffering?: NativeEventHandler<BufferingEventPayload>;
  onPlaybackStateChange?: NativeEventHandler<PlaybackStateEventPayload>;
  onEnd?: NativeEventHandler<Record<string, never>>;
  onError?: NativeEventHandler<ErrorEventPayload>;
  onDecoderFallback?: NativeEventHandler<DecoderFallbackEventPayload>;
  onTracksChanged?: NativeEventHandler<PlayerTracks>;
  style?: StyleProp<ViewStyle>;
};

export type HardwareDecoder = {
  codec: string;
  name: string;
  hardware: boolean;
  maxWidth: number;
  maxHeight: number;
  tenBit: boolean;
};

export type DeviceProfile = {
  manufacturer: string;
  brand: string;
  model: string;
  device: string;
  hardware: string;
  board: string;
  socManufacturer: string;
  socModel: string;
  androidVersion: string;
  sdkInt: number;
  isTranssion: boolean;
  isMediaTek: boolean;
  totalRamMb: number;
  lowRamDevice: boolean;
  refreshRates: number[];
  currentRefreshRate: number;
  supportedAbis: string[];
  libVlcVersion: string;
  hardwareDecoders: HardwareDecoder[];
};

export type ScannedVideo = {
  mediaId: number;
  /** content://media/external/video/media/<id> */
  uri: string;
  name: string;
  size: number;
  /** Milliseconds */
  duration: number;
  width: number;
  height: number;
  /** Epoch milliseconds */
  modifiedAt: number;
  addedAt: number;
  mimeType: string;
  bucketId: string;
  bucketName: string;
  relativePath: string;
};

export type PickedVideo = {
  uri: string;
  name: string;
  /** Bytes, -1 when the provider does not report it */
  size: number;
  mimeType: string;
  /** false when Android refused a persistable grant; resume after restart then relies on READ_MEDIA_VIDEO */
  persisted: boolean;
};

export type VideoTrackInfo ={ id: number; codec: string; width: number; height: number; fps: number; bitrate: number };
export type AudioTrackInfo = {
  id: number;
  codec: string;
  language: string;
  description: string;
  channels: number;
  sampleRate: number;
};
export type SubtitleTrackInfo = { id: number; codec: string; language: string; description: string };

export type MediaInfo = {
  duration: number;
  video: VideoTrackInfo[];
  audio: AudioTrackInfo[];
  subtitle: SubtitleTrackInfo[];
};
