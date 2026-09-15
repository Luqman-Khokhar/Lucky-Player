import { StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Chip } from '@/components/ui/chip';
import { Spacing } from '@/constants/theme';
import { SUBTITLE_COLOR_OPTIONS, SUBTITLE_SIZE_OPTIONS } from '@/features/player/subtitle-style';
import { useTheme } from '@/hooks/use-theme';
import { useAppDispatch, useAppSelector } from '@/store';
import { setSubtitleBackground, setSubtitleColor, setSubtitleSize } from '@/store/settings-slice';

export function SubtitleSettingsSection() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const { subtitleSize, subtitleColor, subtitleBackground } = useAppSelector((state) => state.settings);

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.group}>
        <ThemedText type="smallBold" accessibilityRole="header">
          Subtitles
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Changes apply to the next video you open.
        </ThemedText>
      </View>

      <View style={styles.group}>
        <ThemedText type="small">Text size</ThemedText>
        <View style={styles.chips}>
          {SUBTITLE_SIZE_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              accessibilityLabel={`Subtitle size: ${option.label}`}
              selected={option.value === subtitleSize}
              onPress={() => dispatch(setSubtitleSize(option.value))}
            />
          ))}
        </View>
      </View>

      <View style={styles.group}>
        <ThemedText type="small">Text color</ThemedText>
        <View style={styles.chips}>
          {SUBTITLE_COLOR_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              accessibilityLabel={`Subtitle color: ${option.label}`}
              selected={option.value === subtitleColor}
              onPress={() => dispatch(setSubtitleColor(option.value))}
            />
          ))}
        </View>
      </View>

      <View style={styles.switchRow}>
        <View style={styles.switchText}>
          <ThemedText type="small">Dark background</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Draws a box behind the text so it stays readable on bright scenes.
          </ThemedText>
        </View>
        <Switch
          value={subtitleBackground}
          onValueChange={(value) => {
            dispatch(setSubtitleBackground(value));
          }}
          accessibilityLabel="Dark background behind subtitles"
          trackColor={{ false: theme.backgroundSelected, true: theme.accent }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.three,
  },
  group: {
    gap: Spacing.two,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  switchText: {
    flex: 1,
  },
});
