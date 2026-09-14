import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useLibraryActions } from '@/features/library/use-library-actions';
import { useOpenFile } from '@/features/library/use-open-file';
import { useTheme } from '@/hooks/use-theme';
import { useAppSelector } from '@/store';
import type { LibraryPermission } from '@/store/library-slice';
import { formatCount, formatScanTime } from '@/utils/format';

import { SettingsRow, SettingsSection } from './settings-section';

const PERMISSION_LABELS: Record<LibraryPermission, string> = {
  unknown: 'Checking…',
  granted: 'All videos',
  limited: 'Selected videos only',
  denied: 'Not allowed',
};

export function LibrarySettingsSection() {
  const theme = useTheme();
  const { permission, canAskAgain, scanStatus, scanError, lastScanAt, videoCount } = useAppSelector(
    (state) => state.library
  );
  const { rescan, requestAccess, openAppSettings } = useLibraryActions();
  const { openFile, picking, error } = useOpenFile();

  const scanning = scanStatus === 'scanning';
  const lastScan = scanning
    ? 'Scanning…'
    : scanStatus === 'error'
      ? `Failed: ${scanError ?? 'unknown error'}`
      : formatScanTime(lastScanAt);

  return (
    <SettingsSection title="Library">
      <SettingsRow label="Videos" value={formatCount(videoCount, 'video')} />
      <SettingsRow label="Last scan" value={lastScan} />
      <SettingsRow label="Access" value={PERMISSION_LABELS[permission]} />
      <View style={styles.actions}>
        <Button
          label={scanning ? 'Scanning…' : 'Rescan now'}
          variant="secondary"
          disabled={scanning || permission === 'denied'}
          onPress={rescan}
        />
        {permission === 'limited' || permission === 'denied' ? (
          <Button
            label="Allow all videos"
            variant="secondary"
            onPress={permission === 'denied' && !canAskAgain ? openAppSettings : requestAccess}
          />
        ) : null}
        <Button label={picking ? 'Opening…' : 'Open a file'} disabled={picking} onPress={openFile} />
      </View>
      {error ? (
        <ThemedText type="small" accessibilityRole="alert" style={{ color: theme.danger }}>
          {error}
        </ThemedText>
      ) : null}
    </SettingsSection>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
});
