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
  Snackbar,
  Chip,
  Tooltip
} from '@mui/material';
import { FolderOpen, Add as AddIcon, Edit as EditIcon, CreateNewFolder } from '@mui/icons-material';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import {
  setProjectPath,
  scanProjectFiles,
  parseModelFile,
  createModel,
  updateModel,
  loadModelDraft,
  openPythonImport,
  pickDirectory
} from '../features/project/projectSlice';
import type { ScannedModel } from '../features/project/projectSlice';
import PythonImportDialog from '../components/PythonImportDialog';
import { IconButton } from '@mui/material';
import SchemaDesignPage from './SchemaDesignPage';
import AddModelModal from '../components/AddModelModal';
import BackendStackInfoButton from '../components/BackendStackInfo';
import NewProjectDialog from '../components/NewProjectDialog';
import NewAdminPanelDialog from '../components/NewAdminPanelDialog';
import AuthModulesDialog from '../components/AuthModulesDialog';
import { ADMIN_BACKEND_DEFAULTS, ADMIN_PANEL_INFO } from '@shared/adminPanel';
import type { BackendStack } from '@shared/backendDatabase';
import { AdminPanelSettings } from '@mui/icons-material';
import { NEW_PROJECT_STACKS, type BackendStackInfo } from '@shared/backendStacks';
import type { ModelDraft } from '@shared/modelDraft';
import { readLastProjectPath, writeLastProjectPath } from '../features/project/lastProjectPath';
import { useState, useEffect } from 'react';

function toRelativePath(fullPath: string, root: string): string {
  if (!root || !fullPath) return fullPath || '';
  const normalizedRoot = root.replace(/\\/g, '/').replace(/\/+$/, '');
  const normalizedPath = fullPath.replace(/\\/g, '/');
  if (normalizedPath === normalizedRoot) return '.';
  if (normalizedPath.startsWith(normalizedRoot + '/')) {
    return normalizedPath.slice(normalizedRoot.length + 1);
  }
  return fullPath;
}

const ProjectSelectPage = () => {
  const dispatch = useAppDispatch();
  const {
    projectPath,
    sourceType,
    detectedTechnologies,
    status,
    error,
    modelsFound,
    selectedModelSchema,
    selectedModelSourceRelativePath,
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
  const [loadingModelPath, setLoadingModelPath] = useState<string | null>(null);
  const [editModelDraft, setEditModelDraft] = useState<ModelDraft | null>(null);
  const [editModelFilePath, setEditModelFilePath] = useState<string | null>(null);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error'>('success');
  const [newProject, setNewProject] = useState<BackendStackInfo | null>(null);
  const [newAdminOpen, setNewAdminOpen] = useState(false);
  const [authModulesOpen, setAuthModulesOpen] = useState(false);

  useEffect(() => {
    const last = readLastProjectPath();
    if (!last) return;
    dispatch(setProjectPath(last));
    dispatch(scanProjectFiles({ path: last }));
  }, [dispatch]);

  /** PY9: a new host was bootstrapped; it is opened like any project. */
  const handleProjectCreated = (root: string, message: string) => {
    setNewProject(null);
    writeLastProjectPath(root);
    dispatch(setProjectPath(root));
    dispatch(scanProjectFiles({ path: root }));
    setSnackbarMessage(message);
    setSnackbarSeverity('success');
    setSnackbarOpen(true);
  };

  /** Auth modules of the open Python host were changed; the project is rescanned (Users model may change). */
  const handleAuthModulesSaved = (message: string) => {
    setAuthModulesOpen(false);
    if (projectPath) dispatch(scanProjectFiles({ path: projectPath }));
    setSnackbarMessage(message);
    setSnackbarSeverity('success');
    setSnackbarOpen(true);
  };

  /** Admin panel only: the open backend project stays open (the panel is a frontend folder). */
  const handleAdminPanelCreated = (_root: string, message: string) => {
    setNewAdminOpen(false);
    setSnackbarMessage(message);
    setSnackbarSeverity('success');
    setSnackbarOpen(true);
  };

  const handleBrowseFolder = async () => {
    const selectedPath = await dispatch(pickDirectory()).unwrap();
    if (!selectedPath) return;
    writeLastProjectPath(selectedPath);
    dispatch(setProjectPath(selectedPath));
    dispatch(scanProjectFiles({ path: selectedPath }));
  };

  const handleScanProject = () => {
    if (projectPath) {
      dispatch(scanProjectFiles({ path: projectPath }));
    }
  };

  const handleModelClick = async (model: ScannedModel) => {
    if (!projectPath) return;
    // Python (PY7): a hand-written \`model.py\` is imported first; generated modules open in the schema designer.
    if (model.kind === 'importable') {
      dispatch(openPythonImport(model.path));
    } else {
      setLoadingModelPath(model.path);
      try {
        await dispatch(parseModelFile({ filePath: model.path, projectRoot: projectPath }));
      } finally {
        setLoadingModelPath(null);
      }
    }
  };

  const handlePythonImportClosed = (imported: boolean) => {
    if (!imported || !projectPath) return;
    dispatch(scanProjectFiles({ path: projectPath }));
    setSnackbarMessage('Python modeli içe aktarıldı ve üretildi.');
    setSnackbarSeverity('success');
    setSnackbarOpen(true);
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
      setEditModelDraft(null);
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

  const handleAddModel = async (draft: ModelDraft) => {
    if (projectPath && sourceType) {
      await dispatch(createModel({ projectPath, sourceType, draft }));
    }
  };

  const handleEditModel = async (modelPath: string) => {
    if (sourceType) {
      try {
        const result = await dispatch(loadModelDraft({ filePath: modelPath, sourceType }));
        if (loadModelDraft.fulfilled.match(result)) {
          setEditModelDraft(result.payload);
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

  const handleUpdateModel = async (draft: ModelDraft) => {
    if (editModelFilePath && sourceType) {
      await dispatch(updateModel({ filePath: editModelFilePath, projectPath: projectPath ?? undefined, sourceType, draft }));
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
          <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            {NEW_PROJECT_STACKS.map(info => (
              <Box key={info.stack} sx={{ display: 'flex', alignItems: 'center' }}>
                <Button size='small' startIcon={<CreateNewFolder />} onClick={() => setNewProject(info)}>
                  {info.label}
                </Button>
                <BackendStackInfoButton info={info} />
              </Box>
            ))}
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Button size='small' startIcon={<AdminPanelSettings />} onClick={() => setNewAdminOpen(true)}>
                {ADMIN_PANEL_INFO.label}
              </Button>
              <BackendStackInfoButton info={ADMIN_PANEL_INFO} />
            </Box>
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
            <Typography variant='body2'>
              - .NET: <code>src/&lt;App&gt;.Domain/&lt;Modül&gt;/&lt;Entity&gt;.cs</code> entity dosyaları taranır (çözüm: <code>&lt;App&gt;.slnx</code>).
            </Typography>
            <Typography variant='body2'>
              - Python: manifest'teki modüller (<code>modules/&lt;m&gt;/model_generated.py</code>) ve içe aktarılabilir elle yazılmış{' '}
              <code>modules/&lt;m&gt;/model.py</code> (kök: <code>pyproject.toml</code> + <code>src/&lt;paket&gt;/core</code>).
            </Typography>
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
                      : sourceType === 'python-fastapi'
                        ? 'Python / FastAPI / Pydantic'
                        : '.NET / ASP.NET Core / EF Core'}
                  {detectedTechnologies.length > 0 && <> ({detectedTechnologies.join(', ')})</>}
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
          {sourceType === 'python-fastapi' && projectPath && (
            <Button variant='outlined' size='large' onClick={() => setAuthModulesOpen(true)} startIcon={<AdminPanelSettings />}>
              Auth modülleri
            </Button>
          )}
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
            <List disablePadding>
              {modelsFound.map((model, index) => {
                const relPath = toRelativePath(model.path, projectPath);
                const isSelected = selectedModelSourceRelativePath === relPath;
                const displayName = model.entityName || model.fileName;

                return (
                  <Box key={model.path}>
                    <ListItem
                      disablePadding
                      secondaryAction={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {model.kind === 'importable' && (
                            <Chip size='small' color='info' label='Elle yazılmış: içe aktar' />
                          )}
                          {model.kind !== 'importable' && (
                            <Tooltip title='Modeli Düzenle'>
                              <IconButton
                                edge='end'
                                aria-label='edit'
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditModel(model.path);
                                }}
                                sx={{ mr: 0.5 }}
                              >
                                <EditIcon />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      }
                    >
                      <ListItemButton
                        onClick={() => handleModelClick(model)}
                        selected={isSelected}
                        sx={{
                          py: 1.5,
                          pr: model.kind === 'importable' ? 24 : 8,
                          borderRadius: 1
                        }}
                      >
                        <ListItemText
                          primary={
                            <Typography variant='subtitle1' component='div' sx={{ fontWeight: 600 }}>
                              {displayName}
                            </Typography>
                          }
                          secondary={relPath}
                          secondaryTypographyProps={{
                            sx: {
                              fontFamily: 'monospace',
                              fontSize: '0.8rem',
                              color: 'text.secondary',
                              mt: 0.25,
                              wordBreak: 'break-all'
                            }
                          }}
                        />
                        {loadingModelPath === model.path && (
                          <CircularProgress size={20} sx={{ ml: 2 }} />
                        )}
                      </ListItemButton>
                    </ListItem>
                    {index < modelsFound.length - 1 && <Divider />}
                  </Box>
                );
              })}
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
          setEditModelDraft(null);
          setEditModelFilePath(null);
        }}
        onSave={editModelDraft ? handleUpdateModel : handleAddModel}
        projectPath={projectPath}
        sourceType={sourceType}
        initialData={editModelDraft}
        isEditMode={!!editModelDraft}
        modelFilePath={editModelFilePath || undefined}
      />

      {projectPath && <PythonImportDialog projectPath={projectPath} onClosed={handlePythonImportClosed} />}

      {projectPath && (
        <AuthModulesDialog open={authModulesOpen} projectPath={projectPath} onClose={() => setAuthModulesOpen(false)} onSaved={handleAuthModulesSaved} />
      )}

      <NewProjectDialog info={newProject} onClose={() => setNewProject(null)} onCreated={handleProjectCreated} />
      <NewAdminPanelDialog
        open={newAdminOpen}
        defaultStack={sourceType && sourceType in ADMIN_BACKEND_DEFAULTS ? (sourceType as BackendStack) : undefined}
        onClose={() => setNewAdminOpen(false)}
        onCreated={handleAdminPanelCreated}
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
