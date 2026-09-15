import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { AspectMode, HwDecodingMode } from '@modules/vlc-player';

/** Player skip buttons have matching icons only for these steps. */
export const SEEK_STEP_CHOICES = [5, 10, 30] as const;

export type SettingsState = {
  hwDecoding: HwDecodingMode;
  defaultAspect: AspectMode;
  seekStepSec: number;
  resumePlayback: boolean;
  autoPlayNext: boolean;
};

const initialState: SettingsState = {
  hwDecoding: 'auto',
  defaultAspect: 'fit',
  seekStepSec: 10,
  resumePlayback: true,
  autoPlayNext: true,
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
  },
});

export const { settingsHydrated, setHwDecoding, setDefaultAspect, setSeekStep, setResumePlayback, setAutoPlayNext } =
  settingsSlice.actions;
export default settingsSlice.reducer;
