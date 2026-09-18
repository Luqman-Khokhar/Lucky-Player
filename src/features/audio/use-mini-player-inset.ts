import { Spacing } from '@/constants/theme';
import { useAppSelector } from '@/store';

/** Height of the mini-player bar: 40px art plus its padding. */
const MINI_PLAYER_HEIGHT = 40 + Spacing.one * 2 + 2;

/** Bottom padding a scrolling list needs so its last row is not hidden behind the mini-player. */
export function useMiniPlayerInset(): number {
  const active = useAppSelector((state) => state.audio.active);
  return active ? MINI_PLAYER_HEIGHT : 0;
}
