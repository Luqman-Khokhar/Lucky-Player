import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Provider } from 'react-redux';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { initDatabase } from '@/db';
import { AudioPlaybackSync } from '@/features/audio/audio-playback-sync';
import { MiniPlayer } from '@/features/audio/mini-player';
import { CastSync } from '@/features/cast/cast-sync';
import { SubtitleStyleSync } from '@/features/player/subtitle-style-sync';
import { SoundEffectsSync } from '@/features/sound/sound-effects-sync';
import { store } from '@/store';
import { hydrateSettings, persistSettingsChanges } from '@/store/settings-persistence';
import { hydrateSound } from '@/store/sound-persistence';
import VlcPlayer from '@modules/vlc-player';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    VlcPlayer.warmUp().catch((error: unknown) => console.warn('[vlc] warm-up failed', error));
    hydrateSound();
    initDatabase()
      .then(hydrateSettings)
      .catch((error: unknown) => console.warn('[db] init failed', error));
    return persistSettingsChanges();
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <Provider store={store}>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <AnimatedSplashOverlay />
          <SubtitleStyleSync />
          <SoundEffectsSync />
          <CastSync />
          <AudioPlaybackSync />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="folder/[bucketId]" />
            <Stack.Screen name="player" options={{ animation: 'fade' }} />
            <Stack.Screen
              name="now-playing"
              // Transparent so the list stays on screen behind the player and can be dimmed with it.
              options={{ animation: 'none', presentation: 'transparentModal' }}
            />
            <Stack.Screen name="album/[albumId]" />
            <Stack.Screen name="music-folder/[bucketId]" />
            <Stack.Screen name="playlist/[id]" />
            <Stack.Screen name="queue" />
            <Stack.Screen name="cast" />
            <Stack.Screen name="cast-remote" options={{ animation: 'fade' }} />
          </Stack>
          <MiniPlayer />
        </ThemeProvider>
      </Provider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
