import {
  Alert,
  Box,
  CssBaseline,
  LinearProgress,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Snackbar,
  ThemeProvider,
  createTheme
} from '@mui/material';
import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AtaAdminProvider, createAdminRoutes, createAtaRestProvider, interpolateForPlayground } from './shim.js';
import { createHostApi, currentUserId } from './mockBackend.js';
import { resources, translations } from './resources.js';
import { LoginDemo } from './login.js';
import { DashboardDemo } from './dashboard.js';

type Toast = { message: string; severity: 'success' | 'error' } | null;

function App() {
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const dataProvider = useMemo(
    () => createAtaRestProvider({ http: createHostApi({ onLoading: setLoading, onToast: (message, severity) => setToast({ message, severity }) }) }),
    []
  );
  const routes = useMemo(() => createAdminRoutes(resources), []);
  const [path, setPath] = useState(new URLSearchParams(location.search).has('dashboard') ? '__dashboard' : routes[routes.length - 1].path);
  const t = useMemo(
    () => (key: string, options?: { defaultValue?: string; [k: string]: unknown }) =>
      interpolateForPlayground(translations[key] ?? options?.defaultValue ?? key, options),
    []
  );
  const active = routes.find(r => r.path === path) ?? routes[0];
  const Page = active.element;

  return (
    <AtaAdminProvider dataProvider={dataProvider} resources={resources} t={t} getCurrentUserId={() => currentUserId}>
      {loading ? <LinearProgress sx={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 2000 }} /> : null}
      <Box sx={{ display: 'flex', height: '100vh' }}>
        <Box component='nav' sx={{ width: 240, flexShrink: 0, borderRight: 1, borderColor: 'divider', pt: 2 }}>
          <List>
            <ListItemButton selected={path === '__dashboard'} onClick={() => setPath('__dashboard')} sx={{ mx: 1, borderRadius: 1 }}>
              <ListItemText primary='Dashboard' />
            </ListItemButton>
            {routes.map(route => {
              const Icon = route.icon;
              return (
                <ListItemButton key={route.id} selected={route.path === path} onClick={() => setPath(route.path)} sx={{ mx: 1, borderRadius: 1 }}>
                  <ListItemIcon>
                    <Icon />
                  </ListItemIcon>
                  <ListItemText primary={t(route.text, { defaultValue: route.path })} />
                </ListItemButton>
              );
            })}
          </List>
        </Box>
        <Box component='main' sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', p: 3 }}>
          {path === '__dashboard' ? <DashboardDemo /> : <Page key={active.path} />}
        </Box>
      </Box>
      <Snackbar open={toast !== null} autoHideDuration={3000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        {toast ? <Alert severity={toast.severity} variant='filled'>{toast.message}</Alert> : undefined}
      </Snackbar>
    </AtaAdminProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  new URLSearchParams(location.search).has('login') ? (
    <LoginDemo />
  ) : (
    <ThemeProvider theme={createTheme()}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  )
);
