import { useCallback, useEffect, useRef, useState } from 'react';

import {
  addSoftwareDecoderCodec,
  getPlaybackState,
  getSoftwareDecoderCodecs,
  savePlaybackChoices,
  savePlaybackState,
  type PlaybackChoices,
} from '@/db';
import VlcPlayer, { type DecoderFallbackEventPayload, type HwDecodingMode } from '@modules/vlc-player';

const SAVE_INTERVAL_MS = 5000;
const RESUME_MIN_MS = 5000;
const RESUME_END_GUARD_MS = 10000;

const NO_CHOICES: PlaybackChoices = {
  audioTrack: null,
  subtitleTrack: null,
  audioDelay: 0,
  subtitleDelay: 0,
  hwMode: null,
  subtitleUri: null,
};
const HW_MODES: readonly (HwDecodingMode | null)[] = ['auto', 'hw', 'sw'];

export type PreparedSession = { startPosition: number; hwMode: HwDecodingMode; choices: PlaybackChoices };

type Options = { hwDecoding: HwDecodingMode; resumePlayback: boolean };

function warn(scope: string) {
  return (error: unknown) => console.warn(`[playback-session] ${scope}`, error);
}

/** Where a video resumes: its saved position, unless that is right at the start or near the end. */
export function resumePosition(saved: { position: number } | null, duration: number): number {
  return saved && saved.position >= RESUME_MIN_MS && (duration <= 0 || saved.position < duration - RESUME_END_GUARD_MS)
    ? saved.position
    : 0;
}

/** Resolves resume position + decoder mode before mount, and persists progress while playing. */
export function usePlaybackSession(uri: string | undefined, { hwDecoding, resumePlayback }: Options) {
  const [prepared, setPrepared] = useState<PreparedSession | null>(null);
  const progressRef = useRef({ position: 0, duration: 0 });

  useEffect(() => {
    if (!uri) return;
    let cancelled = false;
    (async () => {
      const [saved, blockedCodecs, info] = await Promise.all([
        getPlaybackState(uri).catch(() => null),
        getSoftwareDecoderCodecs().catch((): string[] => []),
        VlcPlayer.getMediaInfo(uri).catch(() => null),
      ]);
      if (cancelled) return;
      const duration = info?.duration || saved?.duration || 0;
      const resumeAt = resumePlayback ? resumePosition(saved, duration) : 0;
      const codec = info?.video[0]?.codec.trim().toLowerCase() ?? '';
      const knownBad = hwDecoding === 'auto' && codec !== '' && blockedCodecs.includes(codec);
      progressRef.current = { position: resumeAt, duration };
      const choices: PlaybackChoices = saved
        ? {
            audioTrack: saved.audioTrack,
            subtitleTrack: saved.subtitleTrack,
            audioDelay: saved.audioDelay,
            subtitleDelay: saved.subtitleDelay,
            hwMode: HW_MODES.includes(saved.hwMode) ? saved.hwMode : null,
            subtitleUri: saved.subtitleUri,
          }
        : NO_CHOICES;
      // A decoder picked for this video wins over the app default and the failed-codec list.
      setPrepared({ startPosition: resumeAt, hwMode: choices.hwMode ?? (knownBad ? 'sw' : hwDecoding), choices });
    })();
    return () => {
      cancelled = true;
    };
  }, [uri, hwDecoding, resumePlayback]);

  useEffect(() => {
    if (!uri) return;
    const save = () => {
      const { position, duration } = progressRef.current;
      if (duration > 0) savePlaybackState(uri, position, duration).catch(warn('save'));
    };
    const id = setInterval(save, SAVE_INTERVAL_MS);
    return () => {
      clearInterval(id);
      save();
    };
  }, [uri]);

  const reportProgress = useCallback((position: number, duration: number) => {
    progressRef.current = { position, duration };
  }, []);

  const markEnded = useCallback(() => {
    progressRef.current = { position: 0, duration: progressRef.current.duration };
  }, []);

  const rememberFallback = useCallback((event: DecoderFallbackEventPayload) => {
    progressRef.current = { ...progressRef.current, position: event.position };
    addSoftwareDecoderCodec(event.codec, event.reason).catch(warn('blacklist'));
  }, []);

  const restartFromCurrent = useCallback(() => {
    setPrepared((current) => current && { ...current, startPosition: progressRef.current.position });
  }, []);

  const saveChoices = useCallback(
    (choices: Partial<PlaybackChoices>) => {
      if (uri) savePlaybackChoices(uri, choices).catch(warn('choices'));
    },
    [uri]
  );

  return { prepared, progressRef, reportProgress, markEnded, rememberFallback, restartFromCurrent, saveChoices };
}
