import { useCallback, useEffect, useRef, useState } from 'react';
import { useWindowDimensions } from 'react-native';

import { useAppSelector } from '@/store';
import VlcPlayer, {
  type AspectMode,
  type ErrorEventPayload,
  type HwDecodingMode,
  type PlaybackState,
  type PlayerTracks,
  type VlcPlayerViewProps,
  type VlcPlayerViewRef,
} from '@modules/vlc-player';

import type { PlayerSettingsActions, PlayerSettingsValues } from './settings-sheet/settings-types';
import { usePictureInPicture } from './use-picture-in-picture';
import { usePlaybackSession } from './use-playback-session';

const NOTICE_MS = 4000;
const BOOST_RATE = 2;

type MediaSummary = { codec: string; width: number; height: number; frameRate: number; hardware: boolean };
type Handler<K extends keyof VlcPlayerViewProps> = NonNullable<VlcPlayerViewProps[K]>;

/** Owns playback state for one video and exposes native view props plus user actions. */
export function usePlayerController(uri: string | undefined, onEnded?: () => void) {
  const settings = useAppSelector((state) => state.settings);
  const { width, height } = useWindowDimensions();
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
  // Once the aspect ratio is picked by hand, rotating no longer changes it for the rest of this video.
  const aspectChosen = useRef(false);
  const [zoom, setZoom] = useState(1);
  const [boosted, setBoosted] = useState(false);
  const [hwOverride, setHwOverride] = useState<HwDecodingMode | null>(null);
  // Null until the user changes it; the video's remembered value applies meanwhile.
  const [audioDelayOverride, setAudioDelay] = useState<number | null>(null);
  const [subtitleDelayOverride, setSubtitleDelay] = useState<number | null>(null);
  const [error, setError] = useState<ErrorEventPayload | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [externalSubtitle, setExternalSubtitle] = useState<string | null>(null);

  const hwMode = hwOverride ?? prepared?.hwMode ?? settings.hwDecoding;
  const remembered = prepared?.choices;
  const activeAudioTrack = audioTrack ?? remembered?.audioTrack ?? undefined;
  // A subtitle file loaded in this session replaces the remembered track choice.
  const activeSubtitleTrack = externalSubtitle ? subtitleTrack : (subtitleTrack ?? remembered?.subtitleTrack ?? undefined);
  const activeExternalSubtitle = externalSubtitle ?? remembered?.subtitleUri ?? undefined;
  const audioDelay = audioDelayOverride ?? remembered?.audioDelay ?? 0;
  const subtitleDelay = subtitleDelayOverride ?? remembered?.subtitleDelay ?? 0;

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(id);
  }, [notice]);

  // Turning the phone sideways fills the screen, cropping the edges, and turning it back restores the fit.
  // The rotation lock keeps the window in one orientation, so locking it also stops this.
  const landscape = width > height;
  useEffect(() => {
    if (aspectChosen.current) return;
    setAspect(landscape ? 'fitScreen' : settings.defaultAspect);
    setZoom(1);
  }, [landscape, settings.defaultAspect]);

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

  /**
   * Puts the video back at `positionMs` and plays it, reopening the media rather than seeking the existing one:
   * libVLC does not recover its video output after the surface is destroyed and recreated, so a plain seek comes
   * back as sound over a black picture.
   */
  const resumeAt = useCallback(
    (positionMs: number) => {
      const { duration } = progressRef.current;
      reportProgress(positionMs, duration);
      setProgress({ position: positionMs, duration });
      setPaused(false);
      setError(null);
      setPlaybackState('opening');
      restartFromCurrent();
      setAttempt((value) => value + 1);
    },
    [progressRef, reportProgress, restartFromCurrent]
  );

  const retry = useCallback(() => {
    restartFromCurrent();
    setError(null);
    setPlaybackState('opening');
    setAttempt((value) => value + 1);
  }, [restartFromCurrent]);

  const pictureInPicture = usePictureInPicture({
    playing: playbackState === 'playing' && !paused,
    paused,
    width: media?.width ?? 0,
    height: media?.height ?? 0,
    skipSeconds: settings.seekStepSec,
    onClosed: () => setPaused(true),
  });

  const onLoad: Handler<'onLoad'> = ({ nativeEvent }) => {
    setTracks(nativeEvent.tracks);
    setMedia({
      codec: nativeEvent.videoCodec,
      width: nativeEvent.width,
      height: nativeEvent.height,
      frameRate: nativeEvent.frameRate,
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
  // Skips need no mirroring: the next progress event carries the new position.
  const onPlaybackControl: Handler<'onPlaybackControl'> = ({ nativeEvent }) => {
    setPaused(nativeEvent.paused);
    if (nativeEvent.action === 'blocked') setNotice("Can't play right now: a call or another app is using the audio.");
  };

  const enterPictureInPicture = async () => {
    if (await pictureInPicture.enter()) return;
    setNotice('Picture-in-picture is turned off for this app. Turn it on in the settings screen that opened.');
    VlcPlayer.openPictureInPictureSettings().catch(() => undefined);
  };

  const loadSubtitleFile = async () => {
    try {
      const picked = await VlcPlayer.pickSubtitle();
      if (!picked) return;
      const added = (await playerRef.current?.addSubtitle(picked.uri)) ?? false;
      if (!added) {
        setNotice(`Couldn't load ${picked.name}. Check that it is a subtitle file.`);
        return;
      }
      setExternalSubtitle(picked.uri);
      setSubtitleTrack(undefined);
      saveChoices({ subtitleUri: picked.uri, subtitleTrack: null });
      setNotice(`Loaded ${picked.name}`);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Could not open the file picker.');
    }
  };

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
      aspectChosen.current = true;
      setAspect(mode);
      setZoom(1);
    },
    selectDecoder: (mode) => {
      setHwOverride(mode);
      saveChoices({ hwMode: mode });
    },
    changeAudioDelay: (ms) => {
      setAudioDelay(ms);
      saveChoices({ audioDelay: ms });
    },
    changeSubtitleDelay: (ms) => {
      setSubtitleDelay(ms);
      saveChoices({ subtitleDelay: ms });
    },
    loadSubtitleFile,
  };

  const settingsValues: PlayerSettingsValues = {
    tracks,
    speed,
    aspect,
    hwMode,
    hardwareDecoding: media?.hardware ?? hwMode !== 'sw',
    codec: media?.codec ?? '',
    audioDelay,
    subtitleDelay,
  };

  const playerProps: Omit<VlcPlayerViewProps, 'style'> | null =
    prepared && uri
      ? {
          source: uri,
          startPosition: prepared.startPosition,
          externalSubtitle: activeExternalSubtitle,
          matchFrameRate: settings.matchFrameRate,
          skipSeconds: settings.seekStepSec,
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
          onPictureInPictureChange: pictureInPicture.onChange,
          onPlaybackControl,
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
    resumeAt,
    retry,
    settingsActions,
    pictureInPicture: {
      supported: pictureInPicture.supported,
      active: pictureInPicture.active,
      enter: enterPictureInPicture,
    },
  };
}
