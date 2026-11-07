import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  FormControlLabel,
  FormHelperText,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Tooltip,
  type TextFieldProps
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useController, useFieldArray, useFormContext } from 'react-hook-form';
import { useFieldOptions } from '../../react/hooks.js';
import type { AnyResource, LoadOptions } from '../../schema/extend.js';
import type { FieldConfig, MapFieldConfig, ObjectFieldConfig } from '../../schema/fields.js';
import { enumChoices, enumLabelOf, enumValueFromInput } from '../enumChoices.js';
import { isRecord } from '../format.js';
import { RelationAutocomplete } from '../inputs/RelationAutocomplete.js';
import { useAdminTexts } from '../useAdminTexts.js';
import { validateField } from './rules.js';
import { initialFormValues, isFieldVisible, type FormMode } from './values.js';

export interface FormFieldsProps {
  resource: AnyResource;
  fields: readonly FieldConfig[];
  mode: FormMode;
  /** RHF path öneki (ör. `limits`, `items.0`). */
  prefix?: string;
  /** i18n etiket yolu; alt alanlar `<üst>_<alt>` olur. */
  labelPath?: readonly string[];
  /** Etiket anahtar kökü; verilmezse `admin.<resource>.fields`. Action formları kendi kökünü verir. */
  labelBase?: string;
  /** Yalnızca üst seviyede `extensions.fields.<ad>.formField` override'ı uygulanır. */
  topLevel?: boolean;
}

interface FieldProps {
  resource: AnyResource;
  field: FieldConfig;
  mode: FormMode;
  path: string;
  label: string;
  labelPath: readonly string[];
  labelBase: string;
  topLevel: boolean;
}

export function FormFields({ resource, fields, mode, prefix, labelPath = [], labelBase, topLevel = true }: FormFieldsProps) {
  const texts = useAdminTexts();
  const base = labelBase ?? `admin.${resource.name}.fields`;
  return (
    <Stack spacing={2}>
      {fields
        .filter(field => isFieldVisible(field, mode))
        .map(field => {
          const path = prefix ? `${prefix}.${field.name}` : field.name;
          const label = texts.fieldLabel(`${base}.${[...labelPath, field.name].join('_')}`, field);
          const props: FieldProps = { resource, field, mode, path, label, labelPath, labelBase: base, topLevel };
          return <FieldInput key={path} {...props} />;
        })}
    </Stack>
  );
}

function FieldInput(props: FieldProps) {
  const { field } = props;
  if (field.kind === 'object') {
    return field.isArray ? <ObjectArrayField {...props} field={field} /> : <ObjectGroup {...props} field={field} />;
  }
  return <ControlledField {...props} />;
}

function ObjectGroup({ resource, field, mode, path, label, labelPath, labelBase }: FieldProps & { field: ObjectFieldConfig }) {
  return (
    <Box component='fieldset' sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5, m: 0 }}>
      <Box component='legend' sx={{ px: 0.5, fontSize: '0.8125rem', color: 'text.secondary' }}>
        {label}
      </Box>
      <FormFields resource={resource} fields={field.fields} mode={mode} prefix={path}
        labelPath={[...labelPath, field.name]} labelBase={labelBase} topLevel={false} />
    </Box>
  );
}

function ObjectArrayField({ resource, field, mode, path, label, labelPath, labelBase }: FieldProps & { field: ObjectFieldConfig }) {
  const { text } = useAdminTexts();
  const { control } = useFormContext();
  // `keyName`: alt dokümanların kendi `id` alanı RHF'nin üreteceği anahtarla çakışmasın.
  const { fields: items, append, remove } = useFieldArray({ control, name: path, keyName: 'rhfKey' });
  const disabled = mode === 'edit' && field.readonly;

  return (
    <Box>
      <Box sx={{ fontSize: '0.8125rem', color: 'text.secondary', mb: 1 }}>{label}</Box>
      <Stack spacing={1.5}>
        {items.map((item, index) => (
          <Paper key={item.rhfKey} variant='outlined' sx={{ p: 1.5, display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <FormFields resource={resource} fields={field.fields} mode={mode} prefix={`${path}.${index}`}
                labelPath={[...labelPath, field.name]} labelBase={labelBase} topLevel={false} />
            </Box>
            <Tooltip title={text('removeItem')}>
              <span>
                <IconButton size='small' disabled={disabled} onClick={() => remove(index)}>
                  <DeleteOutlineIcon fontSize='small' />
                </IconButton>
              </span>
            </Tooltip>
          </Paper>
        ))}
        <Box>
          <Button size='small' startIcon={<AddIcon />} disabled={disabled}
            onClick={() => append(initialFormValues(field.fields, 'create'))}>
            {text('addItem')}
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}

interface OptionsSelectProps {
  resource: AnyResource;
  field: FieldConfig;
  loadOptions?: LoadOptions;
  common: TextFieldProps;
  value: unknown;
  onChange: (value: unknown) => void;
}

/** Enum ya da `loadOptions`'lı string alanı; seçenek sorgusu hook olduğu için ayrı bileşen. */
function OptionsSelect({ resource, field, loadOptions, common, value, onChange }: OptionsSelectProps) {
  const texts = useAdminTexts();
  const loaded = useFieldOptions(resource.name, field, loadOptions);
  const choices = enumChoices(field, loadOptions ? loaded : undefined);
  // Seçenekler yüklenmeden gelen kayıt değeri listede yoksa yine seçilebilir kalır (MUI "out-of-range" uyarısı olmaz).
  const known = new Set(choices.map(choice => String(choice.value)));
  const current: unknown[] = field.isArray ? (Array.isArray(value) ? value : []) : value == null || value === '' ? [] : [value];
  const missing = current
    .filter(v => !known.has(String(v)))
    .map(v => ({ value: v as string | number, label: enumLabelOf(field, v) }));
  return (
    <TextField {...common} select value={field.isArray ? (Array.isArray(value) ? value : []) : (value ?? '')}
      onChange={e => {
        const raw: unknown = e.target.value;
        onChange(Array.isArray(raw) ? raw.map(v => enumValueFromInput(field, v)) : enumValueFromInput(field, raw));
      }}
      slotProps={{ select: { multiple: field.isArray } }}>
      {!field.isArray && !field.required ? <MenuItem value=''>—</MenuItem> : null}
      {[...choices, ...missing].map(choice => (
        <MenuItem key={String(choice.value)} value={choice.value}>
          {texts.enumLabel(resource, field.name, choice.label)}
        </MenuItem>
      ))}
    </TextField>
  );
}

function ControlledField({ resource, field, mode, path, label, topLevel }: FieldProps) {
  const texts = useAdminTexts();
  const { control } = useFormContext();
  const disabled = mode === 'edit' && Boolean(field.readonly);
  const {
    field: { value, onChange, onBlur, ref },
    fieldState
  } = useController({
    control,
    name: path,
    rules: {
      validate: v => {
        const result = validateField(field, v, mode);
        return result === true ? true : texts.text(result);
      }
    }
  });
  const error = fieldState.error?.message;
  const common = { label, size: 'small' as const, fullWidth: true, disabled, error: Boolean(error), helperText: error, onBlur, inputRef: ref };

  const Override = topLevel ? resource.extensions?.fields?.[field.name]?.formField : undefined;
  if (Override) return <Override value={value} onChange={onChange} disabled={disabled} error={error} />;

  if (field.kind === 'file') {
    const file = value instanceof File ? value : null;
    return (
      <Box>
        <Box sx={{ fontSize: '0.8125rem', color: 'text.secondary', mb: 1 }}>{label}</Box>
        <Button variant='outlined' component='label' disabled={disabled} color={error ? 'error' : 'primary'}>
          {file ? texts.text('changeFile') : texts.text('chooseFile')}
          <input hidden type='file' accept={field.accept} ref={ref} onBlur={onBlur}
            onChange={e => onChange(e.target.files?.[0] ?? null)} />
        </Button>
        {error || file ? (
          <FormHelperText error={Boolean(error)}>
            {error ?? `${file?.name} · ${Math.max(1, Math.round((file?.size ?? 0) / 1024))} KB`}
          </FormHelperText>
        ) : null}
      </Box>
    );
  }

  if (field.kind === 'map') return <MapEditor field={field} label={label} value={value} onChange={onChange} disabled={disabled} />;

  if (field.kind === 'json') {
    // JSON metni; gönderirken parse edilir (`values.ts`), geçersizse alanın altında hata (`rules.ts`).
    return (
      <TextField {...common} value={value ?? ''} onChange={e => onChange(e.target.value)} multiline minRows={4}
        slotProps={{ htmlInput: { spellCheck: false, style: { fontFamily: 'monospace', fontSize: '0.8125rem' } } }} />
    );
  }

  if (field.kind === 'relation') {
    return <RelationAutocomplete field={field} label={label} value={value} onChange={onChange}
      multiple={field.isArray} disabled={disabled} error={error} />;
  }

  const loadOptions = topLevel ? resource.extensions?.fields?.[field.name]?.loadOptions : undefined;
  if (field.kind === 'enum' || (field.kind === 'string' && loadOptions)) {
    return (
      <OptionsSelect resource={resource} field={field} loadOptions={loadOptions} common={common} value={value} onChange={onChange} />
    );
  }

  if (field.kind === 'boolean') {
    return (
      <Box>
        <FormControlLabel label={label} disabled={disabled}
          control={<Switch checked={Boolean(value)} onChange={e => onChange(e.target.checked)} onBlur={onBlur} inputRef={ref} />} />
        {error ? <FormHelperText error>{error}</FormHelperText> : null}
      </Box>
    );
  }

  if (field.isArray) {
    return (
      <Autocomplete<string, true, false, true>
        multiple
        freeSolo
        options={[]}
        disabled={disabled}
        value={Array.isArray(value) ? value.map(String) : []}
        onChange={(_, next) => onChange(next.map(v => v.trim()).filter(Boolean))}
        renderValue={(selected, getItemProps) =>
          selected.map((option, index) => <Chip size='small' label={option} {...getItemProps({ index })} key={option} />)
        }
        renderInput={params => <TextField {...params} label={label} size='small' error={Boolean(error)} helperText={error} />}
      />
    );
  }

  if (field.kind === 'datetime') {
    const pickerProps = {
      label,
      disabled,
      value: value ? dayjs(value as string) : null,
      inputRef: ref,
      slotProps: { textField: { size: 'small' as const, fullWidth: true, error: Boolean(error), helperText: error, onBlur } }
    };
    if (field.dateFormat === 'date') {
      return <DatePicker {...pickerProps} onChange={v => onChange(v && v.isValid() ? v.format('YYYY-MM-DD') : null)} />;
    }
    return <DateTimePicker {...pickerProps} onChange={v => onChange(v && v.isValid() ? v.toISOString() : null)} />;
  }

  if (field.component === 'image') {
    const url = typeof value === 'string' ? value.trim() : '';
    return (
      <Stack spacing={1}>
        <TextField {...common} value={value ?? ''} onChange={e => onChange(e.target.value)} type='url' />
        {url ? (
          <Box component='img' src={url} alt={label}
            sx={{ maxWidth: 160, maxHeight: 120, objectFit: 'contain', borderRadius: 1, border: 1, borderColor: 'divider' }} />
        ) : null}
      </Stack>
    );
  }

  return (
    <TextField
      {...common}
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      type={field.format === 'email' ? 'email' : field.kind === 'number' ? 'number' : field.writeOnly ? 'password' : 'text'}
      autoComplete={field.writeOnly ? 'new-password' : field.format === 'email' ? 'email' : undefined}
      multiline={field.component === 'textarea'}
      minRows={field.component === 'textarea' ? 3 : undefined}
      slotProps={
        field.kind === 'decimal'
          ? { htmlInput: { inputMode: 'decimal' as const } }
          : field.kind === 'number' && field.numberFormat === 'int'
            ? { htmlInput: { step: 1 } }
            : undefined
      }
    />
  );
}

interface MapRow {
  key: string;
  value: string;
}

function MapEditor({ field, label, value, onChange, disabled }: {
  field: MapFieldConfig;
  label: string;
  value: unknown;
  onChange: (value: Record<string, unknown>) => void;
  disabled?: boolean;
}) {
  const { text } = useAdminTexts();
  const [rows, setRows] = useState<MapRow[]>(() =>
    Object.entries(isRecord(value) ? value : {}).map(([key, v]) => ({ key, value: v == null ? '' : String(v) }))
  );

  const emit = (next: MapRow[]) => {
    setRows(next);
    const entries = next
      .filter(row => row.key.trim())
      .map(row => [row.key.trim(), field.valueKind === 'boolean' ? row.value === 'true' : row.value] as const);
    onChange(Object.fromEntries(entries));
  };

  return (
    <Box>
      <Box sx={{ fontSize: '0.8125rem', color: 'text.secondary', mb: 1 }}>{label}</Box>
      <Stack spacing={1}>
        {rows.map((row, index) => (
          <Stack key={index} direction='row' spacing={1} alignItems='center'>
            <TextField size='small' label={text('key')} value={row.key} disabled={disabled} sx={{ flex: 1 }}
              onChange={e => emit(rows.map((r, i) => (i === index ? { ...r, key: e.target.value } : r)))} />
            <TextField size='small' label={text('value')} value={row.value} disabled={disabled} sx={{ flex: 1 }}
              type={field.valueKind === 'number' ? 'number' : 'text'}
              onChange={e => emit(rows.map((r, i) => (i === index ? { ...r, value: e.target.value } : r)))} />
            <IconButton size='small' disabled={disabled} onClick={() => emit(rows.filter((_, i) => i !== index))}>
              <DeleteOutlineIcon fontSize='small' />
            </IconButton>
          </Stack>
        ))}
        <Box>
          <Button size='small' startIcon={<AddIcon />} disabled={disabled} onClick={() => setRows([...rows, { key: '', value: '' }])}>
            {text('addItem')}
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}
