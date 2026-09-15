import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppSelector } from '@/store';

export function CastSettingsSection() {
  const theme = useTheme();
  const router = useRouter();
  const cast = useAppSelector((state) => state.cast);

  const status = cast.running
    ? cast.receivers.length > 0
      ? `Casting now · ${cast.receivers.length === 1 ? '1 laptop' : `${cast.receivers.length} laptops`} connected.`
      : 'Casting now · waiting for a laptop.'
    : "Play videos in a laptop's web browser on the same Wi-Fi. Nothing to install on the laptop.";

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="smallBold" accessibilityRole="header">
        Cast
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {status}
      </ThemedText>
      <Button label="Open cast" onPress={() => router.push('/cast')} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
});
