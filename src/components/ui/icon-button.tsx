import { Pressable, StyleSheet, type ColorValue, type StyleProp, type ViewStyle } from 'react-native';

import { Spacing } from '@/constants/theme';

import { Icon, type IconName } from './icon';

const DIMENSIONS = {
  md: { box: 44, icon: 24 },
  lg: { box: 56, icon: 32 },
  xl: { box: 76, icon: 48 },
} as const;

export type IconButtonProps = {
  icon: IconName;
  label: string;
  onPress: () => void;
  color: ColorValue;
  pressedColor: ColorValue;
  backgroundColor?: ColorValue;
  size?: keyof typeof DIMENSIONS;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function IconButton({
  icon,
  label,
  onPress,
  color,
  pressedColor,
  backgroundColor = 'transparent',
  size = 'md',
  disabled = false,
  style,
}: IconButtonProps) {
  const { box, icon: iconSize } = DIMENSIONS[size];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={Spacing.one}
      style={({ pressed }) => [
        styles.base,
        { width: box, height: box, borderRadius: box / 2, backgroundColor: pressed ? pressedColor : backgroundColor },
        disabled && styles.disabled,
        style,
      ]}>
      <Icon name={icon} size={iconSize} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
});
