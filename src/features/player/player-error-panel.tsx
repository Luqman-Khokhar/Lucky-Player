import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ErrorEventPayload } from '@modules/vlc-player';

type PlayerErrorPanelProps = {
  error: ErrorEventPayload;
  onRetry: () => void;
  onBack: () => void;
};

function messageFor(error: ErrorEventPayload): string {
  switch (error.code) {
    case 'permission_denied':
      return 'Android blocked access to this file. Allow video access for Player, then pick the file again.';
    case 'open_failed':
      return 'The file could not be opened. It may have been moved, deleted, or is still downloading.';
    default:
      return 'This video could not be played. Try switching the decoder in settings, then retry.';
  }
}

export function PlayerErrorPanel({ error, onRetry, onBack }: PlayerErrorPanelProps) {
  const theme = useTheme();

  return (
    <View style={[StyleSheet.absoluteFill, styles.container, { backgroundColor: theme.playerBackdrop }]}>
      <View accessibilityRole="alert" style={[styles.card, { backgroundColor: theme.playerSheet }]}>
        <Icon name="error" size={36} color={theme.danger} />
        <ThemedText type="default" style={[styles.title, { color: theme.playerText }]}>
          Can&apos;t play this video
        </ThemedText>
        <ThemedText type="small" style={[styles.body, { color: theme.playerTextSecondary }]}>
          {messageFor(error)}
        </ThemedText>
        <View style={styles.actions}>
          <Button label="Go back" variant="secondary" onPress={onBack} />
          <Button label="Retry" onPress={onRetry} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
    borderRadius: Radius.lg,
  },
  title: {
    fontWeight: 600,
    textAlign: 'center',
  },
  body: {
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
});
