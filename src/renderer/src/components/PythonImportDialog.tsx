/**
 * Python model import (plan backend-python-fastapi K1, PY7): a hand-written Pydantic class (`modules/<m>/model.py`)
 * is read once into the manifest and the module is generated. Before importing, the module's collection is sampled
 * (read-only) and keys / types the generated `extra="forbid"` model would reject are listed.
 */
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import { useEffect, useState } from 'react';
import type { CollectionReport, CollectionReportIssue } from '@shared/ipcTypes';
import type { NormalizedField } from '@shared/normalizedModel';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { closePythonImport, importPythonModel, previewPythonImport } from '../features/project/projectSlice';

interface Props {
  projectPath: string;
  /** Called after the dialog closes; `imported` → the model list should be rescanned. */
  onClosed: (imported: boolean) => void;
}

function fieldType(f: NormalizedField): string {
  const base =
    f.kind === 'enum'
      ? `enum (${f.enum?.values.join(', ')})`
      : f.kind === 'object' && f.object?.fields?.length
        ? `object ${f.object.typeName ?? ''} {${f.object.fields.map(s => s.name).join(', ')}}`
        : f.kind === 'number' && f.numberFormat === 'int'
          ? 'number (int)'
          : f.kind;
  return f.isArray ? `${base}[]` : base;
}

function IssueTable({ title, rows, hint }: { title: string; rows: CollectionReportIssue[]; hint: string }) {
  if (!rows.length) return null;
  return (
    <Box sx={{ mt: 1.5 }}>
      <Typography variant='subtitle2'>{title}</Typography>
      <Typography variant='caption' color='text.secondary'>
        {hint}
      </Typography>
      <Table size='small'>
        <TableHead>
          <TableRow>
            <TableCell>Alan</TableCell>
            <TableCell align='right'>Doküman</TableCell>
            <TableCell>Bulunan tip</TableCell>
            <TableCell>Admin okuması</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map(row => (
            <TableRow key={row.path}>
              <TableCell>
                <code>{row.path}</code>
                {row.expected && (
                  <Typography variant='caption' color='text.secondary'>
                    {' '}
                    (model: {row.expected})
                  </Typography>
                )}
              </TableCell>
              <TableCell align='right'>{row.docs}</TableCell>
              <TableCell>{row.types.join(', ') || '—'}</TableCell>
              <TableCell>{row.breaksAdminRead ? <Chip size='small' color='error' label='500' /> : <Chip size='small' label='okunur' />}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

function ReportSection({ report, summary }: { report: CollectionReport; summary?: string }) {
  if (!report.ok) {
    return (
      <Alert severity='warning' sx={{ mt: 1 }}>
        Fazladan alan raporu alınamadı ({report.reason}): {report.error}. İçe aktarma yine de yapılabilir; collection'ı elle kontrol edin.
      </Alert>
    );
  }
  const problems = report.extra.length + report.missing.length + report.mismatched.length;
  return (
    <Box sx={{ mt: 1 }}>
      <Alert severity={problems ? 'warning' : 'success'}>
        {summary}
        <Typography variant='caption' display='block'>
          Kaynak: {report.source} → {report.server} / {report.database} (salt okunur örnekleme)
        </Typography>
      </Alert>
      <IssueTable
        title='Modelde olmayan alanlar'
        rows={report.extra}
        hint='Doküman ve alt obje sınıfları extra="forbid": alanı modele ekleyin ya da migration ile temizleyin.'
      />
      <IssueTable
        title='Eksik zorunlu alanlar'
        rows={report.missing}
        hint='Admin satırı bu alanları ister: varsayılan / opsiyonel yapın ya da migration ile doldurun.'
      />
      <IssueTable
        title='Tipi uymayan değerler'
        rows={report.mismatched}
        hint='Satır doğrulaması başarısız olur: veriyi dönüştürün ya da alan tipini değiştirin.'
      />
      <IssueTable
        title='Okunur ama sorunlu'
        rows={report.soft}
        hint='ISO metin tarih / string id: filtre, sıralama ve ilişki kontrolü bu dokümanları kaçırır.'
      />
    </Box>
  );
}

const PythonImportDialog = ({ projectPath, onClosed }: Props) => {
  const dispatch = useAppDispatch();
  const { filePath, status, preview, result, error } = useAppSelector(state => state.project.pythonImport);
  const [allowRemote, setAllowRemote] = useState(false);

  useEffect(() => {
    if (filePath && status === 'idle') dispatch(previewPythonImport({ projectPath, filePath }));
  }, [dispatch, filePath, projectPath, status]);

  const reload = (className?: string, remote = allowRemote) => {
    if (filePath) dispatch(previewPythonImport({ projectPath, filePath, className, allowRemote: remote }));
  };

  const close = () => {
    const imported = status === 'imported';
    dispatch(closePythonImport());
    onClosed(imported);
  };

  const busy = status === 'previewing' || status === 'importing';
  const fields = preview?.model?.fields.filter(f => f.name !== 'createdAt' && f.name !== 'updatedAt') ?? [];

  return (
    <Dialog open={!!filePath} onClose={close} maxWidth='md' fullWidth>
      <DialogTitle>Python modelini içe aktar</DialogTitle>
      <DialogContent dividers>
        <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
          <code>{filePath}</code>: sınıf bir kez manifest'e okunur, modül üretilir (G dosyaları); sonra model Generator'da düzenlenir. Var olan K
          dosyaları (<code>model.py</code>, <code>repository.py</code>, <code>service.py</code>) korunur.
        </Typography>

        {busy && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, my: 2 }}>
            <CircularProgress size={20} />
            <Typography variant='body2'>
              {status === 'importing' ? 'İçe aktarılıyor, üretiliyor…' : 'Model okunuyor, collection örnekleniyor…'}
            </Typography>
          </Box>
        )}

        {error && (
          <Alert severity='error' sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {preview && status !== 'imported' && (
          <>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2 }}>
              <TextField
                select
                size='small'
                label='Doküman sınıfı'
                value={preview.className ?? ''}
                onChange={e => reload(e.target.value)}
                sx={{ minWidth: 260 }}
                disabled={busy}
              >
                {(preview.candidates ?? []).map(name => (
                  <MenuItem key={name} value={name}>
                    {name}
                  </MenuItem>
                ))}
              </TextField>
              {preview.entityName && (
                <Typography variant='body2'>
                  Entity <strong>{preview.entityName}</strong>, collection <code>{preview.collection}</code>
                </Typography>
              )}
            </Box>

            <Table size='small'>
              <TableHead>
                <TableRow>
                  <TableCell>Alan</TableCell>
                  <TableCell>Tip</TableCell>
                  <TableCell>Zorunlu</TableCell>
                  <TableCell>Varsayılan / kısıt</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {fields.map(f => (
                  <TableRow key={f.name}>
                    <TableCell>
                      <code>{f.name}</code>
                    </TableCell>
                    <TableCell>{fieldType(f)}</TableCell>
                    <TableCell>{f.required ? (f.nullable ? 'evet (null olabilir)' : 'evet') : 'hayır'}</TableCell>
                    <TableCell>
                      {[
                        f.default !== undefined ? `= ${JSON.stringify(f.default)}` : '',
                        f.constraints ? JSON.stringify(f.constraints) : '',
                        f.format ?? ''
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {!!preview.unsupported?.length && (
              <Alert severity='error' sx={{ mt: 2 }}>
                Desteklenmeyen alanlar (içe aktarma yapılmaz):
                <ul style={{ margin: 0 }}>
                  {preview.unsupported.map(u => (
                    <li key={u}>{u}</li>
                  ))}
                </ul>
              </Alert>
            )}
            {!!preview.warnings?.length && (
              <Alert severity='info' sx={{ mt: 2 }}>
                Yaklaşık ya da taşınmayanlar:
                <ul style={{ margin: 0, maxHeight: 160, overflow: 'auto' }}>
                  {preview.warnings.map(w => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </Alert>
            )}
            {!!preview.suggestions?.length && (
              <Alert severity='info' sx={{ mt: 2 }}>
                Editörde bakılacaklar:
                <ul style={{ margin: 0 }}>
                  {preview.suggestions.map(w => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </Alert>
            )}

            <Typography variant='subtitle1' sx={{ mt: 3 }}>
              Fazladan alan raporu
            </Typography>
            {preview.report && <ReportSection report={preview.report} summary={preview.reportSummary} />}
            <FormControlLabel
              control={
                <Checkbox
                  checked={allowRemote}
                  onChange={e => {
                    setAllowRemote(e.target.checked);
                    reload(preview.className, e.target.checked);
                  }}
                />
              }
              label='Yerel olmayan Mongo sunucusuna da bağlan (salt okunur)'
            />
          </>
        )}

        {status === 'imported' && result && (
          <Alert severity='success'>
            <strong>{result.entityName}</strong> içe aktarıldı: <code>{result.sourceRelativePath}</code>. {result.writtenFiles?.length ?? 0} dosya
            yazıldı.
            {!!result.notes?.length && (
              <ul style={{ marginBottom: 0 }}>
                {result.notes.map(n => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>{status === 'imported' ? 'Kapat' : 'Vazgeç'}</Button>
        {status !== 'imported' && (
          <Button
            variant='contained'
            disabled={busy || !preview?.model || !!preview.unsupported?.length}
            onClick={() => filePath && dispatch(importPythonModel({ projectPath, filePath, className: preview?.className }))}
          >
            İçe aktar ve generate et
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default PythonImportDialog;
