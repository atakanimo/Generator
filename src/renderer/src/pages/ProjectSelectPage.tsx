import {
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Box,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Alert,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  Divider,
  Snackbar
} from '@mui/material';
import { FolderOpen, Add as AddIcon } from '@mui/icons-material';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { setProjectPath, setSourceType, scanProjectFiles, parseModelFile, createModel, SourceType } from '../features/project/projectSlice';
import SchemaDesignPage from './SchemaDesignPage';
import AddModelModal, { ModelData } from '../components/AddModelModal';
import { useState, useEffect } from 'react';

const ProjectSelectPage = () => {
  const dispatch = useAppDispatch();
  const {
    projectPath,
    sourceType,
    status,
    error,
    modelsFound,
    selectedModelSchema,
    parsingStatus,
    parsingError,
    creatingModelStatus,
    creatingModelError,
    lastCreatedModelPath
  } = useAppSelector(state => state.project);
  const [addModelModalOpen, setAddModelModalOpen] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error'>('success');

  const handleBrowseFolder = async () => {
    try {
      if (!window.electronAPI?.dialog?.openDirectory) {
        console.error('Dialog API is not available');
        return;
      }

      const result = await window.electronAPI.dialog.openDirectory();

      if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
        dispatch(setProjectPath(result.filePaths[0]));
      }
    } catch (err) {
      console.error('Error opening folder dialog:', err);
    }
  };

  const handleSourceTypeChange = (event: any) => {
    dispatch(setSourceType(event.target.value as SourceType));
  };

  const handleScanProject = () => {
    if (projectPath && sourceType) {
      dispatch(scanProjectFiles({ path: projectPath, type: sourceType }));
    }
  };

  const handleModelClick = (modelPath: string) => {
    if (projectPath) {
      dispatch(parseModelFile({ filePath: modelPath, projectRoot: projectPath }));
    }
  };

  const sourceTypeOptions = [
    { value: 'nodejs-mongoose', label: 'Node.js (Mongoose)' },
    { value: 'dotnet-ef', label: '.NET 8 (Entity Framework)' },
    { value: 'nodejs-typeorm', label: 'Node.js (TypeORM)' }
  ];

  const isScanDisabled = !projectPath || !sourceType || status === 'scanning';
  const isAddModelDisabled = status !== 'ready' || !projectPath || !sourceType;

  // Show snackbar when model creation status changes
  useEffect(() => {
    if (creatingModelStatus === 'success') {
      const message = lastCreatedModelPath ? `Model created successfully: ${lastCreatedModelPath}` : 'Model created successfully!';
      setSnackbarMessage(message);
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
      setAddModelModalOpen(false);
      // Refresh the models list by scanning again
      if (projectPath && sourceType) {
        dispatch(scanProjectFiles({ path: projectPath, type: sourceType }));
      }
    } else if (creatingModelStatus === 'error') {
      setSnackbarMessage(creatingModelError || 'Failed to create model');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  }, [creatingModelStatus, creatingModelError, lastCreatedModelPath, projectPath, sourceType, dispatch]);

  const handleAddModel = async (modelData: ModelData) => {
    if (projectPath && sourceType) {
      await dispatch(createModel({ projectPath, sourceType, modelData }));
    }
  };

  const handleCloseSnackbar = () => {
    setSnackbarOpen(false);
  };

  return (
    <Container maxWidth='md' sx={{ py: 4 }}>
      <Typography variant='h4' component='h1' gutterBottom sx={{ mb: 4 }}>
        Backend Project
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* Card 1: Project Location */}
        <Paper sx={{ p: 3 }}>
          <Typography variant='h6' gutterBottom sx={{ mb: 2 }}>
            Project Location
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
            <TextField
              label='Selected Folder Path'
              fullWidth
              value={projectPath}
              InputProps={{
                readOnly: true
              }}
              placeholder='No folder selected'
              helperText='Select a folder containing your backend project'
            />
            <Button variant='outlined' startIcon={<FolderOpen />} onClick={handleBrowseFolder} sx={{ minWidth: 140, height: 56 }}>
              Browse Folder
            </Button>
          </Box>
        </Paper>

        {/* Card 2: Technology Stack */}
        <Paper sx={{ p: 3 }}>
          <Typography variant='h6' gutterBottom sx={{ mb: 2 }}>
            Technology Stack
          </Typography>
          <FormControl fullWidth>
            <InputLabel id='source-type-label'>Which framework are you using?</InputLabel>
            <Select
              labelId='source-type-label'
              id='source-type-select'
              value={sourceType || ''}
              label='Which framework are you using?'
              onChange={handleSourceTypeChange}
            >
              {sourceTypeOptions.map(option => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {sourceType && (
            <Alert severity='info' sx={{ mt: 2 }}>
              <Typography variant='body2'>
                {sourceType === 'nodejs-mongoose' || sourceType === 'nodejs-typeorm' ? (
                  <>
                    <strong>Node.js:</strong> <code>src/models</code> klasörü taranır. Model dosyalarının isminde "model" kelimesi bulunmalıdır.
                  </>
                ) : sourceType === 'dotnet-ef' ? (
                  <>
                    <strong>.NET:</strong> <code>Entities</code> veya <code>Models</code> klasörü taranır. Entity Framework model dosyaları aranır.
                  </>
                ) : null}
              </Typography>
            </Alert>
          )}
        </Paper>

        {/* Error Alert */}
        {error && <Alert severity='error'>{error}</Alert>}

        {/* Action Area */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
          <Button
            variant='outlined'
            size='large'
            onClick={() => setAddModelModalOpen(true)}
            disabled={isAddModelDisabled}
            startIcon={<AddIcon />}
            sx={{ minWidth: 150 }}
          >
            Model Ekle
          </Button>
          <Button
            variant='contained'
            size='large'
            onClick={handleScanProject}
            disabled={isScanDisabled}
            startIcon={status === 'scanning' ? <CircularProgress size={20} color='inherit' /> : null}
            sx={{ minWidth: 200 }}
          >
            {status === 'scanning' ? 'Scanning...' : 'Scan Project Files'}
          </Button>
        </Box>

        {/* Found Models Section */}
        {status === 'ready' && modelsFound.length > 0 && (
          <Paper sx={{ p: 3 }}>
            <Typography variant='h6' gutterBottom sx={{ mb: 2 }}>
              Found Models ({modelsFound.length})
            </Typography>
            <List>
              {modelsFound.map((model, index) => (
                <Box key={model.path}>
                  <ListItem disablePadding>
                    <ListItemButton onClick={() => handleModelClick(model.path)}>
                      <ListItemText primary={model.fileName} secondary={model.path} />
                      {parsingStatus === 'parsing' && <CircularProgress size={20} sx={{ ml: 2 }} />}
                    </ListItemButton>
                  </ListItem>
                  {index < modelsFound.length - 1 && <Divider />}
                </Box>
              ))}
            </List>
          </Paper>
        )}

        {/* Parsing Error Alert */}
        {parsingError && <Alert severity='error'>{parsingError}</Alert>}

        {status === 'ready' && modelsFound.length === 0 && (
          <Paper sx={{ p: 3 }}>
            <Typography variant='body1' color='text.secondary'>
              No model files found. Please check your project structure.
            </Typography>
          </Paper>
        )}
      </Box>

      {/* Schema Designer - shown when schema is selected */}
      {selectedModelSchema && parsingStatus === 'success' && (
        <Box sx={{ mt: 4 }}>
          <SchemaDesignPage />
        </Box>
      )}

      {/* Add Model Modal */}
      <AddModelModal
        open={addModelModalOpen}
        onClose={() => setAddModelModalOpen(false)}
        onSave={handleAddModel}
        projectPath={projectPath}
        sourceType={sourceType}
      />

      {/* Snackbar for notifications */}
      <Snackbar open={snackbarOpen} autoHideDuration={4000} onClose={handleCloseSnackbar} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert onClose={handleCloseSnackbar} severity={snackbarSeverity} sx={{ width: '100%' }}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default ProjectSelectPage;
