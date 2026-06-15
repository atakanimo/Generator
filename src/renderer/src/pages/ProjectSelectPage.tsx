import {
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Box,
  Alert,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  Divider,
  Snackbar
} from '@mui/material';
import { FolderOpen, Add as AddIcon, Edit as EditIcon } from '@mui/icons-material';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { setProjectPath, scanProjectFiles, parseModelFile, createModel, updateModel, parseModelToModelData } from '../features/project/projectSlice';
import { IconButton } from '@mui/material';
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
    lastCreatedModelPath,
    updatingModelStatus,
    updatingModelError,
    lastUpdatedModelPath
  } = useAppSelector(state => state.project);
  const [addModelModalOpen, setAddModelModalOpen] = useState(false);
  const [editModelData, setEditModelData] = useState<ModelData | null>(null);
  const [editModelFilePath, setEditModelFilePath] = useState<string | null>(null);
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
        const selectedPath = result.filePaths[0];
        dispatch(setProjectPath(selectedPath));
        dispatch(scanProjectFiles({ path: selectedPath }));
      }
    } catch (err) {
      console.error('Error opening folder dialog:', err);
    }
  };

  const handleScanProject = () => {
    if (projectPath) {
      dispatch(scanProjectFiles({ path: projectPath }));
    }
  };

  const handleModelClick = (modelPath: string) => {
    if (projectPath) {
      dispatch(parseModelFile({ filePath: modelPath, projectRoot: projectPath }));
    }
  };

  const isScanDisabled = !projectPath || status === 'scanning';
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
      if (projectPath) {
        dispatch(scanProjectFiles({ path: projectPath }));
      }
    } else if (creatingModelStatus === 'error') {
      setSnackbarMessage(creatingModelError || 'Failed to create model');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  }, [creatingModelStatus, creatingModelError, lastCreatedModelPath, projectPath, sourceType, dispatch]);

  // Show snackbar when model update status changes
  useEffect(() => {
    if (updatingModelStatus === 'success') {
      const message = lastUpdatedModelPath ? `Model updated successfully: ${lastUpdatedModelPath}` : 'Model updated successfully!';
      setSnackbarMessage(message);
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
      setAddModelModalOpen(false);
      setEditModelData(null);
      setEditModelFilePath(null);
      if (projectPath) {
        dispatch(scanProjectFiles({ path: projectPath }));
      }
    } else if (updatingModelStatus === 'error') {
      setSnackbarMessage(updatingModelError || 'Failed to update model');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  }, [updatingModelStatus, updatingModelError, lastUpdatedModelPath, projectPath, sourceType, dispatch]);

  const handleAddModel = async (modelData: ModelData) => {
    if (projectPath && sourceType) {
      await dispatch(createModel({ projectPath, sourceType, modelData }));
    }
  };

  const handleEditModel = async (modelPath: string) => {
    if (sourceType) {
      try {
        const result = await dispatch(parseModelToModelData({ filePath: modelPath, sourceType }));
        if (parseModelToModelData.fulfilled.match(result)) {
          setEditModelData(result.payload);
          setEditModelFilePath(modelPath);
          setAddModelModalOpen(true);
        } else {
          const errorMessage = result.payload || 'Failed to load model data for editing';
          setSnackbarMessage(typeof errorMessage === 'string' ? errorMessage : 'Failed to load model data for editing');
          setSnackbarSeverity('error');
          setSnackbarOpen(true);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to load model data for editing';
        setSnackbarMessage(errorMessage);
        setSnackbarSeverity('error');
        setSnackbarOpen(true);
      }
    }
  };

  const handleUpdateModel = async (modelData: ModelData) => {
    if (editModelFilePath && sourceType) {
      await dispatch(updateModel({ filePath: editModelFilePath, projectPath: projectPath ?? undefined, sourceType, modelData }));
    }
  };

  const handleCloseSnackbar = () => {
    setSnackbarOpen(false);
  };

  return (
    <>
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

        {/* Card 2: Auto Detected Technology Stack */}
        <Paper sx={{ p: 3 }}>
          <Typography variant='h6' gutterBottom sx={{ mb: 2 }}>
            Detected Technology Stack
          </Typography>
          <Box sx={{ mb: 2, color: 'text.secondary' }}>
            <Typography variant='body2'>Scan strategy:</Typography>
            <Typography variant='body2'>
              - Node.js: <code>src/modules/**</code> altında <code>*.model.ts|*.model.js</code> dosyaları taranır.
            </Typography>
            <Typography variant='body2'>- .NET: <code>Entities/Models</code> altı entity dosyaları taranır.</Typography>
          </Box>
          <Alert severity={sourceType ? 'success' : 'warning'}>
            <Typography variant='body2'>
              {sourceType ? (
                <>
                  <strong>Detected stack:</strong>{' '}
                  {sourceType === 'nodejs-mongoose'
                    ? 'Node.js / Express / Mongoose'
                    : sourceType === 'nodejs-typeorm'
                      ? 'Node.js / TypeORM'
                      : 'C# / ASP.NET Core / Entity Framework'}
                </>
              ) : (
                'Stack could not be detected yet. Select project root and run scan.'
              )}
            </Typography>
          </Alert>
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
                    <IconButton
                      edge='end'
                      aria-label='edit'
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditModel(model.path);
                      }}
                      sx={{ mr: 1 }}
                    >
                      <EditIcon />
                    </IconButton>
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
      </Container>

      {selectedModelSchema && parsingStatus === 'success' && (
        <Box
          sx={{
            width: '100%',
            maxWidth: '100%',
            px: { xs: 1.5, sm: 2, md: 3 },
            py: 2,
            boxSizing: 'border-box'
          }}
        >
          <SchemaDesignPage />
        </Box>
      )}

      <AddModelModal
        open={addModelModalOpen}
        onClose={() => {
          setAddModelModalOpen(false);
          setEditModelData(null);
          setEditModelFilePath(null);
        }}
        onSave={editModelData ? handleUpdateModel : handleAddModel}
        projectPath={projectPath}
        sourceType={sourceType}
        initialData={editModelData}
        isEditMode={!!editModelData}
        modelFilePath={editModelFilePath || undefined}
      />

      {/* Snackbar for notifications */}
      <Snackbar open={snackbarOpen} autoHideDuration={4000} onClose={handleCloseSnackbar} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert onClose={handleCloseSnackbar} severity={snackbarSeverity} sx={{ width: '100%' }}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </>
  );
};

export default ProjectSelectPage;
