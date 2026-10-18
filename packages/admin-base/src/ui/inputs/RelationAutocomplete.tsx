import { Autocomplete, CircularProgress, TextField, type SxProps, type Theme } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useAtaAdmin } from '../../react/context.js';
import { useRelationOptions } from '../../react/hooks.js';
import type { RelationFieldConfig } from '../../schema/fields.js';
import { canSearchRelation, relationId, relationLabel } from '../../schema/relation.js';
import { isEmptyValue } from '../format.js';

type Option = { id: string } & Record<string, unknown>;

export interface RelationAutocompleteProps {
  field: RelationFieldConfig;
  label: string;
  /** Tek: id veya populate edilmiş obje. Çoklu: bunların dizisi. */
  value: unknown;
  onChange: (value: unknown) => void;
  multiple?: boolean;
  disabled?: boolean;
  error?: string;
  sx?: SxProps<Theme>;
}

function toOption(value: unknown): Option | null {
  if (isEmptyValue(value)) return null;
  const id = relationId(value);
  if (typeof value === 'object' && value !== null) return { ...(value as Record<string, unknown>), id: String(id) };
  return { id: String(id) };
}

/**
 * İlişki seçici (K3): açılınca hedefin `get-all`'undan 20 kayıt çeker, yazdıkça 300 ms gecikmeyle arar.
 * Seçilen değer populate edilmiş obje olarak tutulur; gönderimde `toWriteBody` id'ye indirir.
 */
export function RelationAutocomplete({ field, label, value, onChange, multiple, disabled, error, sx }: RelationAutocompleteProps) {
  const { resources } = useAtaAdmin();
  const searchable = canSearchRelation(field, resources.get(field.ref));
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const handle = setTimeout(() => setSearch(input), 300);
    return () => clearTimeout(handle);
  }, [input]);

  const query = useRelationOptions(field, searchable ? search : '', { enabled: open });
  const options = (query.data?.items ?? []) as Option[];

  const selected = useMemo(() => {
    if (multiple) return (Array.isArray(value) ? value : []).map(toOption).filter((o): o is Option => o !== null);
    return toOption(value);
  }, [multiple, value]);

  return (
    <Autocomplete<Option, boolean>
      multiple={multiple}
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      disabled={disabled}
      sx={sx}
      size='small'
      options={options}
      value={selected as Option & Option[]}
      loading={query.isFetching}
      filterOptions={searchable ? x => x : undefined}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      getOptionLabel={option => relationLabel(option, field)}
      onInputChange={(_, next, reason) => {
        if (reason === 'input') setInput(next);
        if (reason === 'clear') setInput('');
      }}
      onChange={(_, next) => onChange(next ?? (multiple ? [] : null))}
      renderInput={params => (
        <TextField
          {...params}
          label={label}
          error={Boolean(error)}
          helperText={error}
          slotProps={{
            input: {
              ...params.InputProps,
              endAdornment: (
                <>
                  {query.isFetching ? <CircularProgress color='inherit' size={16} /> : null}
                  {params.InputProps.endAdornment}
                </>
              )
            }
          }}
        />
      )}
    />
  );
}
