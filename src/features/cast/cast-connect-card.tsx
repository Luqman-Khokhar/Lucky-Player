import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { CastNetworkKind } from '@modules/vlc-player';

type CastConnectCardProps = {
  address: string | null;
  code: string | null;
  network: CastNetworkKind | null;
};

const NETWORK_HINT: Record<CastNetworkKind, string> = {
  wifi: 'The laptop must be on the same Wi-Fi as this phone.',
  hotspot: "Connect the laptop to this phone's hotspot first.",
  lan: 'The laptop must be on the same network as this phone.',
};

/** Steps a laptop follows to connect: the address to open and the pairing code. */
export function CastConnectCard({ address, code, network }: CastConnectCardProps) {
  if (!address || !code) {
    return (
      <ThemedView type="backgroundElement" style={styles.card} accessibilityLiveRegion="polite">
        <ThemedText type="smallBold">Waiting for Wi-Fi</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          This phone lost its Wi-Fi or hotspot connection. Casting continues by itself when the connection is back.
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <Step number={1} title="On the laptop, open this address" detail={`Use Chrome, Edge or Firefox. ${network ? NETWORK_HINT[network] : ''}`}>
        <ThemedText selectable style={styles.address} accessibilityLabel={`Address: ${address}`}>
          {address}
        </ThemedText>
      </Step>
      <Step number={2} title="Enter this code on the laptop" detail="Only the first time. The laptop is remembered after that.">
        <ThemedText style={styles.code} accessibilityLabel={`Code: ${code.split('').join(' ')}`}>
          {code}
        </ThemedText>
      </Step>
    </ThemedView>
  );
}

function Step({ number, title, detail, children }: { number: number; title: string; detail: string; children: ReactNode }) {
  const theme = useTheme();

  return (
    <View style={styles.step}>
      <View style={[styles.badge, { backgroundColor: theme.accent }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
          {number}
        </ThemedText>
      </View>
      <View style={styles.stepBody}>
        <ThemedText type="smallBold" accessibilityRole="header">
          {title}
        </ThemedText>
        {children}
        <ThemedText type="small" themeColor="textSecondary">
          {detail}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.four,
  },
  step: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  badge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBody: {
    flex: 1,
    gap: Spacing.one,
  },
  address: {
    fontFamily: Fonts.mono,
    fontSize: 20,
    lineHeight: 28,
    fontWeight: 700,
  },
  code: {
    fontFamily: Fonts.mono,
    fontSize: 40,
    lineHeight: 52,
    fontWeight: 700,
    letterSpacing: Spacing.two,
  },
});
