import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useMemo, type PropsWithChildren } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Provider } from 'react-redux';

import { AnimatedSplashOverlay } from '@/components/animated-icon';

import { initDatabase } from '@/db';
import { AudioPlaybackSync } from '@/features/audio/audio-playback-sync';
import { MiniPlayer } from '@/features/audio/mini-player';
import { CastSync } from '@/features/cast/cast-sync';
import { SubtitleStyleSync } from '@/features/player/subtitle-style-sync';
import { SoundEffectsSync } from '@/features/sound/sound-effects-sync';
import { useTheme } from '@/hooks/use-theme';
import { store } from '@/store';
import { hydrateSettings, persistSettingsChanges } from '@/store/settings-persistence';
import { hydrateSound } from '@/store/sound-persistence';
import VlcPlayer from '@modules/vlc-player';

SplashScreen.preventAutoHideAsync();

/**
 * Whether a background is dark enough to need light status-bar icons. Themes do not label themselves
 * light or dark - a single palette such as Neon is only ever drawn dark - so this reads the colour.
 */
function isDark(hex: string): boolean {
  const value = hex.replace('#', '');
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 < 128;
}

/**
 * Reads the palette the user settled on, which lives in the store, so it has to sit inside the Provider
 * rather than in `RootLayout` itself. Navigation's own surfaces - the screen background it paints
 * between screens, its card and its borders - are drawn from the same palette.
 */
function AppTheme({ children }: PropsWithChildren) {
  const theme = useTheme();
  const dark = isDark(theme.background);

  const navigationTheme = useMemo(() => {
    const base = dark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: theme.accent,
        background: theme.background,
        card: theme.background,
        text: theme.text,
        border: theme.border,
      },
    };
  }, [dark, theme.accent, theme.background, theme.border, theme.text]);

  // The window behind React shows through during screen transitions, so it has to follow the theme too.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.background).catch((error: unknown) =>
      console.warn('[theme] window background failed', error)
    );
  }, [theme.background]);

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style={dark ? 'light' : 'dark'} />
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
