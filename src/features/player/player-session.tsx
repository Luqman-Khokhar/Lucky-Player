import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useCastVideo } from '@/features/cast/use-cast-video';
import { useTheme } from '@/hooks/use-theme';
import { VlcPlayerView } from '@modules/vlc-player';

import { PlayerControls } from './player-controls';
import { PlayerErrorPanel } from './player-error-panel';
import { PlayerGestureLayer } from './player-gesture-layer';
import { PlayerNotice } from './player-notice';
import { SettingsSheet } from './settings-sheet/settings-sheet';
import { usePlayerController } from './use-player-controller';
import type { SystemControls } from './use-system-controls';

const CONTROLS_HIDE_MS = 3500;
const LOCKED_HINT_MS = 1500;
const CAST_NOTICE_MS = 6000;
// Previous restarts the current video once playback is past this point.
const RESTART_THRESHOLD_MS = 3000;

type PlayerSessionProps = {
  uri: string;
  title: string;
  system: SystemControls;
  locked: boolean;
  rotationLocked: boolean;
  onBack: () => void;
  onToggleLock: () => void;
  onToggleRotation: () => void;
  /** Undefined when the queue has no video in that direction. */
  onPrevious?: () => void;
  onNext?: () => void;
  /** Called when playback reaches the end; undefined keeps the finished video on screen. */
  onEnded?: () => void;
};

/** Playback of one video. The player screen remounts it (keyed by uri) when the queue moves. */
export function PlayerSession(props: PlayerSessionProps) {
  const { uri, title, system, locked, onBack, onPrevious, onNext } = props;
  const theme = useTheme();
  const player = usePlayerController(uri, props.onEnded);
  const { state } = player;
  const [controlsVisible, setControlsVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sheetSession, setSheetSession] = useState(0);
  const [lastInteraction, setLastInteraction] = useState(0);
  const [castNotice, setCastNotice] = useState<string | null>(null);
  const { castFromPlayer } = useCastVideo();

  useEffect(() => {
    if (!castNotice) return;
    const id = setTimeout(() => setCastNotice(null), CAST_NOTICE_MS);
    return () => clearTimeout(id);
  }, [castNotice]);

  // Local playback pauses first; the laptop continues from the same position.
  const castToLaptop = async () => {
    if (!state.paused) player.togglePlay();
    const { position, duration } = player.getProgress();
    const error = await castFromPlayer({ uri, title, startMs: position, durationMs: duration });
    if (error) setCastNotice(error);
  };

  const ended = state.playbackState === 'ended';
  const inPictureInPicture = player.pictureInPicture.active;
  const showControls = !settingsOpen && !state.error && !inPictureInPicture && (controlsVisible || ended);

  useEffect(() => {
    if (!showControls || state.paused || state.playbackState !== 'playing') return;
    const id = setTimeout(() => setControlsVisible(false), locked ? LOCKED_HINT_MS : CONTROLS_HIDE_MS);
    return () => clearTimeout(id);
  }, [showControls, state.paused, state.playbackState, locked, lastInteraction]);

  const markInteraction = useCallback(() => setLastInteraction(Date.now()), []);
  const toggleControls = useCallback(() => setControlsVisible((visible) => !visible), []);
  const openSettings = useCallback(() => {
    setSheetSession((value) => value + 1);
    setSettingsOpen(true);
  }, []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  const playPrevious = () => {
    if (!onPrevious || player.getProgress().position > RESTART_THRESHOLD_MS) player.seekTo(0);
    else onPrevious();
  };

  const { media } = state;
  const subtitle = media
    ? [
        media.codec.toUpperCase(),
        media.height ? `${media.height}p` : '',
        media.frameRate > 0 ? `${Math.round(media.frameRate)} fps` : '',
        media.hardware ? 'HW' : 'SW',
      ]
        .filter(Boolean)
        .join(' · ')
    : '';
  const loading = !state.error && (!player.playerProps || state.playbackState === 'opening');

  return (
    <View style={styles.root}>
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
        system={system}
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
        title={title}
        subtitle={subtitle}
        paused={state.paused}
        position={state.progress.position}
        duration={state.progress.duration}
        skipMs={player.skipMs}
        hasPrevious={onPrevious !== undefined}
        hasNext={onNext !== undefined}
        rotationLocked={props.rotationLocked}
        pictureInPictureSupported={player.pictureInPicture.supported}
        onPictureInPicture={player.pictureInPicture.enter}
        onCast={castToLaptop}
        onBack={onBack}
        onPrevious={playPrevious}
        onNext={() => onNext?.()}
        onToggleRotation={props.onToggleRotation}
        onTogglePlay={player.togglePlay}
        onSkip={player.skip}
        onSeek={player.seekTo}
        onOpenSettings={openSettings}
        onToggleLock={props.onToggleLock}
        onInteraction={markInteraction}
      />

      <PlayerNotice message={inPictureInPicture ? null : (castNotice ?? state.notice)} />

      {state.error ? <PlayerErrorPanel error={state.error} onRetry={player.retry} onBack={onBack} /> : null}

      <SettingsSheet
        key={`settings-${sheetSession}`}
        open={settingsOpen && !inPictureInPicture}
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
