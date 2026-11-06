// Admin shell: @atakanimo/ata-admin-base `AtaAdminLayout` (Varlik360, SharedFrame and StockExchange admin ile aynı).
import React from 'react';
import { AdminPanelSettings } from '@mui/icons-material';
import { Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { AtaAdminLayout } from '@atakanimo/ata-admin-base';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { GetAuthState, GetThemeState } from '@/store';
import { setDrawerOpen, toggleTheme } from '@/store/slices/themeSlice';
import { logout } from '@/store/slices/authSlice';
import { ProtectedRoutes, routeTitle } from '@/routes/routes';
import { getAppEnv } from '@/utils/appEnv';
import { toggleLanguage } from '@/i18n';

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const { mode, drawerOpen } = useAppSelector(GetThemeState);
  const { user } = useAppSelector(GetAuthState);
  const appEnv = getAppEnv();

  const navItems = ProtectedRoutes.map(route => ({ id: String(route.id), path: route.path, label: routeTitle(route, t), icon: route.icon }));

  return (
    <AtaAdminLayout
      title={t('common.name')}
      navItems={navItems}
      sidebarTitle={
        <>
          <AdminPanelSettings color='primary' />
          <Typography component='div' sx={{ fontSize: '1.0625rem', lineHeight: '1.5rem', fontWeight: 700, color: appEnv === 'prod' ? 'primary.main' : 'warning.main' }}>
            {t(appEnv === 'prod' ? 'layout.envProduction' : 'layout.envTest')}
          </Typography>
        </>
      }
      version={`v${__APP_VERSION__}`}
      user={user}
      onLogout={() => dispatch(logout())}
      onToggleLanguage={toggleLanguage}
      onToggleTheme={() => dispatch(toggleTheme())}
      themeMode={mode}
      drawerOpen={drawerOpen}
      onDrawerOpenChange={open => dispatch(setDrawerOpen(open))}
      t={t}
    >
      {children}
    </AtaAdminLayout>
  );
};

export default MainLayout;
