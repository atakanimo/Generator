import AddIcon from '@mui/icons-material/Add';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import {
  DataGrid,
  type GridPaginationModel,
  type GridRowSelectionModel,
  type GridSortModel
} from '@mui/x-data-grid';
import { trTR } from '@mui/x-data-grid/locales';
import { useMemo, useState } from 'react';
import type { Id, ListBody } from '../contract/api.js';
import { useResourceList, useResourceMutations } from '../react/hooks.js';
import { detailViewOptions, type AnyResource, type CollectionAction, type RowAction } from '../schema/extend.js';
import { canPerform, recordTitle } from '../schema/resource.js';
import {
  ActionInputDialog,
  ConfirmDialog,
  RowActions,
  collectionActionState,
  rowActionsWidth,
  splitActions,
  useExecuteAction,
  type PendingAction
} from './actions/actions.js';
import { ExportDialog } from './actions/ExportDialog.js';
import { ResourceDetailDrawer } from './detail/ResourceDetailDrawer.js';
import { FilterBar } from './filters/FilterBar.js';
import { ResourceFormDrawer } from './form/ResourceFormDrawer.js';
import type { FormMode } from './form/values.js';
import { buildColumns } from './table/columns.js';
import { JsonDialog, type JsonDialogState } from './table/JsonDialog.js';
import { useAdminTexts } from './useAdminTexts.js';

type Row = { id: string } & Record<string, unknown>;

const PAGE_SIZE_OPTIONS = [25, 50, 100];
const EMPTY_SELECTION: GridRowSelectionModel = { type: 'include', ids: new Set() };

export interface ResourcePageProps {
  resource: AnyResource;
}

/**
 * Bir resource'un admin sayfası: başlık + toolbar, filtreler, sunucu taraflı tablo,
 * Drawer form, silme onayı ve custom action'lar. Hepsi config'ten.
 */
export function ResourcePage({ resource }: ResourcePageProps) {
  const texts = useAdminTexts();
  const { text } = texts;
  const slots = resource.extensions?.slots ?? {};
  const detail = useMemo(() => detailViewOptions(resource.extensions), [resource.extensions]);
  const declaredActions = resource.extensions?.actions;
  const { rowActions, detailActions, toolbarActions, bulkActions } = useMemo(
    () => splitActions(declaredActions ?? [], detail !== null),
    [declaredActions, detail]
  );

  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize: resource.pageSize ?? 25 });
  const [sortModel, setSortModel] = useState<GridSortModel>(
    resource.defaultSort && resource.sortable !== false
      ? [{ field: resource.defaultSort.field, sort: resource.defaultSort.order }]
      : []
  );
  const [filters, setFilters] = useState<Record<string, unknown>>({});
  const [selection, setSelection] = useState<GridRowSelectionModel>(EMPTY_SELECTION);
  const [form, setForm] = useState<{ mode: FormMode; row?: Row } | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [viewing, setViewing] = useState<Row | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [json, setJson] = useState<JsonDialogState | null>(null);
  const [exporting, setExporting] = useState(false);

  const body: ListBody = useMemo(() => {
    const sort = sortModel[0];
    return {
      ...(Object.keys(filters).length > 0 ? { filters } : {}),
      page: pagination.page + 1,
      limit: pagination.pageSize,
      ...(sort?.sort ? { sortBy: sort.field, sortOrder: sort.sort } : {})
    };
  }, [filters, pagination, sortModel]);

  const list = useResourceList(resource, body);
  const rows = (list.data?.items ?? []) as Row[];
  const { create, update, remove } = useResourceMutations(resource);
  const executeAction = useExecuteAction(resource);

  const selectedIds: Id[] = useMemo(
    () =>
      selection.type === 'include'
        ? [...selection.ids].map(String)
        : rows.map(r => r.id).filter(id => !selection.ids.has(id)),
    [selection, rows]
  );

  const canCreate = canPerform(resource, 'create');
  const canUpdate = canPerform(resource, 'update');
  const canDelete = canPerform(resource, 'delete');
  const canExport = canPerform(resource, 'export');

  const startAction = (next: PendingAction) => {
    if (next.action.input?.length || next.action.confirm) {
      setPending(next);
      return;
    }
    void executeAction(next, {}, body).catch(() => undefined);
  };

  const columns = useMemo(
    () =>
      buildColumns({
        resource,
        texts,
        onOpenJson: (title, value) => setJson({ title, value }),
        actionsWidth: rowActionsWidth(rowActions.length + (detail ? 1 : 0) + (canUpdate ? 1 : 0) + (canDelete ? 1 : 0)),
        renderActions:
          rowActions.length > 0 || detail || canUpdate || canDelete
            ? row => (
                <RowActions
                  row={row}
                  actions={rowActions}
                  onView={detail ? () => setViewing(row) : undefined}
                  onEdit={canUpdate ? () => setForm({ mode: 'edit', row }) : undefined}
                  onDelete={canDelete ? () => setDeleting(row) : undefined}
                  onAction={(action: RowAction<Row>) => startAction({ action, row })}
                />
              )
            : undefined
      }),
    // startAction `body`'yi kapsar; kolonlar liste isteği değişince yeniden kurulur.
    [resource, texts, rowActions, detail, canUpdate, canDelete, body]
  );

  const actionState = { listBody: body, selectedIds };
  const collectionButton = (action: CollectionAction<Row>) => {
    const { visible, disabled } = collectionActionState(action, actionState);
    return visible ? (
      <Button key={action.id} variant='outlined' startIcon={action.icon} disabled={disabled}
        onClick={() => startAction({ action, selectedIds })}>
        {texts.literal(action.label)}
      </Button>
    ) : null;
  };

  const applyFilters = (next: Record<string, unknown>) => {
    setFilters(next);
    setPagination(prev => ({ ...prev, page: 0 }));
    setSelection(EMPTY_SELECTION);
  };

  const ToolbarStart = slots.toolbarStart;
  const AboveTable = slots.aboveTable;
  const BelowTable = slots.belowTable;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0, width: '100%', overflow: 'hidden', gap: 2 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ flexShrink: 0, alignItems: { sm: 'center' } }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component='h1' sx={{ fontSize: '1.25rem', fontWeight: 600 }}>
            {texts.resourceTitle(resource)}
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
            {text('total', { count: list.data?.total ?? 0 })}
          </Typography>
        </Box>
        <Stack direction='row' spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
          {ToolbarStart ? <ToolbarStart /> : null}
          {selectedIds.length > 0 ? (
            <>
              <Chip size='small' label={text('selected', { count: selectedIds.length })} />
              {bulkActions.map(collectionButton)}
            </>
          ) : null}
          {toolbarActions.map(collectionButton)}
          {canExport ? (
            <Button variant='outlined' startIcon={<FileDownloadOutlinedIcon />} onClick={() => setExporting(true)}>
              {text('export')}
            </Button>
          ) : null}
          {canCreate ? (
            <Button variant='contained' startIcon={<AddIcon />} onClick={() => setForm({ mode: 'create' })}>
              {text('create')}
            </Button>
          ) : null}
        </Stack>
      </Stack>

      <Box sx={{ flexShrink: 0, minWidth: 0 }}>
        <FilterBar resource={resource} onApply={applyFilters} />
      </Box>

      {AboveTable ? <AboveTable /> : null}

      <Box sx={{ flex: 1, minHeight: 0, width: '100%', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <DataGrid<Row>
          rows={rows}
          columns={columns}
          getRowId={row => row.id}
          rowCount={list.data?.total ?? 0}
          paginationMode='server'
          sortingMode='server'
          paginationModel={pagination}
          onPaginationModelChange={setPagination}
          sortModel={sortModel}
          onSortModelChange={next => {
            setSortModel(next);
            setPagination(prev => ({ ...prev, page: 0 }));
          }}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          checkboxSelection={bulkActions.length > 0}
          rowSelectionModel={selection}
          onRowSelectionModelChange={setSelection}
          disableRowSelectionOnClick
          disableColumnFilter
          localeText={{
            ...trTR.components.MuiDataGrid.defaultProps.localeText,
            noRowsLabel: list.isFetching ? '' : text('noRows'),
            paginationRowsPerPage: text('rowsPerPage'),
            paginationDisplayedRows: ({ from, to, count }) => text('displayedRows', { from, to, count: count === -1 ? '?' : count })
          }}
          sx={{
            flex: 1,
            minHeight: 320,
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            bgcolor: 'background.paper',
            // Header like the reference admin (DataGrid v7 look): page background behind headers, semi-bold 13px titles
            '& .MuiDataGrid-columnHeader, & .MuiDataGrid-filler, & .MuiDataGrid-scrollbarFiller--header': { bgcolor: 'background.default' },
            '& .MuiDataGrid-columnHeaderTitle': { fontWeight: 600, fontSize: '0.8125rem' },
            '& .MuiDataGrid-cell': { display: 'flex', alignItems: 'center', fontSize: '0.875rem' }
          }}
        />
      </Box>

      {BelowTable ? <BelowTable /> : null}

      {detail ? (
        // Form ve onay pencereleri bundan sonra render edilir: drawer açıkken üstte kalırlar.
        <ResourceDetailDrawer
          resource={resource}
          row={viewing}
          options={detail}
          actions={detailActions}
          onAction={(action, row) => startAction({ action, row })}
          onEdit={canUpdate ? row => {
            setViewing(null);
            setForm({ mode: 'edit', row });
          } : undefined}
          onDelete={canDelete ? row => setDeleting(row) : undefined}
          onOpenJson={(title, value) => setJson({ title, value })}
          onClose={() => setViewing(null)}
        />
      ) : null}

      <ResourceFormDrawer
        resource={resource}
        open={form !== null}
        mode={form?.mode ?? 'create'}
        row={form?.row}
        onClose={() => setForm(null)}
        onSubmit={values =>
          form?.mode === 'edit' && form.row
            ? update.mutateAsync({ id: form.row.id, data: values })
            : create.mutateAsync(values)
        }
      />

      <ConfirmDialog
        open={deleting !== null}
        title={(name => (name ? text('deleteTitleNamed', { name }) : text('deleteTitle')))(deleting ? recordTitle(resource, deleting) : undefined)}
        description={text('deleteDescription')}
        confirmLabel={text('delete')}
        onConfirm={async () => {
          const id = deleting!.id;
          await remove.mutateAsync(id);
          setViewing(prev => (prev?.id === id ? null : prev));
        }}
        onClose={() => setDeleting(null)}
      />

      {pending && pending.action.input?.length ? (
        <ActionInputDialog
          resource={resource}
          action={pending.action}
          onSubmit={input => executeAction(pending, input, body)}
          onClose={() => setPending(null)}
        />
      ) : null}

      {pending && !pending.action.input?.length ? (
        <ConfirmDialog
          open
          title={texts.literal(pending.action.confirm?.title ?? pending.action.label)}
          description={pending.action.confirm?.description ? texts.literal(pending.action.confirm.description) : undefined}
          confirmLabel={texts.literal(pending.action.label)}
          onConfirm={() => executeAction(pending, {}, body)}
          onClose={() => setPending(null)}
        />
      ) : null}

      {exporting ? <ExportDialog resource={resource} listBody={body} onClose={() => setExporting(false)} /> : null}

      <JsonDialog state={json} onClose={() => setJson(null)} />
    </Box>
  );
}
