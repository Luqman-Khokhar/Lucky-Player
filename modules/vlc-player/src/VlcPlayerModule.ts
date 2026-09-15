import { NativeModule, requireNativeModule } from 'expo';

import type {
  CastState,
  DeviceProfile,
  FolderVideo,
  MediaInfo,
  MediaVolume,
  PickedFolder,
  PickedSubtitle,
  PickedVideo,
  ScannedVideo,
  SoundEffectsStatus,
  EqualizerInfo,
} from './VlcPlayer.types';

type VlcPlayerModuleEvents = {
  /** A notification button changed the sound settings; `settings` is the saved settings as JSON. */
  onSoundSettingsChanged: (event: { settings: string }) => void;
  /** Casting started or stopped, a laptop connected or left, the address or code changed. */
  onCastStateChanged: (event: { state: CastState }) => void;
};

declare class VlcPlayerModule extends NativeModule<VlcPlayerModuleEvents> {
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
  /** Band layout of the phone's global equalizer. */
  getEqualizerInfo(): Promise<EqualizerInfo>;
  /** Sound settings saved on the native side (JSON), or null before the first save. */
  getSoundSettings(): Promise<string | null>;
  /**
   * Saves the sound request (JSON: settings, boostLimit, presets with levelsMb, customLevelsMb), applies the boost and
   * equalizer to every app's audio, and shows or hides the controls notification. Reports what the phone accepted.
   */
  updateSoundEffects(requestJson: string): Promise<SoundEffectsStatus>;
  /** Resolves null when the user cancels. The read grant is persisted so the file reloads next time. */
  pickSubtitle(): Promise<PickedSubtitle | null>;
  /** Size in percent and RGB color; applies to videos opened afterwards. */
  configureSubtitles(scale: number, color: number, background: boolean): Promise<void>;
  isPictureInPictureSupported(): boolean;
  /** False when the system refused, usually because picture-in-picture is turned off for the app. */
  enterPictureInPicture(width: number, height: number): Promise<boolean>;
  /** Android 12+: shrink into picture-in-picture when the user leaves the app. */
  setAutoPictureInPicture(enabled: boolean, width: number, height: number): Promise<void>;
  /** Updates the play/pause button and skip labels shown in the picture-in-picture window. */
  setPictureInPicturePlayback(paused: boolean, skipSeconds: number): Promise<void>;
  openPictureInPictureSettings(): Promise<void>;
  getDeviceProfile(): Promise<DeviceProfile>;
  getMediaInfo(uri: string): Promise<MediaInfo>;
  /** Window brightness 0..1, or the system brightness when the window does not override it. */
  getBrightness(): Promise<number>;
  /** 0..1 for this window only; a negative value restores the system brightness. */
  setBrightness(value: number): Promise<void>;
  /** Media stream volume as a step index. */
  getMediaVolume(): Promise<MediaVolume>;
  setMediaVolume(index: number): Promise<void>;
  /**
   * Starts the laptop receiver server and the casting notification. Resolves the state with address and code.
   * Rejects with ERR_NO_NETWORK without Wi-Fi or hotspot, ERR_CAST_SERVER when no port could be opened.
   */
  startCast(): Promise<CastState>;
  /** Tells connected laptops casting stopped, closes the server and removes the notification. */
  stopCast(): Promise<void>;
  getCastState(): Promise<CastState>;
  /** Every laptop must enter the code again; connected laptops are disconnected. */
  forgetCastReceivers(): Promise<void>;
}

export default requireNativeModule<VlcPlayerModule>('VlcPlayer');
