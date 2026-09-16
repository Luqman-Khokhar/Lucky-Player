import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { CastReceiver } from '@modules/vlc-player';

type CastReceiverListProps = {
  receivers: CastReceiver[];
  onForgetLaptops: () => void;
  /** Shows a Play here button per laptop when a video is waiting for one. */
  onPlayHere?: (receiver: CastReceiver) => void;
  /** Shows a Mirror screen button per laptop. */
  onMirror?: (receiver: CastReceiver) => void;
  /** Laptop the video is being sent to right now. */
  sendingTo?: string | null;
};

/** Laptops connected right now, or a waiting hint while there are none. */
export function CastReceiverList({ receivers, onForgetLaptops, onPlayHere, onMirror, sendingTo }: CastReceiverListProps) {
  const theme = useTheme();

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold" accessibilityRole="header">
        Laptops
      </ThemedText>

      {receivers.length === 0 ? (
        <View style={styles.row} accessibilityLiveRegion="polite">
          <ActivityIndicator color={theme.accent} accessibilityLabel="Waiting for a laptop" />
          <ThemedText type="small" themeColor="textSecondary" style={styles.text}>
            Waiting for a laptop. Open the address above in its browser and it shows up here.
          </ThemedText>
        </View>
      ) : (
        <View style={styles.list} accessibilityLiveRegion="polite">
          {receivers.map((receiver) => (
            <View key={receiver.id} style={styles.row}>
              <Icon name="laptop" color={theme.text} />
              <View style={styles.text} accessible accessibilityLabel={`${receiver.name}, connected`}>
                <ThemedText type="smallBold">{receiver.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Connected
                </ThemedText>
              </View>
              {onPlayHere ? (
                <Button
                  label={sendingTo === receiver.id ? 'Sending…' : 'Play here'}
                  disabled={Boolean(sendingTo)}
                  onPress={() => onPlayHere(receiver)}
                  accessibilityHint={`Plays the video on ${receiver.name}`}
                />
              ) : null}
              {onMirror ? (
                <Button
                  label="Mirror screen"
                  variant="secondary"
                  onPress={() => onMirror(receiver)}
                  accessibilityHint={`Shows everything on this phone's screen on ${receiver.name}`}
                />
              ) : null}
            </View>
          ))}
        </View>
      )}

      <Button
        label="Forget paired laptops"
        variant="secondary"
        onPress={onForgetLaptops}
        accessibilityHint="Every laptop has to enter the code again"
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.three,
  },
  list: {
    gap: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  text: {
    flex: 1,
    minWidth: 120,
  },
});
