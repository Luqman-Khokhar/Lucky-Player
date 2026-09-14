import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { Option } from '../player-options';

type OptionListProps<T> = {
  label: string;
  options: Option<T>[];
  selected: T | undefined;
  onSelect: (value: T) => void;
  emptyLabel?: string;
};

export function OptionList<T extends string | number>({
  label,
  options,
  selected,
  onSelect,
  emptyLabel = 'Nothing to choose from.',
}: OptionListProps<T>) {
  const theme = useTheme();

  if (options.length === 0) {
    return (
      <ThemedText type="small" style={[styles.empty, { color: theme.playerTextSecondary }]}>
        {emptyLabel}
      </ThemedText>
    );
  }

  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.list}>
      {options.map((option) => {
        const checked = option.value === selected;
        return (
          <Pressable
            key={String(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked }}
            accessibilityLabel={option.description ? `${option.label}. ${option.description}` : option.label}
            onPress={() => onSelect(option.value)}
            style={({ pressed }) => [styles.row, (pressed || checked) && { backgroundColor: theme.playerPressed }]}>
            <View style={styles.text}>
              <ThemedText
                type={checked ? 'smallBold' : 'small'}
                style={{ color: checked ? theme.playerAccent : theme.playerText }}>
                {option.label}
              </ThemedText>
              {option.description ? (
                <ThemedText type="small" style={{ color: theme.playerTextSecondary }}>
                  {option.description}
                </ThemedText>
              ) : null}
            </View>
            <View style={styles.check}>
              {checked ? <Icon name="check" size={22} color={theme.playerAccent} /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.half,
  },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  text: {
    flex: 1,
  },
  check: {
    width: 24,
    alignItems: 'center',
  },
  empty: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
  },
});
