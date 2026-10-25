import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  Typography
} from '@mui/material';
import { useMemo, useState } from 'react';
import type { ListBody } from '../../contract/api.js';
import type { ExportBody } from '../../data/dataProvider.js';
import { useResourceApi } from '../../react/hooks.js';
import type { AnyResource } from '../../schema/extend.js';
import { fieldLabelKey, useAdminTexts } from '../useAdminTexts.js';

export interface ExportDialogProps {
  resource: AnyResource;
  /** Tablonun liste isteği: filtre ve sıra export'a aynen gider (sayfa gitmez). */
  listBody: ListBody;
  onClose: () => void;
}

interface ExportColumn {
  name: string;
  label: string;
  checked: boolean;
}

/** Blob'u tarayıcıda dosya olarak indirir. */
function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Hemen bırakılırsa bazı tarayıcılar indirmeyi keser.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * CSV export penceresi (`operations` `export` içeriyorsa): kolon seçimi, yerelleştirilmiş başlıklar, geçerli filtre ve
 * sıra ile `POST {endpoint}/export`. Varsayılan işaretli: `id` + tabloda görünen alanlar.
 */
export function ExportDialog({ resource, listBody, onClose }: ExportDialogProps) {
  const texts = useAdminTexts();
  const api = useResourceApi(resource);
  const columns: ExportColumn[] = useMemo(
    () => [
      { name: 'id', label: 'ID', checked: true },
      ...resource.fields
        .filter(field => !field.writeOnly)
        .map(field => ({
          name: field.name,
          label: texts.fieldLabel(fieldLabelKey(resource, [field.name]), field),
          checked: field.list === true
        }))
    ],
    [resource, texts]
  );
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(columns.filter(c => c.checked).map(c => c.name))
  );
  const [busy, setBusy] = useState(false);

  const allSelected = selected.size === columns.length;
  const toggle = (name: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const submit = async () => {
    const chosen = columns.filter(c => selected.has(c.name));
    const body: ExportBody = {
      ...(listBody.filters ? { filters: listBody.filters } : {}),
      ...(listBody.sortBy ? { sortBy: listBody.sortBy, sortOrder: listBody.sortOrder } : {}),
      fields: chosen.map(c => c.name),
      headers: chosen.map(c => c.label)
    };
    setBusy(true);
    try {
      const { blob, filename } = await api.exportCsv(body);
      download(blob, filename);
      onClose();
    } catch {
      // API hatası host toast'unda; pencere açık kalır.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle sx={{ fontSize: '1.125rem', fontWeight: 600 }}>{texts.text('exportTitle')}</DialogTitle>
      <DialogContent dividers>
        <DialogContentText sx={{ fontSize: '0.875rem', mb: 2 }}>{texts.text('exportHint')}</DialogContentText>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography sx={{ fontSize: '0.875rem', fontWeight: 600 }}>{texts.text('exportColumns')}</Typography>
          <FormControlLabel
            label={texts.text('exportSelectAll')}
            slotProps={{ typography: { fontSize: '0.875rem' } }}
            control={
              <Checkbox
                size='small'
                checked={allSelected}
                indeterminate={selected.size > 0 && !allSelected}
                onChange={() => setSelected(allSelected ? new Set() : new Set(columns.map(c => c.name)))}
              />
            }
          />
        </Box>
        <FormGroup sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, columnGap: 2 }}>
          {columns.map(column => (
            <FormControlLabel
              key={column.name}
              label={column.label}
              slotProps={{ typography: { fontSize: '0.875rem' } }}
              control={<Checkbox size='small' checked={selected.has(column.name)} onChange={() => toggle(column.name)} />}
            />
          ))}
        </FormGroup>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{texts.text('cancel')}</Button>
        <Button variant='contained' disabled={busy || selected.size === 0} onClick={() => void submit()}>
          {texts.text('exportDownload')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
