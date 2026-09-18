import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, type PropsWithChildren } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Provider } from 'react-redux';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { Colors } from '@/constants/theme';
import { initDatabase } from '@/db';
import { AudioPlaybackSync } from '@/features/audio/audio-playback-sync';
import { MiniPlayer } from '@/features/audio/mini-player';
import { CastSync } from '@/features/cast/cast-sync';
import { SubtitleStyleSync } from '@/features/player/subtitle-style-sync';
import { SoundEffectsSync } from '@/features/sound/sound-effects-sync';
import { useAppScheme } from '@/hooks/use-app-scheme';
import { store } from '@/store';
import { hydrateSettings, persistSettingsChanges } from '@/store/settings-persistence';
import { hydrateSound } from '@/store/sound-persistence';
import VlcPlayer from '@modules/vlc-player';

SplashScreen.preventAutoHideAsync();

/** Navigation's own surfaces (screen background, card, borders) drawn from the app's tokens. */
const navigationThemes = {
  light: {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      primary: Colors.light.accent,
      background: Colors.light.background,
      card: Colors.light.background,
      text: Colors.light.text,
      border: Colors.light.border,
    },
  },
  dark: {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      primary: Colors.dark.accent,
      background: Colors.dark.background,
      card: Colors.dark.background,
      text: Colors.dark.text,
      border: Colors.dark.border,
    },
  },
};

/**
 * Reads the theme the user settled on, which lives in the store, so it has to sit inside the Provider
 * rather than in `RootLayout` itself.
 */
function AppTheme({ children }: PropsWithChildren) {
  const scheme = useAppScheme();
  const background = scheme === 'dark' ? Colors.dark.background : Colors.light.background;

  // The window behind React shows through during screen transitions, so it has to follow the theme too.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(background).catch((error: unknown) =>
      console.warn('[theme] window background failed', error)
    );
  }, [background]);

  return (
    <ThemeProvider value={scheme === 'dark' ? navigationThemes.dark : navigationThemes.light}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {children}
    </ThemeProvider>
  );
}

export default function RootLayout() {
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
        <AppTheme>
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
            <Stack.Screen name="appearance" />
            <Stack.Screen name="cast" />
            <Stack.Screen name="cast-remote" options={{ animation: 'fade' }} />
          </Stack>
          <MiniPlayer />
        </AppTheme>
      </Provider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
