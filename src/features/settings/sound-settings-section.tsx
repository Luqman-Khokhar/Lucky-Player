import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function SoundSettingsSection() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="smallBold" accessibilityRole="header">
        Sound
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Volume boost and equalizer for videos and, where the phone allows it, other apps.
      </ThemedText>
      <Button label="Open sound settings" onPress={() => router.push('/sound')} />
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
