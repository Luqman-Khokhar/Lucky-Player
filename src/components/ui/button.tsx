import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Icon, type IconName } from './icon';

export type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName;
  disabled?: boolean;
  accessibilityHint?: string;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled = false,
  accessibilityHint,
}: ButtonProps) {
  const theme = useTheme();

  const background = {
    primary: theme.accent,
    secondary: theme.backgroundElement,
    ghost: 'transparent',
    danger: theme.dangerSoft,
  }[variant];

  const foreground = {
    primary: theme.onAccent,
    secondary: theme.text,
    ghost: theme.accentText,
    danger: theme.danger,
  }[variant];

  const border = {
    primary: 'transparent',
    secondary: theme.border,
    ghost: theme.border,
    danger: 'transparent',
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: background, borderColor: border },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      {icon ? <Icon name={icon} size={18} color={foreground} /> : null}
      <ThemedText type="smallBold" numberOfLines={1} style={{ color: foreground }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pressed: {
    opacity: 0.75,
  },
  disabled: {
    opacity: 0.45,
  },
});
