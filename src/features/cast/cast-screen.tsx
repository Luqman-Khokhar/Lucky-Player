import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { ScreenHeader } from '@/components/ui/screen-header';
import { StateView } from '@/components/ui/state-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAppSelector } from '@/store';

import { CastConnectCard } from './cast-connect-card';
import { CastReceiverList } from './cast-receiver-list';
import { useCastActions } from './use-cast-actions';

export function CastScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cast = useAppSelector((state) => state.cast);
  const actions = useCastActions();

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
          message="Play your videos in the laptop's web browser. Nothing to install: the laptop only needs to be on the same Wi-Fi, or on this phone's hotspot."
          action={{ label: 'Start casting', onPress: actions.start }}
        />
      );
    }
    return (
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.four }]}>
        <View style={styles.column}>
          <CastConnectCard address={cast.address} code={cast.code} network={cast.network} />
          <CastReceiverList receivers={cast.receivers} onForgetLaptops={actions.forgetLaptops} />
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
});
