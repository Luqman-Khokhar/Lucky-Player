import { PermissionsAndroid, Platform } from 'react-native';

/**
 * Android asks for the microphone permission before an app may capture what the phone is playing. Mirroring works
 * without it, silently, so a refusal is not an error.
 */
export async function ensureRecordAudioPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const permission = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
  if (await PermissionsAndroid.check(permission)) return true;
  const result = await PermissionsAndroid.request(permission);
  return result === PermissionsAndroid.RESULTS.GRANTED;
}
