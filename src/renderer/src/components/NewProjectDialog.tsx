import { useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography } from '@mui/material';
import { useAppDispatch } from '../store/hooks';
import { bootstrapBackendProject, pickDirectory } from '../features/project/projectSlice';
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
 */
const NewProjectDialog = ({ info, onClose, onCreated }: NewProjectDialogProps) => {
  const dispatch = useAppDispatch();
  const [root, setRoot] = useState('');
  const [app, setApp] = useState('');
  const [picked, setPicked] = useState<Partial<HostDatabase>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    const { success, files, error: bootstrapError } = await dispatch(bootstrapBackendProject({ stack: info.stack, root, app, db })).unwrap();
    setBusy(false);
    if (!success) {
      setError(bootstrapError || 'Proje oluşturulamadı');
      return;
    }
    onCreated(root, `${app}: ${files?.length ?? 0} dosya oluşturuldu.`);
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
        {error && (
          <Alert severity='error' sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Vazgeç</Button>
        <Button variant='contained' onClick={handleCreate} disabled={!root || !app.trim() || !db || busy}>
          Oluştur
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default NewProjectDialog;
