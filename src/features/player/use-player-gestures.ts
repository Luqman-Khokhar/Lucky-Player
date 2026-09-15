import { useEffect, useMemo, useRef, useState } from 'react';
import { Gesture } from 'react-native-gesture-handler';

import type { SystemControls } from './use-system-controls';

const DOUBLE_TAP_MAX_DELAY_MS = 250;
const FEEDBACK_MS = 650;
const HOLD_MS = 450;
const HUD_LINGER_MS = 600;
// Swipes starting this close to an edge are left to XOS: back gesture on the sides, status and navigation bars top and bottom.
const EDGE_DEAD_ZONE = 40;
const SWIPE_ACTIVATION = 16;
// Share of the screen height a swipe must travel to move brightness or volume from 0 to 100%.
const VERTICAL_RANGE_RATIO = 0.7;
// A swipe across the full width seeks this far.
const SEEK_RANGE_MS = 90_000;
const ZOOM_SNAP = 1.05;
export const MAX_ZOOM = 4;

export type GestureHud =
  | { kind: 'brightness' | 'volume' | 'zoom'; value: number }
  | { kind: 'seek'; target: number; delta: number }
  | { kind: 'boost' };

export type SkipFeedback = { side: 'left' | 'right'; id: number };

type HudOwner = 'pan' | 'pinch' | 'hold';
type SwipeMode = 'pending' | 'brightness' | 'volume' | 'seek';

type Options = {
  width: number;
  height: number;
  locked: boolean;
  skipMs: number;
  zoom: number;
  system: SystemControls;
  getProgress: () => { position: number; duration: number };
  onToggleControls: () => void;
  onSkip: (deltaMs: number) => void;
  onSeek: (positionMs: number) => void;
  onZoom: (zoom: number) => void;
  onBoost: (active: boolean) => void;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Tap toggles controls, double-tap skips, vertical swipe sets brightness (left) or volume (right),
 * horizontal swipe seeks, pinch zooms, hold plays at 2x. Only tap works while locked.
 */
export function usePlayerGestures(options: Options) {
  const { width, height, locked, skipMs, zoom, system, getProgress } = options;
  const { onToggleControls, onSkip, onSeek, onZoom, onBoost } = options;
  const [hud, setHud] = useState<GestureHud | null>(null);
  const [feedback, setFeedback] = useState<SkipFeedback | null>(null);

  const zoomRef = useRef(zoom);
  const swipe = useRef<{ mode: SwipeMode; start: number; target: number }>({ mode: 'seek', start: 0, target: 0 });
  const pinch = useRef({ start: 1, last: 1 });
  const boosting = useRef(false);
  const hudOwner = useRef<HudOwner | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    if (!feedback) return;
    const id = setTimeout(() => setFeedback(null), FEEDBACK_MS);
    return () => clearTimeout(id);
  }, [feedback]);

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  const gesture = useMemo(() => {
    const show = (owner: HudOwner, next: GestureHud) => {
      clearTimeout(hideTimer.current);
      hudOwner.current = owner;
      setHud(next);
    };
    const hide = (owner: HudOwner, delayMs: number) => {
      if (hudOwner.current !== owner) return;
      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => {
        hudOwner.current = null;
        setHud(null);
      }, delayMs);
    };
    const verticalRange = Math.max(1, height * VERTICAL_RANGE_RATIO);

    const pan = Gesture.Pan()
      .enabled(!locked && width > 0)
      .maxPointers(1)
      .minDistance(SWIPE_ACTIVATION)
      .hitSlop({ left: -EDGE_DEAD_ZONE, right: -EDGE_DEAD_ZONE, top: -EDGE_DEAD_ZONE, bottom: -EDGE_DEAD_ZONE })
      .runOnJS(true)
      .onBegin(() => system.refreshVolume())
      .onStart(() => {
        swipe.current.mode = 'pending';
      })
      .onUpdate((event) => {
        const state = swipe.current;
        // The start event carries no translation, so the axis is picked on the first update that moved.
        if (state.mode === 'pending') {
          if (event.translationX === 0 && event.translationY === 0) return;
          if (Math.abs(event.translationY) > Math.abs(event.translationX)) {
            const startX = event.x - event.translationX;
            state.mode = startX < width / 2 ? 'brightness' : 'volume';
            state.start = state.mode === 'brightness' ? system.getBrightness() : system.getVolume();
          } else {
            state.mode = 'seek';
            state.start = getProgress().position;
          }
          state.target = state.start;
        }
        if (state.mode === 'seek') {
          const { duration } = getProgress();
          const upper = duration > 0 ? duration : Number.MAX_SAFE_INTEGER;
          state.target = clamp(state.start + (event.translationX / width) * SEEK_RANGE_MS, 0, upper);
          show('pan', { kind: 'seek', target: state.target, delta: state.target - state.start });
          return;
        }
        const value = clamp(state.start - event.translationY / verticalRange, 0, 1);
        const applied = state.mode === 'brightness' ? system.setBrightness(value) : system.setVolume(value);
        show('pan', { kind: state.mode, value: applied });
      })
      .onEnd((_event, success) => {
        if (success && swipe.current.mode === 'seek') onSeek(swipe.current.target);
      })
      .onFinalize(() => hide('pan', HUD_LINGER_MS));

    const zoomGesture = Gesture.Pinch()
      .enabled(!locked)
      .runOnJS(true)
      .onStart(() => {
        pinch.current = { start: zoomRef.current, last: zoomRef.current };
      })
      .onUpdate((event) => {
        const next = clamp(pinch.current.start * event.scale, 1, MAX_ZOOM);
        pinch.current.last = next;
        onZoom(next);
        show('pinch', { kind: 'zoom', value: next });
      })
      .onEnd(() => {
        if (pinch.current.last < ZOOM_SNAP) onZoom(1);
      })
      .onFinalize(() => hide('pinch', HUD_LINGER_MS));

    const hold = Gesture.LongPress()
      .enabled(!locked)
      .minDuration(HOLD_MS)
      .runOnJS(true)
      .onStart(() => {
        boosting.current = true;
        onBoost(true);
        show('hold', { kind: 'boost' });
      })
      .onFinalize(() => {
        if (!boosting.current) return;
        boosting.current = false;
        onBoost(false);
        hide('hold', 0);
      });

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDelay(DOUBLE_TAP_MAX_DELAY_MS)
      .enabled(!locked)
      .runOnJS(true)
      .onEnd((event, success) => {
        if (!success || width === 0) return;
        const side = event.x < width / 2 ? 'left' : 'right';
        onSkip(side === 'left' ? -skipMs : skipMs);
        setFeedback({ side, id: Date.now() });
      });
    const singleTap = Gesture.Tap()
      .runOnJS(true)
      .onEnd((_event, success) => {
        if (success) onToggleControls();
      });

    return Gesture.Race(zoomGesture, pan, hold, Gesture.Exclusive(doubleTap, singleTap));
  }, [width, height, locked, skipMs, system, getProgress, onToggleControls, onSkip, onSeek, onZoom, onBoost]);

  return { gesture, hud, feedback };
}
