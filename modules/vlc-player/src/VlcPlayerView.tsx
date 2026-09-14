import { requireNativeView } from 'expo';
import * as React from 'react';

import type { VlcPlayerViewProps, VlcPlayerViewRef } from './VlcPlayer.types';

type Props = VlcPlayerViewProps & { ref?: React.Ref<VlcPlayerViewRef> };

const NativeView: React.ComponentType<Props> = requireNativeView('VlcPlayer');

export default function VlcPlayerView(props: Props) {
  return <NativeView {...props} />;
}
