import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { IconButton } from '@/components/ui/icon-button';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { DELAY_STEP_MS, clampDelay, formatDelay } from '../player-options';

type DelayStepperProps = {
  label: string;
  hint: string;
  value: number;
  onChange: (ms: number) => void;
};

export function DelayStepper({ label, hint, value, onChange }: DelayStepperProps) {
  const theme = useTheme();
  const change = (deltaMs: number) => onChange(clampDelay(value + deltaMs));

  return (
    <View style={[styles.container, { borderTopColor: theme.playerDivider }]}>
      <View style={styles.header}>
        <View style={styles.text}>
          <ThemedText type="small" style={{ color: theme.playerText }}>
            {label}
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.playerTextSecondary }}>
            {hint}
          </ThemedText>
        </View>
        {value !== 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Reset ${label.toLowerCase()}`}
            hitSlop={Spacing.two}
            onPress={() => onChange(0)}
            style={({ pressed }) => [styles.reset, pressed && { backgroundColor: theme.playerPressed }]}>
            <ThemedText type="smallBold" style={{ color: theme.playerAccent }}>
              Reset
            </ThemedText>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.controls}>
        <IconButton
          icon="remove"
          label={`Decrease ${label.toLowerCase()} by ${DELAY_STEP_MS} milliseconds`}
          color={theme.playerText}
          pressedColor={theme.playerTrack}
          backgroundColor={theme.playerPressed}
          onPress={() => change(-DELAY_STEP_MS)}
        />
        <ThemedText
          accessibilityLiveRegion="polite"
          style={[styles.value, { color: value === 0 ? theme.playerTextSecondary : theme.playerText }]}>
          {formatDelay(value)}
        </ThemedText>
        <IconButton
          icon="add"
          label={`Increase ${label.toLowerCase()} by ${DELAY_STEP_MS} milliseconds`}
          color={theme.playerText}
          pressedColor={theme.playerTrack}
          backgroundColor={theme.playerPressed}
          onPress={() => change(DELAY_STEP_MS)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: Spacing.three,
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  text: {
    flex: 1,
  },
  reset: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.two,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  value: {
    flex: 1,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});
