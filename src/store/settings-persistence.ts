import { THEME_CHOICES } from '@/constants/theme';
import { getSetting, setSetting } from '@/db';

import { store } from './index';
import {
  SEEK_STEP_CHOICES,
  SUBTITLE_COLOR_CHOICES,
  SUBTITLE_SIZE_CHOICES,
  THEME_MODE_CHOICES,
  settingsHydrated,
  type SettingsState,
} from './settings-slice';

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
  if (typeof input.autoPlayNext === 'boolean') result.autoPlayNext = input.autoPlayNext;
  if (typeof input.backgroundAudio === 'boolean') result.backgroundAudio = input.backgroundAudio;
  if (typeof input.matchFrameRate === 'boolean') result.matchFrameRate = input.matchFrameRate;
  if (typeof input.subtitleBackground === 'boolean') result.subtitleBackground = input.subtitleBackground;
  const size = SUBTITLE_SIZE_CHOICES.find((choice) => choice === input.subtitleSize);
  if (size) result.subtitleSize = size;
  const color = SUBTITLE_COLOR_CHOICES.find((choice) => choice === input.subtitleColor);
  if (color) result.subtitleColor = color;
  if (SEEK_STEP_CHOICES.some((choice) => choice === input.seekStepSec)) result.seekStepSec = input.seekStepSec as number;
  const theme = THEME_CHOICES.find((choice) => choice === input.theme);
  if (theme) result.theme = theme;
  // The accent is checked against the theme that ends up in use, not here, so a theme swap keeps it.
  if (typeof input.accent === 'string') result.accent = input.accent;
  const themeMode = THEME_MODE_CHOICES.find((choice) => choice === input.themeMode);
  if (themeMode) result.themeMode = themeMode;
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
