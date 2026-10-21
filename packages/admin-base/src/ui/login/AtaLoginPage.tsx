import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, IconButton, Link, Paper, TextField, Tooltip, Typography } from '@mui/material';
import { Brightness4, Brightness7, Language, Sync } from '@mui/icons-material';
import { adminBaseTexts, fallbackTranslate, type AdminTextKey, type Translate } from '../texts.js';
import { readRememberedEmail, validateLogin, writeRememberedEmail, type LoginErrors } from './loginForm.js';

export interface AtaLoginValues {
  email: string;
  password: string;
  remember: boolean;
}

export interface AtaLoginPageProps {
  /** Kartın üstündeki uygulama adı ("Varlık360 Admin"). */
  appName: string;
  /** Uygulama adının solundaki ikon; varsayılan `Sync` (tema `primary` rengi). */
  logo?: ReactNode;
  /**
   * Giriş isteği: host kendi API'sini çağırır, yönlendirmeyi de kendisi yapar. Promise beklenir; sürdüğü sürece form
   * kilitli kalır. API hatası host interceptor'ünün toast / alert'idir; form içinde göstermek için `error` verilir.
   */
  onSubmit: (values: AtaLoginValues) => unknown;
  /** Dışarıdan gelen yükleniyor durumu (ör. global loading); `onSubmit` Promise'i de kilitler. */
  loading?: boolean;
  /** Formun üstünde gösterilecek hata (ör. rol reddi). */
  error?: string | null;
  /** "Şifrenizi mi unuttunuz?" bağlantısı; ikisi de yoksa bağlantı gösterilmez. */
  forgotPasswordHref?: string;
  onForgotPassword?: () => void;
  /** "Beni hatırla" e-postasının `localStorage` anahtarı; `false` → kutu gösterilmez. */
  rememberStorageKey?: string | false;
  /** Saklı e-posta yoksa başlangıç değeri. */
  initialEmail?: string;
  /** Host'un i18next `t`'si; yoksa Türkçe varsayılanlar. Anahtarlar `ataAdmin.login*`. */
  t?: Translate;
  /** Sağ üst köşe: dil düğmesi (verilirse). */
  onToggleLanguage?: () => void;
  /** Sağ üst köşe: tema düğmesi (verilirse); ikon `themeMode`'a göre. */
  onToggleTheme?: () => void;
  themeMode?: 'light' | 'dark';
  /** Sağ üst köşeye ek düğmeler. */
  headerActions?: ReactNode;
}

/** Varsayılan `remember` anahtarı (Varlik360 admin'in eski anahtarıyla aynı: geçişte saklı e-posta korunur). */
export const ATA_LOGIN_REMEMBER_KEY = 'remembered_email';

/**
 * Admin giriş ekranı (Varlik360 admin referans): ortada kart, logo + ad, başlık, e-posta / şifre, beni hatırla,
 * tam genişlik giriş düğmesi, şifremi unuttum; sağ üstte dil / tema. Doğrulama ve yükleniyor durumu pakette.
 */
export function AtaLoginPage(props: AtaLoginPageProps) {
  const {
    appName,
    logo,
    onSubmit,
    loading = false,
    error,
    forgotPasswordHref,
    onForgotPassword,
    rememberStorageKey = ATA_LOGIN_REMEMBER_KEY,
    initialEmail = '',
    t = fallbackTranslate,
    onToggleLanguage,
    onToggleTheme,
    themeMode,
    headerActions
  } = props;
  const text = (key: AdminTextKey) => t(`ataAdmin.${key}`, { defaultValue: adminBaseTexts.ataAdmin[key] });

  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [errors, setErrors] = useState<LoginErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const busy = loading || pending;

  useEffect(() => {
    if (rememberStorageKey === false) return;
    const saved = readRememberedEmail(rememberStorageKey);
    if (saved) {
      setEmail(saved);
      setRemember(true);
    }
  }, [rememberStorageKey]);

  // Hata metinleri dil değişince yeniden kurulur.
  const messages = { required: text('required'), emailInvalid: text('loginEmailInvalid') };
  const revalidate = (next: { email: string; password: string }) => {
    if (submitted) setErrors(validateLogin(next, messages));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setSubmitted(true);
    const found = validateLogin({ email, password }, messages);
    setErrors(found);
    if (found.email || found.password) return;
    if (rememberStorageKey !== false) writeRememberedEmail(rememberStorageKey, remember ? email.trim() : null);
    setPending(true);
    try {
      await onSubmit({ email: email.trim(), password, remember });
    } finally {
      setPending(false);
    }
  };

  const showForgot = Boolean(forgotPasswordHref || onForgotPassword);

  return (
    <Box
      component='main'
      sx={{ minHeight: '100vh', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', px: 2 }}
    >
      {(onToggleLanguage || onToggleTheme || headerActions) && (
        <Box sx={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 1 }}>
          {headerActions}
          {onToggleLanguage && (
            <Tooltip title={text('loginLanguage')}>
              <IconButton onClick={onToggleLanguage} aria-label={text('loginLanguage')}>
                <Language />
              </IconButton>
            </Tooltip>
          )}
          {onToggleTheme && (
            <Tooltip title={text('loginTheme')}>
              <IconButton onClick={onToggleTheme} aria-label={text('loginTheme')}>
                {themeMode === 'dark' ? <Brightness7 /> : <Brightness4 />}
              </IconButton>
            </Tooltip>
          )}
        </Box>
      )}

      <Paper elevation={3} sx={{ width: '100%', maxWidth: 480, p: 4, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
          {logo ?? <Sync color='primary' sx={{ fontSize: 40 }} />}
          <Typography component='h1' variant='h4' color='primary' fontWeight='bold'>
            {appName}
          </Typography>
        </Box>

        <Typography component='h2' variant='h5' sx={{ mb: 1 }}>
          {text('loginWelcome')}
        </Typography>
        <Typography variant='body2' color='text.secondary' sx={{ mb: 3 }}>
          {text('loginSubtitle')}
        </Typography>

        <Box component='form' noValidate onSubmit={handleSubmit} sx={{ width: '100%' }}>
          {error && (
            <Alert severity='error' sx={{ mb: 1 }}>
              {error}
            </Alert>
          )}

          <TextField
            margin='normal'
            fullWidth
            id='email'
            name='email'
            type='email'
            autoComplete='email'
            autoFocus
            label={text('loginEmail')}
            value={email}
            onChange={e => {
              setEmail(e.target.value);
              revalidate({ email: e.target.value, password });
            }}
            error={Boolean(errors.email)}
            helperText={errors.email}
            disabled={busy}
          />

          <TextField
            margin='normal'
            fullWidth
            id='password'
            name='password'
            type='password'
            autoComplete='current-password'
            label={text('loginPassword')}
            value={password}
            onChange={e => {
              setPassword(e.target.value);
              revalidate({ email, password: e.target.value });
            }}
            error={Boolean(errors.password)}
            helperText={errors.password}
            disabled={busy}
          />

          {rememberStorageKey !== false && (
            <FormControlLabel
              control={<Checkbox checked={remember} onChange={e => setRemember(e.target.checked)} disabled={busy} color='primary' />}
              label={text('loginRememberMe')}
              sx={{ mt: 1 }}
            />
          )}

          <Button type='submit' fullWidth variant='contained' sx={{ mt: 3, mb: 2, py: 1.5 }} disabled={busy}>
            {busy ? <CircularProgress size={24} color='inherit' /> : text('loginSubmit')}
          </Button>

          {showForgot && (
            <Box sx={{ textAlign: 'center' }}>
              <Link
                href={forgotPasswordHref ?? '#'}
                variant='body2'
                onClick={
                  onForgotPassword
                    ? e => {
                        e.preventDefault();
                        onForgotPassword();
                      }
                    : undefined
                }
              >
                {text('loginForgotPassword')}
              </Link>
            </Box>
          )}
        </Box>
      </Paper>
    </Box>
  );
}
