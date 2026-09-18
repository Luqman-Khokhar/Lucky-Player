import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';

import castReducer from './cast-slice';
import libraryReducer from './library-slice';
import playQueueReducer from './play-queue-slice';
import settingsReducer from './settings-slice';
import soundReducer from './sound-slice';
import uiReducer from './ui-slice';

export const store = configureStore({
  reducer: {
    settings: settingsReducer,
    library: libraryReducer,
    playQueue: playQueueReducer,
    sound: soundReducer,
    cast: castReducer,
    ui: uiReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
