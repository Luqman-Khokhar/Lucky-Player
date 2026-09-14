import { StyleSheet, TextInput, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Icon } from './icon';
import { IconButton } from './icon-button';

type SearchFieldProps = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
};

export function SearchField({ value, onChangeText, placeholder }: SearchFieldProps) {
  const theme = useTheme();

  return (
    <View style={[styles.field, { backgroundColor: theme.backgroundElement }]}>
      <Icon name="search" size={20} color={theme.textSecondary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        accessibilityLabel={placeholder}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        style={[styles.input, { color: theme.text }]}
      />
      {value ? (
        <IconButton
          icon="close"
          label="Clear search"
          color={theme.textSecondary}
          pressedColor={theme.backgroundSelected}
          onPress={() => onChangeText('')}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.one,
    borderRadius: Spacing.four,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: Spacing.two,
  },
});
