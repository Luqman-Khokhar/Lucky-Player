import { StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Chip } from '@/components/ui/chip';
import { Spacing } from '@/constants/theme';
import { DECODER_OPTIONS } from '@/features/player/player-options';
import { useTheme } from '@/hooks/use-theme';
import { useAppDispatch, useAppSelector } from '@/store';
import { SEEK_STEP_CHOICES, setHwDecoding, setResumePlayback, setSeekStep } from '@/store/settings-slice';

export function PlaybackSettingsSection() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const { hwDecoding, resumePlayback, seekStepSec } = useAppSelector((state) => state.settings);
  const decoder = DECODER_OPTIONS.find((option) => option.value === hwDecoding);

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="smallBold" accessibilityRole="header">
        Playback
      </ThemedText>

      <View style={styles.group}>
        <ThemedText type="small">Default decoder</ThemedText>
        <View style={styles.chips}>
          {DECODER_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              accessibilityLabel={`Default decoder: ${option.label}`}
              selected={option.value === hwDecoding}
              onPress={() => dispatch(setHwDecoding(option.value))}
            />
          ))}
        </View>
        {decoder?.description ? (
          <ThemedText type="small" themeColor="textSecondary">
            {decoder.description}
          </ThemedText>
        ) : null}
      </View>

      <View style={styles.group}>
        <ThemedText type="small">Skip back and forward by</ThemedText>
        <View style={styles.chips}>
          {SEEK_STEP_CHOICES.map((seconds) => (
            <Chip
              key={seconds}
              label={`${seconds} s`}
              accessibilityLabel={`Skip by ${seconds} seconds`}
              selected={seconds === seekStepSec}
              onPress={() => dispatch(setSeekStep(seconds))}
            />
          ))}
        </View>
      </View>

      <View style={styles.switchRow}>
        <View style={styles.switchText}>
          <ThemedText type="small">Resume where you left off</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Start each video from its last watched position.
          </ThemedText>
        </View>
        <Switch
          value={resumePlayback}
          onValueChange={(value) => {
            dispatch(setResumePlayback(value));
          }}
          accessibilityLabel="Resume where you left off"
          trackColor={{ false: theme.backgroundSelected, true: theme.accent }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.three,
  },
  group: {
    gap: Spacing.two,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  switchText: {
    flex: 1,
  },
});
