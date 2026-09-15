import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { ScreenHeader } from '@/components/ui/screen-header';
import { StateView } from '@/components/ui/state-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAppSelector } from '@/store';
import type { CastReceiver } from '@modules/vlc-player';

import { CastConnectCard } from './cast-connect-card';
import { CastNowPlayingCard } from './cast-now-playing-card';
import { CastReceiverList } from './cast-receiver-list';
import { useCastActions } from './use-cast-actions';
import { useCastVideo, type CastRequest } from './use-cast-video';

type CastScreenProps = {
  /** A video from the player waiting for a laptop to be chosen. */
  pending?: CastRequest;
};

export function CastScreen({ pending }: CastScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cast = useAppSelector((state) => state.cast);
  const actions = useCastActions();
  const { castTo } = useCastVideo();
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [castError, setCastError] = useState<string | null>(null);

  const playHere = async (receiver: CastReceiver) => {
    if (!pending) return;
    setSendingTo(receiver.id);
    setCastError(null);
    const error = await castTo(receiver.id, pending);
    setSendingTo(null);
    if (error) setCastError(error);
    else router.replace('/cast-remote');
  };

  const renderBody = () => {
    if (cast.starting) {
      return <StateView loading title="Starting casting…" message="Opening a connection for laptops on this network." />;
    }
    if (!cast.running && cast.startError) {
      return (
        <StateView
          icon={cast.startError.code === 'no_network' ? 'wifi_off' : 'error'}
          title={cast.startError.code === 'no_network' ? 'No Wi-Fi or hotspot' : "Couldn't start casting"}
          message={cast.startError.message}
          action={{ label: 'Try again', onPress: actions.start }}
          secondaryAction={
            cast.startError.code === 'no_network' ? { label: 'Wi-Fi settings', onPress: actions.openWifiSettings } : undefined
          }
        />
      );
    }
    if (!cast.running) {
      return (
        <StateView
          icon="cast"
          title="Cast to a laptop"
          message={
            pending
              ? `Start casting, then choose a laptop for "${pending.title}". Nothing to install: the laptop only needs to be on the same Wi-Fi, or on this phone's hotspot.`
              : "Play your videos in the laptop's web browser. Nothing to install: the laptop only needs to be on the same Wi-Fi, or on this phone's hotspot."
          }
          action={{ label: 'Start casting', onPress: actions.start }}
        />
      );
    }
    return (
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.four }]}>
        <View style={styles.column}>
          {pending ? (
            <ThemedView type="backgroundElement" style={styles.card} accessibilityLiveRegion="polite">
              <ThemedText type="smallBold" accessibilityRole="header" numberOfLines={2}>
                {`Play "${pending.title}" on a laptop`}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {cast.receivers.length > 0
                  ? 'Choose a laptop below.'
                  : 'Connect a laptop first with the two steps below. It shows up in the list when it is ready.'}
              </ThemedText>
              {castError ? (
                <ThemedText type="small" themeColor="danger">
                  {castError}
                </ThemedText>
              ) : null}
            </ThemedView>
          ) : cast.playback ? (
            <CastNowPlayingCard playback={cast.playback} onOpenRemote={() => router.push('/cast-remote')} />
          ) : null}
          <CastConnectCard address={cast.address} code={cast.code} network={cast.network} />
          <CastReceiverList
            receivers={cast.receivers}
            onForgetLaptops={actions.forgetLaptops}
            onPlayHere={pending ? playHere : undefined}
            sendingTo={sendingTo}
          />
          <Button label="Stop casting" variant="secondary" onPress={actions.stop} />
        </View>
      </ScrollView>
    );
  };

  return (
    <ThemedView style={styles.root}>
      <ScreenHeader title="Cast" subtitle="Play on a laptop, nothing to install" onBack={() => router.back()} />
      {renderBody()}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
  },
  column: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.three,
  },
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
});
