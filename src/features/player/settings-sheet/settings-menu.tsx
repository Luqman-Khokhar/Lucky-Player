import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon, type IconName } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ASPECT_OPTIONS, DECODER_OPTIONS, SPEED_OPTIONS, formatDelay, labelFor, trackLabel } from '../player-options';
import type { PlayerSettingsValues, SettingsPage } from './settings-types';

type SettingsMenuProps = {
  values: PlayerSettingsValues;
  onOpen: (page: Exclude<SettingsPage, 'main'>) => void;
};

function withDelay(label: string, delayMs: number): string {
  return delayMs === 0 ? label : `${label} · ${formatDelay(delayMs)}`;
}

export function SettingsMenu({ values, onOpen }: SettingsMenuProps) {
  const { tracks } = values;
  const codec = values.codec ? ` · ${values.codec.toUpperCase()}` : '';
  const decoder = `${labelFor(DECODER_OPTIONS, values.hwMode)} · ${values.hardwareDecoding ? 'HW' : 'SW'} active${codec}`;

  return (
    <View style={styles.list}>
      <MenuRow
        icon="audiotrack"
        label="Audio"
        value={withDelay(trackLabel(tracks?.audio, tracks?.selectedAudio), values.audioDelay)}
        onPress={() => onOpen('audio')}
      />
      <MenuRow
        icon="subtitles"
        label="Subtitles"
        value={withDelay(trackLabel(tracks?.subtitle, tracks?.selectedSubtitle), values.subtitleDelay)}
        onPress={() => onOpen('subtitles')}
      />
      <MenuRow
        icon="speed"
        label="Playback speed"
        value={labelFor(SPEED_OPTIONS, values.speed)}
        onPress={() => onOpen('speed')}
      />
      <MenuRow
        icon="aspect_ratio"
        label="Aspect ratio"
        value={labelFor(ASPECT_OPTIONS, values.aspect)}
        onPress={() => onOpen('aspect')}
      />
      <MenuRow icon="memory" label="Decoder" value={decoder} onPress={() => onOpen('decoder')} />
    </View>
  );
}

type MenuRowProps = { icon: IconName; label: string; value: string; onPress: () => void };

function MenuRow({ icon, label, value, onPress }: MenuRowProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      accessibilityHint="Opens options"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.playerPressed }]}>
      <Icon name={icon} size={22} color={theme.playerText} />
      <View style={styles.text}>
        <ThemedText type="small" style={{ color: theme.playerText }}>
          {label}
        </ThemedText>
        <ThemedText type="small" numberOfLines={1} style={{ color: theme.playerTextSecondary }}>
          {value}
        </ThemedText>
      </View>
      <Icon name="chevron_right" size={22} color={theme.playerTextSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.half,
  },
  row: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.md,
  },
  text: {
    flex: 1,
  },
});
