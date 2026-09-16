import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { savePlaybackState } from '@/db';
import { ensureRecordAudioPermission } from '@/features/cast/record-audio-permission';
import { useAppSelector } from '@/store';
import VlcPlayer from '@modules/vlc-player';

export type CastRequest = { uri: string; title: string; startMs: number; durationMs: number };

function messageOf(cause: unknown): string {
  return cause instanceof Error && cause.message ? cause.message : "Couldn't cast this video.";
}

/** Sends videos to laptop browsers. Each call resolves an error message to show, or null once the laptop has the video. */
export function useCastVideo() {
  const router = useRouter();
  const running = useAppSelector((state) => state.cast.running);
  const receivers = useAppSelector((state) => state.cast.receivers);

  const castTo = useCallback(async (receiverId: string, request: CastRequest): Promise<string | null> => {
    // Saved first, so the phone can pick up from here if casting ends.
    if (request.durationMs > 0) {
      await savePlaybackState(request.uri, request.startMs, request.durationMs).catch(() => undefined);
    }
    try {
      await VlcPlayer.castMedia(receiverId, request.uri, request.title, request.startMs);
      return null;
    } catch (cause) {
      return messageOf(cause);
    }
  }, []);

  /** From the player: straight to the only connected laptop, otherwise the Cast screen to connect or choose one. */
  const castFromPlayer = useCallback(
    async (request: CastRequest): Promise<string | null> => {
      if (running && receivers.length === 1) {
        const error = await castTo(receivers[0].id, request);
        if (!error) router.replace('/cast-remote');
        return error;
      }
      router.push({
        pathname: '/cast',
        params: {
          uri: request.uri,
          title: request.title,
          startMs: String(Math.round(request.startMs)),
          durationMs: String(Math.round(request.durationMs)),
        },
      });
      return null;
    },
    [castTo, receivers, router, running]
  );

  /** Mirrors the whole phone screen after Android's screen-capture prompt. */
  const mirrorScreen = useCallback(
    async (receiverId: string): Promise<string | null> => {
      const withAudio = await ensureRecordAudioPermission().catch(() => false);
      try {
        await VlcPlayer.startScreenCast(receiverId, withAudio);
        router.replace('/cast-remote');
        return null;
      } catch (cause) {
        if ((cause as { code?: string } | null)?.code === 'ERR_DENIED') return null;
        return messageOf(cause);
      }
    },
    [router]
  );

  return { castTo, castFromPlayer, mirrorScreen };
}
