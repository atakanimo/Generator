import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import CloseIcon from '@mui/icons-material/Close';
import { Box, Button, Divider, Drawer, IconButton, Stack, Typography } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { resourceKeys, useResourceOne } from '../../react/hooks.js';
import type { AnyResource, DetailViewOptions, RowAction } from '../../schema/extend.js';
import { IdCell, ValueCell } from '../table/cells.js';
import { fieldLabelKey, useAdminTexts } from '../useAdminTexts.js';

type Row = { id: string } & Record<string, unknown>;

export interface ResourceDetailDrawerProps {
  resource: AnyResource;
  /** Açık olan satır; `null` → kapalı. */
  row: Row | null;
  options: DetailViewOptions<Row>;
  /** `placement: 'detail'` aksiyonları. */
  actions: readonly RowAction<Row>[];
  onAction: (action: RowAction<Row>, row: Row) => void;
  onEdit?: (row: Row) => void;
  onDelete?: (row: Row) => void;
  onOpenJson: (title: string, value: unknown) => void;
  onClose: () => void;
}

/** Salt okunur kayıt görünümü — form drawer'ı ile aynı yerden (sağdan) açılır. */
export function ResourceDetailDrawer(props: ResourceDetailDrawerProps) {
  return (
    <Drawer anchor='right' open={props.row !== null} onClose={props.onClose} sx={{ zIndex: theme => theme.zIndex.modal }}
      slotProps={{ paper: { sx: { width: { xs: '100%', sm: 560 } } } }}>
      {props.row ? <DetailBody {...props} row={props.row} /> : null}
    </Drawer>
  );
}

function DetailBody({ resource, row, options, actions, onAction, onEdit, onDelete, onOpenJson, onClose }: ResourceDetailDrawerProps & { row: Row }) {
  const texts = useAdminTexts();
  const queryClient = useQueryClient();
  const fetch = options.fetch !== false;
  const one = useResourceOne(resource, fetch ? row.id : undefined);
  // Kayıt gelene kadar (ya da `fetch: false`) listedeki satır gösterilir.
  const current = (fetch ? (one.data as Row | undefined) : undefined) ?? row;
  const overrides = resource.extensions?.fields ?? {};
  const fields = options.hideFields ? [] : resource.fields.filter(f => !f.writeOnly);
  const Extra = options.component;
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: resourceKeys.all(resource.name) });
  };
  const visibleActions = actions.filter(action => action.visible?.(current) ?? true);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Stack direction='row' alignItems='center' sx={{ px: 2, py: 1.5 }}>
        <Typography sx={{ flex: 1, fontSize: '1.125rem', fontWeight: 600 }}>
          {texts.text('detailTitle', { resource: texts.resourceTitle(resource) })}
        </Typography>
        <IconButton size='small' onClick={onClose} aria-label={texts.text('close')}>
          <CloseIcon fontSize='small' />
        </IconButton>
      </Stack>
      <Divider />
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        <Stack spacing={1.5}>
          {options.hideFields ? null : (
            <DetailItem label='ID'>
              <IdCell id={current.id} />
            </DetailItem>
          )}
          {fields.map(field => {
            const Cell = overrides[field.name]?.cell;
            return (
              <DetailItem key={field.name} label={texts.fieldLabel(fieldLabelKey(resource, [field.name]), field)}>
                {Cell ? (
                  <Cell row={current} value={current[field.name]} />
                ) : (
                  <ValueCell resource={resource} field={field} value={current[field.name]} onOpenJson={onOpenJson} />
                )}
              </DetailItem>
            );
          })}
          {Extra ? <Extra row={current} refresh={refresh} close={onClose} /> : null}
        </Stack>
      </Box>
      {visibleActions.length > 0 || onEdit || onDelete ? (
        <>
          <Divider />
          <Stack direction='row' spacing={1} useFlexGap sx={{ px: 2, py: 1.5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {visibleActions.map(action => (
              <Button key={action.id} variant='outlined' startIcon={action.icon ?? <BoltOutlinedIcon fontSize='small' />}
                disabled={action.disabled?.(current) ?? false} onClick={() => onAction(action, current)}>
                {texts.literal(action.label)}
              </Button>
            ))}
            {onDelete ? (
              <Button variant='outlined' color='error' onClick={() => onDelete(current)}>
                {texts.text('delete')}
              </Button>
            ) : null}
            {onEdit ? (
              <Button variant='contained' onClick={() => onEdit(current)}>
                {texts.text('edit')}
              </Button>
            ) : null}
          </Stack>
        </>
      ) : null}
    </Box>
  );
}

function DetailItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mb: 0.25 }}>{label}</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', minHeight: 24, minWidth: 0 }}>{children}</Box>
    </Box>
  );
}
