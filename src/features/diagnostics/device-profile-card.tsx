import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import VlcPlayer, { type DeviceProfile } from '@modules/vlc-player';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; profile: DeviceProfile };

export function DeviceProfileCard() {
  const theme = useTheme();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      setState({ status: 'ready', profile: await VlcPlayer.getDeviceProfile() });
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold" accessibilityRole="header">
        This device
      </ThemedText>

      {state.status === 'loading' ? (
        <View style={styles.placeholder} accessibilityLabel="Reading device capabilities">
          <ActivityIndicator color={theme.text} />
          <ThemedText type="small" themeColor="textSecondary">
            Reading device capabilities…
          </ThemedText>
        </View>
      ) : null}

      {state.status === 'error' ? (
        <View style={styles.placeholder}>
          <ThemedText type="small" accessibilityRole="alert" style={{ color: theme.danger }}>
            Couldn&apos;t read device capabilities: {state.message}
          </ThemedText>
          <Button label="Retry" variant="secondary" onPress={load} />
        </View>
      ) : null}

      {state.status === 'ready' ? <ProfileDetails profile={state.profile} /> : null}
    </ThemedView>
  );
}

function ProfileDetails({ profile }: { profile: DeviceProfile }) {
  const hardwareDecoders = profile.hardwareDecoders.filter((decoder) => decoder.hardware);
  const rates = profile.refreshRates.map((rate) => rate.toFixed(0)).join(' / ');

  return (
    <View style={styles.details}>
      <Row label="Device" value={`${profile.brand} ${profile.model}`} />
      <Row label="Chipset" value={profile.socModel || profile.hardware} />
      <Row label="Android" value={`${profile.androidVersion} (API ${profile.sdkInt})`} />
      <Row label="RAM" value={`${(profile.totalRamMb / 1024).toFixed(1)} GB${profile.lowRamDevice ? ' (low-RAM mode)' : ''}`} />
      <Row label="Display" value={`${profile.currentRefreshRate.toFixed(0)} Hz now · supports ${rates} Hz`} />
      <Row label="libVLC" value={profile.libVlcVersion} />

      {profile.isTranssion ? (
        <ThemedText type="small" themeColor="textSecondary">
          XOS device detected{profile.isMediaTek ? ' on MediaTek' : ''}. Automatic hardware → software decoder fallback is on.
        </ThemedText>
      ) : null}

      <ThemedText type="smallBold" accessibilityRole="header" style={styles.sectionTitle}>
        Hardware video decoders
      </ThemedText>
      {hardwareDecoders.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          No hardware video decoders reported. Playback will use software decoding.
        </ThemedText>
      ) : (
        hardwareDecoders.map((decoder) => (
          <Row
            key={`${decoder.name}-${decoder.codec}`}
            label={decoder.codec.toUpperCase()}
            value={`${decoder.maxWidth}×${decoder.maxHeight}${decoder.tenBit ? ' · 10-bit' : ''}\n${decoder.name}`}
          />
        ))
      )}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.rowLabel}>
        {label}
      </ThemedText>
      <ThemedText type="small" style={styles.rowValue} selectable>
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.three,
    borderRadius: Radius.md,
    gap: Spacing.two,
  },
  placeholder: {
    minHeight: 96,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  details: {
    gap: Spacing.two,
  },
  sectionTitle: {
    marginTop: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  rowLabel: {
    width: 88,
  },
  rowValue: {
    flex: 1,
    minWidth: 160,
  },
});
