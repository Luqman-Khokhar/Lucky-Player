import { useCallback } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconButton } from '@/components/ui/icon-button';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Slider } from '@/components/ui/slider';
import { StateView } from '@/components/ui/state-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { formatTime } from '@/features/player/format-time';
import { useGoBack } from '@/hooks/use-go-back';
import { useTheme } from '@/hooks/use-theme';
import { useAppDispatch, useAppSelector } from '@/store';
import { audioScrubbed } from '@/store/audio-slice';
import VlcPlayer, { type RepeatMode } from '@modules/vlc-player';

import { AlbumArt } from './album-art';

const SEEK_STEP_MS = 1000;
const ART_MAX_WIDTH = 360;

const REPEAT_ORDER: RepeatMode[] = ['off', 'all', 'one'];
const REPEAT_ICON = { off: 'repeat', all: 'repeat_on', one: 'repeat_one_on' } as const;
const REPEAT_LABEL = {
  off: 'Repeat off. Tap to repeat the queue',
  all: 'Repeating the queue. Tap to repeat this track',
  one: 'Repeating this track. Tap to turn repeat off',
} as const;

function warn(scope: string) {
  return (error: unknown) => console.warn(`[audio] ${scope}`, error);
}

export function NowPlayingScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const goBack = useGoBack();
  const { width } = useWindowDimensions();
  const audio = useAppSelector((state) => state.audio);

  const artSize = Math.min(width - Spacing.four * 2, ART_MAX_WIDTH);

  const scrub = useCallback(
    (value: number) => {
      dispatch(audioScrubbed(value));
      VlcPlayer.audioSeek(value).catch(warn('seek'));
    },
    [dispatch]
  );

  if (!audio.active) {
    return (
      <ThemedView style={styles.root}>
        <ScreenHeader title="Now playing" onBack={goBack} />
        <StateView
          icon="music_note"
          title="Nothing is playing"
          message="Pick a track in the Music tab and it appears here."
        />
      </ThemedView>
    );
  }

  const max = Math.max(audio.durationMs, 1);
  const nextRepeat = REPEAT_ORDER[(REPEAT_ORDER.indexOf(audio.repeat) + 1) % REPEAT_ORDER.length];

  return (
    <ThemedView style={styles.root}>
      <ScreenHeader title="Now playing" subtitle={audio.album ?? undefined} onBack={goBack} />
      <View style={[styles.body, { paddingBottom: insets.bottom + Spacing.four }]}>
        <View style={[styles.art, { width: artSize, height: artSize, backgroundColor: theme.backgroundSelected }]}>
          {audio.uri ? (
            <AlbumArt uri={audio.uri} artKey={audio.artKey ?? audio.uri} width={artSize} icon="album" />
          ) : null}
        </View>

        <View style={styles.titles}>
          <ThemedText type="subtitle" numberOfLines={2} style={styles.title}>
            {audio.title ?? ''}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {audio.artist || 'Unknown artist'}
          </ThemedText>
        </View>

        <View style={styles.progress}>
          <Slider
            value={Math.min(audio.positionMs, max)}
            min={0}
            max={max}
            step={SEEK_STEP_MS}
            onChange={scrub}
            accessibilityLabel="Playback position"
            accessibilityValueText={`${formatTime(audio.positionMs)} of ${formatTime(audio.durationMs)}`}
          />
          <View style={styles.times}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.time}>
              {formatTime(audio.positionMs)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.time}>
              {formatTime(audio.durationMs)}
            </ThemedText>
          </View>
        </View>

        <View style={styles.controls}>
          <IconButton
            icon={audio.shuffle ? 'shuffle_on' : 'shuffle'}
            label={audio.shuffle ? 'Shuffle on. Tap to play in order' : 'Shuffle off. Tap to shuffle the queue'}
            color={audio.shuffle ? theme.accent : theme.textSecondary}
            pressedColor={theme.backgroundSelected}
            onPress={() => VlcPlayer.audioSetShuffle(!audio.shuffle).catch(warn('shuffle'))}
          />
          <IconButton
            icon="skip_previous"
            label="Previous track"
            size="lg"
            color={theme.text}
            pressedColor={theme.backgroundSelected}
            onPress={() => VlcPlayer.audioPrevious().catch(warn('previous'))}
          />
          <IconButton
            icon={audio.playing ? 'pause' : 'play_arrow'}
            label={audio.playing ? 'Pause' : 'Play'}
            size="xl"
            color={theme.onAccent}
            backgroundColor={theme.accent}
            pressedColor={theme.accent}
            onPress={() => VlcPlayer.audioToggle().catch(warn('toggle'))}
          />
          <IconButton
            icon="skip_next"
            label="Next track"
            size="lg"
            color={theme.text}
            pressedColor={theme.backgroundSelected}
            onPress={() => VlcPlayer.audioNext().catch(warn('next'))}
          />
          <IconButton
            icon={REPEAT_ICON[audio.repeat]}
            label={REPEAT_LABEL[audio.repeat]}
            color={audio.repeat === 'off' ? theme.textSecondary : theme.accent}
            pressedColor={theme.backgroundSelected}
            onPress={() => VlcPlayer.audioSetRepeat(nextRepeat).catch(warn('repeat'))}
          />
        </View>

        <View style={styles.footer}>
          <ThemedText type="small" themeColor="textSecondary">
            {audio.queueSize > 1 && audio.index != null ? `Track ${audio.index + 1} of ${audio.queueSize}` : ' '}
          </ThemedText>
          <IconButton
            icon="close"
            label="Stop playback and clear the queue"
            color={theme.textSecondary}
            pressedColor={theme.backgroundSelected}
            onPress={() => VlcPlayer.audioStop().catch(warn('stop'))}
          />
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  body: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
  },
  art: {
    borderRadius: Spacing.three,
    overflow: 'hidden',
  },
  titles: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  title: {
    textAlign: 'center',
  },
  progress: {
    alignSelf: 'stretch',
    gap: Spacing.one,
  },
  times: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  time: {
    fontVariant: ['tabular-nums'],
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  footer: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
