import {
  Container,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Select,
  MenuItem,
  FormControl,
  Switch,
  Box,
  Chip,
  Button,
  Snackbar,
  Alert,
  CircularProgress,
  Checkbox,
  FormGroup,
  FormControlLabel
} from '@mui/material';
import { Save as SaveIcon, Code as CodeIcon, FolderOpen } from '@mui/icons-material';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { updateFieldConfig, saveSchemaConfig, generateFrontend, generateBackend, setFrontendPath } from '../features/project/projectSlice';
import { FieldConfig } from '../types/ProjectTypes';
import { UIComponent } from '../utils/schemaUtils';
import { useEffect, useState } from 'react';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';

const SchemaDesignPage = () => {
  const dispatch = useAppDispatch();
  const {
    selectedModelSchema,
    projectPath,
    frontendPath,
    sourceType,
    status,
    savingStatus,
    savingError,
    lastSavedFilePath,
    generatingFrontendStatus,
    generatingFrontendError,
    lastGeneratedFrontendFiles,
    generatingBackendStatus,
    generatingBackendError,
    lastGeneratedBackendFiles
  } = useAppSelector(state => state.project);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState({
    service: true,
    thunk: true,
    slice: true,
    page: true
  });
  const [selectedBackendFiles, setSelectedBackendFiles] = useState({
    route: true,
    responseModel: false
  });
  const [features, setFeatures] = useState({
    deletable: true,
    updatable: true
  });
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error'>('success');
  const [isProtectedRoute, setIsProtectedRoute] = useState(false);
  const [generationMode, setGenerationMode] = useState<'frontend' | 'backend' | 'fullstack'>('frontend');
  const [baseUrl, setBaseUrl] = useState<string>('');
  const [updateExistingFrontendFiles, setUpdateExistingFrontendFiles] = useState(false);
  const [updateExistingBackendFiles, setUpdateExistingBackendFiles] = useState(false);
  const [isSuperUser, setIsSuperUser] = useState(false);

  // Show snackbar when save status changes
  useEffect(() => {
    if (savingStatus === 'success') {
      const message = lastSavedFilePath ? `Saved to: ${lastSavedFilePath}` : 'Configuration saved successfully!';
      setSnackbarMessage(message);
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
    } else if (savingStatus === 'error') {
      setSnackbarMessage(savingError || 'Failed to save configuration');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  }, [savingStatus, savingError, lastSavedFilePath]);

  // Show snackbar when frontend generate status changes
  useEffect(() => {
    if (generatingFrontendStatus === 'success') {
      const files = lastGeneratedFrontendFiles;
      const fileList = files ? Object.values(files).filter(Boolean).join(', ') : '';
      const message = fileList ? `Frontend code generated: ${fileList}` : 'Frontend code generated successfully!';
      setSnackbarMessage(message);
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
    } else if (generatingFrontendStatus === 'error') {
      setSnackbarMessage(generatingFrontendError || 'Failed to generate frontend code');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  }, [generatingFrontendStatus, generatingFrontendError, lastGeneratedFrontendFiles]);

  // Show snackbar when backend generate status changes
  useEffect(() => {
    if (generatingBackendStatus === 'success') {
      const files = lastGeneratedBackendFiles;
      const fileList = files ? Object.values(files).filter(Boolean).join(', ') : '';
      const message = fileList ? `Backend code generated: ${fileList}` : 'Backend code generated successfully!';
      setSnackbarMessage(message);
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
    } else if (generatingBackendStatus === 'error') {
      setSnackbarMessage(generatingBackendError || 'Failed to generate backend code');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  }, [generatingBackendStatus, generatingBackendError, lastGeneratedBackendFiles]);

  // Auto-save disabled - user must click Save button manually

  // Parse baseUrl from backend when projectPath changes, sourceType is set, or scan completes
  useEffect(() => {
    const parseBaseUrl = async () => {
      // Only parse if we have a backend project path and sourceType is set
      if (projectPath && sourceType) {
        if (sourceType === 'nodejs-mongoose' || sourceType === 'nodejs-typeorm') {
          try {
            console.log('🔍 SchemaDesignPage: Parsing baseUrl from backend path:', projectPath);
            if (window.electronAPI?.project?.parseBaseUrl) {
              const result = await window.electronAPI.project.parseBaseUrl(projectPath);
              if (result.success && result.baseUrl) {
                console.log('✅ SchemaDesignPage: Parsed baseUrl:', result.baseUrl);
                setBaseUrl(result.baseUrl);
              } else {
                console.log('⚠️ SchemaDesignPage: Failed to parse baseUrl, using default:', result.error);
                setBaseUrl('/api'); // Default fallback
              }
            }
          } catch (error) {
            console.error('❌ SchemaDesignPage: Error parsing baseUrl:', error);
            setBaseUrl('/api'); // Default fallback on error
          }
        } else if (sourceType === 'dotnet-ef') {
          // For .NET projects, default to /api
          console.log('🔍 SchemaDesignPage: .NET project detected, setting default baseUrl: /api');
          setBaseUrl('/api');
        }
      } else if (projectPath && !sourceType) {
        // Project path set but sourceType not yet selected - wait
        console.log('⏳ SchemaDesignPage: projectPath set but sourceType not selected yet');
      }
    };

    parseBaseUrl();
  }, [projectPath, sourceType, status]);

  if (!selectedModelSchema) {
    return (
      <Container maxWidth='lg' sx={{ py: 4 }}>
        <Paper sx={{ p: 3 }}>
          <Typography variant='body1' color='text.secondary'>
            No schema selected. Please select a model from the project selection page.
          </Typography>
        </Paper>
      </Container>
    );
  }

  const handleLabelChange = (fieldIndex: number, newLabel: string) => {
    dispatch(updateFieldConfig({ fieldIndex, updates: { label: newLabel } }));
  };

  const handleUIComponentChange = (fieldIndex: number, newComponent: UIComponent) => {
    dispatch(updateFieldConfig({ fieldIndex, updates: { uiComponent: newComponent } }));
  };

  const handleShowInTableChange = (fieldIndex: number, showInTable: boolean) => {
    dispatch(updateFieldConfig({ fieldIndex, updates: { showInTable } }));
  };

  const handleShowInFormChange = (fieldIndex: number, showInForm: boolean) => {
    dispatch(updateFieldConfig({ fieldIndex, updates: { showInForm } }));
  };

  const handleIsSearchableChange = (fieldIndex: number, isSearchable: boolean) => {
    dispatch(updateFieldConfig({ fieldIndex, updates: { isSearchable } }));
  };

  const handleIncludeRelationChange = (fieldIndex: number, includeRelation: boolean) => {
    const field = selectedModelSchema.fields[fieldIndex];
    // Auto-detect relation entity name from field name (e.g., userId -> User, symbolId -> Symbol)
    let relationEntityName = '';
    if (includeRelation && field.type === 'schema') {
      // Remove common suffixes like "Id", "Id", etc. and capitalize first letter
      const fieldName = field.name;
      if (fieldName.endsWith('Id')) {
        relationEntityName = fieldName.slice(0, -2);
      } else if (fieldName.endsWith('ID')) {
        relationEntityName = fieldName.slice(0, -2);
      } else {
        relationEntityName = fieldName;
      }
      // Capitalize first letter
      relationEntityName = relationEntityName.charAt(0).toUpperCase() + relationEntityName.slice(1);
    }
    dispatch(
      updateFieldConfig({
        fieldIndex,
        updates: {
          includeRelation,
          relationEntityName: includeRelation ? relationEntityName : undefined,
          relationProperty: includeRelation ? field.relationProperty || 'name' : undefined
        }
      })
    );
  };

  const handleRelationPropertyChange = (fieldIndex: number, relationProperty: string) => {
    dispatch(updateFieldConfig({ fieldIndex, updates: { relationProperty } }));
  };

  const handleSave = () => {
    if (selectedModelSchema && projectPath) {
      dispatch(saveSchemaConfig({ projectRoot: projectPath, schema: selectedModelSchema }));
    }
  };

  const handleGenerateCode = () => {
    if (selectedModelSchema && projectPath) {
      if (generationMode === 'frontend' || generationMode === 'fullstack') {
        // Check if frontend path is set
        if (!frontendPath) {
          setSnackbarMessage('Please select a frontend project path before generating code.');
          setSnackbarSeverity('error');
          setSnackbarOpen(true);
          return;
        }
        // Generate frontend code (service, thunk, slice, page, table component)
        dispatch(
          generateFrontend({
            schema: selectedModelSchema,
            projectPath: frontendPath,
            selectedFiles,
            backendPath: generationMode === 'fullstack' ? projectPath : undefined,
            features,
            baseUrl: baseUrl || undefined,
            sourceType,
            isProtectedRoute: generationMode === 'frontend' || generationMode === 'fullstack' ? isProtectedRoute : undefined,
            updateExistingFiles: updateExistingFrontendFiles,
            isSuperUser
          })
        );
      }

      if (generationMode === 'backend' || generationMode === 'fullstack') {
        // Generate backend code
        dispatch(
          generateBackend({
            schema: selectedModelSchema,
            projectPath,
            isProtectedRoute,
            sourceType,
            shouldAddRoute: selectedBackendFiles.route,
            shouldGenerateResponseModel: selectedBackendFiles.responseModel,
            baseUrl: baseUrl || undefined,
            updateExistingFiles: updateExistingBackendFiles,
            isSuperUser
          })
        );
      }
    }
  };

  const handleCloseSnackbar = () => {
    setSnackbarOpen(false);
  };

  const uiComponentOptions: UIComponent[] = ['TextField', 'TextArea', 'NumberField', 'Switch', 'Select', 'DatePicker', 'MultiSelect', 'ImageField'];

  return (
    <Container maxWidth='lg' sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant='h4' component='h1'>
          Schema Designer: {selectedModelSchema.entityName}
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant='contained'
            startIcon={savingStatus === 'saving' ? <CircularProgress size={20} color='inherit' /> : <SaveIcon />}
            onClick={handleSave}
            disabled={savingStatus === 'saving' || !projectPath}
            sx={{ minWidth: 150 }}
          >
            {savingStatus === 'saving' ? 'Saving...' : 'Save Configuration'}
          </Button>
          <Button
            variant='contained'
            color='secondary'
            startIcon={
              generatingFrontendStatus === 'generating' || generatingBackendStatus === 'generating' ? (
                <CircularProgress size={20} color='inherit' />
              ) : (
                <CodeIcon />
              )
            }
            onClick={handleGenerateCode}
            disabled={generatingFrontendStatus === 'generating' || generatingBackendStatus === 'generating' || !projectPath || !selectedModelSchema}
            sx={{ minWidth: 150 }}
          >
            {generatingFrontendStatus === 'generating' || generatingBackendStatus === 'generating' ? 'Generating...' : 'Generate Code'}
          </Button>
        </Box>
      </Box>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant='h6' gutterBottom sx={{ mb: 2 }}>
          Backend Settings
        </Typography>
        <Box sx={{ mb: 3 }}>
          <FormControlLabel
            control={<Switch checked={isProtectedRoute} onChange={e => setIsProtectedRoute(e.target.checked)} color='primary' />}
            label='Requires Authentication?'
          />
        </Box>
        <Box>
          <Typography variant='body2' gutterBottom sx={{ mb: 1 }}>
            Generation Mode:
          </Typography>
          <RadioGroup row value={generationMode} onChange={e => setGenerationMode(e.target.value as 'frontend' | 'backend' | 'fullstack')}>
            <FormControlLabel value='frontend' control={<Radio />} label='Frontend Only' />
            <FormControlLabel value='backend' control={<Radio />} label='Backend Only' />
            <FormControlLabel value='fullstack' control={<Radio />} label='Full Stack' />
          </RadioGroup>
        </Box>
        <Box sx={{ mt: 3 }}>
          <Typography variant='body2' gutterBottom sx={{ mb: 1 }}>
            Base API URL:
          </Typography>
          <TextField
            fullWidth
            value={baseUrl}
            onChange={e => setBaseUrl(e.target.value)}
            placeholder='/api/assety'
            helperText='Base URL for API calls (e.g., /api/assety). Auto-detected from backend project when available.'
            sx={{ mb: 3 }}
          />
        </Box>
        {(generationMode === 'frontend' || generationMode === 'fullstack') && (
          <Box sx={{ mt: 3 }}>
            <Typography variant='body2' gutterBottom sx={{ mb: 1 }}>
              Frontend Project Path:
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
              <TextField
                fullWidth
                value={frontendPath}
                InputProps={{
                  readOnly: true
                }}
                placeholder={frontendPath || 'No folder selected'}
                helperText='Select a folder containing your frontend project'
                sx={{
                  '& .MuiInputBase-root': {
                    height: '56px'
                  }
                }}
              />
              <Button
                variant='outlined'
                startIcon={<FolderOpen />}
                onClick={async () => {
                  try {
                    if (window.electronAPI?.dialog?.openDirectory) {
                      const result = await window.electronAPI.dialog.openDirectory();
                      if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
                        dispatch(setFrontendPath(result.filePaths[0]));
                      }
                    }
                  } catch (err) {
                    console.error('Error opening folder dialog:', err);
                  }
                }}
                sx={{ minWidth: 140, height: 56 }}
              >
                Browse Folder
              </Button>
            </Box>
          </Box>
        )}
        {(generationMode === 'backend' || generationMode === 'fullstack') && (
          <Box sx={{ mt: 3 }}>
            <FormControlLabel
              control={<Checkbox checked={updateExistingBackendFiles} onChange={e => setUpdateExistingBackendFiles(e.target.checked)} />}
              label='Varolan dosyaları güncelle'
              sx={{ mb: 2 }}
            />
            <FormControlLabel
              control={<Checkbox checked={isSuperUser} onChange={e => setIsSuperUser(e.target.checked)} />}
              label='isSuperUser'
              sx={{ mb: 2, ml: 2 }}
            />
            <Typography variant='body2' gutterBottom sx={{ mb: 1 }}>
              Select Files to Generate:
            </Typography>
            <FormGroup row>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={selectedBackendFiles.route}
                    onChange={e => setSelectedBackendFiles({ ...selectedBackendFiles, route: e.target.checked })}
                  />
                }
                label='Route'
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={selectedBackendFiles.responseModel}
                    onChange={e => setSelectedBackendFiles({ ...selectedBackendFiles, responseModel: e.target.checked })}
                  />
                }
                label='Response Model'
              />
            </FormGroup>
          </Box>
        )}
        {(generationMode === 'frontend' || generationMode === 'fullstack') && (
          <Box sx={{ mt: 3 }}>
            <FormControlLabel
              control={<Checkbox checked={updateExistingFrontendFiles} onChange={e => setUpdateExistingFrontendFiles(e.target.checked)} />}
              label='Varolan dosyaları güncelle'
              sx={{ mb: 2 }}
            />
            <FormControlLabel
              control={<Checkbox checked={isSuperUser} onChange={e => setIsSuperUser(e.target.checked)} />}
              label='isSuperUser'
              sx={{ mb: 2, ml: 2 }}
            />
            <Typography variant='body2' gutterBottom sx={{ mb: 1 }}>
              Select Files to Generate:
            </Typography>
            <FormGroup row>
              <FormControlLabel
                control={
                  <Checkbox checked={selectedFiles.service} onChange={e => setSelectedFiles({ ...selectedFiles, service: e.target.checked })} />
                }
                label='Service'
              />
              <FormControlLabel
                control={<Checkbox checked={selectedFiles.thunk} onChange={e => setSelectedFiles({ ...selectedFiles, thunk: e.target.checked })} />}
                label='Thunk'
              />
              <FormControlLabel
                control={<Checkbox checked={selectedFiles.slice} onChange={e => setSelectedFiles({ ...selectedFiles, slice: e.target.checked })} />}
                label='Slice'
              />
              <FormControlLabel
                control={<Checkbox checked={selectedFiles.page} onChange={e => setSelectedFiles({ ...selectedFiles, page: e.target.checked })} />}
                label='Page'
              />
            </FormGroup>
            <Typography variant='body2' gutterBottom sx={{ mb: 1, mt: 2 }}>
              Table Features:
            </Typography>
            <Typography variant='caption' color='text.secondary' sx={{ mb: 1, display: 'block' }}>
              These options control which action buttons appear in the table. Page will always be generated.
            </Typography>
            <FormGroup row>
              <FormControlLabel
                control={<Checkbox checked={features.deletable} onChange={e => setFeatures({ ...features, deletable: e.target.checked })} />}
                label='Enable Delete (shows delete button)'
              />
              <FormControlLabel
                control={<Checkbox checked={features.updatable} onChange={e => setFeatures({ ...features, updatable: e.target.checked })} />}
                label='Enable Update (shows edit button & "Add New")'
              />
            </FormGroup>
          </Box>
        )}
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant='h6' gutterBottom sx={{ mb: 2 }}>
          Field Configuration: {selectedModelSchema.entityName}
        </Typography>
        <TableContainer sx={{ maxWidth: '100%', overflowX: 'auto' }}>
          <Table sx={{ minWidth: 800 }}>
            <TableHead>
              <TableRow>
                <TableCell>
                  <strong>Field Name</strong>
                </TableCell>
                <TableCell>
                  <strong>DB Type</strong>
                </TableCell>
                <TableCell>
                  <strong>Label</strong>
                </TableCell>
                <TableCell>
                  <strong>UI Component</strong>
                </TableCell>
                <TableCell align='center'>
                  <strong>In Table</strong>
                </TableCell>
                <TableCell align='center'>
                  <strong>In Form</strong>
                </TableCell>
                <TableCell align='center'>
                  <strong>Searchable</strong>
                </TableCell>
                <TableCell>
                  <strong>Required</strong>
                </TableCell>
                <TableCell>
                  <strong>Array</strong>
                </TableCell>
                {selectedModelSchema.fields.some(f => f.type === 'schema') && (
                  <>
                    <TableCell align='center'>
                      <strong>Include Relation</strong>
                    </TableCell>
                    <TableCell>
                      <strong>Relation Property</strong>
                    </TableCell>
                  </>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {selectedModelSchema.fields.map((field: FieldConfig, index: number) => (
                <TableRow key={field.name} hover>
                  <TableCell>
                    <Typography variant='body2' fontWeight='medium'>
                      {field.name}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={field.type} size='small' color='primary' variant='outlined' />
                  </TableCell>
                  <TableCell sx={{ minWidth: 150 }}>
                    <TextField
                      value={field.label}
                      onChange={e => handleLabelChange(index, e.target.value)}
                      size='small'
                      fullWidth
                      variant='outlined'
                    />
                  </TableCell>
                  <TableCell sx={{ minWidth: 150 }}>
                    <FormControl fullWidth size='small'>
                      <Select value={field.uiComponent} onChange={e => handleUIComponentChange(index, e.target.value as UIComponent)}>
                        {uiComponentOptions.map(option => (
                          <MenuItem key={option} value={option}>
                            {option}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </TableCell>
                  <TableCell align='center'>
                    <Switch checked={field.showInTable} onChange={e => handleShowInTableChange(index, e.target.checked)} color='primary' />
                  </TableCell>
                  <TableCell align='center'>
                    <Switch checked={field.showInForm} onChange={e => handleShowInFormChange(index, e.target.checked)} color='primary' />
                  </TableCell>
                  <TableCell align='center'>
                    <Switch checked={field.isSearchable} onChange={e => handleIsSearchableChange(index, e.target.checked)} color='primary' />
                  </TableCell>
                  <TableCell>
                    {field.required ? <Chip label='Yes' color='success' size='small' /> : <Chip label='No' color='default' size='small' />}
                  </TableCell>
                  <TableCell>
                    {field.isArray ? <Chip label='Yes' color='primary' size='small' /> : <Chip label='No' color='default' size='small' />}
                  </TableCell>
                  {selectedModelSchema.fields.some(f => f.type === 'schema') && (
                    <>
                      <TableCell align='center'>
                        {field.type === 'schema' ? (
                          <Switch
                            checked={field.includeRelation || false}
                            onChange={e => handleIncludeRelationChange(index, e.target.checked)}
                            color='primary'
                          />
                        ) : (
                          <Typography variant='body2' color='text.secondary'>
                            -
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        {field.type === 'schema' && field.includeRelation ? (
                          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                            <TextField
                              value={field.relationProperty || 'name'}
                              onChange={e => handleRelationPropertyChange(index, e.target.value)}
                              size='small'
                              placeholder='e.g., name'
                              sx={{ minWidth: 120 }}
                              variant='outlined'
                            />
                            <Button
                              size='small'
                              variant='outlined'
                              onClick={() => {
                                // TODO: Open modal to select relation property from related entity fields
                                setSnackbarMessage('Relation property selection modal - coming soon');
                                setSnackbarSeverity('success');
                                setSnackbarOpen(true);
                              }}
                            >
                              Select
                            </Button>
                          </Box>
                        ) : (
                          <Typography variant='body2' color='text.secondary'>
                            -
                          </Typography>
                        )}
                      </TableCell>
                    </>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Nested Schemas */}
      {selectedModelSchema.nestedSchemas && selectedModelSchema.nestedSchemas.length > 0 && (
        <>
          {selectedModelSchema.nestedSchemas.map(nestedSchema => (
            <Paper key={nestedSchema.entityName} sx={{ p: 3, mt: 3 }}>
              <Typography variant='h6' gutterBottom sx={{ mb: 2 }}>
                Nested Schema: {nestedSchema.entityName}
              </Typography>
              <TableContainer sx={{ maxWidth: '100%', overflowX: 'auto' }}>
                <Table sx={{ minWidth: 600 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>
                        <strong>Field Name</strong>
                      </TableCell>
                      <TableCell>
                        <strong>DB Type</strong>
                      </TableCell>
                      <TableCell>
                        <strong>Required</strong>
                      </TableCell>
                      <TableCell>
                        <strong>Array</strong>
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {nestedSchema.fields.map(field => (
                      <TableRow key={field.name} hover>
                        <TableCell>
                          <Typography variant='body2' fontWeight='medium'>
                            {field.name}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip label={field.type} size='small' color='primary' variant='outlined' />
                        </TableCell>
                        <TableCell>
                          {field.required ? <Chip label='Yes' color='success' size='small' /> : <Chip label='No' color='default' size='small' />}
                        </TableCell>
                        <TableCell>
                          {field.isArray ? <Chip label='Yes' color='primary' size='small' /> : <Chip label='No' color='default' size='small' />}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          ))}
        </>
      )}

      <Snackbar open={snackbarOpen} autoHideDuration={4000} onClose={handleCloseSnackbar} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert onClose={handleCloseSnackbar} severity={snackbarSeverity} sx={{ width: '100%' }}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default SchemaDesignPage;
