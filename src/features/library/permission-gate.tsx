import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { StateView } from '@/components/ui/state-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppSelector } from '@/store';

import { useLibraryActions } from './use-library-actions';

/** Renders children only once media access is known; explains and requests it otherwise. */
export function PermissionGate({ children }: PropsWithChildren) {
  const { permission, canAskAgain } = useAppSelector((state) => state.library);
  const { requestAccess, openAppSettings } = useLibraryActions();

  if (permission === 'unknown') {
    return <StateView loading title="Checking media access…" />;
  }

  if (permission === 'denied') {
    return canAskAgain ? (
      <StateView
        icon="video_library"
        title="Allow access to your media"
        message="Player reads the videos and music stored on this phone to build your library. Nothing leaves your device."
        action={{ label: 'Allow access', onPress: requestAccess }}
      />
    ) : (
      <StateView
        icon="lock"
        title="Media access is turned off"
        message="Open Android settings and allow Player to access music, photos and videos."
        action={{ label: 'Open settings', onPress: openAppSettings }}
      />
    );
  }

  return (
    <>
      {permission === 'limited' ? <LimitedAccessBanner onAllowAll={requestAccess} /> : null}
      {children}
    </>
  );
}

function LimitedAccessBanner({ onAllowAll }: { onAllowAll: () => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.banner, { backgroundColor: theme.backgroundElement }]}>
      <Icon name="info" size={20} color={theme.textSecondary} />
      <ThemedText type="small" themeColor="textSecondary" style={styles.bannerText}>
        Player can only see the media you selected.
      </ThemedText>
      <Pressable accessibilityRole="button" hitSlop={Spacing.two} onPress={onAllowAll}>
        <ThemedText type="smallBold" style={{ color: theme.accentText }}>
          Allow all
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
  },
  bannerText: {
    flex: 1,
  },
});
