import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon, type IconName } from '@/components/ui/icon';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type SheetActionProps = {
  icon: IconName;
  label: string;
  hint?: string;
  onPress: () => void;
  destructive?: boolean;
  /** Shows a tick on the right, for rows that toggle. */
  selected?: boolean;
};

/** One tappable row inside a bottom sheet. */
export function SheetAction({ icon, label, hint, onPress, destructive = false, selected }: SheetActionProps) {
  const theme = useTheme();
  const color = destructive ? theme.danger : theme.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.backgroundElement }]}>
      <Icon name={icon} size={22} color={destructive ? theme.danger : theme.textSecondary} />
      <View style={styles.text}>
        <ThemedText type="small" numberOfLines={1} style={[styles.label, { color }]}>
          {label}
        </ThemedText>
        {hint ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {hint}
          </ThemedText>
        ) : null}
      </View>
      {selected ? <Icon name="check" size={20} color={theme.accent} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
  label: {
    fontWeight: 600,
  },
});
