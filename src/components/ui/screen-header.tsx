import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { IconButton } from './icon-button';

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  actions?: ReactNode;
};

export function ScreenHeader({ title, subtitle, onBack, actions }: ScreenHeaderProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.header,
        { paddingTop: insets.top + Spacing.two, paddingLeft: insets.left + Spacing.three, paddingRight: insets.right + Spacing.two },
      ]}>
      {onBack ? (
        <IconButton icon="arrow_back" label="Back" color={theme.text} pressedColor={theme.backgroundSelected} onPress={onBack} />
      ) : null}
      <View style={styles.titles}>
        <ThemedText type="subtitle" accessibilityRole="header" numberOfLines={1} style={styles.title}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingBottom: Spacing.three,
  },
  titles: {
    flex: 1,
    paddingHorizontal: Spacing.one,
  },
  title: {
    fontSize: 30,
    lineHeight: 38,
    letterSpacing: -0.8,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
