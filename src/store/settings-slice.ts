import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { DEFAULT_THEME, Themes, resolveAccent, type ThemeName } from '@/constants/theme';
import type { AspectMode, HwDecodingMode } from '@modules/vlc-player';

/** Player skip buttons have matching icons only for these steps. */
export const SEEK_STEP_CHOICES = [5, 10, 30] as const;

export const THEME_MODE_CHOICES = ['system', 'light', 'dark'] as const;
export type ThemeMode = (typeof THEME_MODE_CHOICES)[number];

export const SUBTITLE_SIZE_CHOICES = ['small', 'normal', 'large', 'huge'] as const;
export const SUBTITLE_COLOR_CHOICES = ['white', 'yellow'] as const;
export type SubtitleSize = (typeof SUBTITLE_SIZE_CHOICES)[number];
export type SubtitleColor = (typeof SUBTITLE_COLOR_CHOICES)[number];

export type SettingsState = {
  hwDecoding: HwDecodingMode;
  defaultAspect: AspectMode;
  seekStepSec: number;
  resumePlayback: boolean;
  autoPlayNext: boolean;
  /** Keep a video's sound playing when the app leaves the screen, handing it to the music player. */
  backgroundAudio: boolean;
  matchFrameRate: boolean;
  subtitleSize: SubtitleSize;
  subtitleColor: SubtitleColor;
  subtitleBackground: boolean;
  /** Which full palette the app draws with. See `Themes`. */
  theme: ThemeName;
  /** Which of the theme's accents to lay over it. Themes carry their own sets. */
  accent: string;
  /** Follow the phone's light or dark setting, or override it. */
  themeMode: ThemeMode;
};

const initialState: SettingsState = {
  hwDecoding: 'auto',
  defaultAspect: 'fit',
  seekStepSec: 10,
  resumePlayback: true,
  autoPlayNext: true,
  backgroundAudio: false,
  matchFrameRate: true,
  subtitleSize: 'normal',
  subtitleColor: 'white',
  subtitleBackground: false,
  theme: DEFAULT_THEME,
  accent: Themes[DEFAULT_THEME].defaultAccent,
  themeMode: 'system',
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    settingsHydrated(state, action: PayloadAction<Partial<SettingsState>>) {
      Object.assign(state, action.payload);
    },
    setHwDecoding(state, action: PayloadAction<HwDecodingMode>) {
      state.hwDecoding = action.payload;
    },
    setDefaultAspect(state, action: PayloadAction<AspectMode>) {
      state.defaultAspect = action.payload;
    },
    setSeekStep(state, action: PayloadAction<number>) {
      state.seekStepSec = action.payload;
    },
    setResumePlayback(state, action: PayloadAction<boolean>) {
      state.resumePlayback = action.payload;
    },
    setAutoPlayNext(state, action: PayloadAction<boolean>) {
      state.autoPlayNext = action.payload;
    },
    setBackgroundAudio(state, action: PayloadAction<boolean>) {
      state.backgroundAudio = action.payload;
    },
    setMatchFrameRate(state, action: PayloadAction<boolean>) {
      state.matchFrameRate = action.payload;
    },
    setSubtitleSize(state, action: PayloadAction<SubtitleSize>) {
      state.subtitleSize = action.payload;
    },
    setSubtitleColor(state, action: PayloadAction<SubtitleColor>) {
      state.subtitleColor = action.payload;
    },
    setSubtitleBackground(state, action: PayloadAction<boolean>) {
      state.subtitleBackground = action.payload;
    },
    setTheme(state, action: PayloadAction<ThemeName>) {
      state.theme = action.payload;
      // Accents belong to a theme, so keep the current one only when the new theme also carries it.
      state.accent = resolveAccent(action.payload, state.accent);
    },
    setAccent(state, action: PayloadAction<string>) {
      state.accent = action.payload;
    },
    setThemeMode(state, action: PayloadAction<ThemeMode>) {
      state.themeMode = action.payload;
    },
  },
});

export const {
  settingsHydrated,
  setHwDecoding,
  setDefaultAspect,
  setSeekStep,
  setResumePlayback,
  setAutoPlayNext,
  setBackgroundAudio,
  setMatchFrameRate,
  setSubtitleSize,
  setSubtitleColor,
  setSubtitleBackground,
  setTheme,
  setAccent,
  setThemeMode,
} = settingsSlice.actions;
export default settingsSlice.reducer;
