import { Spacing } from '@/constants/theme';
import { useAppSelector } from '@/store';

/** Height of the floating mini-player: 44px art, its padding, the progress line and the gap below it. */
const MINI_PLAYER_HEIGHT = 44 + Spacing.two * 2 + 3 + Spacing.two;

/** Bottom padding a scrolling list needs so its last row is not hidden behind the mini-player. */
export function useMiniPlayerInset(): number {
  const active = useAppSelector((state) => state.audio.active);
  return active ? MINI_PLAYER_HEIGHT : 0;
}
