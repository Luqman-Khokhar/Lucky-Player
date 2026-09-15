import { PRESET_IDS } from '@/features/sound/equalizer-presets';
import VlcPlayer from '@modules/vlc-player';

import { store } from './index';
import { MAX_BOOST_PERCENT, soundHydrated, type SoundSettings, type SoundState } from './sound-slice';

export function pickSoundSettings(state: SoundState): SoundSettings {
  const { boostEnabled, boostPercent, boostWarningAccepted, equalizerEnabled, presetId, customGainsDb } = state;
  return { boostEnabled, boostPercent, boostWarningAccepted, equalizerEnabled, presetId, customGainsDb };
}

export function parseSoundSettings(value: unknown): Partial<SoundSettings> {
  if (typeof value !== 'object' || value === null) return {};
  const input = value as Record<string, unknown>;
  const result: Partial<SoundSettings> = {};
  if (typeof input.boostEnabled === 'boolean') result.boostEnabled = input.boostEnabled;
  if (typeof input.boostWarningAccepted === 'boolean') result.boostWarningAccepted = input.boostWarningAccepted;
  if (typeof input.equalizerEnabled === 'boolean') result.equalizerEnabled = input.equalizerEnabled;
  if (typeof input.boostPercent === 'number' && Number.isFinite(input.boostPercent)) {
    result.boostPercent = Math.min(MAX_BOOST_PERCENT, Math.max(0, Math.round(input.boostPercent)));
  }
  const preset = PRESET_IDS.find((id) => id === input.presetId);
  if (preset) result.presetId = preset;
  if (Array.isArray(input.customGainsDb) && input.customGainsDb.every((gain) => typeof gain === 'number')) {
    result.customGainsDb = input.customGainsDb as number[];
  }
  return result;
}

/**
 * Loads the sound settings from the native side, which owns them so notification buttons work without JS. Always
 * marks the settings as loaded, so the app starts applying them even when nothing was saved yet.
 */
export async function hydrateSound(): Promise<void> {
  let saved: Partial<SoundSettings> = {};
  try {
    const raw = await VlcPlayer.getSoundSettings();
    if (raw) saved = parseSoundSettings(JSON.parse(raw));
  } catch (error) {
    console.warn('[sound] load failed', error);
  }
  store.dispatch(soundHydrated(saved));
}
