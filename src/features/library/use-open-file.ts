import * as MediaLibrary from 'expo-media-library';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import VlcPlayer from '@modules/vlc-player';

/** Opens the system file picker and plays the chosen video. */
export function useOpenFile() {
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openFile = useCallback(async () => {
    setError(null);
    setPicking(true);
    try {
      // Video access lets playback recover when the picker forwards no read grant. Denial is not fatal.
      await MediaLibrary.requestPermissionsAsync(false, ['video']).catch(() => null);
      const picked = await VlcPlayer.pickVideo();
      if (!picked) return;
      router.push({ pathname: '/player', params: { uri: picked.uri, title: picked.name } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open the file picker.');
    } finally {
      setPicking(false);
    }
  }, [router]);

  return { openFile, picking, error };
}
