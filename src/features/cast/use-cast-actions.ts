import { useCallback } from 'react';
import { Linking } from 'react-native';

import { ensureNotificationPermission } from '@/features/sound/notification-permission';
import { useAppDispatch } from '@/store';
import { castStartFinished, castStartRequested, castStateChanged, type CastStartError } from '@/store/cast-slice';
import VlcPlayer, { type CastReceiver } from '@modules/vlc-player';

function warn(scope: string) {
  return (error: unknown) => console.warn(`[cast] ${scope}`, error);
}

function toStartError(cause: unknown): CastStartError {
  if ((cause as { code?: string } | null)?.code === 'ERR_NO_NETWORK') {
    return {
      code: 'no_network',
      message: 'Connect this phone to Wi-Fi, or turn on its hotspot and connect the laptop to it.',
    };
  }
  const detail = cause instanceof Error && cause.message ? ` (${cause.message})` : '';
  return { code: 'server', message: `The phone couldn't open a connection for laptops${detail}. Try again.` };
}

export function useCastActions() {
  const dispatch = useAppDispatch();

  const start = useCallback(async () => {
    // The casting notification carries the address, code and Stop; casting still works if the user refuses.
    await ensureNotificationPermission().catch(() => false);
    dispatch(castStartRequested());
    try {
      dispatch(castStateChanged(await VlcPlayer.startCast()));
      dispatch(castStartFinished(null));
    } catch (cause) {
      dispatch(castStartFinished(toStartError(cause)));
    }
  }, [dispatch]);

  const stop = useCallback(() => {
    VlcPlayer.stopCast().catch(warn('stop'));
  }, []);

  const forgetLaptops = useCallback(() => {
    VlcPlayer.forgetCastReceivers().catch(warn('forget'));
  }, []);

  /** Entering the code is not permission to watch: each laptop is allowed here, and control is separate. */
  const setReceiverAccess = useCallback((receiver: CastReceiver, allowed: boolean, canControl: boolean) => {
    VlcPlayer.setCastReceiverAccess(receiver.id, allowed, canControl).catch(warn('access'));
  }, []);

  const openWifiSettings = useCallback(() => {
    Linking.sendIntent('android.settings.WIFI_SETTINGS').catch(() => Linking.openSettings());
  }, []);

  return { start, stop, forgetLaptops, setReceiverAccess, openWifiSettings };
}
