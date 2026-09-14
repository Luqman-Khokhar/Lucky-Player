import { useCallback, useEffect, useRef, useState } from 'react';

import { addSoftwareDecoderCodec, getPlaybackState, getSoftwareDecoderCodecs, savePlaybackState } from '@/db';
import VlcPlayer, { type DecoderFallbackEventPayload, type HwDecodingMode } from '@modules/vlc-player';

const SAVE_INTERVAL_MS = 5000;
const RESUME_MIN_MS = 5000;
const RESUME_END_GUARD_MS = 10000;

export type PreparedSession = { startPosition: number; hwMode: HwDecodingMode };

type Options = { hwDecoding: HwDecodingMode; resumePlayback: boolean };

function warn(scope: string) {
  return (error: unknown) => console.warn(`[playback-session] ${scope}`, error);
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
        resumePlayback ? getPlaybackState(uri).catch(() => null) : Promise.resolve(null),
        getSoftwareDecoderCodecs().catch((): string[] => []),
        VlcPlayer.getMediaInfo(uri).catch(() => null),
      ]);
      if (cancelled) return;
      const duration = info?.duration || saved?.duration || 0;
      const resumeAt =
        saved && saved.position >= RESUME_MIN_MS && (duration <= 0 || saved.position < duration - RESUME_END_GUARD_MS)
          ? saved.position
          : 0;
      const codec = info?.video[0]?.codec.trim().toLowerCase() ?? '';
      const knownBad = hwDecoding === 'auto' && codec !== '' && blockedCodecs.includes(codec);
      progressRef.current = { position: resumeAt, duration };
      setPrepared({ startPosition: resumeAt, hwMode: knownBad ? 'sw' : hwDecoding });
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

  return { prepared, progressRef, reportProgress, markEnded, rememberFallback, restartFromCurrent };
}
