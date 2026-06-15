# Admin UI Kuralları (StockExchange)

Bu belge, **admin** uygulamasında (`apps/admin`) iyi hissettiren layout, input, button ve tablo kalıplarını özetler. Referans sayfa: **Günlük Rapor Watchlist** — `DailyReportWatchlistAdminPage.tsx`.

Başka projedeki MUI generator çıktısı buraya **doğrudan kopyalanmaz**. Önce aşağıdaki sarmalayıcılar ve boyut kuralları kullanılır.

---

## Paketler ve import'lar

| Paket | Versiyon | Kullanım |
|-------|----------|----------|
| `@mui/material` | ^6.5.0 | Layout, `TextField`, `Button`, `Stack`, `Box`, `ThemeProvider` |
| `@mui/icons-material` | ^6.5.0 | İkonlar (`ContentCopyIcon` vb.) |
| `@mui/x-data-grid` | ^7.29.12 | Tablo — **`DataGrid`** (MUI `Table` değil) |
| `@emotion/react` / `@emotion/styled` | ^11.14 | MUI styling |

### Tablo — zorunlu import'lar

```tsx
// Sarmalayıcı (sayfada bunu kullan; ham DataGrid değil)
import { AdminTable } from '@/components/ui'

// Kolon tanımı
import type { GridColDef, GridRenderCellParams } from '@mui/x-data-grid'

// Sunucu sayfalama
import { useAdminServerPagination } from '@/hooks'
import type { GridPaginationModel } from '@mui/x-data-grid' // hook içinde
```

`AdminTable` içi (`components/ui/AdminTable.tsx`):

```tsx
import { Box } from '@mui/material'
import { DataGrid, type DataGridProps } from '@mui/x-data-grid'
```

### Tipografi — ham `Typography` yerine

```tsx
import { CoreText } from '@/components/ui'
// variant: 'headingMedium/semiBold' | 'bodySmall/regular' | 'labelBase/regular' ...
```

### Sayfa iskeleti

```tsx
import { AdminPageShell } from '@/components/AdminPageShell'
```

### Tema

```tsx
import { adminTheme } from '@/theme/adminTheme'
// App.tsx → <ThemeProvider theme={adminTheme}>
```

---

## Neden burada daha iyi hissediyor?

1. **Tam yükseklik flex zinciri** — tablo viewport'u doldurur, sayfa taşmaz.
2. **`size="small"` filtre input'ları** — toolbar kompakt; grid ile aynı ölçek.
3. **`minWidth` + `flexWrap`** — input'lar dar ekranda alt alta, genişte yan yana.
4. **`AdminTable` tek tip DataGrid stili** — header/cell font, border, `flex: 1`.
5. **`CoreText` tip ölçeği** — başlık / açıklama / hücre metni tutarlı.
6. **Draft → Apply filtre modeli** — her tuş vuruşunda API yok; kontrollü UX.

---

## Layout zinciri (responsive + tablo dolması)

```
html/body/#root  → height: 100%, overflow: hidden
AdminLayout      → height: 100vh, main: flex 1, minHeight: 0, p: { xs: 2, sm: 3 }
AdminPageShell   → flex column, flex: 1, minHeight: 0, width: 100%
AdminTable Box   → flex: 1, minHeight: 0
DataGrid         → sx: { flex: 1, minHeight: 0 }
```

**Kural:** Liste sayfalarında `AdminPageShell` + `AdminTable` birlikte kullan. Tablonun büyümesi için üst üste `minHeight: 0` ve `flex: 1` şart.

Drawer / AppBar (`AdminLayout.tsx`):

- `drawerWidth`: **304px**
- `toolbarHeight`: **64px**
- Mobil: `xs` temporary drawer; `sm+` permanent drawer
- Main padding: `xs: 2` (16px), `sm: 3` (24px)

---

## Tipografi (`CoreText` + `TypographyScale`)

| Kullanım | Variant | Ek stil |
|----------|---------|---------|
| Sayfa başlığı (`h1`) | `headingMedium/semiBold` | — |
| Intro / toplam satır / ipucu | `bodySmall/regular` | `color: 'text.secondary'`, `display: 'block'` |
| Grid hücre vurgu (ör. % değişim) | `labelBase/regular` | `color: 'success.main' \| 'error.main'` |
| Nav / drawer | `labelLarge/regular` | — |
| Login başlık | `headingSmall/semiBold` | — |

Ölçek dosyası: `components/ui/TypographyScale.ts`  
Örnek: `bodySmall` → `0.875rem / 1.25rem`, `labelBase` → `0.9375rem / 1.375rem`

**Yapma:** `variant="h4"`, `variant="body2"` gibi ham MUI typography variant'ları sayfa gövdesinde kullanma.

---

## Input kuralları (`TextField`)

### Filtre toolbar'ı (liste sayfaları)

| Özellik | Değer |
|---------|-------|
| `size` | **`"small"`** (zorunlu) |
| Genişlik | `sx={{ minWidth: N }}` — sabit `width` yerine tercih et |
| Tarih | `type="date"`, `InputLabelProps={{ shrink: true }}` |
| Select | `select` + `MenuItem` children |
| Uzun metin alanı | `sx={{ minWidth: 220, flex: 1 }}` |

**Günlük rapor sayfası referans `minWidth` değerleri:**

| Alan | minWidth |
|------|----------|
| Market select | 140 |
| Tarih from / to | 160 |
| Report ID | 220 (+ `flex: 1`) |
| Jobs job select | 260 |
| Market calendar market | 120 |
| Market calendar tarih | `width: 160` (sabit) |

### Form sayfası (login vb.)

- Filtre değilse `size` belirtme → **medium** (varsayılan)
- `fullWidth` + `Stack spacing={2}`

### Yükseklik hissi

MUI v6 `TextField size="small"` ≈ **40px** input yüksekliği; filtre barındaki **medium** `Button` ile hizalı görünür.

---

## Button kuralları

### Filtre satırı (DailyReportWatchlist örneği)

| Aksiyon | variant | size | color |
|---------|---------|------|-------|
| Filtre uygula | `outlined` | medium (varsayılan) | primary |
| Listeyi yenile | `text` | medium | primary |
| Tehlikeli toplu sil | `outlined` | medium | `error` |

### Grid içi aksiyon

```tsx
<Button size="small" variant="outlined" color="error">Sil</Button>
```

### Sayfa üstü birincil aksiyon (Markets, Calendar)

```tsx
<Button variant="contained">Ekle / Reseed</Button>
<Button variant="outlined">Yenile</Button>
```

### Jobs sayfası

- Birincil tetikle: `variant="contained" color="warning"`
- İkincil: `outlined` / `outlined color="secondary"`

**Yapma:** Filtre barında her butona `size="large"` verme. Grid içinde `size="medium"` kullanma (satır yüksekliğini şişirir).

---

## Tablo (`AdminTable` / MUI X DataGrid v7)

### Temel kullanım

```tsx
const { paginationModel, onPaginationModelChange, resetPage, skip, limit } =
  useAdminServerPagination(25)

<AdminTable
  tableKey={tableKey}           // filtre değişince remount — hayalet satır önleme
  rows={gridRows}               // her satırda stabil `id`
  columns={columns}
  pageSize={25}
  paginationMode="server"       // API sayfalama
  paginationModel={paginationModel}
  onPaginationModelChange={onPaginationModelChange}
  rowCount={totalFromApi}
  initialState={{ sorting: { sortModel: [...] } }}
/>
```

### Varsayılanlar (`AdminTable.tsx`)

- `pageSizeOptions`: `[25, 50, 100]`
- `disableRowSelectionOnClick`
- `paginationMode` default: `client` (sunucu listelerinde `server` geç)
- Border: `1px divider`, `borderRadius: 1`, `bgcolor: background.paper`
- Header: `fontSize: 0.8125rem`, `fontWeight: 600`
- Cell: `fontSize: 0.875rem`
- `admin-grid-cell-fill` class: hücre içi child'ların tam genişlikte hizalanması

### AdminTable kaynak kodu

Dosya: `apps/admin/src/components/ui/AdminTable.tsx`

```tsx
import { Box } from '@mui/material'
import { DataGrid, type DataGridProps } from '@mui/x-data-grid'

export type AdminTableProps = Pick<
  DataGridProps,
  | 'rows'
  | 'columns'
  | 'pageSizeOptions'
  | 'initialState'
  | 'paginationModel'
  | 'onPaginationModelChange'
  | 'paginationMode'
  | 'rowCount'
  | 'disableColumnSorting'
> & {
  pageSize?: number
  /** Filtre/değişimde grid'i sıfırdan mount et (hayalet satır önleme) */
  tableKey?: string
}

const defaultPageSizeOptions = [25, 50, 100]

export function AdminTable({
  rows,
  columns,
  pageSize = 100,
  pageSizeOptions = defaultPageSizeOptions,
  initialState,
  paginationModel,
  onPaginationModelChange,
  paginationMode = 'client',
  rowCount,
  tableKey,
  disableColumnSorting,
}: AdminTableProps) {
  const isServerPagination = paginationMode === 'server'
  const controlledPagination =
    paginationModel != null && onPaginationModelChange != null

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <DataGrid
        key={tableKey}
        rows={rows}
        columns={columns}
        disableRowSelectionOnClick
        disableColumnSorting={disableColumnSorting}
        paginationMode={paginationMode}
        rowCount={isServerPagination ? rowCount : undefined}
        pageSizeOptions={pageSizeOptions}
        initialState={
          controlledPagination
            ? { ...initialState }
            : {
                pagination: { paginationModel: { pageSize, page: 0 } },
                ...initialState,
              }
        }
        {...(controlledPagination
          ? { paginationModel, onPaginationModelChange }
          : {})}
        sx={{
          flex: 1,
          minHeight: 0,
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
          bgcolor: 'background.paper',
          '& .MuiDataGrid-columnHeaderTitle': {
            fontWeight: 600,
            fontSize: '0.8125rem',
          },
          '& .MuiDataGrid-cell': {
            fontSize: '0.875rem',
          },
          '& .admin-grid-cell-fill': {
            display: 'flex',
            alignItems: 'center',
            minWidth: 0,
            '& > *': {
              flex: 1,
              minWidth: 0,
              width: '100%',
            },
          },
        }}
      />
    </Box>
  )
}
```

**Notlar:**

- `tableKey` → `DataGrid` `key` prop'una gider; filtre/job değişince tam remount.
- `paginationModel` + `onPaginationModelChange` ikisi de verilirse kontrollü sayfalama; `initialState.pagination` yazılmaz.
- Sadece client sayfalama ise `pageSize` (default 100) `initialState` içine yazılır.
- `paginationMode="server"` iken `rowCount` zorunlu (API toplamı).

### Kolon tanımı — iki mod

**1) Sabit genişlik (yoğun finansal tablo — günlük rapor)**

```tsx
{ field: 'rank', headerName: '...', width: 64, type: 'number' }
{ field: 'ticker', width: 110 }
{ field: 'alphaScore', width: 88, valueFormatter: ... }
```

Tipik aralık: **64–150px** dar kolonlar; aksiyon kolonu **~100–110px**.

**2) Esnek genişlik (dinamik API kolonları)**

```tsx
import { buildDynamicColumns } from '@/lib/adminTableColumns'

buildDynamicColumns(rows, {
  emptyLabel: t('common.empty'),
  minWidth: 110,              // Markets: 120
  preferredOrder: [...],       // kolon sırası sabit kalsın
  extraColumns: [editColumn],
})
// → flex: 1, minWidth: 110 (tarih alanı: minWidth 132)
```

### Özel hücre bileşenleri

| Bileşen | Dosya | Ne zaman |
|---------|-------|----------|
| `CopyIdCell` | `components/CopyIdCell.tsx` | Kısaltılmış ID + kopyala |
| `AdminGridEllipsis` | `components/AdminGridEllipsis.tsx` | Uzun metin, tooltip + ellipsis |
| `CoreText` | `renderCell` içinde | Renkli sayı / yüzde |
| `Stack` + `height: '100%'` | aksiyon kolonu | Dikey hizalı buton |

`renderCell` içinde `GridRenderCellParams<RowType>` tipini kullan.

### Satır `id`

```tsx
import { pickRowId } from '@/lib/dataGridId'
rows.map((r, i) => ({ id: pickRowId(r, i, ['runDate', 'job', 'market']), ...r }))
// veya domain id: { id: r.id, ...r }
```

---

## Filtre state kalıbı (server listeler)

```tsx
// Draft — input'lara bağlı
const [draftMarket, setDraftMarket] = useState(FILTER_ALL)
// Applied — API'ye giden
const [appliedMarket, setAppliedMarket] = useState(FILTER_ALL)

const applyFilters = () => {
  setAppliedMarket(draftMarket)
  resetPage()  // sayfa 0'a dön
}

const tableKey = `${appliedMarket}:${appliedReportId}:...`  // grid remount
```

Fetch `useEffect` yalnızca **applied** değerler + `skip` / `limit` ile tetiklenir.

---

## Responsive kalıplar

```tsx
// Filtre barı — günlük rapor
<Stack direction={{ xs: 'column', md: 'row' }} spacing={2} flexWrap="wrap">

// Filtre barı — jobs
<Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} flexWrap="wrap">

// Başlık + aksiyonlar
<Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
```

- `xs`: input'lar tam genişlik (column)
- `sm` / `md+`: yatay toolbar
- `flexWrap="wrap"`: taşan filtreler alt satıra iner
- Uzun alanlarda `flex: 1` ile kalan boşluğu doldur

---

## Tema özeti (`adminTheme.ts`)

| Token | Değer |
|-------|-------|
| `palette.primary.main` | `#2563eb` |
| `palette.background.default` | `#f8fafc` |
| `palette.background.paper` | `#ffffff` |
| `typography.fontFamily` | Inter, system-ui |
| `shape.borderRadius` | **10** |

---

## Yeni admin liste sayfası şablonu

```tsx
export function ExampleAdminPage() {
  const { t } = useCustomTranslation()
  const { paginationModel, onPaginationModelChange, resetPage, skip, limit } =
    useAdminServerPagination(25)

  return (
    <AdminPageShell sx={{ gap: 2 }}>
      <CoreText variant="headingMedium/semiBold" component="h1">
        {t('pages.example.title')}
      </CoreText>
      <CoreText variant="bodySmall/regular" sx={{ color: 'text.secondary', display: 'block' }}>
        {t('pages.example.intro')}
      </CoreText>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} flexWrap="wrap" sx={{ mb: 2 }}>
        <TextField select size="small" label="..." sx={{ minWidth: 140 }}>
          <MenuItem value="...">...</MenuItem>
        </TextField>
        <Button variant="outlined" onClick={applyFilters}>...</Button>
        <Button variant="text" onClick={refresh}>...</Button>
      </Stack>

      <CoreText variant="bodySmall/regular" sx={{ color: 'text.secondary', display: 'block' }}>
        {t('pages.example.totalRows', { total })}
      </CoreText>

      <AdminTable
        tableKey={tableKey}
        rows={gridRows}
        columns={columns}
        pageSize={25}
        paginationMode="server"
        paginationModel={paginationModel}
        onPaginationModelChange={onPaginationModelChange}
        rowCount={total}
      />
    </AdminPageShell>
  )
}
```

---

## Generator / başka projeden taşırken yapma listesi

| Yapma | Bunun yerine |
|-------|----------------|
| `@mui/material` `Table` / `TableContainer` | `@mui/x-data-grid` → `AdminTable` |
| Ham `DataGrid` sayfada | `AdminTable` sarmalayıcı |
| `Typography variant="h5/body1"` | `CoreText` + `TypographyScale` |
| Filtre `TextField` without `size="small"` | `size="small"` + `minWidth` |
| Her input'a sabit `width: 300` | `minWidth` + `flex: 1` (gerekirse) |
| Filtre değişince anında fetch | draft / applied + `applyFilters` |
| `tableKey` olmadan server filtre | `tableKey` ile remount |
| Grid'de `size="medium"` action button | `size="small"` |
| `try_claim` / eski pagination state | `useAdminServerPagination` |

---

## Dosya haritası

```
apps/admin/src/
  components/ui/
    AdminTable.tsx      ← DataGrid sarmalayıcı
    CoreText.tsx        ← tipografi
    TypographyScale.ts  ← font ölçeği
    index.ts
  components/
    AdminPageShell.tsx
    CopyIdCell.tsx
    AdminGridEllipsis.tsx
  hooks/
    useAdminServerPagination.ts
  lib/
    adminTableColumns.ts  ← buildDynamicColumns
    dataGridId.ts         ← pickRowId
  theme/adminTheme.ts
  pages/DailyReportWatchlistAdminPage.tsx  ← referans sayfa
```

---

## Hızlı kontrol listesi (PR / generator çıktısı)

- [ ] `@mui/x-data-grid` v7 + `AdminTable` kullanıldı mı?
- [ ] Filtre `TextField` hepsi `size="small"` mı?
- [ ] `minWidth` değerleri makul mü (140 / 160 / 220)?
- [ ] `Stack direction={{ xs: 'column', md: 'row' }}` + `flexWrap` var mı?
- [ ] Başlık `CoreText headingMedium/semiBold` mı?
- [ ] Sunucu listesinde `useAdminServerPagination(25)` + `tableKey` var mı?
- [ ] Grid aksiyon butonları `size="small"` mı?
- [ ] `AdminPageShell` ile sarıldı mı?
