import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ScreenHeader } from '@/components/ui/screen-header';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { BoostPanel } from './boost-panel';
import { EqualizerPanel } from './equalizer-panel';

type SoundTab = 'boost' | 'equalizer';

const TABS: { id: SoundTab; label: string }[] = [
  { id: 'boost', label: 'Volume boost' },
  { id: 'equalizer', label: 'Equalizer' },
];

export function SoundScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<SoundTab>('boost');

  return (
    <ThemedView style={styles.root}>
      <ScreenHeader title="Sound" subtitle="Applies to every app on your phone" onBack={() => router.back()} />
      <View style={styles.tabsWrap}>
        <View style={[styles.tabs, { backgroundColor: theme.backgroundElement }]} accessibilityRole="tablist">
          {TABS.map((item) => {
            const selected = item.id === tab;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => setTab(item.id)}
                style={({ pressed }) => [
                  styles.tab,
                  selected && { backgroundColor: theme.accent },
                  pressed && !selected && { backgroundColor: theme.backgroundSelected },
                ]}>
                <ThemedText type="smallBold" style={{ color: selected ? theme.onAccent : theme.text }}>
                  {item.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.four }]}>
        <View style={styles.column}>{tab === 'boost' ? <BoostPanel /> : <EqualizerPanel />}</View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  tabsWrap: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
    alignItems: 'center',
  },
  tabs: {
    width: '100%',
    maxWidth: MaxContentWidth,
    flexDirection: 'row',
    padding: Spacing.one,
    borderRadius: Spacing.four,
    gap: Spacing.one,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.four,
  },
  content: {
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
  },
  column: {
    width: '100%',
    maxWidth: MaxContentWidth,
  },
});
