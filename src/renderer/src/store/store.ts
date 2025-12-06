import { configureStore } from '@reduxjs/toolkit';
import appReducer from './features/appSlice';
import projectReducer from '../features/project/projectSlice';

export const store = configureStore({
  reducer: {
    app: appReducer,
    project: projectReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

