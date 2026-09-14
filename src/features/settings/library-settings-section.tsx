import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useLibraryActions } from '@/features/library/use-library-actions';
import { useLibraryQuery } from '@/features/library/use-library-query';
import { useOpenFile } from '@/features/library/use-open-file';
import { clearThumbnailMemoryCache } from '@/features/library/use-thumbnail';
import { useTheme } from '@/hooks/use-theme';
import { useAppDispatch, useAppSelector } from '@/store';
import { libraryChanged, THUMBNAIL_CACHE_MAX_BYTES, type LibraryPermission } from '@/store/library-slice';
import { formatBytes, formatCount, formatScanTime } from '@/utils/format';
import VlcPlayer from '@modules/vlc-player';

import { SettingsRow, SettingsSection } from './settings-section';

const PERMISSION_LABELS: Record<LibraryPermission, string> = {
  unknown: 'Checking…',
  granted: 'All videos',
  limited: 'Selected videos only',
  denied: 'Not allowed',
};

export function LibrarySettingsSection() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const { permission, canAskAgain, scanStatus, scanError, lastScanAt, videoCount } = useAppSelector(
    (state) => state.library
  );
  const { rescan, requestAccess, openAppSettings } = useLibraryActions();
  const { openFile, picking, error } = useOpenFile();
  // Passing a huge cap reads the cache size without deleting anything.
  const cacheSize = useLibraryQuery('thumbnail-cache-size', () => VlcPlayer.trimThumbnailCache(Number.MAX_SAFE_INTEGER));
  const [clearing, setClearing] = useState(false);

  const scanning = scanStatus === 'scanning';
  const lastScan = scanning
    ? 'Scanning…'
    : scanStatus === 'error'
      ? `Failed: ${scanError ?? 'unknown error'}`
      : formatScanTime(lastScanAt);

  const clearThumbnails = async () => {
    setClearing(true);
    try {
      await VlcPlayer.trimThumbnailCache(0);
      clearThumbnailMemoryCache();
      dispatch(libraryChanged());
    } finally {
      setClearing(false);
    }
  };

  return (
    <SettingsSection title="Library">
      <SettingsRow label="Videos" value={formatCount(videoCount, 'video')} />
      <SettingsRow label="Last scan" value={lastScan} />
      <SettingsRow label="Access" value={PERMISSION_LABELS[permission]} />
      <SettingsRow
        label="Thumbnails"
        value={
          cacheSize.data === null
            ? cacheSize.error
              ? 'Size unavailable'
              : 'Measuring…'
            : `${formatBytes(cacheSize.data)} of ${formatBytes(THUMBNAIL_CACHE_MAX_BYTES)}`
        }
      />
      <View style={styles.actions}>
        <Button label={scanning ? 'Scanning…' : 'Rescan now'} variant="secondary" disabled={scanning} onPress={rescan} />
        {permission === 'limited' || permission === 'denied' ? (
          <Button
            label="Allow all videos"
            variant="secondary"
            onPress={permission === 'denied' && !canAskAgain ? openAppSettings : requestAccess}
          />
        ) : null}
        <Button
          label={clearing ? 'Clearing…' : 'Clear thumbnails'}
          variant="secondary"
          disabled={clearing}
          onPress={clearThumbnails}
        />
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
