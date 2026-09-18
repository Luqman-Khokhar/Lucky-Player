import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing, Themes, accentLabel } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppSelector } from '@/store';

import { SettingsSection } from './settings-section';

export function AppearanceSettingsSection() {
  const theme = useTheme();
  const router = useRouter();
  const themeName = useAppSelector((state) => state.settings.theme);
  const accent = useAppSelector((state) => state.settings.accent);
  const definition = Themes[themeName];
  const currentAccent = accentLabel(themeName, accent);

  return (
    <SettingsSection title="Appearance">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Appearance, ${definition.label} theme, ${currentAccent} accent`}
        accessibilityHint="Opens the appearance screen"
        onPress={() => router.push('/appearance')}
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.accentSoft }]}>
        <View style={[styles.dot, { backgroundColor: theme.accent, borderColor: theme.border }]} />
        <View style={styles.text}>
          <ThemedText type="small" style={styles.title}>
            Theme and colors
          </ThemedText>
          <ThemedText type="caption" themeColor="textTertiary">
            {`${definition.label} · ${currentAccent}`}
          </ThemedText>
        </View>
        <Icon name="chevron_right" size={22} color={theme.textSecondary} />
      </Pressable>
    </SettingsSection>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 48,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    marginHorizontal: -Spacing.two,
    borderRadius: Radius.md,
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
  title: {
    fontWeight: 700,
  },
});
