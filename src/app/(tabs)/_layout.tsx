import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useLibrarySync } from '@/features/library/use-library-sync';
import { useTheme } from '@/hooks/use-theme';

export default function TabsLayout() {
  const theme = useTheme();
  useLibrarySync();

  return (
    <NativeTabs
      backgroundColor={theme.background}
      indicatorColor={theme.backgroundSelected}
      labelStyle={{ selected: { color: theme.text } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Videos</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="video_library" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="music">
        <NativeTabs.Trigger.Label>Music</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="music_note" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
