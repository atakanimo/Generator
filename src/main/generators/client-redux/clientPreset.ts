/**
 * Client data-layer presets (plan client-data-layer §2 #9): where files go and what the host provides.
 * The generated code only differs by these values; the shape of the files is the same for every client.
 */
export type ClientPresetId = 'redux-rn' | 'redux-web';

export interface ClientPreset {
  id: ClientPresetId;
  /** Folders relative to the client root. */
  dirs: { services: string; thunks: string; slices: string };
  /** Module specifiers of host-provided symbols. */
  imports: {
    /** Exports `API`: the host's axios instance; its interceptor resolves `LocalResponse` (contract §7). */
    api: string;
    /** Exports `LocalResponse<T>`. */
    localResponse: string;
    /** Exports `RootState` (slices' selectors). */
    rootState: string;
    /** Alias of `dirs.services` used by thunks / slices. */
    services: string;
  };
}

// Request flags (`skipLoading`, `skipSuccessToast`) always ride on the axios config: every client shares one
// interceptor (`services/api`, docs/frontend/http-layer.md), so presets no longer differ here.

/** Varlik360 `apps/mobile`: React Native, RTK, axios `API` in `@/services/api`. */
export const REDUX_RN_PRESET: ClientPreset = {
  id: 'redux-rn',
  dirs: { services: 'src/services', thunks: 'src/store/thunks', slices: 'src/store/slices' },
  imports: { api: '@/services/api', localResponse: '@/types', rootState: '@/store', services: '@/services' }
};

/** React web (SharedFrame `apps/web`): same layout, names and flags as `redux-rn`. */
export const REDUX_WEB_PRESET: ClientPreset = {
  ...REDUX_RN_PRESET,
  id: 'redux-web'
};

export const CLIENT_PRESETS: Record<ClientPresetId, ClientPreset> = {
  'redux-rn': REDUX_RN_PRESET,
  'redux-web': REDUX_WEB_PRESET
};
