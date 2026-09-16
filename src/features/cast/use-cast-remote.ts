import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { getPlaybackState, savePlaybackState } from '@/db';
import { resumePosition } from '@/features/player/use-playback-session';
import { useAppSelector } from '@/store';
import type { QueueItem } from '@/store/play-queue-slice';
import VlcPlayer, { type CastControlAction, type CastPlayback } from '@modules/vlc-player';

import { useCastVideo } from './use-cast-video';

const SAVE_INTERVAL_MS = 5000;
// A seek shows its target until the laptop's next reports catch up.
const SEEK_HOLD_MS = 1500;
// Presses within this window collapse into one seek.
const SEEK_DEBOUNCE_MS = 400;
const NOTICE_MS = 4000;

function warn(scope: string) {
  return (error: unknown) => console.warn(`[cast-remote] ${scope}`, error);
}

function control(action: CastControlAction, positionMs = 0) {
  return VlcPlayer.castControl(action, positionMs).catch(warn(action));
}

// A finished video resumes from the start next time.
function saveProgress(playback: CastPlayback) {
  if (playback.durationMs <= 0 || playback.status === 'loading') return Promise.resolve();
  const position = playback.status === 'ended' ? 0 : playback.positionMs;
  return savePlaybackState(playback.uri, position, playback.durationMs).catch(warn('save'));
}

/** Remote for the video a laptop plays: controls, the play queue, and saved progress. */
export function useCastRemote() {
  const router = useRouter();
  const playback = useAppSelector((state) => state.cast.playback);
  const queue = useAppSelector((state) => state.playQueue.items);
  const { seekStepSec, autoPlayNext, resumePlayback } = useAppSelector((state) => state.settings);
  const { castTo } = useCastVideo();
  const [seekTarget, setSeekTarget] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const playbackRef = useRef(playback);
  const endedUriRef = useRef<string | null>(null);
  const seekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    playbackRef.current = playback;
  }, [playback]);

  const uri = playback?.uri;

  useEffect(() => {
    if (!uri) return;
    const save = () => {
      const current = playbackRef.current;
      if (current?.uri === uri) saveProgress(current);
    };
    const id = setInterval(save, SAVE_INTERVAL_MS);
    return () => {
      clearInterval(id);
      save();
    };
  }, [uri]);

  useEffect(() => {
    if (seekTarget === null) return;
    const id = setTimeout(() => setSeekTarget(null), SEEK_HOLD_MS);
    return () => clearTimeout(id);
  }, [seekTarget]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(id);
  }, [notice]);

  const index = playback ? queue.findIndex((item) => item.uri === playback.uri) : -1;
  const previous = index > 0 ? queue[index - 1] : null;
  const next = index >= 0 && index < queue.length - 1 ? queue[index + 1] : null;

  const playItem = useCallback(
    async (item: QueueItem) => {
      const current = playbackRef.current;
      if (!current) return;
      await saveProgress(current);
      // The saved state carries the length from when the video was played on the phone.
      const saved = await getPlaybackState(item.uri).catch(() => null);
      const startMs = resumePlayback ? resumePosition(saved, saved?.duration ?? 0) : 0;
      const error = await castTo(current.receiverId, {
        uri: item.uri,
        title: item.title,
        startMs,
        durationMs: saved?.duration ?? 0,
      });
      if (error) setNotice(error);
    },
    [castTo, resumePlayback]
  );

  const ended = playback?.status === 'ended';

  useEffect(() => {
    if (!ended || !uri) {
      endedUriRef.current = null;
      return;
    }
    if (endedUriRef.current === uri) return;
    endedUriRef.current = uri;
    if (autoPlayNext && next) playItem(next);
  }, [ended, uri, autoPlayNext, next, playItem]);

  // Tapping skip several times must land one seek, not one per tap: a converted video starts again at each seek.
  const seekTo = useCallback((positionMs: number) => {
    const current = playbackRef.current;
    if (!current) return;
    const target = Math.max(0, current.durationMs > 0 ? Math.min(positionMs, current.durationMs) : positionMs);
    setSeekTarget(target);
    if (seekTimerRef.current) clearTimeout(seekTimerRef.current);
    seekTimerRef.current = setTimeout(() => {
      seekTimerRef.current = null;
      control('seek', target);
    }, SEEK_DEBOUNCE_MS);
  }, []);

  useEffect(() => () => {
    if (seekTimerRef.current) clearTimeout(seekTimerRef.current);
  }, []);

  const position = seekTarget ?? playback?.positionMs ?? 0;
  const playing = playback?.status === 'playing' || playback?.status === 'buffering';

  const skip = useCallback((deltaMs: number) => seekTo(position + deltaMs), [position, seekTo]);
  const togglePlay = useCallback(() => control(playing ? 'pause' : 'play'), [playing]);

  const muted = playback?.muted ?? false;
  const toggleMute = useCallback(() => control(muted ? 'unmute' : 'mute'), [muted]);

  const playOnPhone = useCallback(async () => {
    const current = playbackRef.current;
    if (!current) return;
    await saveProgress({ ...current, status: 'paused' });
    await control('stop');
    router.replace({ pathname: '/player', params: { uri: current.uri, title: current.title } });
  }, [router]);

  const stopVideo = useCallback(async () => {
    const current = playbackRef.current;
    if (current) await saveProgress(current);
    await control('stop');
    router.back();
  }, [router]);

  return {
    playback,
    position,
    duration: playback?.durationMs ?? 0,
    playing,
    seekStepMs: seekStepSec * 1000,
    notice,
    muted,
    toggleMute,
    togglePlay,
    seekTo,
    skip,
    playPrevious: previous ? () => playItem(previous) : undefined,
    playNext: next ? () => playItem(next) : undefined,
    playOnPhone,
    stopVideo,
  };
}
