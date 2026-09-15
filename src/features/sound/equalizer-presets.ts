export type EqualizerPresetId =
  | 'normal'
  | 'bass'
  | 'treble'
  | 'vocal'
  | 'rock'
  | 'pop'
  | 'jazz'
  | 'classical'
  | 'dance'
  | 'custom';

/** Gain in dB at a few frequencies; phone bands in between are interpolated on a log-frequency scale. */
type Curve = readonly (readonly [hz: number, db: number])[];

export const EQUALIZER_PRESETS: readonly { id: Exclude<EqualizerPresetId, 'custom'>; label: string; curve: Curve }[] = [
  { id: 'normal', label: 'Normal', curve: [[60, 0], [14000, 0]] },
  { id: 'bass', label: 'Bass boost', curve: [[60, 6], [230, 4], [910, 0], [14000, 0]] },
  { id: 'treble', label: 'Treble boost', curve: [[60, 0], [910, 0], [3600, 4], [14000, 6]] },
  { id: 'vocal', label: 'Vocal', curve: [[60, -2], [230, 0], [910, 4], [3600, 3], [14000, -1]] },
  { id: 'rock', label: 'Rock', curve: [[60, 5], [230, 3], [910, -1], [3600, 3], [14000, 5]] },
  { id: 'pop', label: 'Pop', curve: [[60, -1], [230, 2], [910, 4], [3600, 2], [14000, -1]] },
  { id: 'jazz', label: 'Jazz', curve: [[60, 4], [230, 2], [910, -2], [3600, 2], [14000, 4]] },
  { id: 'classical', label: 'Classical', curve: [[60, 5], [230, 3], [910, -2], [3600, 4], [14000, 4]] },
  { id: 'dance', label: 'Dance', curve: [[60, 6], [230, 0], [910, 2], [3600, 4], [14000, 1]] },
];

export const PRESET_IDS: readonly EqualizerPresetId[] = [...EQUALIZER_PRESETS.map((preset) => preset.id), 'custom'];

function gainAt(curve: Curve, hz: number): number {
  const first = curve[0];
  const last = curve[curve.length - 1];
  if (hz <= first[0]) return first[1];
  if (hz >= last[0]) return last[1];
  for (let index = 1; index < curve.length; index++) {
    const [highHz, highDb] = curve[index];
    if (hz > highHz) continue;
    const [lowHz, lowDb] = curve[index - 1];
    const ratio = (Math.log10(hz) - Math.log10(lowHz)) / (Math.log10(highHz) - Math.log10(lowHz));
    return lowDb + (highDb - lowDb) * ratio;
  }
  return last[1];
}

/** dB per phone band for a preset, rounded to 0.5 dB. */
export function presetGains(id: Exclude<EqualizerPresetId, 'custom'>, centerHz: readonly number[]): number[] {
  const curve = EQUALIZER_PRESETS.find((preset) => preset.id === id)?.curve ?? EQUALIZER_PRESETS[0].curve;
  return centerHz.map((hz) => Math.round(gainAt(curve, hz) * 2) / 2);
}

/** Current dB per band: the preset's curve, or the saved custom gains padded to the phone's band count. */
export function currentGains(
  presetId: EqualizerPresetId,
  customGainsDb: readonly number[],
  centerHz: readonly number[]
): number[] {
  if (presetId !== 'custom') return presetGains(presetId, centerHz);
  return centerHz.map((_hz, band) => customGainsDb[band] ?? 0);
}

export function formatFrequency(hz: number): string {
  return hz >= 1000 ? `${Number((hz / 1000).toFixed(1))}k` : `${Math.round(hz)}`;
}
