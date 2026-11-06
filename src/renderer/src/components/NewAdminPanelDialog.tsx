import { useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography } from '@mui/material';
import { useAppDispatch } from '../store/hooks';
import { bootstrapAdminPanel, pickDirectory } from '../features/project/projectSlice';
import { ADMIN_BACKEND_DEFAULTS, ADMIN_PANEL_INFO, ADMIN_STACK_LABELS } from '@shared/adminPanel';
import type { BackendStack } from '@shared/backendDatabase';

interface NewAdminPanelDialogProps {
  open: boolean;
  /** Preselected backend (the open project's stack), when known. */
  defaultStack?: BackendStack;
  onClose: () => void;
  onCreated: (root: string, message: string) => void;
}

const STACKS = Object.keys(ADMIN_BACKEND_DEFAULTS) as BackendStack[];

/**
 * "Yeni Admin paneli": empty folder + panel name + backend (API prefix / dev port) → `project:bootstrapAdmin`.
 * Module screens are written into it later by Frontend generate (admin config).
 */
const NewAdminPanelDialog = ({ open, defaultStack, onClose, onCreated }: NewAdminPanelDialogProps) => {
  const dispatch = useAppDispatch();
  const [root, setRoot] = useState('');
  const [app, setApp] = useState('');
  const [stack, setStack] = useState<BackendStack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selected = stack ?? defaultStack ?? 'nodejs-mongoose';
  const { apiPrefix, devUrl } = ADMIN_BACKEND_DEFAULTS[selected];

  const handleClose = () => {
    setError(null);
    onClose();
  };

  const handleBrowse = async () => {
    const path = await dispatch(pickDirectory()).unwrap();
    if (path) setRoot(path);
  };

  const handleCreate = async () => {
    setBusy(true);
    setError(null);
    const { success, files, error: bootstrapError } = await dispatch(bootstrapAdminPanel({ root, app, stack: selected })).unwrap();
    setBusy(false);
    if (!success) {
      setError(bootstrapError || 'Admin paneli oluşturulamadı');
      return;
    }
    onCreated(root, `${app}: ${files?.length ?? 0} dosya oluşturuldu. Klasörde npm install && npm run dev.`);
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth='sm' fullWidth>
      <DialogTitle>{ADMIN_PANEL_INFO.label}</DialogTitle>
      <DialogContent>
        <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
          {ADMIN_PANEL_INFO.summary} Var olan dosyaların üzerine yazılmaz.
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <TextField label='Klasör' fullWidth value={root} InputProps={{ readOnly: true }} placeholder='Boş bir klasör seçin (ör. <backend>/apps/admin)' />
          <Button variant='outlined' onClick={handleBrowse}>
            Seç
          </Button>
        </Box>
        <TextField
          label='Panel adı'
          fullWidth
          value={app}
          onChange={(e) => setApp(e.target.value)}
          placeholder={ADMIN_PANEL_INFO.appName.placeholder}
          helperText={ADMIN_PANEL_INFO.appName.helper}
        />
        <TextField
          select
          label='Backend'
          fullWidth
          sx={{ mt: 2 }}
          value={selected}
          onChange={(e) => setStack(e.target.value as BackendStack)}
          helperText={`Auth: ${apiPrefix}/auth/login · me; geliştirmede /api → ${devUrl} (src/config/app.ts, .env.development)`}
        >
          {STACKS.map((s) => (
            <MenuItem key={s} value={s}>
              {ADMIN_STACK_LABELS[s]}
            </MenuItem>
          ))}
        </TextField>
        {error && (
          <Alert severity='error' sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Vazgeç</Button>
        <Button variant='contained' onClick={handleCreate} disabled={!root || !app.trim() || busy}>
          Oluştur
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default NewAdminPanelDialog;
