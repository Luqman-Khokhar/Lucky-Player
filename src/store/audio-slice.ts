import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { AudioPlaybackState } from '@modules/vlc-player';

export type AudioState = AudioPlaybackState;

export const initialAudioState: AudioState = {
  active: false,
  playing: false,
  loading: false,
  uri: null,
  title: null,
  artist: null,
  album: null,
  artKey: null,
  positionMs: 0,
  durationMs: 0,
  index: null,
  queueSize: 0,
  repeat: 'off',
  shuffle: false,
  rate: 1,
};

const audioSlice = createSlice({
  name: 'audio',
  initialState: initialAudioState,
  reducers: {
    /** The native service is the only source of truth; this mirrors it for the UI. */
    audioStateChanged(_state, action: PayloadAction<AudioPlaybackState>) {
      return action.payload;
    },
    /** Moves the slider while the user drags it, before the seek lands. */
    audioScrubbed(state, action: PayloadAction<number>) {
      state.positionMs = action.payload;
    },
  },
});

export const { audioStateChanged, audioScrubbed } = audioSlice.actions;
export default audioSlice.reducer;
