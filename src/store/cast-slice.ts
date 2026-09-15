import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { CastState } from '@modules/vlc-player';

export type CastStartError = { code: 'no_network' | 'server'; message: string };

export type CastSliceState = CastState & {
  /** Runtime only: a start request is in flight, and why the last one failed. */
  starting: boolean;
  startError: CastStartError | null;
};

const initialState: CastSliceState = {
  running: false,
  address: null,
  network: null,
  code: null,
  receivers: [],
  starting: false,
  startError: null,
};

const castSlice = createSlice({
  name: 'cast',
  initialState,
  reducers: {
    /** Mirrors the native casting state. */
    castStateChanged(state, action: PayloadAction<CastState>) {
      Object.assign(state, action.payload);
      if (action.payload.running) state.startError = null;
    },
    castStartRequested(state) {
      state.starting = true;
      state.startError = null;
    },
    castStartFinished(state, action: PayloadAction<CastStartError | null>) {
      state.starting = false;
      state.startError = action.payload;
    },
  },
});

export const { castStateChanged, castStartRequested, castStartFinished } = castSlice.actions;
export default castSlice.reducer;
