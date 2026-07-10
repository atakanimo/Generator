import React, { useState, useEffect } from 'react';
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
  Switch
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import type { ModelData, ModelField, ModelObjectSubField } from '@shared/modelTypes';
import { normalizeModelFields } from '@shared/modelTypes';

export type { ModelData, ModelField, ModelObjectSubField } from '@shared/modelTypes';

interface AddModelModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (modelData: ModelData) => Promise<void>;
  projectPath: string;
  sourceType: 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm' | null;
  initialData?: ModelData | null;
  isEditMode?: boolean;
  modelFilePath?: string;
}

const DEFAULT_FIELDS: ModelField[] = [
  { name: 'value', type: 'String', required: true, unique: true, trim: true },
  { name: 'displayText', type: 'String', required: true, trim: true }
];

const defaultObjectSubField = (): ModelObjectSubField => ({
  name: '',
  type: 'String',
  required: false,
  trim: true
});

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

const AddModelModal: React.FC<AddModelModalProps> = ({
  open,
  onClose,
  onSave,
  sourceType,
  initialData,
  isEditMode = false
}) => {
  const [modelName, setModelName] = useState('');
  const [fields, setFields] = useState<ModelField[]>(DEFAULT_FIELDS);
  const [hasInitializeFunction, setHasInitializeFunction] = useState(false);
  const [initializeData, setInitializeData] = useState<Array<Record<string, unknown>>>([{}]);
  const [timestamps, setTimestamps] = useState({ createdAt: false, updatedAt: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMongoose = sourceType === 'nodejs-mongoose';

  useEffect(() => {
    if (open && initialData) {
      setModelName(initialData.modelName);
      setFields(normalizeModelFields(initialData.fields.length > 0 ? initialData.fields : DEFAULT_FIELDS));
      setHasInitializeFunction(initialData.hasInitializeFunction);
      setInitializeData(initialData.initializeData && initialData.initializeData.length > 0 ? initialData.initializeData : [{}]);
      setTimestamps(initialData.timestamps || { createdAt: false, updatedAt: false });
    } else if (open && !initialData) {
      setModelName('');
      setFields(DEFAULT_FIELDS);
      setHasInitializeFunction(false);
      setInitializeData([{}]);
      setTimestamps({ createdAt: false, updatedAt: false });
    }
  }, [open, initialData]);

  const handleAddField = () => {
    setFields([...fields, { name: '', type: 'String', required: false, unique: false, trim: false }]);
  };

  const handleRemoveField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  const handleFieldChange = (index: number, patch: Partial<ModelField>) => {
    const newFields = [...fields];
    const current = { ...newFields[index], ...patch };

    if (patch.type === 'Object') {
      current.unique = false;
      current.trim = false;
      if (!current.objectFields?.length) {
        current.objectFields = [defaultObjectSubField()];
      }
    } else if (patch.type && patch.type !== 'Object') {
      delete current.objectFields;
    }

    newFields[index] = current;
    setFields(newFields);
  };

  const handleAddObjectSubField = (fieldIndex: number) => {
    const newFields = [...fields];
    const field = { ...newFields[fieldIndex] };
    field.objectFields = [...(field.objectFields ?? []), defaultObjectSubField()];
    newFields[fieldIndex] = field;
    setFields(newFields);
  };

  const handleRemoveObjectSubField = (fieldIndex: number, subIndex: number) => {
    const newFields = [...fields];
    const field = { ...newFields[fieldIndex] };
    field.objectFields = (field.objectFields ?? []).filter((_, i) => i !== subIndex);
    newFields[fieldIndex] = field;
    setFields(newFields);
  };

  const handleObjectSubFieldChange = (fieldIndex: number, subIndex: number, patch: Partial<ModelObjectSubField>) => {
    const newFields = [...fields];
    const field = { ...newFields[fieldIndex] };
    const subs = [...(field.objectFields ?? [])];
    subs[subIndex] = { ...subs[subIndex], ...patch };
    field.objectFields = subs;
    newFields[fieldIndex] = field;
    setFields(newFields);
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

      if (field.type === 'Object') {
        const subs = field.objectFields ?? [];
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

        if (field.type === 'Object') {
          for (const sub of field.objectFields ?? []) {
            if (!sub.required) continue;
            const val = getObjectFieldValue(item, field.name, sub.name);
            if (!val.trim()) {
              return `Required sub-field "${field.name}.${sub.name}" must have a value in all initialize data items`;
            }
          }
          continue;
        }

        const raw = item[field.name];
        if (field.type === 'Boolean') {
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
              if (field.type === 'Object') {
                const existing = item[field.name];
                const obj =
                  existing && typeof existing === 'object' && !Array.isArray(existing)
                    ? { ...(existing as Record<string, unknown>) }
                    : {};
                for (const sub of field.objectFields ?? []) {
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
              if (field.type === 'Object') {
                const obj = item[field.name];
                if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
                return Object.values(obj as Record<string, unknown>).some(v => String(v ?? '').trim() !== '');
              }
              const value = item[field.name];
              if (field.type === 'Boolean') return value !== undefined && value !== null && value !== '';
              if (field.type === 'Number') {
                return value !== undefined && value !== null && value !== '' && !Number.isNaN(Number(value));
              }
              return value != null && String(value).trim() !== '';
            })
          );

        if (processed.length > 0) {
          resolvedInitializeData = processed;
        } else if (isEditMode && initialData?.initializeData?.length) {
          resolvedInitializeData = initialData.initializeData;
        }
      }

      await onSave({
        modelName: modelName.trim(),
        fields: normalizeModelFields(
          fields.map(f => ({
            ...f,
            name: f.name.trim(),
            objectFields: f.type === 'Object' ? f.objectFields?.map(s => ({ ...s, name: s.name.trim() })) : undefined
          }))
        ),
        hasInitializeFunction,
        timestamps: isMongoose ? timestamps : undefined,
        initializeData: resolvedInitializeData
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

  if (!isMongoose) {
    return (
      <Dialog open={open} onClose={handleClose} maxWidth='md' fullWidth>
        <DialogTitle>Add Model</DialogTitle>
        <DialogContent>
          <Alert severity='info' sx={{ mt: 2 }}>
            Model creation is currently only supported for Node.js (Mongoose) projects.
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

            {fields.map((field, index) => (
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
                    onChange={e => handleFieldChange(index, { name: e.target.value })}
                    size='small'
                    sx={{ flex: 1, minWidth: 150 }}
                    required
                  />

                  <FormControl size='small' sx={{ minWidth: 150 }}>
                    <InputLabel>Type</InputLabel>
                    <Select
                      value={field.type}
                      label='Type'
                      onChange={e => handleFieldChange(index, { type: e.target.value as ModelField['type'] })}
                    >
                      <MenuItem value='String'>String</MenuItem>
                      <MenuItem value='Number'>Number</MenuItem>
                      <MenuItem value='Boolean'>Boolean</MenuItem>
                      <MenuItem value='Date'>Date</MenuItem>
                      <MenuItem value='ObjectId'>ObjectId</MenuItem>
                      <MenuItem value='Array'>Array</MenuItem>
                      <MenuItem value='Object'>Object</MenuItem>
                    </Select>
                  </FormControl>

                  <FormControlLabel
                    control={<Checkbox checked={field.required} onChange={e => handleFieldChange(index, { required: e.target.checked })} />}
                    label='Required'
                  />

                  {field.type !== 'Object' && (
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={field.unique}
                          onChange={e => handleFieldChange(index, { unique: e.target.checked })}
                          disabled={!field.required}
                        />
                      }
                      label='Unique'
                    />
                  )}

                  {field.type === 'String' && (
                    <FormControlLabel
                      control={<Checkbox checked={field.trim} onChange={e => handleFieldChange(index, { trim: e.target.checked })} />}
                      label='Trim'
                    />
                  )}

                  {field.type === 'ObjectId' && (
                    <TextField
                      label='Ref'
                      value={field.ref || ''}
                      onChange={e => handleFieldChange(index, { ref: e.target.value || undefined })}
                      size='small'
                      placeholder='e.g., User'
                      sx={{ minWidth: 150 }}
                      helperText='Mongoose ref name'
                    />
                  )}
                </Box>

                {field.type === 'Object' && (
                  <Box sx={{ mt: 2, pl: 1, borderLeft: '3px solid', borderColor: 'primary.light' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant='subtitle2' color='text.secondary'>
                        Object fields
                      </Typography>
                      <Button variant='text' size='small' startIcon={<AddIcon />} onClick={() => handleAddObjectSubField(index)}>
                        Add sub-field
                      </Button>
                    </Box>

                    {(field.objectFields ?? []).map((sub, subIndex) => (
                      <Box key={subIndex} sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1, alignItems: 'center' }}>
                        <TextField
                          label='Sub-field name'
                          value={sub.name}
                          onChange={e => handleObjectSubFieldChange(index, subIndex, { name: e.target.value })}
                          size='small'
                          sx={{ minWidth: 140 }}
                          placeholder='e.g., tr'
                        />
                        <FormControl size='small' sx={{ minWidth: 120 }}>
                          <InputLabel>Type</InputLabel>
                          <Select
                            value={sub.type}
                            label='Type'
                            onChange={e =>
                              handleObjectSubFieldChange(index, subIndex, { type: e.target.value as ModelObjectSubField['type'] })
                            }
                          >
                            <MenuItem value='String'>String</MenuItem>
                            <MenuItem value='Number'>Number</MenuItem>
                            <MenuItem value='Boolean'>Boolean</MenuItem>
                          </Select>
                        </FormControl>
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={sub.required}
                              onChange={e => handleObjectSubFieldChange(index, subIndex, { required: e.target.checked })}
                            />
                          }
                          label='Required'
                        />
                        {sub.type === 'String' && (
                          <FormControlLabel
                            control={
                              <Checkbox checked={sub.trim} onChange={e => handleObjectSubFieldChange(index, subIndex, { trim: e.target.checked })} />
                            }
                            label='Trim'
                          />
                        )}
                        <IconButton
                          size='small'
                          color='error'
                          onClick={() => handleRemoveObjectSubField(index, subIndex)}
                          disabled={(field.objectFields?.length ?? 0) <= 1}
                        >
                          <DeleteIcon fontSize='small' />
                        </IconButton>
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            ))}
          </Box>

          <Divider />

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
                        if (field.type === 'Object') {
                          return (
                            <Box key={field.name} sx={{ pl: 1, borderLeft: '2px solid', borderColor: 'divider' }}>
                              <Typography variant='caption' color='text.secondary' sx={{ mb: 1, display: 'block' }}>
                                {field.name}
                              </Typography>
                              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                {(field.objectFields ?? []).map(sub => (
                                  <TextField
                                    key={sub.name || `sub-${sub.type}`}
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

                        if (field.type === 'Boolean') {
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
                            type={field.type === 'Number' ? 'number' : 'text'}
                          />
                        );
                      })}
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
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
