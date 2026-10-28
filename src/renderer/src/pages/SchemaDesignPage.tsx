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
  Autocomplete,
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
  FormControlLabel,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  LinearProgress,
  FormLabel
} from '@mui/material';
import { Save as SaveIcon, Code as CodeIcon, FolderOpen } from '@mui/icons-material';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import {
  updateFieldConfig, updateModelApi,
  updateModelLabel, markModelApiSaved, saveSchemaConfig, generateFrontend, generateBackend, setFrontendPath, pickDirectory, patchWorkspaceGeneratePrefs, persistWorkspaceManifest, buildManifestWorkspacePayload
} from '../features/project/projectSlice';
import type { NormalizedField, NormalizedModel, RelationType } from '@shared/normalizedModel';
import type { RelationPropertyObjectSubField } from '@shared/relationDisplayMeta';
import { uiComponentOptionsFor, type UIComponent } from '@shared/modelMerge';
import { FILTER_TOKENS, filterFromToken, filterTokenOf, type FilterToken } from '@shared/fieldTypeToken';
import { FieldPatch, fieldTypeLabel, isReferenceField, modelApiSettings } from '../features/project/modelEdits';
import { modelCandidatesFromScanned } from '@shared/modelCandidates';
import ModelApiSettingsPanel, { resolveModelApi } from '../components/ModelApiSettingsPanel';
import { useEffect, useState, useMemo } from 'react';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';

const RELATION_FIELD_GRID_COLS = 4;

/** `_id` / timestamps: never hidden or admin-only. */
const isSystemField = (name: string) => ['_id', 'id', 'createdAt', 'updatedAt'].includes(name);

type RelatedModelFieldInfo = {
  name: string;
  type: string;
  regexSearchable?: boolean;
  objectFields?: RelationPropertyObjectSubField[];
};

type RelationPopulatePickerState = {
  open: boolean;
  fieldIndex: number | null;
  loading: boolean;
  error: string | null;
  candidates: RelatedModelFieldInfo[];
  selected: Record<string, boolean>;
  displayField: string;
};

const relationPickerInitial: RelationPopulatePickerState = {
  open: false,
  fieldIndex: null,
  loading: false,
  error: null,
  candidates: [],
  selected: {},
  displayField: ''
};

const SchemaDesignPage = () => {
  const dispatch = useAppDispatch();
  const {
    selectedModelSchema,
    selectedModelSourceRelativePath,
    selectedModelApiSource,
    projectPath,
    frontendPath,
    sourceType,
    modelsFound,
    savingStatus,
    savingError,
    lastSavedFilePath,
    generatingFrontendStatus,
    generatingFrontendError,
    lastGeneratedFrontendFiles,
    generatingBackendStatus,
    generatingBackendError,
    lastGeneratedBackendFiles,
    lastGeneratedBackendNotes,
    workspaceGeneratePrefs,
    workspaceManifestLoaded
  } = useAppSelector(state => state.project);
  const {
    generationMode,
    updateExistingBackendFiles,
    selectedBackendFiles,
    features
  } = workspaceGeneratePrefs;
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error'>('success');
  const baseUrl = '/api';
  const [relationPicker, setRelationPicker] = useState<RelationPopulatePickerState>(relationPickerInitial);
  const modelOptions = useMemo(() => modelCandidatesFromScanned(modelsFound), [modelsFound]);

  useEffect(() => {
    if (!projectPath || !workspaceManifestLoaded) return;
    const timer = setTimeout(() => {
      void dispatch(persistWorkspaceManifest(projectPath));
    }, 600);
    return () => clearTimeout(timer);
  }, [dispatch, projectPath, frontendPath, workspaceGeneratePrefs, workspaceManifestLoaded]);

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
      const base = fileList ? `Backend code generated: ${fileList}` : 'Backend code generated successfully!';
      const message = lastGeneratedBackendNotes.length ? [base, ...lastGeneratedBackendNotes].join('\n') : base;
      setSnackbarMessage(message);
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
    } else if (generatingBackendStatus === 'error') {
      setSnackbarMessage(generatingBackendError || 'Failed to generate backend code');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  }, [generatingBackendStatus, generatingBackendError, lastGeneratedBackendFiles, lastGeneratedBackendNotes]);

  // Auto-save disabled - user must click Save button manually

  // Base API URL is fixed to /api (Task 47).

  if (!selectedModelSchema) {
    return (
      <Container maxWidth={false} sx={{ py: 4, width: '100%' }}>
        <Paper sx={{ p: 3 }}>
          <Typography variant='body1' color='text.secondary'>
            No schema selected. Please select a model from the project selection page.
          </Typography>
        </Paper>
      </Container>
    );
  }

  // Per-model API settings (P5): auth and admin come from the model, not from workspace prefs.
  const apiSettings = modelApiSettings(selectedModelSchema);
  // Python generates only the admin API: on unless the model turned it off (the Python generator's own default).
  const defaultAdmin = sourceType === 'python-fastapi';
  const modelApi = resolveModelApi(apiSettings, selectedModelSchema.fields, defaultAdmin);
  const isProtectedRoute = modelApi.requiresAuth;
  const isAdminUser = modelApi.admin;
  /** Schema as stored / generated: the API set exactly as the generator will apply it. */
  const schemaWithResolvedApi = (): NormalizedModel => ({
    ...selectedModelSchema,
    api: {
      ...selectedModelSchema.api,
      normalOperations: modelApi.operations,
      requiresAuth: modelApi.requiresAuth,
      admin: modelApi.admin
    }
  });

  const handleLabelChange = (fieldIndex: number, newLabel: string) => {
    dispatch(updateFieldConfig({ fieldIndex, updates: { ui: { label: newLabel } } }));
  };

  const handleUIComponentChange = (fieldIndex: number, newComponent: UIComponent) => {
    dispatch(updateFieldConfig({ fieldIndex, updates: { ui: { component: newComponent } } }));
  };

  const handleShowInTableChange = (fieldIndex: number, showInTable: boolean) => {
    dispatch(updateFieldConfig({ fieldIndex, updates: { ui: { list: showInTable } } }));
  };

  const handleIsSearchableChange = (fieldIndex: number, isSearchable: boolean) => {
    dispatch(updateFieldConfig({ fieldIndex, updates: { filter: { searchable: isSearchable } } }));
  };

  const handleFilterTypeChange = (fieldIndex: number, filterType: FilterToken) => {
    dispatch(updateFieldConfig({ fieldIndex, updates: { filter: filterFromToken(filterType) } }));
  };

  const handleDefaultValueChange = (fieldIndex: number, defaultValue: string) => {
    dispatch(updateFieldConfig({ fieldIndex, updates: { ui: { defaultValue } } }));
  };

  const handleReadonlyChange = (fieldIndex: number, isReadonly: boolean) => {
    dispatch(updateFieldConfig({ fieldIndex, updates: { access: { readonly: isReadonly } } }));
  };

  const handleHiddenChange = (fieldIndex: number, hidden: boolean) => {
    dispatch(updateFieldConfig({ fieldIndex, updates: { access: { hidden: hidden || undefined } } }));
  };

  const handleAdminOnlyChange = (fieldIndex: number, adminOnly: boolean) => {
    dispatch(updateFieldConfig({ fieldIndex, updates: { access: { adminOnly: adminOnly || undefined } } }));
  };

  const handleComputedChange = (fieldIndex: number, computed: boolean) => {
    dispatch(updateFieldConfig({ fieldIndex, updates: { access: { computed: computed || undefined } } }));
  };

  const handleDetailOnlyChange = (fieldIndex: number, detailOnly: boolean) => {
    dispatch(updateFieldConfig({ fieldIndex, updates: { access: { detailOnly: detailOnly || undefined } } }));
  };

  // HiddenFromCreate / HiddenFromUpdate controls removed (Task 51)

  const handleRelationEntityChange = (fieldIndex: number, relationEntityName: string) => {
    const field = selectedModelSchema.fields[fieldIndex];
    const updates: FieldPatch = {
      reference: { target: relationEntityName, populate: undefined, display: undefined, displayObjectFields: undefined }
    };
    if (relationEntityName.trim() || isReferenceField(field)) {
      if (!field.ui?.component || field.ui.component === 'TextField') {
        updates.ui = { component: 'Autocomplete' };
      }
      if (!field.filter?.type || field.filter.type === 'regex') {
        updates.filter = { searchable: field.filter?.searchable ?? true, type: 'reference' };
      }
    }
    dispatch(updateFieldConfig({ fieldIndex, updates }));
  };

  const handleRelationTypeChange = (fieldIndex: number, relationType: RelationType) => {
    dispatch(updateFieldConfig({ fieldIndex, updates: { reference: { relationType } } }));
  };

  const handleIncludeRelationChange = (fieldIndex: number, includeRelation: boolean) => {
    const field = selectedModelSchema.fields[fieldIndex];
    // Auto-detect relation entity name from field name (e.g., userId -> User, symbolId -> Symbol)
    let relationEntityName = '';
    if (includeRelation && isReferenceField(field)) {
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
    const updates: FieldPatch = {
      reference: {
        include: includeRelation,
        target: includeRelation ? relationEntityName : undefined,
        display: includeRelation ? field.reference?.display : undefined,
        populate: includeRelation ? field.reference?.populate : undefined,
        displayObjectFields: includeRelation ? field.reference?.displayObjectFields : undefined,
        relationType: includeRelation ? field.reference?.relationType || (field.isArray ? 'oneToMany' : 'manyToOne') : undefined
      }
    };
    if (includeRelation || isReferenceField(field)) {
      if (!field.ui?.component || field.ui.component === 'TextField') {
        updates.ui = { component: 'Autocomplete' };
      }
      if (!field.filter?.type || field.filter.type === 'regex') {
        updates.filter = { searchable: field.filter?.searchable ?? true, type: 'reference' };
      }
    }
    dispatch(updateFieldConfig({ fieldIndex, updates }));
  };

  const openRelationPopulatePicker = async (fieldIndex: number) => {
    const field = selectedModelSchema.fields[fieldIndex];
    const entity = field.reference?.target?.trim();
    if (!entity) {
      setSnackbarMessage('Önce hedef model adını girin (ör. SymbolTypes).');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
      return;
    }
    if (!projectPath) {
      setSnackbarMessage('Proje kökü bulunamadı.');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
      return;
    }
    if (!window.electronAPI?.project?.getRelatedModelFields) {
      setSnackbarMessage('IPC: getRelatedModelFields kullanılamıyor.');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
      return;
    }

    setRelationPicker({
      ...relationPickerInitial,
      open: true,
      fieldIndex,
      loading: true
    });

    try {
      const res = await window.electronAPI.project.getRelatedModelFields(projectPath, entity, sourceType);
      if (!res.success || !res.fields?.length) {
        setRelationPicker({
          ...relationPickerInitial,
          open: true,
          fieldIndex,
          loading: false,
          error: res.error || 'Alan listesi alınamadı'
        });
        return;
      }
      const fields = res.fields;
      const populate = field.reference?.populate;
      const initialPopulate = populate && populate.length > 0 ? populate : [];
      const selected: Record<string, boolean> = {};
      for (const f of fields) {
        selected[f.name] = initialPopulate.includes(f.name);
      }
      let display = field.reference?.display?.trim() || '';
      if (display && !selected[display]) {
        display = '';
      }
      setRelationPicker({
        open: true,
        fieldIndex,
        loading: false,
        error: null,
        candidates: fields,
        selected,
        displayField: display
      });
    } catch (e) {
      setRelationPicker({
        ...relationPickerInitial,
        open: true,
        fieldIndex,
        loading: false,
        error: e instanceof Error ? e.message : 'İstek başarısız'
      });
    }
  };

  const toggleRelationPopulateCandidate = (name: string, checked: boolean) => {
    setRelationPicker(p => {
      const next = { ...p.selected, [name]: checked };
      let displayField = p.displayField;
      if (!checked && displayField === name) {
        displayField = '';
      }
      return { ...p, selected: next, displayField };
    });
  };

  const applyRelationPopulatePicker = () => {
    const idx = relationPicker.fieldIndex;
    if (idx === null) return;
    const ordered = relationPicker.candidates.filter(f => relationPicker.selected[f.name]).map(f => f.name);
    if (ordered.length === 0) {
      setSnackbarMessage('En az bir alan seçin.');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
      return;
    }
    const display = relationPicker.displayField.trim();
    if (!display) {
      setSnackbarMessage('Display alanını seçin.');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
      return;
    }
    if (!ordered.includes(display)) {
      setSnackbarMessage('Display, işaretlediğiniz alanlardan biri olmalı.');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
      return;
    }
    const displayFieldMeta = relationPicker.candidates.find(f => f.name === display);
    const relationPropertyObjectFields =
      displayFieldMeta && String(displayFieldMeta.type).toLowerCase() === 'object' && displayFieldMeta.objectFields?.length
        ? displayFieldMeta.objectFields.map(sub => ({
          name: sub.name,
          type: sub.type ?? 'string',
          required: sub.required ?? false,
          trim: sub.trim,
        }))
        : undefined;
    dispatch(
      updateFieldConfig({
        fieldIndex: idx,
        updates: {
          reference: { populate: ordered, display, displayObjectFields: relationPropertyObjectFields }
        },
      })
    );
    setRelationPicker(relationPickerInitial);
  };

  const closeRelationPopulatePicker = () => {
    setRelationPicker(relationPickerInitial);
  };

  const handleRelationPropertyChange = (fieldIndex: number, relationProperty: string) => {
    dispatch(updateFieldConfig({ fieldIndex, updates: { reference: { display: relationProperty } } }));
  };

  const handleSave = () => {
    if (selectedModelSchema && projectPath) {
      dispatch(saveSchemaConfig({ projectRoot: projectPath, schema: schemaWithResolvedApi() }));
    }
  };

  const relationDisplayValidationError = (schema: NormalizedModel): string | null => {
    for (const f of schema.fields) {
      if (!isReferenceField(f) || !f.reference?.include) continue;
      if (!String(f.reference.display || '').trim()) {
        return `İlişki açık olan "${f.name}" alanı için display seçin veya girin.`;
      }
    }
    return null;
  };

  const handleGenerateCode = async () => {
    if (!selectedModelSchema || !projectPath) return;

    const relErr = relationDisplayValidationError(selectedModelSchema);
    if (relErr) {
      setSnackbarMessage(relErr);
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
      return;
    }

    if ((generationMode === 'frontend' || generationMode === 'fullstack') && !frontendPath) {
      setSnackbarMessage('Please select a frontend project path before generating code.');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
      return;
    }

    const schemaSnapshot = schemaWithResolvedApi();
    const relPath = selectedModelSourceRelativePath;

    const tasks: Array<Promise<unknown>> = [];
    if (generationMode === 'frontend' || generationMode === 'fullstack') {
      tasks.push(
        dispatch(
          generateFrontend({
            schema: schemaSnapshot,
            projectPath: frontendPath!,
            // Backend project: the admin router mount path is read from its app file.
            backendPath: projectPath,
            features,
            baseUrl
          })
        ).unwrap()
      );
    }
    if (generationMode === 'backend' || generationMode === 'fullstack') {
      const backendSelectedFiles = {
        ...selectedBackendFiles,
        route: true,
        serviceAdmin: isAdminUser ? selectedBackendFiles.serviceAdmin : false,
        routeAdmin: isAdminUser ? selectedBackendFiles.routeAdmin : false
      };
      tasks.push(
        dispatch(
          generateBackend({
            schema: schemaSnapshot,
            projectPath,
            isProtectedRoute,
            sourceType,
            // Route file follows the normal API selection (P5 #24): the generator decides.
            shouldAddRoute: true,
            baseUrl,
            updateExistingFiles: updateExistingBackendFiles,
            isAdminUser,
            selectedFiles: backendSelectedFiles
          })
        ).unwrap()
      );
    }

    try {
      await Promise.all(tasks);
    } catch {
      return;
    }

    if (relPath && window.electronAPI?.project?.writeWorkspaceManifest) {
      const workspace = buildManifestWorkspacePayload(frontendPath, workspaceGeneratePrefs);
      const man = await window.electronAPI.project.writeWorkspaceManifest(projectPath, schemaSnapshot, relPath, workspace);
      if (man.success) dispatch(markModelApiSaved());
      if (!man.success && man.error) {
        setSnackbarMessage(`Code generated; workspace manifest not updated: ${man.error}`);
        setSnackbarSeverity('error');
        setSnackbarOpen(true);
      }
    }
  };

  const handleCloseSnackbar = () => {
    setSnackbarOpen(false);
  };

  /** Kind-compatible components plus the stored one (so an old, incompatible choice is visible and changeable). */
  const uiComponentOptions = (field: NormalizedField): UIComponent[] => {
    const options = uiComponentOptionsFor(field);
    const current = field.ui?.component as UIComponent | undefined;
    return current && !options.includes(current) ? [...options, current] : options;
  };
  const filterTypeOptions: readonly FilterToken[] = FILTER_TOKENS;
  const defaultValueOptions = ['', 'currentDate', 'currentUserId', 'uuid'];

  return (
    <Container maxWidth={false} sx={{ py: 4, width: '100%' }}>
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
        <Typography variant='subtitle2' sx={{ fontWeight: 600, mb: 2, color: 'text.secondary' }}>
          Backend Settings
        </Typography>
        <TextField
          label='Model etiketi'
          size='small'
          fullWidth
          sx={{ mb: 2 }}
          value={selectedModelSchema.ui?.label ?? ''}
          onChange={e => dispatch(updateModelLabel(e.target.value))}
          placeholder={selectedModelSchema.entityName.replace(/([a-z0-9])([A-Z])/g, '$1 $2')}
          helperText='Admin menüsü ve sayfa başlığı. Boşsa model adından türetilir.'
        />
        <Box sx={{ mb: 2 }}>
          <ModelApiSettingsPanel
            api={apiSettings}
            fields={selectedModelSchema.fields}
            source={selectedModelApiSource}
            defaultAdmin={defaultAdmin}
            onChange={patch => dispatch(updateModelApi(patch))}
          />
        </Box>
        <Divider sx={{ my: 2 }} />
        <Box sx={{ mb: 2 }}>
          <Typography variant='subtitle1' sx={{ fontWeight: 600, mb: 1 }}>
            Generation Mode:
          </Typography>
          <RadioGroup
            row
            value={generationMode}
            onChange={e => dispatch(patchWorkspaceGeneratePrefs({ generationMode: e.target.value as 'frontend' | 'backend' | 'fullstack' }))}
          >
            <FormControlLabel value='frontend' control={<Radio />} label='Frontend Only' />
            <FormControlLabel value='backend' control={<Radio />} label='Backend Only' />
            <FormControlLabel value='fullstack' control={<Radio />} label='Full Stack' />
          </RadioGroup>
        </Box>

        {(generationMode === 'backend' || generationMode === 'fullstack') && sourceType === 'dotnet-ef' && (
          <Alert severity='info' sx={{ mt: 2 }}>
            .NET: modülün bütün dosyaları (Domain, Application, Infrastructure, Api) ve kayıt dosyaları üretilir. Başlıklı dosyalar her
            seferinde yeniden yazılır; <code>*.Custom.cs</code> ve <code>*Hooks.cs</code> bir kez oluşturulur. Migration Generator'ın işi
            değildir; komut generate sonrası gösterilir.
          </Alert>
        )}
        {(generationMode === 'backend' || generationMode === 'fullstack') && sourceType === 'python-fastapi' && (
          <Alert severity='info' sx={{ mt: 2 }}>
            Python: modülün G dosyaları (<code>*_generated.py</code>) ve <code>api/routers_generated.py</code> /{' '}
            <code>indexes_generated.py</code> her seferinde yeniden yazılır; <code>model.py</code>, <code>repository.py</code>,{' '}
            <code>hooks.py</code>, <code>service.py</code> bir kez oluşturulur. Model kaynağı manifest'tir.
          </Alert>
        )}
        {(generationMode === 'backend' || generationMode === 'fullstack') && sourceType !== 'dotnet-ef' && sourceType !== 'python-fastapi' && (
          <Box sx={{ mt: 2 }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={updateExistingBackendFiles}
                  onChange={e => dispatch(patchWorkspaceGeneratePrefs({ updateExistingBackendFiles: e.target.checked }))}
                />
              }
              label='Varolan dosyaları güncelle'
              sx={{ mb: 2 }}
            />
            <Typography variant='body2' gutterBottom sx={{ mb: 1 }}>
              Select Files to Generate:
            </Typography>
            <FormGroup row>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={selectedBackendFiles.model}
                    onChange={e =>
                      dispatch(
                        patchWorkspaceGeneratePrefs({
                          selectedBackendFiles: { ...selectedBackendFiles, model: e.target.checked }
                        })
                      )
                    }
                  />
                }
                label='Model'
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={selectedBackendFiles.crud}
                    onChange={e =>
                      dispatch(
                        patchWorkspaceGeneratePrefs({
                          selectedBackendFiles: { ...selectedBackendFiles, crud: e.target.checked }
                        })
                      )
                    }
                  />
                }
                label='Crud'
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={selectedBackendFiles.filters}
                    onChange={e =>
                      dispatch(
                        patchWorkspaceGeneratePrefs({
                          selectedBackendFiles: { ...selectedBackendFiles, filters: e.target.checked }
                        })
                      )
                    }
                  />
                }
                label='Filters'
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={selectedBackendFiles.types}
                    onChange={e =>
                      dispatch(
                        patchWorkspaceGeneratePrefs({
                          selectedBackendFiles: { ...selectedBackendFiles, types: e.target.checked }
                        })
                      )
                    }
                  />
                }
                label='Types'
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={selectedBackendFiles.service}
                    onChange={e =>
                      dispatch(
                        patchWorkspaceGeneratePrefs({
                          selectedBackendFiles: { ...selectedBackendFiles, service: e.target.checked }
                        })
                      )
                    }
                  />
                }
                label='Service'
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={selectedBackendFiles.schema}
                    onChange={e =>
                      dispatch(
                        patchWorkspaceGeneratePrefs({
                          selectedBackendFiles: { ...selectedBackendFiles, schema: e.target.checked }
                        })
                      )
                    }
                  />
                }
                label='Schema'
              />
              {isAdminUser && (
                <>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={selectedBackendFiles.serviceAdmin}
                        onChange={e =>
                          dispatch(
                            patchWorkspaceGeneratePrefs({
                              selectedBackendFiles: { ...selectedBackendFiles, serviceAdmin: e.target.checked }
                            })
                          )
                        }
                      />
                    }
                    label='Admin Service'
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={selectedBackendFiles.routeAdmin}
                        onChange={e =>
                          dispatch(
                            patchWorkspaceGeneratePrefs({
                              selectedBackendFiles: { ...selectedBackendFiles, routeAdmin: e.target.checked }
                            })
                          )
                        }
                      />
                    }
                    label='Admin Routes'
                  />
                </>
              )}
            </FormGroup>
          </Box>
        )}

        {generationMode === 'fullstack' && <Divider sx={{ my: 3, borderColor: 'divider' }} />}

        {(generationMode === 'frontend' || generationMode === 'fullstack') && (
          <Box sx={{ mt: generationMode === 'frontend' ? 2 : 0 }}>
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
                placeholder='No folder selected'
                helperText='Inside the selected backend, or apps/admin'
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
                  const path = await dispatch(pickDirectory()).unwrap();
                  if (path) dispatch(setFrontendPath(path));
                }}
                sx={{ minWidth: 140, height: 56 }}
              >
                Browse Folder
              </Button>
            </Box>
          </Box>
        )}

        {(generationMode === 'frontend' || generationMode === 'fullstack') && (
          <Box sx={{ mt: 3 }}>
            <Typography variant='body2' gutterBottom sx={{ mb: 1 }}>
              Table Features:
            </Typography>
            <FormGroup row>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={features.deletable}
                    onChange={e =>
                      dispatch(patchWorkspaceGeneratePrefs({ features: { ...features, deletable: e.target.checked } }))
                    }
                  />
                }
                label='Enable Delete (shows delete button)'
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={features.updatable}
                    onChange={e =>
                      dispatch(patchWorkspaceGeneratePrefs({ features: { ...features, updatable: e.target.checked } }))
                    }
                  />
                }
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
        <TableContainer
          sx={{
            maxWidth: '100%',
            display: 'block',
            overflowX: 'auto',
            overflowY: 'hidden',
            // Keep layout stable when scrollbar appears (supported in modern Chromium)
            scrollbarGutter: 'stable both-edges',
            // Make horizontal scrollbar visible (macOS overlay scrollbars otherwise hide it)
            scrollbarWidth: 'thin',
            '&::-webkit-scrollbar': { height: 10 },
            '&::-webkit-scrollbar-track': { backgroundColor: 'rgba(255,255,255,0.06)' },
            '&::-webkit-scrollbar-thumb': {
              backgroundColor: 'rgba(255,255,255,0.24)',
              borderRadius: 999
            },
            '&::-webkit-scrollbar-thumb:hover': { backgroundColor: 'rgba(255,255,255,0.34)' }
          }}
        >
          <Table sx={{ minWidth: 1760 }}>
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
                  <strong>Searchable</strong>
                </TableCell>
                <TableCell>
                  <strong>Filter Type</strong>
                </TableCell>
                <TableCell>
                  <strong>Default Value</strong>
                </TableCell>
                <TableCell align='center'>
                  <strong>Readonly</strong>
                </TableCell>
                <TableCell align='center' title='Hiçbir CRUD cevabında dönmez (admin dahil) ve filtrelenemez'>
                  <strong>Hidden</strong>
                </TableCell>
                <TableCell align='center' title='Normal (mobil) API create / update gövdesine girmez; admin yazar'>
                  <strong>Admin only</strong>
                </TableCell>
                <TableCell align='center' title='Okurken hesaplanır (ör. canlı fiyat): saklanmaz, gövdede yok, filtre / sıralama yok; map_rows hook doldurur'>
                  <strong>Computed</strong>
                </TableCell>
                <TableCell align='center' title='Ağır gövde (ör. analiz blobu): liste sayfasında okunmaz (null), detayda (getOne) döner'>
                  <strong>Detail only</strong>
                </TableCell>
                <TableCell>
                  <strong>Required</strong>
                </TableCell>
                <TableCell>
                  <strong>Array</strong>
                </TableCell>
                {selectedModelSchema.fields.some(isReferenceField) && (
                  <>
                    <TableCell align='center'>
                      <strong>Include Relation</strong>
                    </TableCell>
                    <TableCell>
                      <strong>Relation</strong>
                    </TableCell>
                    <TableCell sx={{ minWidth: 200 }}>
                      <strong>Display</strong>
                    </TableCell>
                  </>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {selectedModelSchema.fields.map((field: NormalizedField, index: number) => (
                <TableRow key={field.name} hover>
                  <TableCell>
                    <Typography variant='body2' fontWeight='medium'>
                      {field.name}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={field.enum?.values.length ? 'enum' : fieldTypeLabel(field)} size='small' color='primary' variant='outlined' />
                    {field.enum?.values.length ? (
                      <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mt: 0.5 }}>
                        {field.enum.values.join(' | ')}
                      </Typography>
                    ) : null}
                    {fieldTypeLabel(field) === 'object' && field.object?.fields && field.object.fields.length > 0 && (
                      <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mt: 0.5 }}>
                        {(field.object.schemaName
                          ? `${field.object.typeName || ''} / ${field.object.schemaName} — `
                          : '')}
                        {field.object.fields.map(sub => `${sub.name}: ${fieldTypeLabel(sub)}`).join(', ')}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell sx={{ minWidth: 150 }}>
                    <TextField
                      value={field.ui?.label}
                      onChange={e => handleLabelChange(index, e.target.value)}
                      size='small'
                      fullWidth
                      variant='outlined'
                    />
                  </TableCell>
                  <TableCell sx={{ minWidth: 150 }}>
                    <FormControl fullWidth size='small'>
                      <Select
                        value={field.ui?.component ?? ''}
                        disabled={uiComponentOptionsFor(field).length === 0}
                        onChange={e => handleUIComponentChange(index, e.target.value as UIComponent)}
                      >
                        {uiComponentOptions(field).map(option => (
                          <MenuItem key={option} value={option} disabled={!uiComponentOptionsFor(field).includes(option)}>
                            {option}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </TableCell>
                  <TableCell align='center'>
                    <Switch checked={field.ui?.list} onChange={e => handleShowInTableChange(index, e.target.checked)} color='primary' />
                  </TableCell>
                  <TableCell align='center'>
                    <Switch checked={field.filter?.searchable} onChange={e => handleIsSearchableChange(index, e.target.checked)} color='primary' />
                  </TableCell>
                  <TableCell sx={{ minWidth: 130 }}>
                    <FormControl fullWidth size='small'>
                      <Select
                        value={filterTokenOf(field.filter) || 'regex'}
                        onChange={e => handleFilterTypeChange(index, e.target.value as FilterToken)}
                      >
                        {filterTypeOptions.map(option => (
                          <MenuItem key={option} value={option}>
                            {option}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </TableCell>
                  <TableCell sx={{ minWidth: 140 }}>
                    <FormControl fullWidth size='small'>
                      <Select value={field.ui?.defaultValue || ''} onChange={e => handleDefaultValueChange(index, e.target.value)}>
                        {defaultValueOptions.map(option => (
                          <MenuItem key={option || 'static-empty'} value={option}>
                            {option || 'static'}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </TableCell>
                  <TableCell align='center'>
                    <Switch checked={field.access?.readonly === true} onChange={e => handleReadonlyChange(index, e.target.checked)} color='primary' />
                  </TableCell>
                  <TableCell align='center'>
                    {isSystemField(field.name) ? (
                      <Typography variant='body2' color='text.secondary'>
                        -
                      </Typography>
                    ) : (
                      <Switch checked={field.access?.hidden === true} onChange={e => handleHiddenChange(index, e.target.checked)} color='warning' />
                    )}
                  </TableCell>
                  <TableCell align='center'>
                    {isSystemField(field.name) ? (
                      <Typography variant='body2' color='text.secondary'>
                        -
                      </Typography>
                    ) : (
                      <Switch checked={field.access?.adminOnly === true} onChange={e => handleAdminOnlyChange(index, e.target.checked)} color='warning' />
                    )}
                  </TableCell>
                  <TableCell align='center'>
                    {isSystemField(field.name) ? (
                      <Typography variant='body2' color='text.secondary'>
                        -
                      </Typography>
                    ) : (
                      <Switch checked={field.access?.computed === true} onChange={e => handleComputedChange(index, e.target.checked)} color='info' />
                    )}
                  </TableCell>
                  <TableCell align='center'>
                    {isSystemField(field.name) ? (
                      <Typography variant='body2' color='text.secondary'>
                        -
                      </Typography>
                    ) : (
                      <Switch checked={field.access?.detailOnly === true} onChange={e => handleDetailOnlyChange(index, e.target.checked)} color='info' />
                    )}
                  </TableCell>
                  <TableCell>
                    {field.required ? <Chip label='Yes' color='success' size='small' /> : <Chip label='No' color='default' size='small' />}
                  </TableCell>
                  <TableCell>
                    {field.isArray ? <Chip label='Yes' color='primary' size='small' /> : <Chip label='No' color='default' size='small' />}
                  </TableCell>
                  {selectedModelSchema.fields.some(isReferenceField) && (
                    <>
                      <TableCell align='center'>
                        {isReferenceField(field) ? (
                          <Switch
                            checked={field.reference?.include || false}
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
                        {isReferenceField(field) && field.reference?.include ? (
                          <Box
                            sx={{
                              display: 'flex',
                              flexDirection: 'row',
                              alignItems: 'flex-start',
                              gap: 2,
                              minWidth: 360,
                              maxWidth: 'none'
                            }}
                          >
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flex: '0 1 auto' }}>
                              <Autocomplete
                                freeSolo
                                options={modelOptions}
                                value={field.reference?.target || ''}
                                onChange={(_, val) => handleRelationEntityChange(index, (val as string) || '')}
                                onInputChange={(_, val, reason) => {
                                  if (reason === 'input' || reason === 'clear') {
                                    handleRelationEntityChange(index, val || '');
                                  }
                                }}
                                renderInput={params => (
                                  <TextField
                                    {...params}
                                    size='small'
                                    placeholder='Target model'
                                    variant='outlined'
                                  />
                                )}
                                sx={{ minWidth: 180 }}
                              />
                              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
                                <FormControl size='small' sx={{ minWidth: 130 }}>
                                  <Select
                                    value={field.reference?.relationType || (field.isArray ? 'oneToMany' : 'manyToOne')}
                                    onChange={e => handleRelationTypeChange(index, e.target.value as RelationType)}
                                  >
                                    <MenuItem value='oneToOne'>oneToOne</MenuItem>
                                    <MenuItem value='oneToMany'>oneToMany</MenuItem>
                                    <MenuItem value='manyToOne'>manyToOne</MenuItem>
                                    <MenuItem value='manyToMany'>manyToMany</MenuItem>
                                  </Select>
                                </FormControl>
                                <Button size='small' variant='outlined' onClick={() => void openRelationPopulatePicker(index)}>
                                  Select
                                </Button>
                              </Box>
                            </Box>
                            <Box
                              sx={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 0.5,
                                minWidth: 96,
                                maxWidth: 220,
                                pt: 0.25
                              }}
                            >
                              {(field.reference?.populate ?? []).map(name => (
                                <Chip
                                  key={name}
                                  label={name}
                                  size='small'
                                  variant='outlined'
                                  sx={{
                                    justifySelf: 'stretch',
                                    maxWidth: '100%',
                                    '& .MuiChip-label': {
                                      px: 0.75,
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      display: 'block'
                                    }
                                  }}
                                />
                              ))}
                            </Box>
                          </Box>
                        ) : (
                          <Typography variant='body2' color='text.secondary'>
                            -
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ minWidth: 200, width: 200, verticalAlign: 'top' }}>
                        {isReferenceField(field) && field.reference?.include ? (
                          field.reference.populate?.length ? (
                            <Typography variant='body2' fontWeight={600} sx={{ wordBreak: 'break-word' }}>
                              {field.reference.display?.trim() ? field.reference.display : '—'}
                            </Typography>
                          ) : (
                            <TextField
                              value={field.reference.display ?? ''}
                              onChange={e => handleRelationPropertyChange(index, e.target.value)}
                              size='small'
                              placeholder='Display'
                              fullWidth
                              variant='outlined'
                              sx={{ minWidth: 180 }}
                            />
                          )
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
                          <Chip label={fieldTypeLabel(field)} size='small' color='primary' variant='outlined' />
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

      <Dialog open={relationPicker.open} onClose={closeRelationPopulatePicker} maxWidth='md' fullWidth>
        <DialogTitle>İlişki alan seçimi</DialogTitle>
        <DialogContent>
          {relationPicker.loading ? <LinearProgress sx={{ my: 2 }} /> : null}
          {relationPicker.error ? (
            <Alert severity='error' sx={{ mt: 1 }}>
              {relationPicker.error}
            </Alert>
          ) : null}
          {!relationPicker.loading && !relationPicker.error && relationPicker.candidates.length > 0 ? (
            <>
              <FormLabel component='legend'>Alanlar</FormLabel>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${RELATION_FIELD_GRID_COLS}, minmax(0, 1fr))`,
                  columnGap: 1,
                  rowGap: 0.25,
                  mt: 1
                }}
              >
                {relationPicker.candidates.map(f => (
                  <FormControlLabel
                    key={f.name}
                    sx={{ m: 0, alignItems: 'center' }}
                    control={
                      <Checkbox
                        checked={Boolean(relationPicker.selected[f.name])}
                        onChange={e => toggleRelationPopulateCandidate(f.name, e.target.checked)}
                        size='small'
                      />
                    }
                    label={f.name}
                    componentsProps={{ typography: { variant: 'caption', noWrap: true } }}
                  />
                ))}
              </Box>
              <FormLabel component='legend' sx={{ mt: 2 }}>
                Display
              </FormLabel>
              <RadioGroup
                value={relationPicker.displayField}
                onChange={e => setRelationPicker(p => ({ ...p, displayField: e.target.value }))}
                sx={{ mt: 0.5 }}
              >
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${RELATION_FIELD_GRID_COLS}, minmax(0, 1fr))`,
                    columnGap: 1,
                    rowGap: 0.25
                  }}
                >
                  {relationPicker.candidates
                    .filter(f => relationPicker.selected[f.name])
                    .map(f => (
                      <FormControlLabel
                        key={f.name}
                        value={f.name}
                        sx={{ m: 0 }}
                        control={<Radio size='small' />}
                        label={f.name}
                        componentsProps={{ typography: { variant: 'caption', noWrap: true } }}
                      />
                    ))}
                </Box>
              </RadioGroup>
              {(() => {
                const display = relationPicker.candidates.find(f => f.name === relationPicker.displayField);
                return display && display.regexSearchable !== true ? (
                  <Alert severity='warning' sx={{ mt: 2 }}>
                    "{display.name}" hedef modelde regex filtreli aranabilir değil; admin panelde ilişki autocomplete'i bu alanda arama
                    yapamaz (sözleşme K3). Hedef modelin şema ayarında alanı Searchable + regex yapın.
                  </Alert>
                ) : null;
              })()}
            </>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeRelationPopulatePicker}>İptal</Button>
          <Button
            variant='contained'
            onClick={applyRelationPopulatePicker}
            disabled={relationPicker.loading || Boolean(relationPicker.error) || relationPicker.candidates.length === 0}
          >
            Uygula
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbarOpen} autoHideDuration={lastGeneratedBackendNotes.length ? 12000 : 4000} onClose={handleCloseSnackbar} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert onClose={handleCloseSnackbar} severity={snackbarSeverity} sx={{ width: '100%', whiteSpace: 'pre-line' }}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default SchemaDesignPage;
