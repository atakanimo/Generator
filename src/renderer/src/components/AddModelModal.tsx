import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Divider,
  Alert,
  Switch,
  Autocomplete,
  Chip
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import type { NormalizedField, NormalizedModel, NormalizedObjectSubField } from '@shared/normalizedModel';
import { typeTokenOf } from '@shared/fieldTypeToken';
import {
  EDITOR_FIELD_TYPES,
  EDITOR_SUB_FIELD_TYPES,
  editorSubTypeOf,
  editorShowsNumberFormat,
  editorTypeHasDefault,
  editorTypeOf,
  isReservedFieldName,
  newObjectSubField,
  normalizeEditedField,
  referenceTargetOf,
  subReferenceOf,
  withEditorSubType,
  withEditorType,
  withConstraint,
  withEnumNumbers,
  withEnumValues,
  withPattern,
  withReferenceTarget,
  withSubReference,
  type EditorFieldType,
  type EditorSubFieldType,
  type ModelDraft
} from '@shared/modelDraft';

interface AddModelModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (draft: ModelDraft) => Promise<void>;
  projectPath: string;
  sourceType: 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm' | 'python-fastapi' | null;
  initialData?: ModelDraft | null;
  isEditMode?: boolean;
  modelFilePath?: string;
}

const DEFAULT_FIELDS: NormalizedField[] = [
  { name: 'value', kind: 'string', isArray: false, required: true, unique: true, trim: true },
  { name: 'displayText', kind: 'string', isArray: false, required: true, unique: false, trim: true }
];

const newField = (): NormalizedField => ({ name: '', kind: 'string', isArray: false, required: false, unique: false, trim: false });

/** Schema `default:` editor — typed by the field type; an enum field picks one of its values. */
function SchemaDefaultInput({ field, onChange }: { field: NormalizedField; onChange: (value: NormalizedField['default']) => void }) {
  const value = field.default;
  const type = editorTypeOf(field);
  const enumValues = field.enum?.values;
  if (type === 'Boolean' || enumValues?.length) {
    const options = type === 'Boolean' ? ['true', 'false'] : enumValues ?? [];
    return (
      <FormControl size='small' sx={{ minWidth: 140 }}>
        <InputLabel>Default</InputLabel>
        <Select
          label='Default'
          value={value === undefined || value === null ? '' : String(value)}
          onChange={e => {
            const raw = String(e.target.value);
            onChange(raw === '' ? undefined : type === 'Boolean' ? raw === 'true' : raw);
          }}
        >
          <MenuItem value=''>
            <em>yok</em>
          </MenuItem>
          {options.map(o => (
            <MenuItem key={o} value={o}>
              {o}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    );
  }
  return (
    <TextField
      label='Default'
      size='small'
      type={type === 'Number' ? 'number' : 'text'}
      value={value === undefined || value === null ? '' : String(value)}
      onChange={e => {
        const raw = e.target.value;
        if (raw === '') return onChange(undefined);
        if (type === 'Number') {
          const n = Number(raw);
          return onChange(Number.isFinite(n) ? n : undefined);
        }
        onChange(raw);
      }}
      sx={{ width: 140 }}
    />
  );
}

function getObjectFieldValue(item: Record<string, unknown>, fieldName: string, subName: string): string {
  const raw = item[fieldName];
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const v = (raw as Record<string, unknown>)[subName];
    return v != null ? String(v) : '';
  }
  return '';
}

function setObjectFieldValue(
  item: Record<string, unknown>,
  fieldName: string,
  subName: string,
  value: string
): Record<string, unknown> {
  const current = item[fieldName];
  const obj =
    current && typeof current === 'object' && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {};
  obj[subName] = value;
  return { ...item, [fieldName]: obj };
}

/** Sub-fields the editor shows; undefined for an object whose sub-fields the file does not declare. */
const subFieldsOf = (field: NormalizedField): NormalizedObjectSubField[] | undefined =>
  field.kind === 'object' ? field.object?.fields : undefined;

const AddModelModal: React.FC<AddModelModalProps> = ({
  open,
  onClose,
  onSave,
  sourceType,
  initialData,
  isEditMode = false
}) => {
  const [modelName, setModelName] = useState('');
  const [fields, setFields] = useState<NormalizedField[]>(DEFAULT_FIELDS);
  const [hasInitializeFunction, setHasInitializeFunction] = useState(false);
  const [initializeData, setInitializeData] = useState<Array<Record<string, unknown>>>([{}]);
  const [timestamps, setTimestamps] = useState({ createdAt: false, updatedAt: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Fields as loaded: an untouched field is saved exactly as parsed. */
  const loadedFields = useRef(new Set<NormalizedField>());

  const isMongoose = sourceType === 'nodejs-mongoose';
  // .NET host (D5): no seed function; timestamps always come from `AuditableEntity`.
  const isDotnet = sourceType === 'dotnet-ef';

  useEffect(() => {
    if (open && initialData) {
      const loaded = initialData.model.fields.length > 0 ? initialData.model.fields : DEFAULT_FIELDS;
      loadedFields.current = new Set(loaded);
      setModelName(initialData.model.entityName);
      setFields(loaded);
      setHasInitializeFunction(Boolean(initialData.seed));
      setInitializeData(initialData.seed?.data && initialData.seed.data.length > 0 ? initialData.seed.data : [{}]);
      setTimestamps({
        createdAt: initialData.model.timestamps?.createdAt ?? false,
        updatedAt: initialData.model.timestamps?.updatedAt ?? false
      });
    } else if (open && !initialData) {
      loadedFields.current = new Set();
      setModelName('');
      setFields(DEFAULT_FIELDS);
      setHasInitializeFunction(false);
      setInitializeData([{}]);
      setTimestamps({ createdAt: false, updatedAt: false });
    }
  }, [open, initialData]);

  const handleAddField = () => {
    setFields([...fields, newField()]);
  };

  const handleRemoveField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  const updateField = (index: number, update: (field: NormalizedField) => NormalizedField) => {
    setFields(fields.map((f, i) => (i === index ? update(f) : f)));
  };

  const handleTypeChange = (index: number, type: Exclude<EditorFieldType, 'Other'>) => {
    updateField(index, f => (editorTypeOf(f) === type ? f : withEditorType(f, type)));
  };

  const updateObject = (index: number, patch: Partial<NonNullable<NormalizedField['object']>>) => {
    updateField(index, f => ({ ...f, object: { ...f.object, ...patch } }));
  };

  const handleAddObjectSubField = (fieldIndex: number) => {
    updateField(fieldIndex, f => ({ ...f, object: { ...f.object, fields: [...(f.object?.fields ?? []), newObjectSubField()] } }));
  };

  const handleRemoveObjectSubField = (fieldIndex: number, subIndex: number) => {
    updateField(fieldIndex, f => ({ ...f, object: { ...f.object, fields: (f.object?.fields ?? []).filter((_, i) => i !== subIndex) } }));
  };

  const updateSubField = (fieldIndex: number, subIndex: number, update: (sub: NormalizedObjectSubField) => NormalizedObjectSubField) => {
    updateField(fieldIndex, f => ({
      ...f,
      object: { ...f.object, fields: (f.object?.fields ?? []).map((s, i) => (i === subIndex ? update(s) : s)) }
    }));
  };

  const handleAddInitializeData = () => {
    setInitializeData([...initializeData, {}]);
  };

  const handleRemoveInitializeData = (index: number) => {
    setInitializeData(initializeData.filter((_, i) => i !== index));
  };

  const handleInitializeScalarChange = (itemIndex: number, fieldName: string, value: string) => {
    const newData = [...initializeData];
    if (!newData[itemIndex]) newData[itemIndex] = {};
    newData[itemIndex] = { ...newData[itemIndex], [fieldName]: value };
    setInitializeData(newData);
  };

  const handleInitializeObjectSubChange = (itemIndex: number, fieldName: string, subName: string, value: string) => {
    const newData = [...initializeData];
    if (!newData[itemIndex]) newData[itemIndex] = {};
    newData[itemIndex] = setObjectFieldValue(newData[itemIndex], fieldName, subName, value);
    setInitializeData(newData);
  };

  const validateFields = (): string | null => {
    for (const field of fields) {
      if (!field.name.trim()) return 'All fields must have a name';
      if (isReservedFieldName(field.name)) {
        return `"${field.name.trim()}" alan adı ayrılmıştır: kayıt kimliği JSON'da her zaman \`id\` (sözleşme K1).`;
      }
      const enumValues = field.enum?.values;
      if (enumValues?.length && field.default != null && !enumValues.includes(String(field.default))) {
        return `"${field.name}" varsayılanı enum değerlerinden biri olmalı.`;
      }

      const subs = subFieldsOf(field);
      if (subs) {
        if (subs.length === 0) return `Object field "${field.name}" must have at least one sub-field`;
        const names = new Set<string>();
        for (const sub of subs) {
          if (!sub.name.trim()) return `All sub-fields of "${field.name}" must have a name`;
          if (names.has(sub.name.trim())) return `Duplicate sub-field "${sub.name}" in "${field.name}"`;
          names.add(sub.name.trim());
        }
      }
    }
    return null;
  };

  const validateInitializeData = (): string | null => {
    if (!hasInitializeFunction) return null;

    for (const item of initializeData) {
      for (const field of fields) {
        if (!field.required) continue;

        const subs = subFieldsOf(field);
        if (subs) {
          for (const sub of subs) {
            if (!sub.required) continue;
            const val = getObjectFieldValue(item, field.name, sub.name);
            if (!val.trim()) {
              return `Required sub-field "${field.name}.${sub.name}" must have a value in all initialize data items`;
            }
          }
          continue;
        }

        const raw = item[field.name];
        if (editorTypeOf(field) === 'Boolean') {
          if (raw === undefined || raw === null || raw === '') {
            return `Required field "${field.name}" must have a value in all initialize data items`;
          }
          continue;
        }

        if (raw == null || String(raw).trim() === '') {
          return `Required field "${field.name}" must have a value in all initialize data items`;
        }
      }
    }

    return null;
  };

  const handleSave = async () => {
    setError(null);

    if (!modelName.trim()) {
      setError('Model name is required');
      return;
    }

    if (fields.length === 0) {
      setError('At least one field is required');
      return;
    }

    const fieldError = validateFields();
    if (fieldError) {
      setError(fieldError);
      return;
    }

    const initError = validateInitializeData();
    if (initError) {
      setError(initError);
      return;
    }

    setLoading(true);
    try {
      let resolvedInitializeData: Array<Record<string, unknown>> | undefined;
      if (hasInitializeFunction) {
        const processed = initializeData
          .map(item => {
            const completeItem: Record<string, unknown> = {};
            fields.forEach(field => {
              const subs = subFieldsOf(field);
              if (subs) {
                const existing = item[field.name];
                const obj =
                  existing && typeof existing === 'object' && !Array.isArray(existing)
                    ? { ...(existing as Record<string, unknown>) }
                    : {};
                for (const sub of subs) {
                  obj[sub.name] = obj[sub.name] != null ? String(obj[sub.name]) : '';
                }
                completeItem[field.name] = obj;
              } else {
                completeItem[field.name] =
                  item[field.name] !== undefined && item[field.name] !== null ? item[field.name] : '';
              }
            });
            return completeItem;
          })
          .filter(item =>
            fields.some(field => {
              if (subFieldsOf(field)) {
                const obj = item[field.name];
                if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
                return Object.values(obj as Record<string, unknown>).some(v => String(v ?? '').trim() !== '');
              }
              const value = item[field.name];
              const type = editorTypeOf(field);
              if (type === 'Boolean') return value !== undefined && value !== null && value !== '';
              if (type === 'Number') {
                return value !== undefined && value !== null && value !== '' && !Number.isNaN(Number(value));
              }
              return value != null && String(value).trim() !== '';
            })
          );

        if (processed.length > 0) {
          resolvedInitializeData = processed;
        } else if (isEditMode && initialData?.seed?.data?.length) {
          resolvedInitializeData = initialData.seed.data;
        }
      }

      const base = initialData?.model;
      const model: NormalizedModel = {
        ...(base ?? { schemaVersion: 2 as const }),
        entityName: modelName.trim(),
        fields: fields.map(f => (loadedFields.current.has(f) ? f : normalizeEditedField(f)))
      };
      if (isMongoose && (base?.timestamps || timestamps.createdAt || timestamps.updatedAt)) model.timestamps = { ...timestamps };

      await onSave({
        model,
        seed: isMongoose && hasInitializeFunction ? { data: resolvedInitializeData } : undefined
      });
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create model');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setModelName('');
    setFields(DEFAULT_FIELDS);
    setHasInitializeFunction(false);
    setInitializeData([{}]);
    setTimestamps({ createdAt: false, updatedAt: false });
    setError(null);
    onClose();
  };

  if (!isMongoose && !isDotnet) {
    return (
      <Dialog open={open} onClose={handleClose} maxWidth='md' fullWidth>
        <DialogTitle>Add Model</DialogTitle>
        <DialogContent>
          <Alert severity='info' sx={{ mt: 2 }}>
            Model creation is supported for Node.js (Mongoose) and .NET (EF Core) projects.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Close</Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth='md' fullWidth>
      <DialogTitle>{isEditMode ? 'Edit Model' : 'Add New Model'}</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {error && (
            <Alert severity='error' onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <TextField
            label='Model Name'
            value={modelName}
            onChange={e => setModelName(e.target.value)}
            fullWidth
            required
            placeholder='e.g., SymbolTypes'
            helperText='Model name (will be used for interface and schema names)'
            disabled={isEditMode}
          />

          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant='h6'>Fields</Typography>
              <Button variant='outlined' size='small' startIcon={<AddIcon />} onClick={handleAddField}>
                Add Field
              </Button>
            </Box>

            {fields.map((field, index) => {
              const type = editorTypeOf(field);
              const subs = subFieldsOf(field);
              return (
              <Box key={field.name || `field-${index}`} sx={{ mb: 2, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant='subtitle2'>Field {index + 1}</Typography>
                  <IconButton size='small' color='error' onClick={() => handleRemoveField(index)} disabled={fields.length === 1}>
                    <DeleteIcon />
                  </IconButton>
                </Box>

                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  <TextField
                    label='Field Name'
                    value={field.name}
                    onChange={e => updateField(index, f => ({ ...f, name: e.target.value }))}
                    size='small'
                    sx={{ flex: 1, minWidth: 150 }}
                    required
                  />

                  <FormControl size='small' sx={{ minWidth: 150 }}>
                    <InputLabel>Type</InputLabel>
                    <Select
                      value={type}
                      label='Type'
                      onChange={e => {
                        const next = e.target.value as EditorFieldType;
                        if (next !== 'Other') handleTypeChange(index, next);
                      }}
                    >
                      {EDITOR_FIELD_TYPES.map(t => (
                        <MenuItem key={t} value={t}>
                          {t}
                        </MenuItem>
                      ))}
                      {type === 'Other' && (
                        <MenuItem value='Other' disabled>
                          {typeTokenOf(field) || field.kind} (dosyadan)
                        </MenuItem>
                      )}
                    </Select>
                  </FormControl>

                  <FormControlLabel
                    control={<Checkbox checked={field.required} onChange={e => updateField(index, f => ({ ...f, required: e.target.checked }))} />}
                    label='Required'
                  />

                  {type === 'Object' && (
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={field.isArray === true}
                          onChange={e => updateField(index, f => ({ ...f, isArray: e.target.checked }))}
                        />
                      }
                      label='Array of objects'
                    />
                  )}

                  {type !== 'Object' && (
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={field.unique === true}
                          onChange={e => updateField(index, f => ({ ...f, unique: e.target.checked }))}
                          disabled={!field.required}
                        />
                      }
                      label='Unique'
                    />
                  )}

                  {type === 'String' && (
                    <FormControlLabel
                      control={<Checkbox checked={field.trim === true} onChange={e => updateField(index, f => ({ ...f, trim: e.target.checked }))} />}
                      label='Trim'
                    />
                  )}

                  {type === 'String' && (
                    <Autocomplete
                      multiple
                      freeSolo
                      size='small'
                      options={[]}
                      value={field.enum?.values ?? []}
                      onChange={(_, values) => {
                        const enumValues = [...new Set(values.map(v => String(v).trim()).filter(Boolean))];
                        updateField(index, f => withEnumValues(f, enumValues.length ? enumValues : undefined));
                      }}
                      renderTags={(values, getTagProps) =>
                        values.map((v, i) => <Chip size='small' label={v} {...getTagProps({ index: i })} key={v} />)
                      }
                      renderInput={params => (
                        <TextField {...params} label='Enum values' placeholder='değer + Enter' helperText='Boş = serbest metin' />
                      )}
                      sx={{ minWidth: 260, flex: 1 }}
                    />
                  )}

                  {editorShowsNumberFormat(sourceType) && field.kind === 'number' && !field.isArray && (
                    <FormControl size='small' sx={{ minWidth: 150 }}>
                      <InputLabel>Number format</InputLabel>
                      <Select
                        value={field.numberFormat === 'int' ? 'int' : 'float'}
                        label='Number format'
                        onChange={e =>
                          updateField(index, f => {
                            const out = { ...f };
                            if (e.target.value === 'int') out.numberFormat = 'int';
                            else delete out.numberFormat;
                            return out;
                          })
                        }
                      >
                        <MenuItem value='float'>float</MenuItem>
                        <MenuItem value='int'>int</MenuItem>
                      </Select>
                    </FormControl>
                  )}

                  {type === 'Date' && field.kind === 'date' && (
                    <FormControl size='small' sx={{ minWidth: 160 }}>
                      <InputLabel>Date format</InputLabel>
                      <Select
                        value={field.dateFormat === 'date' ? 'date' : 'datetime'}
                        label='Date format'
                        onChange={e =>
                          updateField(index, f => {
                            const out = { ...f };
                            if (e.target.value === 'date') out.dateFormat = 'date';
                            else delete out.dateFormat;
                            return out;
                          })
                        }
                      >
                        <MenuItem value='datetime'>Date + time</MenuItem>
                        <MenuItem value='date'>Date only</MenuItem>
                      </Select>
                    </FormControl>
                  )}

                  {type === 'String' && !field.enum?.values?.length && (
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={field.format === 'email'}
                          onChange={e =>
                            updateField(index, f => {
                              const out = { ...f };
                              if (e.target.checked) out.format = 'email';
                              else delete out.format;
                              return out;
                            })
                          }
                        />
                      }
                      label='Email'
                    />
                  )}

                  {(field.enum?.values?.length ?? 0) > 0 && (
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={Boolean(field.enum?.numbers)}
                          onChange={e => updateField(index, f => withEnumNumbers(f, e.target.checked ? [] : undefined))}
                        />
                      }
                      label='Numeric enum'
                    />
                  )}

                  {field.enum?.numbers && (
                    <TextField
                      // Committed on blur: a half-typed list ("1,") must not be parsed while typing.
                      key={field.enum.numbers.join(',')}
                      size='small'
                      label='Numbers (one per value, in order)'
                      defaultValue={field.enum.numbers.join(', ')}
                      helperText={field.enum.values.map((v, i) => `${v} = ${field.enum?.numbers?.[i]}`).join(', ')}
                      onBlur={e => {
                        const numbers = e.target.value
                          .split(',')
                          .map(part => part.trim())
                          .filter(Boolean)
                          .map(Number);
                        if (numbers.every(Number.isInteger) && new Set(numbers).size === numbers.length) {
                          updateField(index, f => withEnumNumbers(f, numbers));
                        }
                      }}
                    />
                  )}

                  {type === 'String' && !field.enum?.values?.length && (
                    <>
                      <TextField
                        label='Min length'
                        size='small'
                        type='number'
                        value={field.constraints?.minLength ?? ''}
                        onChange={e => updateField(index, f => withConstraint(f, 'minLength', e.target.value))}
                        sx={{ width: 120 }}
                      />
                      <TextField
                        label='Max length'
                        size='small'
                        type='number'
                        value={field.constraints?.maxLength ?? ''}
                        onChange={e => updateField(index, f => withConstraint(f, 'maxLength', e.target.value))}
                        sx={{ width: 120 }}
                      />
                      <TextField
                        label='Pattern'
                        size='small'
                        value={field.constraints?.pattern ?? ''}
                        onChange={e => updateField(index, f => withPattern(f, e.target.value))}
                        sx={{ minWidth: 180, flex: 1 }}
                      />
                    </>
                  )}

                  {(field.kind === 'number' || field.kind === 'decimal') && !field.isArray && (
                    <>
                      <TextField
                        label='Min'
                        size='small'
                        type='number'
                        value={field.constraints?.min ?? ''}
                        onChange={e => updateField(index, f => withConstraint(f, 'min', e.target.value))}
                        sx={{ width: 110 }}
                      />
                      <TextField
                        label='Max'
                        size='small'
                        type='number'
                        value={field.constraints?.max ?? ''}
                        onChange={e => updateField(index, f => withConstraint(f, 'max', e.target.value))}
                        sx={{ width: 110 }}
                      />
                    </>
                  )}

                  {editorTypeHasDefault(type) && (
                    <SchemaDefaultInput
                      field={field}
                      onChange={value =>
                        updateField(index, f => {
                          const out = { ...f };
                          if (value === undefined) delete out.default;
                          else out.default = value;
                          return out;
                        })
                      }
                    />
                  )}

                  {type === 'ObjectId' && (
                    <TextField
                      label='Ref'
                      value={referenceTargetOf(field)}
                      onChange={e => updateField(index, f => withReferenceTarget(f, e.target.value || undefined))}
                      size='small'
                      placeholder='e.g., User'
                      sx={{ minWidth: 150 }}
                      helperText='Mongoose ref name'
                    />
                  )}
                </Box>

                {type === 'Object' && (
                  <Box sx={{ mt: 2, pl: 1, borderLeft: '3px solid', borderColor: 'primary.light' }}>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
                      <TextField
                        label='Nested interface name'
                        value={field.object?.typeName || ''}
                        onChange={e => updateObject(index, { typeName: e.target.value || undefined })}
                        size='small'
                        sx={{ minWidth: 180 }}
                        placeholder='e.g., ISubscriptionLimits'
                        helperText='Optional — empty keeps inline object'
                      />
                      <TextField
                        label='Nested schema name'
                        value={field.object?.schemaName || ''}
                        onChange={e => updateObject(index, { schemaName: e.target.value || undefined })}
                        size='small'
                        sx={{ minWidth: 200 }}
                        placeholder='e.g., SubscriptionLimitsSchema'
                        helperText='Optional — pairs with interface name'
                      />
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant='subtitle2' color='text.secondary'>
                        Object fields
                      </Typography>
                      <Button variant='text' size='small' startIcon={<AddIcon />} onClick={() => handleAddObjectSubField(index)}>
                        Add sub-field
                      </Button>
                    </Box>

                    {!subs && (
                      <Typography variant='caption' color='text.secondary'>
                        Alt alanlar dosyada tanımlı değil (serbest nesne); eklenmedikçe olduğu gibi kalır.
                      </Typography>
                    )}

                    {(subs ?? []).map((sub, subIndex) => {
                      const subType = editorSubTypeOf(sub);
                      return (
                      <Box key={subIndex} sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1, alignItems: 'center' }}>
                        <TextField
                          label='Sub-field name'
                          value={sub.name}
                          onChange={e => updateSubField(index, subIndex, s => ({ ...s, name: e.target.value }))}
                          size='small'
                          sx={{ minWidth: 140 }}
                          placeholder='e.g., tr'
                        />
                        <FormControl size='small' sx={{ minWidth: 120 }}>
                          <InputLabel>Type</InputLabel>
                          <Select
                            value={subType}
                            label='Type'
                            onChange={e => {
                              const next = e.target.value as EditorSubFieldType;
                              updateSubField(index, subIndex, s => (editorSubTypeOf(s) === next ? s : withEditorSubType(s, next)));
                            }}
                          >
                            {EDITOR_SUB_FIELD_TYPES.map(t => (
                              <MenuItem key={t} value={t}>
                                {t}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={sub.required}
                              onChange={e => updateSubField(index, subIndex, s => ({ ...s, required: e.target.checked }))}
                            />
                          }
                          label='Required'
                        />
                        {subType === 'ObjectId' && (
                          <TextField
                            label='Ref'
                            value={subReferenceOf(sub)}
                            onChange={e => updateSubField(index, subIndex, s => withSubReference(s, e.target.value || undefined))}
                            size='small'
                            placeholder='e.g., SymbolTypes'
                            sx={{ minWidth: 140 }}
                          />
                        )}
                        {subType === 'String' && (
                          <FormControlLabel
                            control={
                              <Checkbox
                                checked={sub.trim === true}
                                onChange={e => updateSubField(index, subIndex, s => ({ ...s, trim: e.target.checked }))}
                              />
                            }
                            label='Trim'
                          />
                        )}
                        {subType === 'Number' && (
                          <FormControlLabel
                            control={
                              <Checkbox
                                checked={Boolean(sub.nullable)}
                                onChange={e => updateSubField(index, subIndex, s => ({ ...s, nullable: e.target.checked }))}
                              />
                            }
                            label='Nullable (null = unlimited)'
                          />
                        )}
                        <IconButton
                          size='small'
                          color='error'
                          onClick={() => handleRemoveObjectSubField(index, subIndex)}
                          disabled={(subs?.length ?? 0) <= 1}
                        >
                          <DeleteIcon fontSize='small' />
                        </IconButton>
                      </Box>
                      );
                    })}
                  </Box>
                )}
              </Box>
              );
            })}
          </Box>

          <Divider />

          {isDotnet ? (
            <Alert severity='info'>
              .NET: <code>id</code>, <code>createdAt</code> ve <code>updatedAt</code> her entity'de vardır (AuditableEntity). Kaydedince modül
              dosyaları üretilir; şema değiştiyse migration eklemeyi unutmayın.
            </Alert>
          ) : (
            <>
          <Box>
            <Typography variant='h6' gutterBottom sx={{ mb: 2 }}>
              Timestamps
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <FormControlLabel
                control={<Switch checked={timestamps.createdAt} onChange={e => setTimestamps({ ...timestamps, createdAt: e.target.checked })} />}
                label='Created At'
              />
              <FormControlLabel
                control={<Switch checked={timestamps.updatedAt} onChange={e => setTimestamps({ ...timestamps, updatedAt: e.target.checked })} />}
                label='Updated At'
              />
            </Box>
          </Box>

          <Divider />

          <Box>
            <FormControlLabel
              control={<Checkbox checked={hasInitializeFunction} onChange={e => setHasInitializeFunction(e.target.checked)} />}
              label='Add Initialize Function'
            />

            {hasInitializeFunction && (
              <Box sx={{ mt: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant='subtitle2'>Default Data</Typography>
                  <Button variant='outlined' size='small' startIcon={<AddIcon />} onClick={handleAddInitializeData}>
                    Add Item
                  </Button>
                </Box>

                {initializeData.map((item, itemIndex) => (
                  <Box key={itemIndex} sx={{ mb: 3, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Typography variant='subtitle2'>Data Item {itemIndex + 1}</Typography>
                      <IconButton
                        size='small'
                        color='error'
                        onClick={() => handleRemoveInitializeData(itemIndex)}
                        disabled={initializeData.length === 1}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {fields.map(field => {
                        const subs = subFieldsOf(field);
                        const type = editorTypeOf(field);
                        if (subs) {
                          return (
                            <Box key={field.name} sx={{ pl: 1, borderLeft: '2px solid', borderColor: 'divider' }}>
                              <Typography variant='caption' color='text.secondary' sx={{ mb: 1, display: 'block' }}>
                                {field.name}
                              </Typography>
                              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                {subs.map((sub, subIndex) => (
                                  <TextField
                                    key={sub.name || `sub-${subIndex}`}
                                    label={`${field.name}.${sub.name || '…'}`}
                                    value={getObjectFieldValue(item, field.name, sub.name)}
                                    onChange={e => handleInitializeObjectSubChange(itemIndex, field.name, sub.name, e.target.value)}
                                    size='small'
                                    fullWidth
                                    required={field.required && sub.required}
                                  />
                                ))}
                              </Box>
                            </Box>
                          );
                        }

                        if (type === 'Boolean') {
                          return (
                            <FormControlLabel
                              key={field.name}
                              control={
                                <Switch
                                  checked={item[field.name] === 'true' || item[field.name] === true}
                                  onChange={e =>
                                    handleInitializeScalarChange(itemIndex, field.name, e.target.checked ? 'true' : 'false')
                                  }
                                />
                              }
                              label={field.name}
                            />
                          );
                        }

                        return (
                          <TextField
                            key={field.name}
                            label={field.name}
                            value={item[field.name] != null ? String(item[field.name]) : ''}
                            onChange={e => handleInitializeScalarChange(itemIndex, field.name, e.target.value)}
                            size='small'
                            fullWidth
                            required={field.required}
                            type={type === 'Number' ? 'number' : 'text'}
                          />
                        );
                      })}
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
            </>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button onClick={handleSave} variant='contained' disabled={loading}>
          {loading ? (isEditMode ? 'Updating...' : 'Creating...') : isEditMode ? 'Update Model' : 'Create Model'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddModelModal;
