import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import { useAdminTexts } from '../useAdminTexts.js';

export interface JsonDialogState {
  title: string;
  value: unknown;
}

export function JsonDialog({ state, onClose }: { state: JsonDialogState | null; onClose: () => void }) {
  const { text } = useAdminTexts();
  return (
    <Dialog open={state !== null} onClose={onClose} maxWidth='md' fullWidth>
      <DialogTitle sx={{ fontSize: '1.125rem', fontWeight: 600 }}>{state?.title}</DialogTitle>
      <DialogContent dividers>
        <Box component='pre' sx={{ m: 0, fontSize: '0.8125rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {JSON.stringify(state?.value, null, 2)}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{text('close')}</Button>
      </DialogActions>
    </Dialog>
  );
}
