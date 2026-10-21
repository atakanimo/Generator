// `?login`: AtaLoginPage, dil (tr / en) ve tema düğmeleriyle; submit 800 ms sonra biter.
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { useMemo, useState } from 'react';
import { AtaLoginPage, adminBaseTexts, adminBaseTextsEn, interpolateForPlayground } from './shim.js';

export function LoginDemo() {
  const [lang, setLang] = useState<'tr' | 'en'>('tr');
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const theme = useMemo(() => createTheme({ palette: { mode } }), [mode]);
  const bundle = lang === 'en' ? adminBaseTextsEn.ataAdmin : adminBaseTexts.ataAdmin;
  const t = (key: string, options?: { defaultValue?: string; [k: string]: unknown }) => {
    const own = key.startsWith('ataAdmin.') ? (bundle as Record<string, string>)[key.slice(9)] : undefined;
    return interpolateForPlayground(own ?? options?.defaultValue ?? key, options);
  };
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AtaLoginPage
        appName='Varlık360 Admin'
        t={t}
        onSubmit={values => new Promise(resolve => setTimeout(() => resolve(console.log('login', values)), 800))}
        forgotPasswordHref='#'
        onToggleLanguage={() => setLang(l => (l === 'tr' ? 'en' : 'tr'))}
        onToggleTheme={() => setMode(m => (m === 'dark' ? 'light' : 'dark'))}
        themeMode={mode}
      />
    </ThemeProvider>
  );
}
