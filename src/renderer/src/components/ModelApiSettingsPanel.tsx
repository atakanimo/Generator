import { Alert, Box, Checkbox, FormControl, FormControlLabel, FormGroup, InputLabel, MenuItem, Select, Switch, Typography } from '@mui/material';
import type { NormalOperation } from '@shared/normalizedModel';
import type { ModelApiSettings } from '../features/project/modelEdits';

/**
 * Per-model API settings (plan 5 P5 #24, #26a; contract §2.1, G3, G5): normal (mobile) API operations,
 * record ownership, auth and the admin API. Stored in the manifest with the model.
 */

const OPERATIONS: Array<{ op: NormalOperation; label: string; endpoint: string; write: boolean }> = [
  { op: 'list', label: 'List', endpoint: 'POST /get-all', write: false },
  { op: 'getOne', label: 'Get one', endpoint: 'GET /:id', write: false },
  { op: 'create', label: 'Create', endpoint: 'POST /create', write: true },
  { op: 'update', label: 'Update', endpoint: 'POST /update/:id', write: true },
  { op: 'delete', label: 'Delete', endpoint: 'DELETE /:id', write: true }
];

type OwnershipChoice = 'none' | 'field' | 'self';

type NamedField = { name: string };

export interface ResolvedModelApi {
  operations: NormalOperation[];
  ownership: OwnershipChoice;
  requiresAuth: boolean;
  admin: boolean;
}

/** Effective settings as the backend generator will apply them (writes need ownership; self has no create). */
export function resolveModelApi(api: ModelApiSettings | undefined, fields: NamedField[]): ResolvedModelApi {
  const hasUserId = fields.some(f => f.name.toLowerCase() === 'userid');
  const ownership: OwnershipChoice = api?.ownership === 'self' ? 'self' : hasUserId ? 'field' : 'none';
  const selected = api?.normalOperations ?? [];
  const operations = OPERATIONS.filter(({ op, write }) => {
    if (!selected.includes(op)) return false;
    if (write && ownership === 'none') return false;
    return !(op === 'create' && ownership === 'self');
  }).map(({ op }) => op);
  const hasWrite = operations.some(op => OPERATIONS.find(o => o.op === op)?.write);
  return { operations, ownership, requiresAuth: hasWrite || api?.requiresAuth !== false, admin: api?.admin === true };
}

interface Props {
  api: ModelApiSettings | undefined;
  fields: NamedField[];
  source: 'saved' | 'files' | 'new' | null;
  onChange: (patch: Partial<ModelApiSettings>) => void;
}

const ModelApiSettingsPanel = ({ api, fields, source, onChange }: Props) => {
  const hasUserId = fields.some(f => f.name.toLowerCase() === 'userid');
  const resolved = resolveModelApi(api, fields);
  const hasWrite = resolved.operations.some(op => OPERATIONS.find(o => o.op === op)?.write);

  const toggleOperation = (op: NormalOperation, checked: boolean) => {
    const current = new Set(resolved.operations);
    if (checked) current.add(op);
    else current.delete(op);
    const normalOperations = OPERATIONS.map(o => o.op).filter(o => current.has(o));
    const addsWrite = checked && OPERATIONS.find(o => o.op === op)?.write;
    onChange(addsWrite ? { normalOperations, requiresAuth: true } : { normalOperations });
  };

  const changeOwnership = (choice: OwnershipChoice) => {
    const ownership = choice === 'self' ? 'self' : choice === 'field' ? 'field' : undefined;
    // Keep the stored set equal to what will be generated.
    const normalOperations = resolveModelApi({ ...api, ownership }, fields).operations;
    onChange({ ownership, normalOperations });
  };

  return (
    <Box>
      <FormControlLabel
        control={<Checkbox checked={resolved.admin} onChange={e => onChange({ admin: e.target.checked })} />}
        label='Include Admin API'
      />
      <Typography variant='subtitle1' sx={{ fontWeight: 600, mt: 2, mb: 0.5 }}>
        Normal (mobil) API
      </Typography>
      {source === 'files' && (
        <Alert severity='info' sx={{ mb: 1.5 }}>
          Bu modelin API ayarları henüz kaydedilmemiş; mevcut route dosyasından okundu. Saklamak için Save Configuration.
        </Alert>
      )}
      {source === 'new' && (
        <Alert severity='info' sx={{ mb: 1.5 }}>
          Yeni model: normal API işlemleri varsayılan olarak kapalı. Mobilin kullanacağı işlemleri seçin.
        </Alert>
      )}
      <FormGroup row>
        {OPERATIONS.map(({ op, label, endpoint, write }) => {
          const disabled = (write && resolved.ownership === 'none') || (op === 'create' && resolved.ownership === 'self');
          return (
            <FormControlLabel
              key={op}
              disabled={disabled}
              control={<Checkbox checked={resolved.operations.includes(op)} onChange={e => toggleOperation(op, e.target.checked)} />}
              label={
                <Box>
                  <Typography variant='body2'>{label}</Typography>
                  <Typography variant='caption' color='text.secondary'>
                    {endpoint}
                  </Typography>
                </Box>
              }
              sx={{ mr: 3 }}
            />
          );
        })}
      </FormGroup>
      <Box sx={{ display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap', mt: 1.5 }}>
        <FormControl size='small' sx={{ minWidth: 260 }}>
          <InputLabel id='ownership-label'>Kayıt sahibi (ownership)</InputLabel>
          <Select
            labelId='ownership-label'
            label='Kayıt sahibi (ownership)'
            value={resolved.ownership}
            onChange={e => changeOwnership(e.target.value as OwnershipChoice)}
          >
            <MenuItem value='none' disabled={hasUserId}>
              Yok (yalnızca okuma)
            </MenuItem>
            <MenuItem value='field' disabled={!hasUserId}>
              userId alanı
            </MenuItem>
            <MenuItem value='self'>Kaydın kendisi (kullanıcı)</MenuItem>
          </Select>
        </FormControl>
        <FormControlLabel
          control={
            <Switch
              checked={resolved.requiresAuth}
              disabled={hasWrite}
              onChange={e => onChange({ requiresAuth: e.target.checked })}
              color='primary'
            />
          }
          label='Requires Authentication?'
        />
      </Box>
      <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mt: 1 }}>
        {resolved.ownership === 'none'
          ? 'Ownership olmayan modelde normal API yalnızca okur; yazma işlemleri kapalı.'
          : resolved.ownership === 'self'
            ? 'Kapsam: { _id: authUserId } — kullanıcı yalnızca kendi kaydını okur / günceller.'
            : 'Kapsam: { userId: authUserId } — kullanıcı yalnızca kendi kayıtlarını görür.'}
        {hasWrite ? ' Yazma seçili olduğu için kimlik doğrulama kapatılamaz.' : ''}
        {resolved.operations.length === 0
          ? ' Hiçbir işlem seçilmezse yeni modelde normal route dosyası üretilmez; mevcut dosyada yalnızca custom route’lar kalır.'
          : ''}
      </Typography>
    </Box>
  );
};

export default ModelApiSettingsPanel;
