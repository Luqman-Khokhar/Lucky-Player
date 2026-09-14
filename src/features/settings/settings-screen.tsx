import Constants from 'expo-constants';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ScreenHeader } from '@/components/ui/screen-header';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { DeviceProfileCard } from '@/features/diagnostics/device-profile-card';

import { LibrarySettingsSection } from './library-settings-section';
import { PlaybackSettingsSection } from './playback-settings-section';
import { SettingsRow, SettingsSection } from './settings-section';

export function SettingsScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ThemedView style={styles.root}>
      <ScreenHeader title="Settings" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.four }]}>
        <View style={styles.column}>
          <LibrarySettingsSection />
          <PlaybackSettingsSection />
          <DeviceProfileCard />
          <SettingsSection title="About">
            <SettingsRow label="Version" value={Constants.expoConfig?.version ?? 'Unknown'} />
            <ThemedText type="small" themeColor="textSecondary">
              Video playback is powered by libVLC from VideoLAN, licensed under the GNU LGPL 2.1.
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
});
