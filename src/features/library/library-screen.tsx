import { useCallback } from 'react';

import { SegmentedControl, type Segment } from '@/components/ui/segmented-control';
import { useAppDispatch, useAppSelector } from '@/store';
import { setLibrarySegment, type LibrarySegment } from '@/store/ui-slice';

import { FoldersScreen } from './folders-screen';
import { RecentScreen } from './recent-screen';
import { VideoListScreen } from './video-list-screen';

const SEGMENTS: Segment<LibrarySegment>[] = [
  { key: 'folders', label: 'Folders' },
  { key: 'videos', label: 'Videos' },
  { key: 'recent', label: 'Continue' },
];

/** The Videos tab: one tab holding the three views of the video library. */
export function LibraryScreen() {
  const dispatch = useAppDispatch();
  const segment = useAppSelector((state) => state.ui.librarySegment);
  const select = useCallback((next: LibrarySegment) => dispatch(setLibrarySegment(next)), [dispatch]);

  const segments = <SegmentedControl options={SEGMENTS} value={segment} onChange={select} label="Library view" />;

  if (segment === 'videos') return <VideoListScreen title="Videos" allowFavoritesFilter segments={segments} />;
  if (segment === 'recent') {
    return <RecentScreen segments={segments} onBrowseFolders={() => select('folders')} />;
  }
  return <FoldersScreen segments={segments} />;
}
