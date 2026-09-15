import type { SubtitleColor, SubtitleSize } from '@/store/settings-slice';

import type { Option } from './player-options';

export const SUBTITLE_SIZE_OPTIONS: (Option<SubtitleSize> & { scale: number })[] = [
  { value: 'small', label: 'Small', scale: 75 },
  { value: 'normal', label: 'Normal', scale: 100 },
  { value: 'large', label: 'Large', scale: 135 },
  { value: 'huge', label: 'Huge', scale: 175 },
];

// RGB values for libVLC's subtitle renderer, not app UI colors.
export const SUBTITLE_COLOR_OPTIONS: (Option<SubtitleColor> & { rgb: number })[] = [
  { value: 'white', label: 'White', rgb: 0xffffff },
  { value: 'yellow', label: 'Yellow', rgb: 0xffe14d },
];

export function subtitleScaleFor(size: SubtitleSize): number {
  return SUBTITLE_SIZE_OPTIONS.find((option) => option.value === size)?.scale ?? 100;
}

export function subtitleRgbFor(color: SubtitleColor): number {
  return SUBTITLE_COLOR_OPTIONS.find((option) => option.value === color)?.rgb ?? 0xffffff;
}
