import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Last row of the folder list: points to Settings for folders Android does not index. */
export function AddFolderFooter({ onPress }: { onPress: () => void }) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Opens settings to add a folder"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.backgroundElement }]}>
      <View style={[styles.iconWrap, { backgroundColor: theme.backgroundElement }]}>
        <Icon name="create_new_folder" size={24} color={theme.accent} />
      </View>
      <View style={styles.text}>
        <ThemedText type="smallBold" style={{ color: theme.accent }}>
          Missing a folder?
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Add folders Android doesn&apos;t scan, like ones with a .nomedia file.
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginTop: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
  },
});
