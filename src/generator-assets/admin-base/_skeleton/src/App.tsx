import React, { useEffect } from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import { Provider } from 'react-redux';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { ToastContainer } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import { AtaAdminProvider, createAtaRestProvider } from '@atakanimo/ata-admin-base';
import 'dayjs/locale/tr';
import '@/i18n';
import { GetCommonState, GetThemeState, store } from '@/store';
import { createAppTheme } from '@/theme';
import { useAppDispatch, useAppSelector } from '@/hooks';
import AppRoutes from '@/routes';
import { injectStore, API } from '@/services/api/api.generated';
import { restoreSession } from '@/store/thunks/auth.thunk.generated';
import { resources } from '@/modules/resources.generated';
import { LoadingOverlay } from '@/components';

const adminDataProvider = createAtaRestProvider({ http: API });
// `default: { dynamic: 'currentUserId' }` alanları için.
const getCurrentUserId = () => store.getState().auth.user?.id ?? null;

injectStore(store);

const AppContent: React.FC = () => {
  const dispatch = useAppDispatch();
  const { mode } = useAppSelector(GetThemeState);
  const { isLoading } = useAppSelector(GetCommonState);
  // react-i18next `t` dil değişince kimlik değiştirir; admin-base metinleri yeniden çizilir.
  const { t: adminT, i18n } = useTranslation();
  const theme = createAppTheme(mode);

  useEffect(() => {
    // Kayıtlı oturum (access ya da yalnız refresh token) `me` ile doğrulanır; süresi dolmuşsa interceptor yeniler.
    void dispatch(restoreSession());
  }, [dispatch]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AtaAdminProvider
        dataProvider={adminDataProvider}
        resources={resources}
        t={adminT}
        dateLocale={i18n.language?.startsWith('tr') ? 'tr' : 'en'}
        getCurrentUserId={getCurrentUserId}
      >
        <Router>
          <AppRoutes />
        </Router>
      </AtaAdminProvider>
      {isLoading && <LoadingOverlay />}
      <ToastContainer position='bottom-right' autoClose={5000} newestOnTop={false} closeOnClick pauseOnFocusLoss draggable pauseOnHover theme={mode} />
    </ThemeProvider>
  );
};

function App() {
  return (
    <Provider store={store}>
      <AppContent />
    </Provider>
  );
}

export default App;
