import { PermissionsAndroid, Platform } from 'react-native';

/**
 * Android 13+ asks before an app may show notifications. The sound controls notification needs it; the boost and
 * equalizer work either way, so a refusal is not an error.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 33) return true;
  const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
  if (await PermissionsAndroid.check(permission)) return true;
  const result = await PermissionsAndroid.request(permission);
  return result === PermissionsAndroid.RESULTS.GRANTED;
}
