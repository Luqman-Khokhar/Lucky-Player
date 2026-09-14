import { SymbolView, type AndroidSymbol } from 'expo-symbols';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';

export type IconName = AndroidSymbol;

type IconProps = {
  name: IconName;
  size?: number;
  color: ColorValue;
  style?: StyleProp<ViewStyle>;
};

/** Material Symbols glyph from the bundled font, so it renders offline. Decorative: label the parent control. */
export function Icon({ name, size = 24, color, style }: IconProps) {
  return (
    <SymbolView
      name={{ android: name, web: name }}
      size={size}
      tintColor={color}
      style={style}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
