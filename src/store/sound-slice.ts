import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { EqualizerPresetId } from '@/features/sound/equalizer-presets';
import type { EqualizerInfo, SoundEffectsStatus } from '@modules/vlc-player';

/** Boost above this needs a one-time hearing warning to be accepted. */
export const BOOST_WARNING_PERCENT = 50;
export const MAX_BOOST_PERCENT = 100;

export type SoundSettings = {
  boostEnabled: boolean;
  boostPercent: number;
  boostWarningAccepted: boolean;
  equalizerEnabled: boolean;
  presetId: EqualizerPresetId;
  /** dB per phone band, used when presetId is 'custom'. */
  customGainsDb: number[];
};

export type SoundState = SoundSettings & {
  /** Runtime only, never saved: settings loaded, and what the phone reported. */
  hydrated: boolean;
  equalizerInfo: EqualizerInfo | null;
  status: SoundEffectsStatus | null;
};

const initialState: SoundState = {
  boostEnabled: false,
  boostPercent: 30,
  boostWarningAccepted: false,
  equalizerEnabled: false,
  presetId: 'normal',
  customGainsDb: [],
  hydrated: false,
  equalizerInfo: null,
  status: null,
};

const soundSlice = createSlice({
  name: 'sound',
  initialState,
  reducers: {
    soundHydrated(state, action: PayloadAction<Partial<SoundSettings>>) {
      Object.assign(state, action.payload);
      state.hydrated = true;
    },
    setBoostEnabled(state, action: PayloadAction<boolean>) {
      state.boostEnabled = action.payload;
    },
    setBoostPercent(state, action: PayloadAction<number>) {
      const limit = state.boostWarningAccepted ? MAX_BOOST_PERCENT : BOOST_WARNING_PERCENT;
      state.boostPercent = Math.round(Math.min(limit, Math.max(0, action.payload)));
    },
    acceptBoostWarning(state) {
      state.boostWarningAccepted = true;
    },
    setEqualizerEnabled(state, action: PayloadAction<boolean>) {
      state.equalizerEnabled = action.payload;
    },
    selectPreset(state, action: PayloadAction<EqualizerPresetId>) {
      state.presetId = action.payload;
    },
    /** Any slider change turns the current sound into a custom preset. */
    setCustomGains(state, action: PayloadAction<number[]>) {
      state.presetId = 'custom';
      state.customGainsDb = action.payload;
    },
    equalizerInfoLoaded(state, action: PayloadAction<EqualizerInfo>) {
      state.equalizerInfo = action.payload;
    },
    soundStatusChanged(state, action: PayloadAction<SoundEffectsStatus>) {
      state.status = action.payload;
    },
  },
});

export const {
  soundHydrated,
  setBoostEnabled,
  setBoostPercent,
  acceptBoostWarning,
  setEqualizerEnabled,
  selectPreset,
  setCustomGains,
  equalizerInfoLoaded,
  soundStatusChanged,
} = soundSlice.actions;
export default soundSlice.reducer;
