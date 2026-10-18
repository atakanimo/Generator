import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, IconButton, Tooltip } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import type { Id, ListBody } from '../../contract/api.js';
import { resourceKeys, useResourceApi } from '../../react/hooks.js';
import type { AnyResource, CollectionAction, ResourceAction, RowAction } from '../../schema/extend.js';
import { FormFields } from '../form/FormFields.js';
import { formValuesToBody, initialFormValues } from '../form/values.js';
import { useAdminTexts } from '../useAdminTexts.js';

type Row = { id: string } & Record<string, unknown>;

export type PendingAction =
  | { action: RowAction<Row>; row: Row }
  | { action: CollectionAction<Row>; selectedIds: Id[] };

export function isRowAction(action: ResourceAction<Row>): action is RowAction<Row> {
  return action.placement === 'row' || action.placement === 'detail';
}

/** `run` yoksa sözleşmedeki action endpoint'i çağrılır; sonra resource sorguları yenilenir. */
export function useExecuteAction(resource: AnyResource) {
  const api = useResourceApi(resource);
  const queryClient = useQueryClient();
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: resourceKeys.all(resource.name) });
  };

  return async (pending: PendingAction, input: Record<string, unknown>, listBody: ListBody) => {
    if ('row' in pending) {
      const { action, row } = pending;
      if (action.run) await action.run({ row, input, api, refresh });
      else await api.action(action.id, { id: row.id, input });
    } else {
      const { action, selectedIds } = pending;
      if (action.run) await action.run({ selectedIds, input, listBody, api, refresh });
      else await api.action(action.id, { ids: selectedIds, input });
    }
    await refresh();
  };
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  onConfirm: () => Promise<unknown>;
  onClose: () => void;
}

export function ConfirmDialog({ open, title, description, confirmLabel, onConfirm, onClose }: ConfirmDialogProps) {
  const { text } = useAdminTexts();
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } catch {
      // API hatası host toast'unda.
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth='xs' fullWidth>
      <DialogTitle sx={{ fontSize: '1.125rem', fontWeight: 600 }}>{title}</DialogTitle>
      {description ? (
        <DialogContent>
          <DialogContentText sx={{ fontSize: '0.875rem' }}>{description}</DialogContentText>
        </DialogContent>
      ) : null}
      <DialogActions>
        <Button onClick={onClose}>{text('cancel')}</Button>
        <Button variant='contained' onClick={confirm} disabled={busy}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export interface ActionInputDialogProps {
  resource: AnyResource;
  action: ResourceAction<Row>;
  onSubmit: (input: Record<string, unknown>) => Promise<unknown>;
  onClose: () => void;
}

/** `input` tanımlı action'lar için küçük form; alanlar entity formuyla aynı bileşenlerle çizilir. */
export function ActionInputDialog({ resource, action, onSubmit, onClose }: ActionInputDialogProps) {
  const texts = useAdminTexts();
  const fields = action.input ?? [];
  const methods = useForm({ defaultValues: initialFormValues(fields, 'create') });
  const submit = methods.handleSubmit(async values => {
    try {
      await onSubmit(formValuesToBody(fields, values, 'create'));
      onClose();
    } catch {
      // API hatası host toast'unda; form açık kalır.
    }
  });

  return (
    <Dialog open onClose={onClose} maxWidth='sm' fullWidth>
      <FormProvider {...methods}>
        <Box component='form' noValidate onSubmit={submit}>
          <DialogTitle sx={{ fontSize: '1.125rem', fontWeight: 600 }}>
            {texts.literal(action.confirm?.title ?? action.label)}
          </DialogTitle>
          <DialogContent dividers>
            {action.confirm?.description ? (
              <DialogContentText sx={{ fontSize: '0.875rem', mb: 2 }}>{texts.literal(action.confirm.description)}</DialogContentText>
            ) : null}
            <FormFields resource={resource} fields={fields} mode='create' topLevel={false}
              labelBase={`admin.${resource.name}.actions.${action.id}.fields`} />
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>{texts.text('cancel')}</Button>
            <Button variant='contained' type='submit' disabled={methods.formState.isSubmitting}>
              {texts.literal(action.label)}
            </Button>
          </DialogActions>
        </Box>
      </FormProvider>
    </Dialog>
  );
}

export interface RowActionsProps {
  row: Row;
  actions: readonly RowAction<Row>[];
  onEdit?: () => void;
  onDelete?: () => void;
  onAction: (action: RowAction<Row>) => void;
}

/** Satır işlemleri: `IconButton size="small"` (admin-ui kuralı). */
export function RowActions({ row, actions, onEdit, onDelete, onAction }: RowActionsProps) {
  const texts = useAdminTexts();
  const icon = (title: string, node: ReactNode, onClick: () => void, disabled?: boolean) => (
    <Tooltip title={title} key={title}>
      <span>
        <IconButton size='small' aria-label={title} disabled={disabled} onClick={event => {
          event.stopPropagation();
          onClick();
        }}>
          {node}
        </IconButton>
      </span>
    </Tooltip>
  );

  return (
    <Box sx={{ display: 'flex', justifyContent: 'flex-start', width: '100%' }}>
      {actions
        .filter(action => action.visible?.(row) ?? true)
        .map(action =>
          icon(texts.literal(action.label), action.icon ?? <BoltOutlinedIcon fontSize='small' />, () => onAction(action),
            action.disabled?.(row) ?? false)
        )}
      {onEdit ? icon(texts.text('edit'), <EditOutlinedIcon fontSize='small' />, onEdit) : null}
      {onDelete ? icon(texts.text('delete'), <DeleteOutlineIcon fontSize='small' />, onDelete) : null}
    </Box>
  );
}

export function rowActionsWidth(actionCount: number): number {
  return Math.max(88, actionCount * 36 + 20);
}
