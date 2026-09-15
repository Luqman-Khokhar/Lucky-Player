import type { SoundEffectResult } from '@modules/vlc-player';

/** One line explaining what the phone did with an effect, or null when there is nothing to report. */
export function soundStatusMessage(result: SoundEffectResult | undefined, requested: boolean): string | null {
  if (!requested) return null;
  if (!result) return 'Applying…';
  if (!result.ok) return `Your phone refused this effect: ${result.error ?? 'unknown reason'}.`;
  if (result.hasControl === false) {
    return 'Another app is controlling sound effects right now. Turn off other booster or equalizer apps.';
  }
  return 'On for every app, including Lucky Player.';
}
