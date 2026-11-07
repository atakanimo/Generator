import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  MenuItem,
  TextField,
  Typography
} from '@mui/material';
import { useAppDispatch } from '../store/hooks';
import { bootstrapAdminPanel, bootstrapBackendProject, loadAuthDefaults, pickDirectory } from '../features/project/projectSlice';
import { AUTH_ADMIN_RULE, AUTH_MODULES, AUTH_MODULE_INFO, authAdminError, type AuthBootstrapOptions, type AuthModule } from '@shared/authModules';
import { ADMIN_PANEL_DIR } from '@shared/adminPanel';
import type { BackendStackInfo } from '@shared/backendStacks';
import { DATABASE_LABELS, STACK_DATABASES, type BackendDatabase, type BackendIdType, type HostDatabase } from '@shared/backendDatabase';

interface NewProjectDialogProps {
  /** Stack being created; `null` closes the dialog. */
  info: BackendStackInfo | null;
  onClose: () => void;
  /** The host was written into `root`: the page opens and scans it. */
  onCreated: (root: string, message: string) => void;
}

const ID_TYPE_LABELS: Record<BackendIdType, string> = { 'uuid-v7': 'uuid v7', objectid: 'ObjectId' };

/**
 * "Yeni … projesi" (PY9): empty folder + app name (+ database / id type when the stack offers a choice) →
 * `project:bootstrap<Stack>`. Existing projects are refused by main. The pair is written to the manifest and never changes.
 * "Admin paneli de kur": right after the host, an ata-admin-base panel in `<root>/apps/admin` (`project:bootstrapAdmin`).
 * Auth (docs/backend/auth.md): core always on, optional modules + first admin; the fields start from the last
 * bootstrap on this machine (`project:getAuthDefaults`).
 */
const NewProjectDialog = ({ info, onClose, onCreated }: NewProjectDialogProps) => {
  const dispatch = useAppDispatch();
  const [root, setRoot] = useState('');
  const [app, setApp] = useState('');
  const [picked, setPicked] = useState<Partial<HostDatabase>>({});
  const [withAdmin, setWithAdmin] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [auth, setAuth] = useState<AuthBootstrapOptions>({ modules: [...AUTH_MODULES], admin: { email: '', password: '', name: 'Admin' } });

  useEffect(() => {
    if (!info) return;
    void (async () => {
      const defaults = await dispatch(loadAuthDefaults()).unwrap();
      if (defaults) setAuth(defaults);
    })();
  }, [info, dispatch]);

  const adminError = authAdminError(auth.admin);
  const toggleModule = (module: AuthModule, on: boolean) =>
    setAuth({ ...auth, modules: AUTH_MODULES.filter((m) => (m === module ? on : auth.modules.includes(m))) });
  const setAdmin = (patch: Partial<AuthBootstrapOptions['admin']>) => setAuth({ ...auth, admin: { ...auth.admin, ...patch } });

  const choices = info ? STACK_DATABASES[info.stack] : [];
  const entry = choices.find((c) => c.database === picked.database) ?? choices[0];
  const db: HostDatabase | null = entry
    ? { database: entry.database, idType: picked.idType && entry.idTypes.includes(picked.idType) ? picked.idType : entry.idTypes[0] }
    : null;

  const handleClose = () => {
    setError(null);
    setPicked({});
    onClose();
  };

  const handleBrowse = async () => {
    const path = await dispatch(pickDirectory()).unwrap();
    if (path) setRoot(path);
  };

  const handleCreate = async () => {
    if (!info || !db) return;
    setBusy(true);
    setError(null);
    const { success, files, error: bootstrapError } = await dispatch(bootstrapBackendProject({ stack: info.stack, root, app, db, auth })).unwrap();
    if (!success) {
      setBusy(false);
      setError(bootstrapError || 'Proje oluşturulamadı');
      return;
    }
    let message = `${app}: ${files?.length ?? 0} dosya oluşturuldu.`;
    if (withAdmin) {
      const admin = await dispatch(bootstrapAdminPanel({ root: `${root}/${ADMIN_PANEL_DIR}`, app, stack: info.stack })).unwrap();
      message = admin.success
        ? `${message} Admin paneli (${ADMIN_PANEL_DIR}): ${admin.files?.length ?? 0} dosya.`
        : `${message} Admin paneli kurulamadı: ${admin.error ?? 'bilinmeyen hata'}`;
    }
    setBusy(false);
    onCreated(root, message);
  };

  return (
    <Dialog open={Boolean(info)} onClose={handleClose} maxWidth='sm' fullWidth>
      <DialogTitle>{info?.label}</DialogTitle>
      <DialogContent>
        <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
          {info?.summary} Var olan dosyaların üzerine yazılmaz; klasörde proje zaten varsa kurulmaz.
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <TextField label='Klasör' fullWidth value={root} InputProps={{ readOnly: true }} placeholder='Boş bir klasör seçin' />
          <Button variant='outlined' onClick={handleBrowse}>
            Seç
          </Button>
        </Box>
        <TextField
          label='Uygulama adı'
          fullWidth
          value={app}
          onChange={(e) => setApp(e.target.value)}
          placeholder={info?.appName.placeholder}
          helperText={info?.appName.helper}
        />
        {db && (choices.length > 1 || entry.idTypes.length > 1) && (
          <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
            <TextField
              select
              label='Veritabanı'
              fullWidth
              value={db.database}
              onChange={(e) => setPicked({ database: e.target.value as BackendDatabase })}
              disabled={choices.length < 2}
            >
              {choices.map((c) => (
                <MenuItem key={c.database} value={c.database}>
                  {DATABASE_LABELS[c.database]}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label='Id tipi'
              fullWidth
              value={db.idType}
              onChange={(e) => setPicked({ ...picked, idType: e.target.value as BackendIdType })}
              disabled={entry.idTypes.length < 2}
              helperText='Sonradan değiştirilemez'
            >
              {entry.idTypes.map((t) => (
                <MenuItem key={t} value={t}>
                  {ID_TYPE_LABELS[t]}
                </MenuItem>
              ))}
            </TextField>
          </Box>
        )}
        <Divider sx={{ my: 2 }} />
        <Typography variant='subtitle2'>Auth</Typography>
        <Typography variant='caption' color='text.secondary' component='div' sx={{ mb: 1 }}>
          Her zaman: login, refresh, logout, me, şifre değiştirme, Users modeli (roller: admin / user). Ek modüller (yalnız kullanıcılar için):
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          {AUTH_MODULES.map((m) => (
            <FormControlLabel
              key={m}
              control={<Checkbox size='small' checked={auth.modules.includes(m)} onChange={(e) => toggleModule(m, e.target.checked)} />}
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
        <Typography variant='subtitle2' sx={{ mt: 2 }}>
          İlk admin
        </Typography>
        <Typography variant='caption' color='text.secondary' component='div' sx={{ mb: 1 }}>
          Uygulama ilk açıldığında hiç admin yoksa oluşturulur. Projeye yalnız şifrenin bcrypt hash&apos;i yazılır.
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField label='E-posta' fullWidth size='small' value={auth.admin.email} onChange={(e) => setAdmin({ email: e.target.value })} />
          <TextField label='Ad' fullWidth size='small' value={auth.admin.name} onChange={(e) => setAdmin({ name: e.target.value })} />
        </Box>
        <TextField
          sx={{ mt: 1 }}
          label='Şifre'
          type='password'
          fullWidth
          size='small'
          value={auth.admin.password}
          onChange={(e) => setAdmin({ password: e.target.value })}
          error={Boolean(adminError) && auth.admin.password.length > 0}
          helperText={adminError ?? 'En az 8 karakter, bir harf ve bir rakam'}
        />
        <Divider sx={{ my: 2 }} />
        <FormControlLabel
          control={<Checkbox checked={withAdmin} onChange={(e) => setWithAdmin(e.target.checked)} />}
          label={`Admin paneli de kur (${ADMIN_PANEL_DIR}: @atakanimo/ata-admin-base, tema, menü, login, i18n)`}
        />
        <Typography variant='caption' color='text.secondary' component='div' sx={{ ml: 4 }}>
          {AUTH_ADMIN_RULE}
        </Typography>
        {error && (
          <Alert severity='error' sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Vazgeç</Button>
        <Button variant='contained' onClick={handleCreate} disabled={!root || !app.trim() || !db || Boolean(adminError) || busy}>
          Oluştur
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default NewProjectDialog;
