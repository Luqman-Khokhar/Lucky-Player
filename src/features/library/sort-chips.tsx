import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { Spacing } from '@/constants/theme';
import type { SortDirection } from '@/db';

export type SortOption<K extends string> = { key: K; label: string; initialDirection: SortDirection };

type SortChipsProps<K extends string> = {
  options: SortOption<K>[];
  sort: K;
  direction: SortDirection;
  onChange: (sort: K, direction: SortDirection) => void;
  /** Extra chips (filters) rendered before the sort chips. */
  leading?: ReactNode;
};

/** Tap a chip to sort by it; tap the active chip again to reverse the order. */
export function SortChips<K extends string>({ options, sort, direction, onChange, leading }: SortChipsProps<K>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroller}
      contentContainerStyle={styles.row}>
      {leading}
      {options.map((option) => {
        const active = option.key === sort;
        const order = direction === 'asc' ? 'ascending' : 'descending';
        return (
          <Chip
            key={option.key}
            label={option.label}
            selected={active}
            icon={active ? (direction === 'asc' ? 'arrow_upward' : 'arrow_downward') : undefined}
            accessibilityLabel={
              active ? `Sorted by ${option.label}, ${order}. Tap to reverse.` : `Sort by ${option.label}`
            }
            onPress={() =>
              onChange(option.key, active ? (direction === 'asc' ? 'desc' : 'asc') : option.initialDirection)
            }
          />
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // A horizontal ScrollView in a column otherwise grows to fill the free height and stretches the chips.
  scroller: {
    flexGrow: 0,
    flexShrink: 0,
  },
  row: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
