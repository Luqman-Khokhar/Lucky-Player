import { ActivityIndicator, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { CastReceiver } from '@modules/vlc-player';

type CastReceiverListProps = {
  receivers: CastReceiver[];
  onForgetLaptops: () => void;
  /** Allows a laptop to watch, and optionally to control what everyone is watching. */
  onAccessChange: (receiver: CastReceiver, allowed: boolean, canControl: boolean) => void;
  /** Shows a Mirror screen button per laptop. */
  onMirror?: (receiver: CastReceiver) => void;
};

/** Laptops connected right now, what each may do, or a waiting hint while there are none. */
export function CastReceiverList({ receivers, onForgetLaptops, onAccessChange, onMirror }: CastReceiverListProps) {
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
            Waiting for a laptop. Open the address above in its browser and it shows up here. If nothing appears, the
            Wi-Fi may keep devices apart, which guest networks usually do; the phone&apos;s hotspot always works.
          </ThemedText>
        </View>
      ) : (
        <View style={styles.list} accessibilityLiveRegion="polite">
          {receivers.map((receiver) => (
            <View key={receiver.id} style={styles.device}>
              <View style={styles.row}>
                <Icon name="laptop" color={receiver.allowed ? theme.text : theme.textSecondary} />
                <View style={styles.text}>
                  <ThemedText type="smallBold">{receiver.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {receiver.watching ? 'Watching now' : receiver.allowed ? 'Allowed' : 'Waiting for you to allow it'}
                  </ThemedText>
                </View>
              </View>

              <View style={styles.row}>
                <ThemedText type="small" style={styles.text} nativeID={`allow-${receiver.id}`}>
                  Let it watch
                </ThemedText>
                <Switch
                  value={receiver.allowed}
                  onValueChange={(allowed) => onAccessChange(receiver, allowed, allowed && receiver.canControl)}
                  accessibilityLabel={`Let ${receiver.name} watch`}
                />
              </View>

              <View style={styles.row}>
                <ThemedText
                  type="small"
                  themeColor={receiver.allowed ? 'text' : 'textSecondary'}
                  style={styles.text}
                  nativeID={`control-${receiver.id}`}>
                  Let it control playback
                </ThemedText>
                <Switch
                  value={receiver.canControl}
                  disabled={!receiver.allowed}
                  onValueChange={(canControl) => onAccessChange(receiver, true, canControl)}
                  accessibilityLabel={`Let ${receiver.name} control playback for everyone`}
                />
              </View>

              {onMirror ? (
                <View style={styles.row}>
                  <Button
                    label="Mirror screen"
                    variant="secondary"
                    disabled={!receiver.allowed}
                    onPress={() => onMirror(receiver)}
                    accessibilityHint={`Shows everything on this phone's screen on ${receiver.name}`}
                  />
                </View>
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
    borderRadius: Radius.md,
    gap: Spacing.three,
  },
  list: {
    gap: Spacing.four,
  },
  device: {
    gap: Spacing.two,
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
