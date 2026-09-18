import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/** The three views of the video library, shown as segments inside the Videos tab. */
export const LIBRARY_SEGMENTS = ['folders', 'videos', 'recent'] as const;
export type LibrarySegment = (typeof LIBRARY_SEGMENTS)[number];

export type UiState = {
  librarySegment: LibrarySegment;
};

const initialState: UiState = {
  librarySegment: 'folders',
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setLibrarySegment(state, action: PayloadAction<LibrarySegment>) {
      state.librarySegment = action.payload;
    },
  },
});

export const { setLibrarySegment } = uiSlice.actions;
export default uiSlice.reducer;
