import { getSetting, setSetting } from '@/db';

import { store } from './index';
import { SEEK_STEP_CHOICES, settingsHydrated, type SettingsState } from './settings-slice';

const SETTINGS_KEY = 'app.settings';
const SAVE_DEBOUNCE_MS = 300;

function parseSettings(value: unknown): Partial<SettingsState> {
  if (typeof value !== 'object' || value === null) return {};
  const input = value as Record<string, unknown>;
  const result: Partial<SettingsState> = {};
  if (input.hwDecoding === 'auto' || input.hwDecoding === 'hw' || input.hwDecoding === 'sw') {
    result.hwDecoding = input.hwDecoding;
  }
  if (typeof input.resumePlayback === 'boolean') result.resumePlayback = input.resumePlayback;
  if (SEEK_STEP_CHOICES.some((choice) => choice === input.seekStepSec)) result.seekStepSec = input.seekStepSec as number;
  return result;
}

export async function hydrateSettings(): Promise<void> {
  const raw = await getSetting(SETTINGS_KEY);
  if (!raw) return;
  try {
    store.dispatch(settingsHydrated(parseSettings(JSON.parse(raw))));
  } catch {
    // Corrupt value: keep defaults; the next change overwrites it.
  }
}

/** Saves settings whenever they change. Returns an unsubscribe function. */
export function persistSettingsChanges(): () => void {
  let previous = store.getState().settings;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsubscribe = store.subscribe(() => {
    const next = store.getState().settings;
    if (next === previous) return;
    previous = next;
    clearTimeout(timer);
    timer = setTimeout(() => {
      setSetting(SETTINGS_KEY, JSON.stringify(next)).catch((error: unknown) =>
        console.warn('[settings] save failed', error)
      );
    }, SAVE_DEBOUNCE_MS);
  });
  return () => {
    clearTimeout(timer);
    unsubscribe();
  };
}
