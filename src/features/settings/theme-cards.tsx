import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import {
  Radius,
  Spacing,
  THEME_CHOICES,
  Themes,
  resolvePalette,
  themeModes,
  type ThemeName,
} from '@/constants/theme';
import { useAppScheme } from '@/hooks/use-app-scheme';
import { useTheme } from '@/hooks/use-theme';

type ThemeCardsProps = {
  value: ThemeName;
  onChange: (name: ThemeName) => void;
};

/**
 * One row per theme, each previewing itself: the strip on the left is that theme's own page, card and
 * accent colors, so the list reads as five samples rather than five names.
 */
export function ThemeCards({ value, onChange }: ThemeCardsProps) {
  const theme = useTheme();
  const mode = useAppScheme();

  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Theme" style={styles.list}>
      {THEME_CHOICES.map((name) => {
        const definition = Themes[name];
        const modes = themeModes(name);
        // A dark-only theme has nothing to show in light, so it always previews itself dark.
        const previewMode = modes.includes(mode) ? mode : 'dark';
        const preview = resolvePalette(name, previewMode, definition.defaultAccent);
        const selected = name === value;

        return (
          <Pressable
            key={name}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={definition.label}
            accessibilityHint={definition.description}
            onPress={() => onChange(name)}
            style={({ pressed }) => [
              styles.row,
              {
                backgroundColor: selected ? theme.accentSoft : 'transparent',
                borderColor: selected ? theme.accentText : theme.border,
              },
              pressed && styles.pressed,
            ]}>
            <View style={[styles.preview, { backgroundColor: preview.background, borderColor: theme.border }]}>
              <View style={[styles.previewCard, { backgroundColor: preview.backgroundElement }]} />
              <View style={[styles.previewBar, { backgroundColor: preview.accent }]} />
            </View>
            <View style={styles.text}>
              <ThemedText type="small" style={styles.name}>
                {definition.label}
              </ThemedText>
              <ThemedText type="caption" themeColor="textTertiary">
                {definition.description}
              </ThemedText>
            </View>
            {selected ? <Icon name="check_circle" size={22} color={theme.accentText} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 64,
    padding: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pressed: {
    opacity: 0.7,
  },
  preview: {
    width: 52,
    height: 44,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.one,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  previewCard: {
    height: 14,
    borderRadius: Radius.xs,
  },
  previewBar: {
    height: 6,
    width: '70%',
    borderRadius: Radius.pill,
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
  name: {
    fontWeight: 700,
  },
});
