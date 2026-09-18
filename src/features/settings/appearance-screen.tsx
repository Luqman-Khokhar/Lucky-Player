import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Accents, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useGoBack } from '@/hooks/use-go-back';
import { useTheme } from '@/hooks/use-theme';
import { useAppDispatch, useAppSelector } from '@/store';
import { setAccent } from '@/store/settings-slice';

import { AccentSwatches } from './accent-swatches';
import { SettingsSection } from './settings-section';

export function AppearanceScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const goBack = useGoBack();
  const dispatch = useAppDispatch();
  const accent = useAppSelector((state) => state.settings.accent);
  const scheme = useColorScheme();

  return (
    <ThemedView style={styles.root}>
      <ScreenHeader title="Appearance" subtitle="How the app looks" onBack={goBack} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.four }]}>
        <View style={styles.column}>
          <SettingsSection title="Accent color">
            <ThemedText type="small" themeColor="textSecondary">
              Colors buttons, highlights and the playback bars. Light and dark each use their own shade of
              the color you pick, and the choice is saved with the rest of your settings.
            </ThemedText>
            <AccentSwatches value={accent} onChange={(name) => dispatch(setAccent(name))} />
          </SettingsSection>

          <SettingsSection title="Preview">
            <View
              style={[styles.preview, { borderColor: theme.border }]}
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants">
              <View style={styles.previewRow}>
                <Chip label={Accents[accent].label} selected onPress={() => {}} />
                <Chip label="Not selected" selected={false} onPress={() => {}} />
              </View>
              <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
                <View style={[styles.fill, { backgroundColor: theme.accent }]} />
              </View>
              <View style={styles.previewRow}>
                <Button label="Play" icon="play_arrow" onPress={() => {}} />
                <Button label="Later" variant="secondary" onPress={() => {}} />
              </View>
            </View>
            <ThemedText type="caption" themeColor="textTertiary" accessibilityLiveRegion="polite">
              {scheme === 'dark'
                ? 'Showing the dark shades, because your phone is set to dark.'
                : 'Showing the light shades, because your phone is set to light.'}
            </ThemedText>
          </SettingsSection>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
  },
  column: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.three,
  },
  preview: {
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  previewRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
  track: {
    height: 8,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  fill: {
    width: '62%',
    height: '100%',
  },
});
