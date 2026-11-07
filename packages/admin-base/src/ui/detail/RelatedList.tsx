import { Box, Typography } from '@mui/material';
import type { GridPaginationModel } from '@mui/x-data-grid';
import { useMemo, useState } from 'react';
import { useAtaAdmin } from '../../react/context.js';
import { useResourceList } from '../../react/hooks.js';
import type { AnyResource, RelatedListOptions, RowAction } from '../../schema/extend.js';
import { ActionInputDialog, ConfirmDialog, RowActions, rowActionsWidth, splitActions, useExecuteAction } from '../actions/actions.js';
import { buildColumns } from '../table/columns.js';
import { RecordTable } from '../table/RecordTable.js';
import { useAdminTexts } from '../useAdminTexts.js';

type Row = { id: string } & Record<string, unknown>;

export interface RelatedListProps {
  options: RelatedListOptions<any>;
  /** Detayı açık kayıt. */
  row: Row;
  /** Aksiyon sonrası detayın resource'unu yeniler (ör. iade etkinliğin paketini değiştirir). */
  onChanged: () => Promise<void>;
  onOpenJson: (title: string, value: unknown) => void;
}

/** `detail.related`: hedef resource'un `filters(row)` ile süzülmüş tablosu ve satır aksiyonları. */
export function RelatedList({ options, row, onChanged, onOpenJson }: RelatedListProps) {
  const { resources } = useAtaAdmin();
  const target = resources.get(options.resource);
  if (!target) throw new Error(`[ata-admin-base] detail.related: "${options.resource}" resource registry'de yok.`);
  return <RelatedTable target={target} options={options} row={row} onChanged={onChanged} onOpenJson={onOpenJson} />;
}

function RelatedTable({ target, options, row, onChanged, onOpenJson }: RelatedListProps & { target: AnyResource }) {
  const texts = useAdminTexts();
  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize: options.pageSize ?? 10 });
  const [pending, setPending] = useState<{ action: RowAction<Row>; row: Row } | null>(null);
  // `filters(row)` her render'da yeni obje döner; sorgu içerik değişince değişir.
  const filtersKey = JSON.stringify(options.filters(row));
  const body = useMemo(
    () => ({
      filters: JSON.parse(filtersKey) as Record<string, unknown>,
      page: pagination.page + 1,
      limit: pagination.pageSize,
      ...(target.defaultSort ? { sortBy: target.defaultSort.field, sortOrder: target.defaultSort.order } : {})
    }),
    [filtersKey, pagination, target.defaultSort]
  );
  const list = useResourceList(target, body, { background: true });
  const executeAction = useExecuteAction(target);
  // İç içe drawer yok: hedefin `detail` aksiyonları da satırda.
  const actions = useMemo(() => splitActions(target.extensions?.actions ?? [], false).rowActions, [target.extensions?.actions]);

  const columns = useMemo(() => {
    const all = buildColumns({
      resource: target,
      texts,
      onOpenJson,
      actionsWidth: rowActionsWidth(actions.length),
      renderActions: actions.length > 0
        ? r => <RowActions row={r} actions={actions} onAction={action => setPending({ action, row: r })} />
        : undefined
    });
    if (!options.fields) return all;
    const order = new Map(options.fields.map((name, index) => [name, index]));
    return all
      .filter(c => c.field === '__actions' || order.has(c.field))
      .sort((a, b) => (order.get(a.field) ?? -1) - (order.get(b.field) ?? -1));
  }, [target, texts, onOpenJson, actions, options.fields]);

  const run = async (input: Record<string, unknown>) => {
    if (!pending) return;
    await executeAction(pending, input, body);
    await onChanged();
  };

  return (
    <Box>
      <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, mb: 1 }}>
        {options.title ? texts.literal(options.title) : texts.resourceTitle(target)}
        <Typography component='span' sx={{ ml: 1, fontSize: '0.8125rem', color: 'text.secondary' }}>
          {texts.text('total', { count: list.data?.total ?? 0 })}
        </Typography>
      </Typography>
      <RecordTable<Row>
        rows={(list.data?.items ?? []) as Row[]}
        columns={columns}
        loading={list.isFetching}
        height='auto'
        rowCount={list.data?.total ?? 0}
        paginationModel={pagination}
        onPaginationModelChange={setPagination}
        pageSizeOptions={[pagination.pageSize]}
        disableColumnSorting
      />
      {pending && pending.action.input?.length ? (
        <ActionInputDialog resource={target} action={pending.action} onSubmit={run} onClose={() => setPending(null)} />
      ) : null}
      {pending && !pending.action.input?.length ? (
        <ConfirmDialog
          open
          title={texts.literal(pending.action.confirm?.title ?? pending.action.label)}
          description={pending.action.confirm?.description ? texts.literal(pending.action.confirm.description) : undefined}
          confirmLabel={texts.literal(pending.action.label)}
          onConfirm={() => run({})}
          onClose={() => setPending(null)}
        />
      ) : null}
    </Box>
  );
}
