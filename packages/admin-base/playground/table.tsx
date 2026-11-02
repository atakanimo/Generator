import { Button, Stack, TextField } from '@mui/material';
import type { GridColDef, GridPaginationModel } from '@mui/x-data-grid';
import { useEffect, useMemo, useState } from 'react';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import RestartAltOutlinedIcon from '@mui/icons-material/RestartAltOutlined';
import { GridRowButtons, RecordTable } from '../src/index.js';
import { pageUserSubscriptions, patchUserSubscription } from './mockBackend.js';

type Row = { id: string; status: string; provider: string; deepDiveDailyUsed: number; currentPeriodEnd: string; updatedAt: string };

/** Örnek: üstte düzenlenebilir istemci tablo (autoHeight), altta sunucu sayfalı + aksiyonlu tablo (fill). */
export function TableDemo() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize: 25 });
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(() => pageUserSubscriptions(0, 25));

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      setPage(pageUserSubscriptions(pagination.page, pagination.pageSize));
      setLoading(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [pagination, version]);

  const editable = useMemo(
    () => pageUserSubscriptions(0, 100).items.filter(row => !query || String(row.provider).includes(query)).slice(0, 8) as unknown as Row[],
    [query, version]
  );

  const editColumns: GridColDef<Row>[] = [
    { field: 'provider', headerName: 'Sağlayıcı', width: 140 },
    { field: 'deepDiveDailyUsed', headerName: 'Günlük kullanım', width: 150, editable: true },
    { field: 'updatedAt', headerName: 'Güncellendi', width: 200 }
  ];

  const columns: GridColDef<Row>[] = [
    { field: 'id', headerName: 'Id', width: 220 },
    { field: 'status', headerName: 'Durum', width: 140 },
    { field: 'deepDiveDailyUsed', headerName: 'Kullanım', width: 110 },
    { field: 'currentPeriodEnd', headerName: 'Dönem sonu', width: 200 }
  ];

  const renderActions = (row: Row) => (
    <GridRowButtons
      buttons={[
        {
          title: 'Kullanımı sıfırla',
          icon: <RestartAltOutlinedIcon fontSize='small' />,
          disabled: row.deepDiveDailyUsed === 0,
          onClick: () => {
            patchUserSubscription(row.id, { deepDiveDailyUsed: 0 });
            setVersion(v => v + 1);
          }
        },
        {
          title: 'İptal et',
          icon: <BlockOutlinedIcon fontSize='small' />,
          onClick: () => {
            patchUserSubscription(row.id, { status: 'canceled' });
            setVersion(v => v + 1);
          }
        }
      ]}
    />
  );

  return (
    <Stack spacing={3} sx={{ p: 3, height: '100%', minHeight: 0 }}>
      <RecordTable<Row>
        title='Düzenlenebilir (istemci)'
        toolbar={
          <Stack direction='row' spacing={1}>
            <TextField size='small' label='Sağlayıcı' value={query} onChange={event => setQuery(event.target.value)} />
            <Button variant='outlined' onClick={() => setQuery('')}>Temizle</Button>
          </Stack>
        }
        hints={[`${editable.length} satır${selected ? ` · seçili: ${selected}` : ''}`]}
        rows={editable}
        columns={editColumns}
        height='auto'
        maxHeight='40vh'
        pageSize={25}
        gridKey={`edit-${query}`}
        editMode='cell'
        processRowUpdate={next => {
          const used = Number(next.deepDiveDailyUsed);
          if (!Number.isInteger(used) || used < 0) throw new Error('negatif olamaz');
          const saved = patchUserSubscription(next.id, { deepDiveDailyUsed: used }) as unknown as Row;
          setVersion(v => v + 1);
          return saved;
        }}
        onProcessRowUpdateError={error => window.alert(String(error))}
      />
      <Stack sx={{ flex: 1, minHeight: 0 }}>
        <RecordTable<Row>
          title='Sunucu sayfalı'
          hints={[`Toplam ${page.total}`]}
          rows={page.items as unknown as Row[]}
          columns={columns}
          renderActions={renderActions}
          height='fill'
          loading={loading}
          rowCount={page.total}
          paginationModel={pagination}
          onPaginationModelChange={setPagination}
          onRowClick={({ row }) => setSelected(row.id)}
        />
      </Stack>
    </Stack>
  );
}
