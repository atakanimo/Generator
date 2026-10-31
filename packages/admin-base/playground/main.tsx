import DashboardOutlined from '@mui/icons-material/DashboardOutlined';
import { Alert, CssBaseline, LinearProgress, Snackbar, ThemeProvider, createTheme } from '@mui/material';
import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AtaAdminLayout, AtaAdminProvider, createAdminRoutes, createAtaRestProvider, interpolateForPlayground } from './shim.js';
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
  const t = useMemo(
    () => (key: string, options?: { defaultValue?: string; [k: string]: unknown }) =>
      interpolateForPlayground(translations[key] ?? options?.defaultValue ?? key, options),
    []
  );
  const navItems = useMemo(
    () => [
      { path: '/dashboard', label: 'Dashboard', icon: DashboardOutlined },
      ...routes.map(route => ({ id: route.id, path: route.path, label: t(route.text, { defaultValue: route.path }), icon: route.icon }))
    ],
    [routes, t]
  );

  return (
    <AtaAdminProvider dataProvider={dataProvider} resources={resources} t={t} getCurrentUserId={() => currentUserId}>
      {loading ? <LinearProgress sx={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 2000 }} /> : null}
      <AtaAdminLayout title='Playground' navItems={navItems} user={{ email: 'admin@example.com' }} onLogout={() => setToast({ message: 'Logout', severity: 'success' })} version='v0'>
        <Routes>
          <Route path='/dashboard' element={<DashboardDemo />} />
          {routes.map(route => {
            const Page = route.element;
            return <Route key={route.path} path={route.path} element={<Page />} />;
          })}
          <Route path='*' element={<Navigate to={new URLSearchParams(location.search).has('dashboard') ? '/dashboard' : routes[routes.length - 1].path} replace />} />
        </Routes>
      </AtaAdminLayout>
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
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  )
);
