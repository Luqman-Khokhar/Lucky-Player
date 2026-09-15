import { StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  BOOST_WARNING_PERCENT,
  MAX_BOOST_PERCENT,
  acceptBoostWarning,
  setBoostEnabled,
  setBoostPercent,
} from '@/store/sound-slice';

import { ensureNotificationPermission } from './notification-permission';
import { soundStatusMessage } from './sound-status';

const BOOST_STEP = 5;

export function BoostPanel() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const { boostEnabled, boostPercent, boostWarningAccepted, status } = useAppSelector((state) => state.sound);
  const atWarningLimit = !boostWarningAccepted && boostPercent >= BOOST_WARNING_PERCENT;
  const message = soundStatusMessage(status?.boost, boostEnabled && boostPercent > 0);

  return (
    <View style={styles.column}>
      <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <ThemedText type="smallBold">Volume boost</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Makes every app louder than the phone's maximum, up to +100%.
            </ThemedText>
          </View>
          <Switch
            value={boostEnabled}
            onValueChange={(value) => {
              if (value) ensureNotificationPermission().catch(() => false);
              dispatch(setBoostEnabled(value));
            }}
            accessibilityLabel="Volume boost"
            trackColor={{ false: theme.backgroundSelected, true: theme.accent }}
          />
        </View>

        <ThemedText type="title" style={styles.value} accessibilityElementsHidden>
          {`+${boostPercent}%`}
        </ThemedText>

        <Slider
          value={boostPercent}
          min={0}
          max={MAX_BOOST_PERCENT}
          step={BOOST_STEP}
          disabled={!boostEnabled}
          onChange={(value) => dispatch(setBoostPercent(value))}
          accessibilityLabel="Boost level"
          accessibilityValueText={`plus ${boostPercent} percent`}
        />
        <View style={styles.scale}>
          <ThemedText type="small" themeColor="textSecondary">
            0%
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            +100%
          </ThemedText>
        </View>

        {message ? (
          <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">
            {message}
          </ThemedText>
        ) : null}
      </View>

      {atWarningLimit ? (
        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]} accessibilityLiveRegion="polite">
          <ThemedText type="smallBold">Protect your hearing</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Boost is held at +{BOOST_WARNING_PERCENT}%. Very loud sound can damage your hearing and your phone's speaker.
            Only go higher for quiet videos, at a volume that stays comfortable.
          </ThemedText>
          <Button label="I understand, allow up to +100%" onPress={() => dispatch(acceptBoostWarning())} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  column: {
    gap: Spacing.three,
  },
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
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
  value: {
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  scale: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
