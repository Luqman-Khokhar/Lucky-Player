import { NativeModule, requireNativeModule } from 'expo';

import type { DeviceProfile, MediaInfo, PickedVideo, ScannedVideo } from './VlcPlayer.types';

declare class VlcPlayerModule extends NativeModule {
  /** Every video MediaStore knows about. Rejects with ERR_PERMISSION without video access. */
  scanVideos(): Promise<ScannedVideo[]>;
  /** file:// JPEG path, or null when no frame could be read. `key` must change when the file changes. */
  getThumbnail(uri: string, key: string, width: number): Promise<string | null>;
  /** Resolves null when the user cancels. */
  pickVideo(): Promise<PickedVideo | null>;
  getDeviceProfile(): Promise<DeviceProfile>;
  getMediaInfo(uri: string): Promise<MediaInfo>;
}

export default requireNativeModule<VlcPlayerModule>('VlcPlayer');
