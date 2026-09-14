import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Button } from './button';
import { Icon, type IconName } from './icon';

type StateAction = { label: string; onPress: () => void };

type StateViewProps = {
  title: string;
  message?: string;
  icon?: IconName;
  loading?: boolean;
  action?: StateAction;
  secondaryAction?: StateAction;
};

/** Full-area loading, empty, and error states. */
export function StateView({ title, message, icon, loading = false, action, secondaryAction }: StateViewProps) {
  const theme = useTheme();

  return (
    <View style={styles.container} accessibilityLiveRegion="polite">
      {loading ? (
        <ActivityIndicator size="large" color={theme.accent} />
      ) : icon ? (
        <View style={[styles.iconWrap, { backgroundColor: theme.backgroundElement }]}>
          <Icon name={icon} size={36} color={theme.textSecondary} />
        </View>
      ) : null}
      <ThemedText style={styles.title}>{title}</ThemedText>
      {message ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.message}>
          {message}
        </ThemedText>
      ) : null}
      {action || secondaryAction ? (
        <View style={styles.actions}>
          {secondaryAction ? (
            <Button label={secondaryAction.label} variant="secondary" onPress={secondaryAction.onPress} />
          ) : null}
          {action ? <Button label={action.label} onPress={action.onPress} /> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  title: {
    fontWeight: 600,
    textAlign: 'center',
  },
  message: {
    textAlign: 'center',
    maxWidth: 360,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
});
