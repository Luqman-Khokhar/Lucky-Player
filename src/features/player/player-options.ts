import type { AspectMode, HwDecodingMode, TrackDescription } from '@modules/vlc-player';

export type Option<T> = { value: T; label: string; description?: string };

export const SPEED_OPTIONS: Option<number>[] = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3, 4].map((value) => ({
  value,
  label: value === 1 ? 'Normal' : `${value}×`,
}));

export const ASPECT_OPTIONS: Option<AspectMode>[] = [
  { value: 'fit', label: 'Fit', description: 'Whole picture, black bars when needed' },
  { value: 'fitScreen', label: 'Crop', description: 'Fill the screen, trims the edges' },
  { value: 'fill', label: 'Stretch', description: 'Fill the screen, may distort' },
  { value: '16:9', label: '16:9' },
  { value: '4:3', label: '4:3' },
  { value: 'original', label: 'Original size' },
];

export const DECODER_OPTIONS: Option<HwDecodingMode>[] = [
  { value: 'auto', label: 'Auto', description: 'Hardware first, switches to software if it fails' },
  { value: 'hw', label: 'Hardware', description: 'Phone chip: cool and battery friendly, fewer formats' },
  { value: 'sw', label: 'Software', description: 'CPU: plays almost anything, uses more battery' },
];

export const DELAY_STEP_MS = 50;
const DELAY_LIMIT_MS = 10000;

export function labelFor<T>(options: Option<T>[], value: T): string {
  return options.find((option) => option.value === value)?.label ?? String(value);
}

/** libVLC lists a "Disable" entry with id -1; show it as "Off". */
export function trackOptions(tracks: TrackDescription[] | undefined): Option<number>[] {
  return (tracks ?? []).map((track) => ({ value: track.id, label: track.id === -1 ? 'Off' : track.name }));
}

export function trackLabel(tracks: TrackDescription[] | undefined, id: number | undefined): string {
  if (!tracks?.length) return 'None';
  const track = tracks.find((item) => item.id === id);
  if (!track) return 'Default';
  return track.id === -1 ? 'Off' : track.name;
}

export function clampDelay(ms: number): number {
  return Math.max(-DELAY_LIMIT_MS, Math.min(DELAY_LIMIT_MS, ms));
}

export function formatDelay(ms: number): string {
  if (ms === 0) return 'No delay';
  return `${ms > 0 ? '+' : '−'}${(Math.abs(ms) / 1000).toFixed(2)} s`;
}
