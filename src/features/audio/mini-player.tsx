import { usePathname, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { IconButton } from '@/components/ui/icon-button';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppSelector } from '@/store';
import VlcPlayer from '@modules/vlc-player';

import { AlbumArt } from './album-art';

const ART_WIDTH = 40;

/** The tab screens the bar sits above; the full player and the video player show their own controls. */
const TAB_ROUTES = ['/', '/music', '/settings'];

function warn(scope: string) {
  return (error: unknown) => console.warn(`[audio] ${scope}`, error);
}

/** The bar above the tab bar while music is loaded. Tapping it opens the full player. */
export function MiniPlayer() {
  const theme = useTheme();
  const router = useRouter();
  const audio = useAppSelector((state) => state.audio);
  const pathname = usePathname();

  if (!audio.active || !audio.uri || !TAB_ROUTES.includes(pathname)) return null;

  const progress = audio.durationMs > 0 ? Math.min(1, audio.positionMs / audio.durationMs) : 0;

  return (
    <View style={[styles.bar, { backgroundColor: theme.backgroundElement }]}>
      <View style={[styles.progressTrack, { backgroundColor: theme.backgroundSelected }]}>
        <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: theme.accent }]} />
      </View>
      <View style={styles.content}>
        <IconButton
          icon="expand_less"
          label={`Open the player for ${audio.title ?? 'the current track'}`}
          color={theme.textSecondary}
          pressedColor={theme.backgroundSelected}
          onPress={() => router.push('/now-playing')}
          style={styles.expand}
        />
        <AlbumArt uri={audio.uri} artKey={audio.artKey ?? audio.uri} width={ART_WIDTH} />
        <View style={styles.text}>
          <ThemedText type="small" numberOfLines={1} style={styles.title}>
            {audio.title ?? ''}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {audio.artist || 'Unknown artist'}
          </ThemedText>
        </View>
        <IconButton
          icon={audio.playing ? 'pause' : 'play_arrow'}
          label={audio.playing ? 'Pause' : 'Play'}
          color={theme.text}
          pressedColor={theme.backgroundSelected}
          onPress={() => VlcPlayer.audioToggle().catch(warn('toggle'))}
        />
        <IconButton
          icon="skip_next"
          label="Next track"
          color={theme.text}
          pressedColor={theme.backgroundSelected}
          onPress={() => VlcPlayer.audioNext().catch(warn('next'))}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: BottomTabInset,
  },
  progressTrack: {
    height: 2,
  },
  progressFill: {
    height: '100%',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
  },
  expand: {
    marginRight: -Spacing.two,
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
  title: {
    fontWeight: 600,
  },
});
