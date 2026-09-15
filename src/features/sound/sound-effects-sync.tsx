import { useEffect } from 'react';

import { useAppDispatch, useAppSelector } from '@/store';
import { parseSoundSettings, pickSoundSettings } from '@/store/sound-persistence';
import {
  BOOST_WARNING_PERCENT,
  MAX_BOOST_PERCENT,
  equalizerInfoLoaded,
  soundHydrated,
  soundStatusChanged,
  type SoundState,
} from '@/store/sound-slice';
import VlcPlayer from '@modules/vlc-player';

import { EQUALIZER_PRESETS, currentGains, presetGains } from './equalizer-presets';

function warn(scope: string) {
  return (error: unknown) => console.warn(`[sound] ${scope}`, error);
}

const toMillibels = (gainsDb: readonly number[]) => gainsDb.map((db) => Math.round(db * 100));

/** Everything the native side needs to apply the effects and run the notification buttons without JS. */
function buildRequest(sound: SoundState): string {
  const centerHz = sound.equalizerInfo?.ok ? sound.equalizerInfo.centerHz : [];
  return JSON.stringify({
    settings: pickSoundSettings(sound),
    boostLimit: sound.boostWarningAccepted ? MAX_BOOST_PERCENT : BOOST_WARNING_PERCENT,
    presets: centerHz.length
      ? EQUALIZER_PRESETS.map((preset) => ({
          id: preset.id,
          label: preset.label,
          levelsMb: toMillibels(presetGains(preset.id, centerHz)),
        }))
      : [],
    customLevelsMb: toMillibels(currentGains('custom', sound.customGainsDb, centerHz)),
  });
}

/**
 * Keeps the native volume boost, equalizer and controls notification in line with the sound settings, and mirrors
 * changes made from the notification back into the app. Renders nothing.
 */
export function SoundEffectsSync() {
  const dispatch = useAppDispatch();
  const sound = useAppSelector((state) => state.sound);

  useEffect(() => {
    VlcPlayer.getEqualizerInfo()
      .then((info) => dispatch(equalizerInfoLoaded(info)))
      .catch(warn('equalizer info'));
  }, [dispatch]);

  useEffect(() => {
    const subscription = VlcPlayer.addListener('onSoundSettingsChanged', ({ settings }) => {
      try {
        dispatch(soundHydrated(parseSoundSettings(JSON.parse(settings))));
      } catch (error) {
        warn('notification change')(error);
      }
    });
    return () => subscription.remove();
  }, [dispatch]);

  // Nothing is sent before the saved settings load, or the defaults would overwrite them.
  const requestJson = sound.hydrated ? buildRequest(sound) : null;

  useEffect(() => {
    if (!requestJson) return;
    VlcPlayer.updateSoundEffects(requestJson)
      .then((status) => dispatch(soundStatusChanged(status)))
      .catch(warn('apply'));
  }, [requestJson, dispatch]);

  return null;
}
