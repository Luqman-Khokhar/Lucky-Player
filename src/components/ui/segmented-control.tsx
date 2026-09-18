import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type Segment<K extends string> = { key: K; label: string };

type SegmentedControlProps<K extends string> = {
  options: Segment<K>[];
  value: K;
  onChange: (value: K) => void;
  /** Names the group for screen readers, e.g. "Library view". */
  label: string;
};

/** Equal-width tabs that switch between views of the same content. */
export function SegmentedControl<K extends string>({ options, value, onChange, label }: SegmentedControlProps<K>) {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      style={[styles.group, { backgroundColor: theme.backgroundElement }]}>
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.key)}
            style={({ pressed }) => [
              styles.segment,
              selected && { backgroundColor: theme.accent },
              pressed && !selected && { backgroundColor: theme.backgroundSelected },
            ]}>
            <ThemedText
              type="smallBold"
              numberOfLines={1}
              style={[styles.label, { color: selected ? theme.onAccent : theme.text }]}>
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    padding: Spacing.half,
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.two,
    borderRadius: Spacing.four,
  },
  segment: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.four,
  },
  label: {
    textAlign: 'center',
  },
});
