import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import * as MediaLibrary from 'expo-media-library';

import { syncScannedVideos } from '@/db';
import VlcPlayer from '@modules/vlc-player';

export type LibraryPermission = 'unknown' | 'granted' | 'limited' | 'denied';

export type LibraryState = {
  permission: LibraryPermission;
  canAskAgain: boolean;
  scanStatus: 'idle' | 'scanning' | 'error';
  scanError: string | null;
  lastScanAt: number | null;
  videoCount: number;
  /** Bumped whenever library rows change; queries refetch on change. */
  version: number;
};

const RESCAN_MIN_INTERVAL_MS = 30_000;

const initialState: LibraryState = {
  permission: 'unknown',
  canAskAgain: true,
  scanStatus: 'idle',
  scanError: null,
  lastScanAt: null,
  videoCount: 0,
  version: 0,
};

export const resolveLibraryPermission = createAsyncThunk(
  'library/permission',
  async ({ request }: { request: boolean }) => {
    const response = request
      ? await MediaLibrary.requestPermissionsAsync(false, ['video'])
      : await MediaLibrary.getPermissionsAsync(false, ['video']);
    const permission: LibraryPermission = !response.granted
      ? 'denied'
      : response.accessPrivileges === 'limited'
        ? 'limited'
        : 'granted';
    return { permission, canAskAgain: response.canAskAgain };
  }
);

export const scanLibrary = createAsyncThunk(
  'library/scan',
  async (_options: void | { force?: boolean }) => {
    const videos = await VlcPlayer.scanVideos();
    const result = await syncScannedVideos(videos);
    return { videoCount: result.total, scannedAt: Date.now() };
  },
  {
    condition: (options, { getState }) => {
      const { library } = getState() as { library: LibraryState };
      if (library.scanStatus === 'scanning') return false;
      if (library.permission === 'unknown' || library.permission === 'denied') return false;
      const force = typeof options === 'object' && options.force === true;
      return force || !library.lastScanAt || Date.now() - library.lastScanAt > RESCAN_MIN_INTERVAL_MS;
    },
  }
);

const librarySlice = createSlice({
  name: 'library',
  initialState,
  reducers: {
    libraryChanged(state) {
      state.version += 1;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(resolveLibraryPermission.fulfilled, (state, action) => {
        state.permission = action.payload.permission;
        state.canAskAgain = action.payload.canAskAgain;
      })
      .addCase(resolveLibraryPermission.rejected, (state) => {
        state.permission = 'denied';
      })
      .addCase(scanLibrary.pending, (state) => {
        state.scanStatus = 'scanning';
        state.scanError = null;
      })
      .addCase(scanLibrary.fulfilled, (state, action) => {
        state.scanStatus = 'idle';
        state.lastScanAt = action.payload.scannedAt;
        state.videoCount = action.payload.videoCount;
        state.version += 1;
      })
      .addCase(scanLibrary.rejected, (state, action) => {
        state.scanStatus = 'error';
        state.scanError = action.error.message ?? 'Could not scan videos';
      });
  },
});

export const { libraryChanged } = librarySlice.actions;
export default librarySlice.reducer;
