import React from 'react';
import { useTranslation } from 'react-i18next';
import { AtaLoginPage } from '@atakanimo/ata-admin-base';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { GetAuthState, GetThemeState } from '@/store';
import { login } from '@/store/slices/authSlice';
import { toggleTheme } from '@/store/slices/themeSlice';
import { toggleLanguage } from '@/i18n';

/**
 * Login: `@atakanimo/ata-admin-base` `AtaLoginPage`; "Beni hatırla" token'ı da hatırlatır (authSlice).
 * Başarılı girişte yönlendirmeyi `routes/index.tsx` yapar (`isAuthenticated`).
 */
const Login: React.FC = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { error } = useAppSelector(GetAuthState);
  const { mode } = useAppSelector(GetThemeState);

  return (
    <AtaLoginPage
      appName={t('common.name')}
      t={t}
      // Sunucu hatası interceptor'da toast olarak gösterilir; burada yalnızca rol reddi.
      error={error ? t(error) : null}
      onSubmit={async ({ email, password, remember }) => {
        await dispatch(login({ email, password, rememberMe: remember })).unwrap();
      }}
      onToggleLanguage={toggleLanguage}
      onToggleTheme={() => dispatch(toggleTheme())}
      themeMode={mode}
    />
  );
};

export default Login;
