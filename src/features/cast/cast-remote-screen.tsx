import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { formatTime } from '@/features/player/format-time';
import { SKIP_ICONS } from '@/features/player/player-controls';
import { SeekBar } from '@/features/player/seek-bar';
import { useTheme } from '@/hooks/use-theme';

import { castStatusText, isCastBusy } from './cast-playback-status';
import { useCastRemote } from './use-cast-remote';

/** Phone remote while a laptop plays the video. Dark like the player, whatever the app theme. */
export function CastRemoteScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const remote = useCastRemote();
  const { playback } = remote;
  const colors = { color: theme.playerText, pressedColor: theme.playerPressed };
  const skipSeconds = Math.round(remote.seekStepMs / 1000);
  const [rewindIcon, forwardIcon] = SKIP_ICONS[skipSeconds] ?? SKIP_ICONS[10];
  const connected = playback !== null && playback.status !== 'disconnected';

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: theme.playerBackground,
          paddingTop: insets.top + Spacing.two,
          paddingBottom: insets.bottom + Spacing.three,
          paddingLeft: insets.left + Spacing.three,
          paddingRight: insets.right + Spacing.three,
        },
      ]}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <IconButton icon="arrow_back" label="Back" {...colors} onPress={() => router.back()} />
        <ThemedText type="smallBold" numberOfLines={1} style={[styles.headerText, { color: theme.playerTextSecondary }]}>
          {playback ? `Casting to ${playback.receiverName}` : 'Cast'}
        </ThemedText>
      </View>

      {playback ? (
        <View style={styles.column}>
          <View style={styles.hero}>
            <View style={[styles.heroIcon, { backgroundColor: theme.playerScrim }]}>
              <Icon name="cast_connected" size={56} color={theme.playerAccent} />
            </View>
            <ThemedText accessibilityRole="header" numberOfLines={2} style={[styles.title, { color: theme.playerText }]}>
              {playback.title}
            </ThemedText>
            <View style={styles.statusRow} accessibilityLiveRegion="polite">
              {isCastBusy(playback) ? <ActivityIndicator size="small" color={theme.playerTextSecondary} /> : null}
              <ThemedText type="small" style={[styles.status, { color: theme.playerTextSecondary }]}>
                {castStatusText(playback)}
              </ThemedText>
            </View>
          </View>

          <View>
            <SeekBar position={remote.position} duration={remote.duration} skipMs={remote.seekStepMs} onSeek={remote.seekTo} />
            <View style={styles.times}>
              <ThemedText type="small" style={[styles.time, { color: theme.playerText }]}>
                {formatTime(remote.position)}
              </ThemedText>
              <ThemedText type="small" style={[styles.time, { color: theme.playerTextSecondary }]}>
                {formatTime(remote.duration)}
              </ThemedText>
            </View>
          </View>

          <View style={styles.controls}>
            <IconButton icon="skip_previous" label="Previous video" disabled={!remote.playPrevious} {...colors} onPress={() => remote.playPrevious?.()} />
            <IconButton icon={rewindIcon} label={`Rewind ${skipSeconds} seconds`} size="lg" disabled={!connected} {...colors} onPress={() => remote.skip(-remote.seekStepMs)} />
            <IconButton
              icon={remote.playing ? 'pause' : 'play_arrow'}
              label={remote.playing ? 'Pause' : 'Play'}
              size="xl"
              backgroundColor={theme.playerScrim}
              disabled={!connected}
              {...colors}
              onPress={remote.togglePlay}
            />
            <IconButton icon={forwardIcon} label={`Forward ${skipSeconds} seconds`} size="lg" disabled={!connected} {...colors} onPress={() => remote.skip(remote.seekStepMs)} />
            <IconButton icon="skip_next" label="Next video" disabled={!remote.playNext} {...colors} onPress={() => remote.playNext?.()} />
          </View>

          {remote.notice ? (
            <ThemedText type="small" accessibilityLiveRegion="polite" style={[styles.notice, { color: theme.playerText, backgroundColor: theme.playerSheet }]}>
              {remote.notice}
            </ThemedText>
          ) : null}

          <View style={styles.actions}>
            <Button label="Play on phone" variant="secondary" onPress={remote.playOnPhone} />
            <Button label="Stop video" variant="secondary" onPress={remote.stopVideo} />
          </View>
        </View>
      ) : (
        <View style={[styles.column, styles.empty]}>
          <View style={[styles.heroIcon, { backgroundColor: theme.playerScrim }]}>
            <Icon name="cast" size={56} color={theme.playerTextSecondary} />
          </View>
          <ThemedText accessibilityRole="header" style={[styles.title, { color: theme.playerText }]}>
            Nothing is casting
          </ThemedText>
          <ThemedText type="small" style={[styles.status, { color: theme.playerTextSecondary }]}>
            Open a video and tap the cast button in the player to play it on a laptop.
          </ThemedText>
          <Button label="Go back" onPress={() => router.back()} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
  },
  header: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  headerText: {
    flex: 1,
  },
  column: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    justifyContent: 'center',
    gap: Spacing.four,
  },
  empty: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  hero: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  heroIcon: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: 600,
    textAlign: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  status: {
    flexShrink: 1,
    textAlign: 'center',
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
  notice: {
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.five,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.two,
  },
});
