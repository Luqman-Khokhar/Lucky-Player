import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import * as MediaLibrary from 'expo-media-library';

import {
  addFolderSource,
  countVideos,
  listFolderSources,
  markFolderScanFailed,
  removeFolderSource,
  syncFolderVideos,
  syncScannedVideos,
  type FolderSource,
} from '@/db';
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
export const THUMBNAIL_CACHE_MAX_BYTES = 150 * 1024 * 1024;

const initialState: LibraryState = {
  permission: 'unknown',
  canAskAgain: true,
  scanStatus: 'idle',
  scanError: null,
  lastScanAt: null,
  videoCount: 0,
  version: 0,
};

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

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

/** MediaStore (when allowed) plus every added folder, then keeps the thumbnail cache under its cap. */
export const scanLibrary = createAsyncThunk(
  'library/scan',
  async (_options: void | { force?: boolean }, { getState }) => {
    const { library } = getState() as { library: LibraryState };
    if (library.permission !== 'denied') {
      await syncScannedVideos(await VlcPlayer.scanVideos());
    }
    for (const source of await listFolderSources()) {
      try {
        await syncFolderVideos(source.id, await VlcPlayer.scanFolder(source.treeUri));
      } catch (error) {
        // One unreadable folder must not fail the whole scan; Settings shows the error.
        await markFolderScanFailed(source.id, messageOf(error, 'Scan failed'));
      }
    }
    await VlcPlayer.trimThumbnailCache(THUMBNAIL_CACHE_MAX_BYTES).catch(() => 0);
    return { videoCount: await countVideos(), scannedAt: Date.now() };
  },
  {
    condition: (options, { getState }) => {
      const { library } = getState() as { library: LibraryState };
      if (library.scanStatus === 'scanning' || library.permission === 'unknown') return false;
      const force = typeof options === 'object' && options.force === true;
      return force || !library.lastScanAt || Date.now() - library.lastScanAt > RESCAN_MIN_INTERVAL_MS;
    },
  }
);

/** Opens the folder picker, saves the folder and scans it. Resolves null when cancelled. */
export const pickAndAddFolder = createAsyncThunk('library/addFolder', async () => {
  const picked = await VlcPlayer.pickFolder();
  if (!picked) return null;
  const id = await addFolderSource(picked.uri, picked.name);
  const count = await syncFolderVideos(id, await VlcPlayer.scanFolder(picked.uri));
  return { name: picked.name, count };
});

export const removeFolder = createAsyncThunk('library/removeFolder', async (source: FolderSource) => {
  await removeFolderSource(source.id);
  await VlcPlayer.releaseFolder(source.treeUri).catch(() => undefined);
});

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
      })
      .addCase(pickAndAddFolder.fulfilled, (state, action) => {
        if (action.payload) state.version += 1;
      })
      .addCase(removeFolder.fulfilled, (state) => {
        state.version += 1;
      });
  },
});

export const { libraryChanged } = librarySlice.actions;
export default librarySlice.reducer;
