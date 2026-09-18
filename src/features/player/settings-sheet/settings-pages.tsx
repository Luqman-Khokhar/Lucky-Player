import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ASPECT_OPTIONS, DECODER_OPTIONS, SPEED_OPTIONS, trackOptions } from '../player-options';
import { DelayStepper } from './delay-stepper';
import { OptionList } from './option-list';
import { SettingsMenu } from './settings-menu';
import type { PlayerSettingsActions, PlayerSettingsValues, SettingsPage } from './settings-types';

export const PAGE_TITLES: Record<SettingsPage, string> = {
  main: 'Settings',
  audio: 'Audio',
  subtitles: 'Subtitles',
  speed: 'Playback speed',
  aspect: 'Aspect ratio',
  decoder: 'Decoder',
};

type SettingsPageContentProps = {
  page: SettingsPage;
  values: PlayerSettingsValues;
  actions: PlayerSettingsActions;
  onOpen: (page: Exclude<SettingsPage, 'main'>) => void;
};

export function SettingsPageContent({ page, values, actions, onOpen }: SettingsPageContentProps) {
  const theme = useTheme();

  switch (page) {
    case 'audio':
      return (
        <View>
          <OptionList
            label="Audio track"
            options={trackOptions(values.tracks?.audio)}
            selected={values.tracks?.selectedAudio}
            onSelect={actions.selectAudio}
            emptyLabel="This video has no audio tracks."
          />
          <DelayStepper
            label="Audio delay"
            hint="Use + when audio comes before the picture"
            value={values.audioDelay}
            onChange={actions.changeAudioDelay}
          />
        </View>
      );
    case 'subtitles':
      return (
        <View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Load subtitle file"
            accessibilityHint="Opens the file picker"
            onPress={actions.loadSubtitleFile}
            style={({ pressed }) => [styles.loadRow, pressed && { backgroundColor: theme.playerPressed }]}>
            <Icon name="file_open" size={22} color={theme.playerAccent} />
            <ThemedText type="smallBold" style={{ color: theme.playerAccent }}>
              Load subtitle file
            </ThemedText>
          </Pressable>
          <OptionList
            label="Subtitle track"
            options={trackOptions(values.tracks?.subtitle)}
            selected={values.tracks?.selectedSubtitle}
            onSelect={actions.selectSubtitle}
            emptyLabel="This video has no subtitle tracks."
          />
          <DelayStepper
            label="Subtitle delay"
            hint="Use + when subtitles appear too early"
            value={values.subtitleDelay}
            onChange={actions.changeSubtitleDelay}
          />
          <ThemedText type="small" style={[styles.note, { color: theme.playerTextSecondary }]}>
            Subtitle files named like the video, such as movie.srt next to movie.mkv, load on their own for videos in
            folders you added. Text size and color are in the app settings.
          </ThemedText>
        </View>
      );
    case 'speed':
      return (
        <OptionList label="Playback speed" options={SPEED_OPTIONS} selected={values.speed} onSelect={actions.selectSpeed} />
      );
    case 'aspect':
      return (
        <OptionList label="Aspect ratio" options={ASPECT_OPTIONS} selected={values.aspect} onSelect={actions.selectAspect} />
      );
    case 'decoder':
      return (
        <View>
          <OptionList label="Decoder" options={DECODER_OPTIONS} selected={values.hwMode} onSelect={actions.selectDecoder} />
          <ThemedText type="small" style={[styles.note, { color: theme.playerTextSecondary }]}>
            Now decoding with {values.hardwareDecoding ? 'hardware' : 'software'}
            {values.codec ? ` (${values.codec.toUpperCase()})` : ''}. Changing this restarts the video at the same
            position and is remembered for this video.
          </ThemedText>
        </View>
      );
    default:
      return <SettingsMenu values={values} onOpen={onOpen} />;
  }
}

const styles = StyleSheet.create({
  loadRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    marginBottom: Spacing.two,
    borderRadius: Radius.md,
  },
  note: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
  },
});
