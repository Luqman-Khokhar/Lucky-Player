import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { VlcPlayerView } from '@modules/vlc-player';

import { PlayerControls } from './player-controls';
import { PlayerErrorPanel } from './player-error-panel';
import { PlayerGestureLayer } from './player-gesture-layer';
import { PlayerNotice } from './player-notice';
import { SettingsSheet } from './settings-sheet/settings-sheet';
import { useImmersiveMode } from './use-immersive-mode';
import { usePlayerController } from './use-player-controller';

const CONTROLS_HIDE_MS = 3500;
const LOCKED_HINT_MS = 1500;

type PlayerScreenProps = { uri?: string; title?: string };

export function PlayerScreen({ uri, title }: PlayerScreenProps) {
  const router = useRouter();
  const theme = useTheme();
  const player = usePlayerController(uri);
  const { state } = player;
  const [controlsVisible, setControlsVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sheetSession, setSheetSession] = useState(0);
  const [locked, setLocked] = useState(false);
  const [lastInteraction, setLastInteraction] = useState(0);
  useImmersiveMode();

  const ended = state.playbackState === 'ended';
  const showControls = !settingsOpen && !state.error && (controlsVisible || ended);

  useEffect(() => {
    if (!showControls || state.paused || state.playbackState !== 'playing') return;
    const id = setTimeout(() => setControlsVisible(false), locked ? LOCKED_HINT_MS : CONTROLS_HIDE_MS);
    return () => clearTimeout(id);
  }, [showControls, state.paused, state.playbackState, locked, lastInteraction]);

  const goBack = useCallback(() => router.back(), [router]);
  const markInteraction = useCallback(() => setLastInteraction(Date.now()), []);
  const toggleControls = useCallback(() => setControlsVisible((visible) => !visible), []);
  const toggleLock = useCallback(() => setLocked((value) => !value), []);
  const openSettings = useCallback(() => {
    setSheetSession((value) => value + 1);
    setSettingsOpen(true);
  }, []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  if (!uri) {
    return (
      <View style={[styles.root, styles.centered, { backgroundColor: theme.playerBackground }]}>
        <ThemedText style={{ color: theme.playerText }}>No video was selected.</ThemedText>
        <Button label="Go back" onPress={goBack} />
      </View>
    );
  }

  const { media } = state;
  const subtitle = media
    ? [media.codec.toUpperCase(), media.height ? `${media.height}p` : '', media.hardware ? 'HW' : 'SW']
        .filter(Boolean)
        .join(' · ')
    : '';
  const loading = !state.error && (!player.playerProps || state.playbackState === 'opening');

  return (
    <View style={[styles.root, { backgroundColor: theme.playerBackground }]}>
      <StatusBar hidden />
      {player.playerProps ? (
        <VlcPlayerView
          key={`player-${player.playerKey}`}
          ref={player.playerRef}
          style={StyleSheet.absoluteFill}
          {...player.playerProps}
        />
      ) : null}

      <PlayerGestureLayer
        locked={locked}
        skipMs={player.skipMs}
        zoom={state.zoom}
        getProgress={player.getProgress}
        onToggleControls={toggleControls}
        onSkip={player.skip}
        onSeek={player.seekTo}
        onZoom={player.setZoom}
        onBoost={player.setBoosted}
      />

      {loading ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.centered]}>
          <View style={[styles.spinner, { backgroundColor: theme.playerScrim }]}>
            <ActivityIndicator size="large" color={theme.playerText} accessibilityLabel="Loading video" />
          </View>
        </View>
      ) : null}

      <PlayerControls
        visible={showControls}
        locked={locked}
        title={title ?? 'Video'}
        subtitle={subtitle}
        paused={state.paused}
        position={state.progress.position}
        duration={state.progress.duration}
        skipMs={player.skipMs}
        onBack={goBack}
        onTogglePlay={player.togglePlay}
        onSkip={player.skip}
        onSeek={player.seekTo}
        onOpenSettings={openSettings}
        onToggleLock={toggleLock}
        onInteraction={markInteraction}
      />

      <PlayerNotice message={state.notice} />

      {state.error ? <PlayerErrorPanel error={state.error} onRetry={player.retry} onBack={goBack} /> : null}

      <SettingsSheet
        key={`settings-${sheetSession}`}
        open={settingsOpen}
        values={state.settingsValues}
        actions={player.settingsActions}
        onClose={closeSettings}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  spinner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
