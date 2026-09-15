import { useCallback, useEffect, useRef, useState } from 'react';

import { useAppSelector } from '@/store';
import type {
  AspectMode,
  ErrorEventPayload,
  HwDecodingMode,
  PlaybackState,
  PlayerTracks,
  VlcPlayerViewProps,
  VlcPlayerViewRef,
} from '@modules/vlc-player';

import type { PlayerSettingsActions, PlayerSettingsValues } from './settings-sheet/settings-types';
import { usePlaybackSession } from './use-playback-session';

const NOTICE_MS = 4000;
const BOOST_RATE = 2;

type MediaSummary = { codec: string; width: number; height: number; hardware: boolean };
type Handler<K extends keyof VlcPlayerViewProps> = NonNullable<VlcPlayerViewProps[K]>;

/** Owns playback state for one video and exposes native view props plus user actions. */
export function usePlayerController(uri: string | undefined, onEnded?: () => void) {
  const settings = useAppSelector((state) => state.settings);
  const { prepared, progressRef, reportProgress, markEnded, rememberFallback, restartFromCurrent, saveChoices } =
    usePlaybackSession(uri, settings);
  const playerRef = useRef<VlcPlayerViewRef>(null);

  const [attempt, setAttempt] = useState(0);
  const [playbackState, setPlaybackState] = useState<PlaybackState>('opening');
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState({ position: 0, duration: 0 });
  const [media, setMedia] = useState<MediaSummary | null>(null);
  const [tracks, setTracks] = useState<PlayerTracks | null>(null);
  const [audioTrack, setAudioTrack] = useState<number>();
  const [subtitleTrack, setSubtitleTrack] = useState<number>();
  const [speed, setSpeed] = useState(1);
  const [aspect, setAspect] = useState<AspectMode>(settings.defaultAspect);
  const [zoom, setZoom] = useState(1);
  const [boosted, setBoosted] = useState(false);
  const [hwOverride, setHwOverride] = useState<HwDecodingMode | null>(null);
  // Null until the user changes it; the video's remembered value applies meanwhile.
  const [audioDelayOverride, setAudioDelay] = useState<number | null>(null);
  const [subtitleDelayOverride, setSubtitleDelay] = useState<number | null>(null);
  const [error, setError] = useState<ErrorEventPayload | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const hwMode = hwOverride ?? prepared?.hwMode ?? settings.hwDecoding;
  const remembered = prepared?.choices;
  const activeAudioTrack = audioTrack ?? remembered?.audioTrack ?? undefined;
  const activeSubtitleTrack = subtitleTrack ?? remembered?.subtitleTrack ?? undefined;
  const audioDelay = audioDelayOverride ?? remembered?.audioDelay ?? 0;
  const subtitleDelay = subtitleDelayOverride ?? remembered?.subtitleDelay ?? 0;

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(id);
  }, [notice]);

  const seekTo = useCallback(
    (positionMs: number) => {
      const { duration } = progressRef.current;
      const target = Math.max(0, duration > 0 ? Math.min(positionMs, duration) : positionMs);
      reportProgress(target, duration);
      setProgress({ position: target, duration });
      playerRef.current?.seek(target).catch(() => undefined);
    },
    [progressRef, reportProgress]
  );

  const skip = useCallback((deltaMs: number) => seekTo(progressRef.current.position + deltaMs), [progressRef, seekTo]);
  const getProgress = useCallback(() => progressRef.current, [progressRef]);
  const togglePlay = useCallback(() => setPaused((value) => !value), []);

  const retry = useCallback(() => {
    restartFromCurrent();
    setError(null);
    setPlaybackState('opening');
    setAttempt((value) => value + 1);
  }, [restartFromCurrent]);

  const onLoad: Handler<'onLoad'> = ({ nativeEvent }) => {
    setTracks(nativeEvent.tracks);
    setMedia({
      codec: nativeEvent.videoCodec,
      width: nativeEvent.width,
      height: nativeEvent.height,
      hardware: nativeEvent.hardwareDecoding,
    });
    reportProgress(progressRef.current.position, nativeEvent.duration);
    setProgress((current) => ({ ...current, duration: nativeEvent.duration }));
  };
  const onProgress: Handler<'onProgress'> = ({ nativeEvent }) => {
    reportProgress(nativeEvent.position, nativeEvent.duration);
    setProgress(nativeEvent);
  };
  const onPlaybackStateChange: Handler<'onPlaybackStateChange'> = ({ nativeEvent }) => setPlaybackState(nativeEvent.state);
  const onTracksChanged: Handler<'onTracksChanged'> = ({ nativeEvent }) => setTracks(nativeEvent);
  const onEnd: Handler<'onEnd'> = () => {
    markEnded();
    setPaused(true);
    onEnded?.();
  };
  const onDecoderFallback: Handler<'onDecoderFallback'> = ({ nativeEvent }) => {
    rememberFallback(nativeEvent);
    setMedia((current) => current && { ...current, hardware: false });
    setNotice(`Hardware decoder failed${nativeEvent.codec ? ` for ${nativeEvent.codec}` : ''}. Switched to software.`);
  };
  const onError: Handler<'onError'> = ({ nativeEvent }) => setError(nativeEvent);

  const settingsActions: PlayerSettingsActions = {
    selectAudio: (id) => {
      setAudioTrack(id);
      setTracks((current) => current && { ...current, selectedAudio: id });
      saveChoices({ audioTrack: id });
    },
    selectSubtitle: (id) => {
      setSubtitleTrack(id);
      setTracks((current) => current && { ...current, selectedSubtitle: id });
      saveChoices({ subtitleTrack: id });
    },
    selectSpeed: setSpeed,
    selectAspect: (mode) => {
      setAspect(mode);
      setZoom(1);
    },
    selectDecoder: setHwOverride,
    changeAudioDelay: (ms) => {
      setAudioDelay(ms);
      saveChoices({ audioDelay: ms });
    },
    changeSubtitleDelay: (ms) => {
      setSubtitleDelay(ms);
      saveChoices({ subtitleDelay: ms });
    },
  };

  const settingsValues: PlayerSettingsValues = {
    tracks,
    speed,
    aspect,
    hwMode,
    hardwareDecoding: media?.hardware ?? hwMode !== 'sw',
    audioDelay,
    subtitleDelay,
  };

  const playerProps: Omit<VlcPlayerViewProps, 'style'> | null =
    prepared && uri
      ? {
          source: uri,
          startPosition: prepared.startPosition,
          paused,
          rate: boosted ? BOOST_RATE : speed,
          aspect,
          zoom,
          hwDecoding: hwMode,
          audioTrack: activeAudioTrack,
          subtitleTrack: activeSubtitleTrack,
          audioDelay,
          subtitleDelay,
          onLoad,
          onProgress,
          onPlaybackStateChange,
          onTracksChanged,
          onEnd,
          onDecoderFallback,
          onError,
        }
      : null;

  return {
    playerKey: attempt,
    playerRef,
    playerProps,
    state: { playbackState, paused, progress, media, error, notice, settingsValues, zoom },
    skipMs: settings.seekStepSec * 1000,
    getProgress,
    setZoom,
    setBoosted,
    seekTo,
    skip,
    togglePlay,
    retry,
    settingsActions,
  };
}
