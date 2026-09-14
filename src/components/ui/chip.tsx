import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Icon, type IconName } from './icon';

type ChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: IconName;
  accessibilityLabel?: string;
};

export function Chip({ label, selected, onPress, icon, accessibilityLabel }: ChipProps) {
  const theme = useTheme();
  const color = selected ? theme.onAccent : theme.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      hitSlop={Spacing.one}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: selected ? theme.accent : theme.backgroundElement },
        pressed && styles.pressed,
      ]}>
      {icon ? <Icon name={icon} size={16} color={color} /> : null}
      <ThemedText type="smallBold" style={{ color }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.four,
  },
  pressed: {
    opacity: 0.8,
  },
});
