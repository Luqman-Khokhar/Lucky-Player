import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { Spacing } from '@/constants/theme';
import { listFolderSources, type FolderSource } from '@/db';
import { useLibraryQuery } from '@/features/library/use-library-query';
import { useTheme } from '@/hooks/use-theme';
import { useAppDispatch } from '@/store';
import { pickAndAddFolder, removeFolder } from '@/store/library-slice';
import { formatCount, formatScanTime } from '@/utils/format';

import { SettingsSection } from './settings-section';

type Notice = { tone: 'info' | 'error'; text: string };

function errorText(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'message' in error) return String(error.message);
  return fallback;
}

export function FolderSourcesSection() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const sources = useLibraryQuery('folder-sources', listFolderSources);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const addFolder = async () => {
    setNotice(null);
    setAdding(true);
    try {
      const result = await dispatch(pickAndAddFolder()).unwrap();
      if (result) setNotice({ tone: 'info', text: `Added “${result.name}” with ${formatCount(result.count, 'video')}.` });
    } catch (error) {
      setNotice({ tone: 'error', text: errorText(error, 'The folder could not be added.') });
    } finally {
      setAdding(false);
    }
  };

  const remove = (source: FolderSource) => {
    setNotice(null);
    dispatch(removeFolder(source))
      .unwrap()
      .then(() => setNotice({ tone: 'info', text: `Removed “${source.name}”. Its files were not deleted.` }))
      .catch((error: unknown) => setNotice({ tone: 'error', text: errorText(error, 'The folder could not be removed.') }));
  };

  const renderList = () => {
    if (sources.data === null) {
      return sources.error ? (
        <ThemedText type="small" accessibilityRole="alert" style={{ color: theme.danger }}>
          Couldn&apos;t load folders: {sources.error}
        </ThemedText>
      ) : (
        <ActivityIndicator color={theme.accent} accessibilityLabel="Loading folders" />
      );
    }
    if (sources.data.length === 0) {
      return (
        <ThemedText type="small" themeColor="textSecondary">
          No extra folders yet.
        </ThemedText>
      );
    }
    return sources.data.map((source) => <FolderSourceRow key={source.id} source={source} onRemove={remove} />);
  };

  return (
    <SettingsSection title="Extra folders">
      <ThemedText type="small" themeColor="textSecondary">
        Add folders that Android&apos;s media scanner skips, such as folders with a .nomedia file or on a USB drive.
      </ThemedText>
      <View style={styles.list}>{renderList()}</View>
      <View style={styles.actions}>
        <Button label={adding ? 'Adding…' : 'Add folder'} disabled={adding} onPress={addFolder} />
      </View>
      {notice ? (
        <ThemedText
          type="small"
          accessibilityLiveRegion="polite"
          accessibilityRole={notice.tone === 'error' ? 'alert' : undefined}
          style={{ color: notice.tone === 'error' ? theme.danger : theme.textSecondary }}>
          {notice.text}
        </ThemedText>
      ) : null}
    </SettingsSection>
  );
}

function FolderSourceRow({ source, onRemove }: { source: FolderSource; onRemove: (source: FolderSource) => void }) {
  const theme = useTheme();
  const status = source.lastError ? 'Access lost. Remove it and add it again.' : formatScanTime(source.lastScanAt);

  return (
    <View style={styles.row}>
      <Icon name={source.lastError ? 'warning' : 'folder'} size={22} color={source.lastError ? theme.danger : theme.accent} />
      <View style={styles.rowText}>
        <ThemedText type="small" numberOfLines={1} style={styles.rowName}>
          {source.name}
        </ThemedText>
        <ThemedText
          type="small"
          numberOfLines={2}
          style={{ color: source.lastError ? theme.danger : theme.textSecondary }}>
          {`${formatCount(source.videoCount, 'video')} · ${status}`}
        </ThemedText>
      </View>
      <IconButton
        icon="delete"
        label={`Remove ${source.name}`}
        color={theme.textSecondary}
        pressedColor={theme.backgroundSelected}
        onPress={() => onRemove(source)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  rowText: {
    flex: 1,
  },
  rowName: {
    fontWeight: 600,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
