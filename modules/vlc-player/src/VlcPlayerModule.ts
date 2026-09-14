import { NativeModule, requireNativeModule } from 'expo';

import type {
  DeviceProfile,
  FolderVideo,
  MediaInfo,
  PickedFolder,
  PickedVideo,
  ScannedVideo,
} from './VlcPlayer.types';

declare class VlcPlayerModule extends NativeModule {
  /** Every video MediaStore knows about. Rejects with ERR_PERMISSION without video access. */
  scanVideos(): Promise<ScannedVideo[]>;
  /** file:// JPEG path, or null when no frame could be read. `key` must change when the file changes. */
  getThumbnail(uri: string, key: string, width: number): Promise<string | null>;
  /** Deletes least recently used thumbnails above `maxBytes` (0 clears all). Resolves bytes remaining. */
  trimThumbnailCache(maxBytes: number): Promise<number>;
  /** System folder picker with persisted read access. Resolves null when cancelled. */
  pickFolder(): Promise<PickedFolder | null>;
  /** Recursively lists videos in a picked folder. Rejects with ERR_PERMISSION when access was revoked. */
  scanFolder(treeUri: string): Promise<FolderVideo[]>;
  releaseFolder(treeUri: string): Promise<void>;
  /** Resolves null when the user cancels. */
  pickVideo(): Promise<PickedVideo | null>;
  getDeviceProfile(): Promise<DeviceProfile>;
  getMediaInfo(uri: string): Promise<MediaInfo>;
}

export default requireNativeModule<VlcPlayerModule>('VlcPlayer');
