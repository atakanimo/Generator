import React from 'react';
import { useTranslation } from 'react-i18next';
import { AtaLoginPage } from '@atakanimo/ata-admin-base';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { GetAuthState, GetThemeState } from '@/store';
import { login } from '@/store/thunks/auth.thunk.generated';
import { toggleTheme } from '@/store/slices/theme.slice';
import { toggleLanguage } from '@/i18n';

/** Login: `AtaLoginPage`; başarılı girişte yönlendirmeyi `routes/index.tsx` yapar (`isAuthenticated`). */
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
        await dispatch(login({ email, password, remember })).unwrap();
      }}
      onToggleLanguage={toggleLanguage}
      onToggleTheme={() => dispatch(toggleTheme())}
      themeMode={mode}
    />
  );
};

export default Login;
