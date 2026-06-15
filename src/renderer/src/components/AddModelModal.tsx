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

export interface ModelField {
  name: string;
  type: 'String' | 'Number' | 'Boolean' | 'Date' | 'ObjectId' | 'Array';
  required: boolean;
  unique: boolean;
  trim: boolean;
  displayText?: string; // For ModelType fields
  ref?: string; // Mongoose ref (e.g., "User", "Symbol") - used in schema definition
}

export interface ModelData {
  modelName: string;
  fields: ModelField[];
  hasInitializeFunction: boolean;
  initializeData?: Array<Record<string, string>>;
  timestamps?: {
    createdAt?: boolean;
    updatedAt?: boolean;
  };
}

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

const AddModelModal: React.FC<AddModelModalProps> = ({
  open,
  onClose,
  onSave,
  projectPath,
  sourceType,
  initialData,
  isEditMode = false,
  modelFilePath
}) => {
  const [modelName, setModelName] = useState('');
  const [fields, setFields] = useState<ModelField[]>([
    { name: 'value', type: 'String', required: true, unique: true, trim: true },
    { name: 'displayText', type: 'String', required: true, trim: true }
  ]);
  const [hasInitializeFunction, setHasInitializeFunction] = useState(false);
  const [initializeData, setInitializeData] = useState<Array<Record<string, string>>>([{}]);
  const [timestamps, setTimestamps] = useState({ createdAt: false, updatedAt: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only support mongoose for now
  const isMongoose = sourceType === 'nodejs-mongoose';

  // Load initial data when modal opens or initialData changes
  useEffect(() => {
    if (open && initialData) {
      setModelName(initialData.modelName);
      setFields(
        initialData.fields.length > 0
          ? initialData.fields
          : [
              { name: 'value', type: 'String', required: true, unique: true, trim: true },
              { name: 'displayText', type: 'String', required: true, trim: true }
            ]
      );
      setHasInitializeFunction(initialData.hasInitializeFunction);
      setInitializeData(initialData.initializeData && initialData.initializeData.length > 0 ? initialData.initializeData : [{}]);
      setTimestamps(initialData.timestamps || { createdAt: false, updatedAt: false });
    } else if (open && !initialData) {
      // Reset to defaults when opening in add mode
      setModelName('');
      setFields([
        { name: 'value', type: 'String', required: true, unique: true, trim: true },
        { name: 'displayText', type: 'String', required: true, trim: true }
      ]);
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

  const handleFieldChange = (index: number, field: Partial<ModelField>) => {
    const newFields = [...fields];
    newFields[index] = { ...newFields[index], ...field };
    setFields(newFields);
  };

  const handleAddInitializeData = () => {
    const newItem: Record<string, string> = {};
    fields.forEach(field => {
      newItem[field.name] = '';
    });
    setInitializeData([...initializeData, newItem]);
  };

  const handleRemoveInitializeData = (index: number) => {
    setInitializeData(initializeData.filter((_, i) => i !== index));
  };

  const handleInitializeDataFieldChange = (itemIndex: number, fieldName: string, value: string) => {
    const newData = [...initializeData];
    if (!newData[itemIndex]) {
      newData[itemIndex] = {};
    }
    newData[itemIndex][fieldName] = value;
    setInitializeData(newData);
  };

  const handleSave = async () => {
    setError(null);

    // Validation
    if (!modelName.trim()) {
      setError('Model name is required');
      return;
    }

    if (fields.length === 0) {
      setError('At least one field is required');
      return;
    }

    for (const field of fields) {
      if (!field.name.trim()) {
        setError('All fields must have a name');
        return;
      }
    }

    if (hasInitializeFunction) {
      // Check if all required fields have values in at least one item
      const requiredFields = fields.filter(f => f.required);
      for (const item of initializeData) {
        for (const field of requiredFields) {
          if (!item[field.name] || !item[field.name].trim()) {
            setError(`Required field "${field.name}" must have a value in all initialize data items`);
            return;
          }
        }
      }
    }

    setLoading(true);
    try {
      let resolvedInitializeData: Array<Record<string, string>> | undefined;
      if (hasInitializeFunction) {
        const processed = initializeData
          .map(item => {
            const completeItem: Record<string, string> = {};
            fields.forEach(field => {
              completeItem[field.name] = item[field.name] !== undefined && item[field.name] !== null ? String(item[field.name]) : '';
            });
            return completeItem;
          })
          .filter(item =>
            fields.some(field => {
              const value = item[field.name];
              if (field.type === 'Boolean') {
                return value !== undefined && value !== null && value !== '';
              }
              if (field.type === 'Number') {
                return value !== undefined && value !== null && value !== '' && !isNaN(Number(value));
              }
              return value && typeof value === 'string' && value.trim() !== '';
            })
          );

        if (processed.length > 0) {
          resolvedInitializeData = processed;
        } else if (isEditMode && initialData?.initializeData?.length) {
          // Edit round-trip: keep disk seed data when user did not touch initialize section
          resolvedInitializeData = initialData.initializeData;
        }
      }

      await onSave({
        modelName: modelName.trim(),
        fields: fields.map(f => ({
          ...f,
          name: f.name.trim()
        })),
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
    setFields([
      { name: 'value', type: 'String', required: true, unique: true, trim: true },
      { name: 'displayText', type: 'String', required: true, trim: true }
    ]);
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
              <Box key={index} sx={{ mb: 2, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
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
                    <Select value={field.type} label='Type' onChange={e => handleFieldChange(index, { type: e.target.value as ModelField['type'] })}>
                      <MenuItem value='String'>String</MenuItem>
                      <MenuItem value='Number'>Number</MenuItem>
                      <MenuItem value='Boolean'>Boolean</MenuItem>
                      <MenuItem value='Date'>Date</MenuItem>
                      <MenuItem value='ObjectId'>ObjectId</MenuItem>
                      <MenuItem value='Array'>Array</MenuItem>
                    </Select>
                  </FormControl>

                  <FormControlLabel
                    control={<Checkbox checked={field.required} onChange={e => handleFieldChange(index, { required: e.target.checked })} />}
                    label='Required'
                  />

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
              </Box>
            ))}
          </Box>

          <Divider />

          {isMongoose && (
            <Box>
              <Typography variant='h6' gutterBottom sx={{ mb: 2 }}>
                Timestamps
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={timestamps.createdAt}
                      onChange={e => setTimestamps({ ...timestamps, createdAt: e.target.checked })}
                      color='primary'
                    />
                  }
                  label='Created At'
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={timestamps.updatedAt}
                      onChange={e => setTimestamps({ ...timestamps, updatedAt: e.target.checked })}
                      color='primary'
                    />
                  }
                  label='Updated At'
                />
              </Box>
              <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mt: 1 }}>
                Select which timestamp fields should be automatically managed by Mongoose
              </Typography>
            </Box>
          )}

          {isMongoose && <Divider />}

          <Box>
            <FormControlLabel
              control={<Checkbox checked={hasInitializeFunction} onChange={e => setHasInitializeFunction(e.target.checked)} />}
              label='Add Initialize Function'
            />
            <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mt: 1, mb: 2 }}>
              Creates an initialize function that populates default data if the collection is empty
            </Typography>

            {hasInitializeFunction && (
              <Box>
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
                        if (field.type === 'Boolean') {
                          return (
                            <FormControlLabel
                              key={field.name}
                              control={
                                <Switch
                                  checked={item[field.name] === 'true' || item[field.name] === true}
                                  onChange={e => handleInitializeDataFieldChange(itemIndex, field.name, e.target.checked ? 'true' : 'false')}
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
                            value={item[field.name] || ''}
                            onChange={e => handleInitializeDataFieldChange(itemIndex, field.name, e.target.value)}
                            size='small'
                            fullWidth
                            required={field.required}
                            type={field.type === 'Number' ? 'number' : 'text'}
                            helperText={field.required ? 'Required' : 'Optional'}
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
