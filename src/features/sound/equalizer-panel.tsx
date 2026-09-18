import { StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Slider } from '@/components/ui/slider';
import { StateView } from '@/components/ui/state-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppDispatch, useAppSelector } from '@/store';
import { selectPreset, setCustomGains, setEqualizerEnabled } from '@/store/sound-slice';

import { EQUALIZER_PRESETS, currentGains, formatFrequency } from './equalizer-presets';
import { ensureNotificationPermission } from './notification-permission';
import { soundStatusMessage } from './sound-status';

// Sliders stop at ±12 dB even when the phone allows more; beyond that sound distorts.
const GAIN_LIMIT_DB = 12;
const GAIN_STEP_DB = 0.5;
const BAND_HEIGHT = 200;

function formatGain(db: number): string {
  if (db === 0) return '0';
  return `${db > 0 ? '+' : '−'}${Math.abs(db)}`;
}

export function EqualizerPanel() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const { equalizerEnabled, presetId, customGainsDb, equalizerInfo, status } = useAppSelector((state) => state.sound);

  if (!equalizerInfo) return <StateView loading title="Checking your phone's equalizer…" />;
  if (!equalizerInfo.ok) {
    return (
      <StateView
        icon="error"
        title="Your phone doesn't allow an equalizer"
        message={`Android refused it: ${equalizerInfo.error}. Volume boost may still work.`}
      />
    );
  }

  const minDb = Math.max(-GAIN_LIMIT_DB, equalizerInfo.minMb / 100);
  const maxDb = Math.min(GAIN_LIMIT_DB, equalizerInfo.maxMb / 100);
  const gains = currentGains(presetId, customGainsDb, equalizerInfo.centerHz);
  const message = soundStatusMessage(status?.equalizer, equalizerEnabled);

  const changeBand = (band: number, db: number) => {
    const next = gains.map((gain, index) => (index === band ? db : gain));
    dispatch(setCustomGains(next));
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.switchRow}>
        <View style={styles.switchText}>
          <ThemedText type="smallBold">Equalizer</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Shapes the sound of every app. Pick a preset or drag the sliders.
          </ThemedText>
        </View>
        <Switch
          value={equalizerEnabled}
          onValueChange={(value) => {
            if (value) ensureNotificationPermission().catch(() => false);
            dispatch(setEqualizerEnabled(value));
          }}
          accessibilityLabel="Equalizer"
          trackColor={{ false: theme.backgroundSelected, true: theme.accent }}
        />
      </View>

      <View style={styles.chips} accessibilityLabel="Presets">
        {EQUALIZER_PRESETS.map((preset) => (
          <Chip
            key={preset.id}
            label={preset.label}
            accessibilityLabel={`Preset: ${preset.label}`}
            selected={preset.id === presetId}
            onPress={() => dispatch(selectPreset(preset.id))}
          />
        ))}
        <Chip
          label="Custom"
          accessibilityLabel="Preset: Custom"
          selected={presetId === 'custom'}
          onPress={() => dispatch(setCustomGains(gains))}
        />
      </View>

      <View style={styles.bands}>
        {equalizerInfo.centerHz.map((hz, band) => (
          <View key={hz} style={styles.band}>
            <ThemedText type="small" style={styles.gain} accessibilityElementsHidden>
              {formatGain(gains[band])}
            </ThemedText>
            <View style={styles.bandSlider}>
              <Slider
                orientation="vertical"
                value={gains[band]}
                min={minDb}
                max={maxDb}
                step={GAIN_STEP_DB}
                origin={0}
                disabled={!equalizerEnabled}
                onChange={(db) => changeBand(band, db)}
                accessibilityLabel={`${formatFrequency(hz)} hertz`}
                accessibilityValueText={`${formatGain(gains[band])} decibels`}
              />
            </View>
            <ThemedText type="small" themeColor="textSecondary" accessibilityElementsHidden>
              {formatFrequency(hz)}
            </ThemedText>
          </View>
        ))}
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.unit}>
        dB · Hz
      </ThemedText>

      <Button label="Reset to Normal" onPress={() => dispatch(selectPreset('normal'))} />

      {message ? (
        <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">
          {message}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.three,
    borderRadius: Radius.md,
    gap: Spacing.three,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  switchText: {
    flex: 1,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  bands: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  band: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.one,
  },
  gain: {
    fontVariant: ['tabular-nums'],
  },
  bandSlider: {
    height: BAND_HEIGHT,
  },
  unit: {
    textAlign: 'center',
  },
});
