import { useRouter } from 'expo-router';
import { useCallback } from 'react';

/**
 * Back, or to the library when there is nothing behind this screen. A screen opened from a notification or a link
 * starts its own stack, where plain back does nothing and the device's back button leaves the app.
 */
export function useGoBack() {
  const router = useRouter();

  return useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/videos');
  }, [router]);
}
