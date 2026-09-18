import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Accents, ACCENT_CHOICES, Radius, Spacing, type AccentName } from '@/constants/theme';
import { useAppScheme } from '@/hooks/use-app-scheme';
import { useTheme } from '@/hooks/use-theme';

const SWATCH_SIZE = 56;

type AccentSwatchesProps = {
  value: AccentName;
  onChange: (name: AccentName) => void;
};

/** One filled circle per accent. The chosen one carries a check and a ring drawn in its own color. */
export function AccentSwatches({ value, onChange }: AccentSwatchesProps) {
  const theme = useTheme();
  const variant = useAppScheme();

  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Accent color" style={styles.grid}>
      {ACCENT_CHOICES.map((name) => {
        const option = Accents[name];
        const colors = option[variant];
        const selected = name === value;

        return (
          <Pressable
            key={name}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(name)}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
            <View
              style={[
                styles.swatch,
                {
                  backgroundColor: colors.accent,
                  borderColor: selected ? colors.accentText : theme.border,
                },
              ]}>
              {selected ? <Icon name="check" size={26} color={colors.onAccent} /> : null}
            </View>
            <ThemedText
              type="caption"
              numberOfLines={1}
              themeColor={selected ? 'text' : 'textSecondary'}
              style={selected ? styles.selectedLabel : undefined}>
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  item: {
    alignItems: 'center',
    gap: Spacing.one,
    minWidth: SWATCH_SIZE + Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
  swatch: {
    width: SWATCH_SIZE,
    height: SWATCH_SIZE,
    borderRadius: Radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedLabel: {
    fontWeight: 700,
  },
});
