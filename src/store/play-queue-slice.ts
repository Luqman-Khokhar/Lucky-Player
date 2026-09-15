import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type QueueItem = { uri: string; title: string };

export type PlayQueueState = {
  /** The list the current video was opened from, in that screen's order. Drives previous, next and auto-play. */
  items: QueueItem[];
};

const initialState: PlayQueueState = { items: [] };

const playQueueSlice = createSlice({
  name: 'playQueue',
  initialState,
  reducers: {
    playQueueSet(state, action: PayloadAction<QueueItem[]>) {
      state.items = action.payload;
    },
  },
});

export const { playQueueSet } = playQueueSlice.actions;
export default playQueueSlice.reducer;
