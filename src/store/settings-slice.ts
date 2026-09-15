import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { AspectMode, HwDecodingMode } from '@modules/vlc-player';

/** Player skip buttons have matching icons only for these steps. */
export const SEEK_STEP_CHOICES = [5, 10, 30] as const;

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
  matchFrameRate: boolean;
  subtitleSize: SubtitleSize;
  subtitleColor: SubtitleColor;
  subtitleBackground: boolean;
};

const initialState: SettingsState = {
  hwDecoding: 'auto',
  defaultAspect: 'fit',
  seekStepSec: 10,
  resumePlayback: true,
  autoPlayNext: true,
  matchFrameRate: true,
  subtitleSize: 'normal',
  subtitleColor: 'white',
  subtitleBackground: false,
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
  },
});

export const {
  settingsHydrated,
  setHwDecoding,
  setDefaultAspect,
  setSeekStep,
  setResumePlayback,
  setAutoPlayNext,
  setMatchFrameRate,
  setSubtitleSize,
  setSubtitleColor,
  setSubtitleBackground,
} = settingsSlice.actions;
export default settingsSlice.reducer;
