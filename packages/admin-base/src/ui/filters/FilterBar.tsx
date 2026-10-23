import { Box, Button, MenuItem, Stack, TextField } from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';
import { useState, type KeyboardEvent } from 'react';
import { useFieldOptions } from '../../react/hooks.js';
import type { AnyResource } from '../../schema/extend.js';
import type { FieldConfig } from '../../schema/fields.js';
import { enumChoices, enumValueFromInput } from '../enumChoices.js';
import { isRecord } from '../format.js';
import { RelationAutocomplete } from '../inputs/RelationAutocomplete.js';
import { fieldLabelKey, useAdminTexts } from '../useAdminTexts.js';
import { buildListFilters, type FilterDraft } from './filterValues.js';

/** Varsayılan minWidth'ler admin-ui kuralından. */
const minWidthFor: Record<string, number> = { boolean: 140, enum: 140, 'date-range': 160, range: 120, relation: 200 };

export interface FilterBarProps {
  resource: AnyResource;
  onApply: (filters: Record<string, unknown>) => void;
}

interface EnumFilterProps {
  resource: AnyResource;
  field: FieldConfig;
  label: string;
  sx: { minWidth: number };
  value: unknown;
  onChange: (value: unknown) => void;
}

/** Ayrı bileşen: `loadOptions` sorgusu hook olduğu için alan başına bir kez çağrılmalı. */
function EnumFilter({ resource, field, label, sx, value, onChange }: EnumFilterProps) {
  const texts = useAdminTexts();
  const loadOptions = resource.extensions?.fields?.[field.name]?.loadOptions;
  const loaded = useFieldOptions(resource.name, field, loadOptions);
  const choices = enumChoices(field, loadOptions ? loaded : undefined);
  return (
    <TextField select size='small' label={label} sx={sx} value={value ?? ''}
      onChange={e => onChange(enumValueFromInput(field, e.target.value))}>
      <MenuItem value=''>{texts.text('all')}</MenuItem>
      {choices.map(choice => (
        <MenuItem key={String(choice.value)} value={choice.value}>
          {texts.enumLabel(resource, field.name, choice.label)}
        </MenuItem>
      ))}
    </TextField>
  );
}

/** Taslak / uygulanmış ayrımı: istek yalnızca "Uygula" ile atılır. */
export function FilterBar({ resource, onApply }: FilterBarProps) {
  const texts = useAdminTexts();
  const { text } = texts;
  const [draft, setDraft] = useState<FilterDraft>({});
  const fields = resource.fields.filter(f => f.filter && !f.writeOnly);

  const set = (name: string, value: unknown) => setDraft(prev => ({ ...prev, [name]: value }));
  const apply = () => onApply(buildListFilters(resource.fields, draft));
  const reset = () => {
    setDraft({});
    onApply({});
  };
  const onEnter = (event: KeyboardEvent) => {
    if (event.key === 'Enter') apply();
  };

  if (fields.length === 0) return null;

  const renderField = (field: FieldConfig) => {
    const label = texts.fieldLabel(fieldLabelKey(resource, [field.name]), field);
    const raw = draft[field.name];
    const sx = { minWidth: minWidthFor[field.filter ?? ''] ?? (field.kind === 'number' ? 120 : 180) };

    switch (field.filter) {
      case 'boolean':
        return (
          <TextField select size='small' label={label} sx={sx} value={raw ?? ''} onChange={e => set(field.name, e.target.value)}>
            <MenuItem value=''>{text('all')}</MenuItem>
            <MenuItem value='true'>{text('yes')}</MenuItem>
            <MenuItem value='false'>{text('no')}</MenuItem>
          </TextField>
        );
      case 'enum':
        return <EnumFilter resource={resource} field={field} label={label} sx={sx} value={raw} onChange={v => set(field.name, v)} />;
      case 'relation':
        return field.kind === 'relation' ? (
          <RelationAutocomplete field={field} label={label} value={raw} onChange={v => set(field.name, v)} sx={sx} />
        ) : null;
      case 'range': {
        const range = isRecord(raw) ? raw : {};
        return (
          <Stack direction='row' spacing={1}>
            <TextField size='small' type='number' label={`${label} · ${text('min')}`} sx={sx} value={range.min ?? ''}
              onChange={e => set(field.name, { ...range, min: e.target.value })} onKeyDown={onEnter} />
            <TextField size='small' type='number' label={`${label} · ${text('max')}`} sx={sx} value={range.max ?? ''}
              onChange={e => set(field.name, { ...range, max: e.target.value })} onKeyDown={onEnter} />
          </Stack>
        );
      }
      case 'date-range': {
        const range = isRecord(raw) ? raw : {};
        const picker = (key: 'from' | 'to') => (
          <DatePicker
            label={`${label} · ${text(key)}`}
            value={range[key] ? dayjs(range[key] as string) : null}
            onChange={v => set(field.name, { ...range, [key]: v && v.isValid() ? v.format('YYYY-MM-DD') : undefined })}
            slotProps={{ textField: { size: 'small', sx } }}
          />
        );
        return (
          <Stack direction='row' spacing={1}>
            {picker('from')}
            {picker('to')}
          </Stack>
        );
      }
      default:
        return (
          <TextField size='small' label={label} sx={sx} value={raw ?? ''} type={field.kind === 'number' ? 'number' : 'text'}
            onChange={e => set(field.name, e.target.value)} onKeyDown={onEnter} />
        );
    }
  };

  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} useFlexGap sx={{ flexWrap: 'wrap', flexShrink: 0, alignItems: { md: 'center' } }}>
      <TextField size='small' label='ID' sx={{ minWidth: 220 }} value={draft.id ?? ''} onChange={e => set('id', e.target.value)} onKeyDown={onEnter} />
      {fields.map(field => (
        <Box key={field.name}>{renderField(field)}</Box>
      ))}
      <Stack direction='row' spacing={1}>
        <Button variant='outlined' onClick={apply}>
          {text('apply')}
        </Button>
        <Button variant='text' onClick={reset}>
          {text('reset')}
        </Button>
      </Stack>
    </Stack>
  );
}
