import { NativeModule, requireNativeModule } from 'expo';

import type {
  DeviceProfile,
  FolderVideo,
  MediaInfo,
  MediaVolume,
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
  /** Starts libVLC in the background so the first video opens quickly. Resolves immediately. */
  warmUp(): Promise<void>;
  getDeviceProfile(): Promise<DeviceProfile>;
  getMediaInfo(uri: string): Promise<MediaInfo>;
  /** Window brightness 0..1, or the system brightness when the window does not override it. */
  getBrightness(): Promise<number>;
  /** 0..1 for this window only; a negative value restores the system brightness. */
  setBrightness(value: number): Promise<void>;
  /** Media stream volume as a step index. */
  getMediaVolume(): Promise<MediaVolume>;
  setMediaVolume(index: number): Promise<void>;
}

export default requireNativeModule<VlcPlayerModule>('VlcPlayer');
