import { useEffect, useState } from 'react';
import { Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, TextField, Typography } from '@mui/material';
import { useAppDispatch } from '../store/hooks';
import { loadPythonAuthSettings, savePythonAuthModules } from '../features/project/projectSlice';
import { AUTH_ADMIN_RULE, AUTH_MODULES, AUTH_MODULE_INFO, type AuthModule } from '@shared/authModules';
import type { AuthModulesResult } from '@shared/ipcTypes';

interface AuthModulesDialogProps {
  open: boolean;
  projectPath: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}

const SHOWN_ACTIONS = new Set(['created', 'updated', 'removed', 'skipped-user-owned']);
const ACTION_LABELS: Record<string, string> = { created: 'yazılacak', updated: 'güncellenecek', removed: 'silinecek', 'skipped-user-owned': 'elle yazılmış, dokunulmaz' };

/** Var olan Python projesinin auth modülleri (docs/backend/auth.md "Var olan proje"): önizleme, sonra uygula. */
const AuthModulesDialog = ({ open, projectPath, onClose, onSaved }: AuthModulesDialogProps) => {
  const dispatch = useAppDispatch();
  const [modules, setModules] = useState<AuthModule[]>([]);
  const [appName, setAppName] = useState('');
  const [preview, setPreview] = useState<AuthModulesResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPreview(null);
    setError(null);
    void (async () => {
      const { success, auth, error: loadError } = await dispatch(loadPythonAuthSettings(projectPath)).unwrap();
      if (!success || !auth) {
        setError(loadError ?? 'Auth ayarları okunamadı');
        return;
      }
      setModules(auth.modules);
      setAppName(auth.appName ?? '');
    })();
  }, [open, projectPath, dispatch]);

  const toggle = (module: AuthModule, on: boolean) => {
    setPreview(null);
    setModules(AUTH_MODULES.filter((m) => (m === module ? on : modules.includes(m))));
  };

  const run = async (apply: boolean) => {
    setBusy(true);
    setError(null);
    const result = await dispatch(savePythonAuthModules({ root: projectPath, modules, appName, apply })).unwrap();
    setBusy(false);
    if (!result.success) {
      setError(result.error ?? 'Auth modülleri yazılamadı');
      return;
    }
    if (!apply) {
      setPreview(result);
      return;
    }
    const changed = result.files?.filter((f) => SHOWN_ACTIONS.has(f.action) && f.action !== 'skipped-user-owned').length ?? 0;
    onSaved(`Auth modülleri kaydedildi: ${modules.join(', ') || 'yalnız çekirdek'} (${changed} auth dosyası).`);
  };

  const changes = preview?.files?.filter((f) => SHOWN_ACTIONS.has(f.action)) ?? [];

  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle>Auth modülleri</DialogTitle>
      <DialogContent>
        <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
          Seçim manifest&apos;e (workspace.auth) yazılır; auth G dosyaları, Users modeli ve .env.example buna göre yeniden üretilir. hooks.py ve
          .Custom dosyaları projenindir, dokunulmaz.
        </Typography>
        <TextField
          label='Uygulama adı (auth e-postalarının konusu)'
          fullWidth
          size='small'
          value={appName}
          onChange={(e) => {
            setPreview(null);
            setAppName(e.target.value);
          }}
          sx={{ mb: 2 }}
        />
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          {AUTH_MODULES.map((m) => (
            <FormControlLabel
              key={m}
              control={<Checkbox size='small' checked={modules.includes(m)} onChange={(e) => toggle(m, e.target.checked)} />}
              label={
                <Typography variant='body2'>
                  {AUTH_MODULE_INFO[m].label}{' '}
                  <Typography component='span' variant='caption' color='text.secondary'>
                    {AUTH_MODULE_INFO[m].description}
                  </Typography>
                </Typography>
              }
            />
          ))}
        </Box>
        <Typography variant='caption' color='text.secondary' component='div' sx={{ mt: 1 }}>
          {AUTH_ADMIN_RULE}
        </Typography>
        {preview && (
          <Box sx={{ mt: 2 }}>
            <Typography variant='subtitle2'>Önizleme</Typography>
            {changes.length === 0 ? (
              <Typography variant='body2' color='text.secondary'>
                Auth dosyalarında değişiklik yok.
              </Typography>
            ) : (
              <Box component='ul' sx={{ m: 0, pl: 2, fontFamily: 'monospace', fontSize: 12 }}>
                {changes.map((f) => (
                  <li key={f.path}>
                    {f.path} ({ACTION_LABELS[f.action]})
                  </li>
                ))}
              </Box>
            )}
            {preview.notes?.map((n) => (
              <Alert key={n} severity='info' sx={{ mt: 1 }}>
                {n}
              </Alert>
            ))}
          </Box>
        )}
        {error && (
          <Alert severity='error' sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Vazgeç</Button>
        <Button onClick={() => void run(false)} disabled={busy || !appName.trim()}>
          Önizle
        </Button>
        <Button variant='contained' onClick={() => void run(true)} disabled={busy || !preview || !appName.trim()}>
          Uygula
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AuthModulesDialog;
