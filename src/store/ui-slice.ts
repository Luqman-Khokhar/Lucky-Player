import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/** The three views of the video library, shown as segments inside the Videos tab. */
export const LIBRARY_SEGMENTS = ['folders', 'videos', 'recent'] as const;
export type LibrarySegment = (typeof LIBRARY_SEGMENTS)[number];

/** The three views of the music library, shown as segments inside the Music tab. */
export const MUSIC_SEGMENTS = ['tracks', 'albums', 'playlists', 'folders'] as const;
export type MusicSegment = (typeof MUSIC_SEGMENTS)[number];

export type UiState = {
  librarySegment: LibrarySegment;
  musicSegment: MusicSegment;
};

const initialState: UiState = {
  librarySegment: 'folders',
  musicSegment: 'tracks',
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setLibrarySegment(state, action: PayloadAction<LibrarySegment>) {
      state.librarySegment = action.payload;
    },
    setMusicSegment(state, action: PayloadAction<MusicSegment>) {
      state.musicSegment = action.payload;
    },
  },
});

export const { setLibrarySegment, setMusicSegment } = uiSlice.actions;
export default uiSlice.reducer;
