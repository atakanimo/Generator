# Generator Admin UI Kuralları (Local)

Bu belge, **Generator** projesinin ürettiği admin frontend çıktısı için hedef UI standardını tanımlar. Kaynak referans: başka projedeki StockExchange admin (`UIRule.md`).

**Kapsam:** Generator ile basılan tüm UI sayfaları bu projede **admin** kabul edilir. Kurallar yalnızca admin çıktısına uygulanır.

**Üretilmeyecek:** `AdminPageShell`, `AdminLayout` ve benzeri layout kabukları generator tarafından yazılmaz — hedef projede zaten vardır veya proje kendi layout'unu yönetir. Generator yalnızca entity sayfa / tablo / modal / core bileşenleri üretir.

---

## Mevcut durum vs hedef

| Alan | Şu an (generator) | Hedef |
|------|-------------------|-------|
| Tablo | MUI `Table` + `CoreTable` | `@mui/x-data-grid` v7 + `AdminTable` sarmalayıcı |
| Sayfa kabuğu | `Container` + viewport yükseklik hesabı | Mevcut layout'a uyum; **AdminPageShell üretilmez** |
| Sayfalama | `useState(page)` + `TablePagination` | `useAdminServerPagination` hook |
| Filtre state | `draftFilters` / `appliedFilters` | Aynı kalır ✅ |
| `tableKey` remount | Yok | Applied filtrelerden string → `DataGrid` `key` |
| Filtre layout | `GridLegacy` container | `Stack` + `flexWrap` + responsive `direction` |
| Filtre butonları | Search `contained`, Reset `outlined error` | Apply `outlined`, Reset `text` (referans) |
| Satır aksiyonları | `IconButton size="small"` | **Aynı kalır** — boyutlar referansla hizalanır |
| Kolon genişliği | `tableLayout: auto`, sabit maxWidth | Şemadan otomatik `width` / `flex` + **default `minWidth`** |
| Tipografi | `CoreText` + `TypographyScale` | Aynı kalır ✅ |

---

## Paketler

Hedef projede (generator çıktısının yazıldığı admin app) şunlar gerekir:

| Paket | Versiyon (referans) | Kullanım |
|-------|---------------------|----------|
| `@mui/material` | ^6.x | Layout, `TextField`, `Button`, `Stack`, `Box` |
| `@mui/icons-material` | ^6.x | İkonlar |
| `@mui/x-data-grid` | ^7.x | Tablo — ham `Table` değil |
| `@emotion/react` / `@emotion/styled` | ^11.x | MUI styling |

Generator, `package.json`'a bu bağımlılıkları otomatik eklemez; hedef projenin kurulu olduğu varsayılır.

---

## Üretilecek core bileşenler

`FrontendGenerator.ensureCoreUiComponents()` ile yazılan paylaşımlı dosyalar:

| Şablon | Çıktı | Not |
|--------|-------|-----|
| `core.typography-scale` | `TypographyScale.ts` | Mevcut ✅ |
| `core.text` | `CoreText.tsx` | Mevcut ✅ |
| `core.table` | `CoreTable.tsx` | Legacy MUI Table kabuğu + `tableActionsCellSx` (mevcut kodlar için) |
| `core.admin-table` | `AdminTable.tsx` | DataGrid kabuğu (yeni generate entity tabloları) |
| `core.modal` | `CoreModal.tsx` | Mevcut ✅ |
| `use-admin-server-pagination` | `hooks/useAdminServerPagination.ts` | Sunucu sayfalama hook'u |

**Üretilmeyecek:** `AdminPageShell.tsx`, `AdminLayout.tsx`, `adminTheme.ts`, `CopyIdCell`, `AdminGridEllipsis` (ihtiyaç olursa ayrı task).

**Not:** `CoreTable.tsx` dokunulmaz (eski entity / manuel tablolar `tableActionsCellSx` import edebilir). Yeni liste sayfaları `AdminTable.tsx` kullanır.

---

## Layout zinciri (generator sayfası)

Hedef projedeki `AdminLayout` generator tarafından yazılmaz. Generator sayfası (`page.hbs`) şu flex kurallarına uyar — tablonun viewport'u doldurması için:

```
Sayfa root (Container veya mevcut wrapper)
  → flex column, flex: 1, minHeight: 0, overflow: hidden
  → Başlık + toolbar (flexShrink: 0)
  → Filtre barı (flexShrink: 0)
  → AdminTable Box (flex: 1, minHeight: 0)
  → DataGrid (sx: flex: 1, minHeight: 0)
```

**Kural:** Üst üste `minHeight: 0` + `flex: 1` zinciri korunur. Mevcut `page.hbs` viewport hesabı (`calc(100dvh - chrome)`) layout ile uyumluysa korunabilir; `AdminPageShell` ile değiştirilmez.

---

## Tipografi

Ham MUI `Typography variant="h4/body2"` kullanılmaz. Kilitli variant'lar (`shared/feTypography.ts`):

| Kullanım | Variant |
|----------|---------|
| Sayfa başlığı | `headingMedium/semiBold` |
| Intro / toplam satır | `bodySmall/regular` + `color: text.secondary` |
| Tablo header (DataGrid dışı metin) | `labelBase/semiBold` → hedefte header sx ile `0.8125rem / 600` |
| Tablo hücre | `bodySmall/regular` (`0.875rem`) |
| Boş tablo mesajı | `bodyBase/regular` |
| Modal başlık | `headingSmall/semiBold` |

`TypographyScale` değerleri referans projeyle uyumlu (`bodySmall` → `0.875rem / 1.25rem`, `labelBase` → `0.9375rem / 1.375rem`).

---

## Input kuralları (filtre toolbar)

| Özellik | Değer |
|---------|-------|
| `size` | **`"small"`** (zorunlu) |
| Genişlik | `sx={{ minWidth: N }}` — sabit `width` yerine |
| Tarih | `type="date"`, `InputLabelProps={{ shrink: true }}`, `minWidth: 160` |
| Select / relation | `minWidth: 140` (uzun label → 160–220) |
| Uzun metin / ID arama | `minWidth: 220`, `flex: 1` |
| Boolean select | `FormControl size="small"`, `minWidth: 140` |

MUI v6 `TextField size="small"` ≈ **40px** yükseklik; filtre barındaki medium `Button` ile hizalı görünür.

Form modal (create/edit): filtre değilse `size` belirtilmez → **medium** (varsayılan).

### Filtre alanı tipine göre default `minWidth`

| Alan tipi / filterType | minWidth |
|------------------------|----------|
| `boolean` / select | 140 |
| `date` / `date-range` (tek alan) | 160 |
| `number` | 120 |
| `string` / text arama | 180 |
| relation (`Autocomplete`) | 200 |
| Uzun ID / serbest metin | 220 + `flex: 1` |

---

## Button kuralları

### Filtre satırı

| Aksiyon | variant | size | color |
|---------|---------|------|-------|
| Filtre uygula | `outlined` | medium (varsayılan) | primary |
| Sıfırla | `text` | medium | primary |
| Tehlikeli toplu işlem (varsa) | `outlined` | medium | error |

**Yapma:** Filtre barında `size="large"`. Search için `contained` kullanma (referans: outlined).

### Sayfa üstü birincil aksiyon

```tsx
<Button variant="contained">Add New {Entity}</Button>
```

### Satır aksiyonları (karar: mevcut kalır)

```tsx
<IconButton size="small" onClick={...} color="primary">
  <EditIcon />
</IconButton>
<IconButton size="small" onClick={...} color="error">
  <DeleteIcon />
</IconButton>
```

Referanstaki `Button size="small" variant="outlined"` metin butonları **kullanılmaz**; `IconButton size="small"` korunur. DataGrid satır yüksekliği referans ölçeğine uygun tutulur (medium buton satıra konmaz).

---

## Tablo (`AdminTable` / DataGrid)

### Temel kullanım (üretilecek `table.hbs`)

```tsx
const { paginationModel, onPaginationModelChange, resetPage, skip, limit } =
  useAdminServerPagination(25)

const tableKey = useMemo(
  () => JSON.stringify(appliedFilters),
  [appliedFilters]
)

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
```

### `AdminTable` varsayılanları

- `pageSizeOptions`: `[25, 50, 100]`
- `disableRowSelectionOnClick`
- `paginationMode` default: `client`; liste sayfalarında `server`
- Border: `1px divider`, `borderRadius: 1`, `bgcolor: background.paper`
- Header: `fontSize: 0.8125rem`, `fontWeight: 600`
- Cell: `fontSize: 0.875rem`
- Wrapper: `flex: 1`, `minHeight: 0`
- `tableKey` → `DataGrid` `key` prop (filtre değişince remount)

Kaynak: `UIRule.md` içindeki `AdminTable.tsx` gövdesi → `core.admin-table.hbs` şablonu.

### Kolon genişliği — otomatik (şemadan)

Her `showInTable` alanı için generator kolon tanımı üretir. **Karar:** genişlikler otomatik; her kolonda **default `minWidth`** zorunlu.

| Alan tipi / uiComponent | width | flex | minWidth |
|-------------------------|-------|------|----------|
| `boolean` | 80 | — | 80 |
| `number` | 100 | — | 88 |
| `date` / `datetime` | 160 | — | 132 |
| `ImageField` / avatar | 72 | — | 72 |
| relation (populate) | — | 1 | 120 |
| `string` kısa (name, code) | 140 | — | 110 |
| `string` uzun / açıklama | — | 1 | 150 |
| ObjectId / id gösterimi | 120 | — | 100 |
| Varsayılan | — | 1 | **110** |

Aksiyon kolonu: `width: 112`, `minWidth: 112` (mevcut `tableActionsCellSx` ile uyumlu).

`renderCell`: mevcut `table-cell.hbs` / `feTableCellExpr` mantığı `GridRenderCellParams` ile taşınır.

### Satır `id`

```tsx
rows.map((r, i) => ({ id: r._id ?? r.id ?? i, ...r }))
```

Domain primary key (`sourceType`) helper ile seçilir.

---

## Filtre state kalıbı

Mevcut generator çıktısı korunur:

```tsx
const [draftFilters, setDraftFilters] = useState<GetEntityQuery>({})
const [appliedFilters, setAppliedFilters] = useState<GetEntityQuery>({})

const handleSearch = () => {
  setPage(0) // veya resetPage()
  setAppliedFilters(draftFilters)
}
```

Fetch yalnızca **applied** filtreler + `skip` / `limit` ile tetiklenir.

`tableKey` applied filtrelerden türetilir; draft değişimi API çağırmaz.

---

## Responsive kalıplar

Filtre barı — `GridLegacy` yerine:

```tsx
<Stack
  direction={{ xs: 'column', md: 'row' }}
  spacing={2}
  flexWrap="wrap"
  sx={{ mb: 2, flexShrink: 0 }}
>
  {/* TextField / Autocomplete / FormControl — minWidth kuralları */}
  <Button variant="outlined" onClick={handleSearch}>Apply</Button>
  <Button variant="text" onClick={handleReset}>Reset</Button>
</Stack>
```

Başlık + üst aksiyonlar:

```tsx
<Stack
  direction="row"
  justifyContent="space-between"
  alignItems="center"
  flexWrap="wrap"
  gap={1}
>
```

- `xs`: input'lar tam genişlik (column)
- `md+`: yatay toolbar
- `flexWrap="wrap"`: taşan filtreler alt satıra iner

---

## Yapma listesi (generator çıktısı)

| Yapma | Bunun yerine |
|-------|----------------|
| MUI `Table` / `TableContainer` entity listelerinde | `AdminTable` (DataGrid) |
| Ham `DataGrid` entity sayfasında | `AdminTable` sarmalayıcı |
| `Typography variant="h5/body1"` | `CoreText` + scale |
| Filtre `TextField` without `size="small"` | `size="small"` + `minWidth` |
| Her input'a sabit `width: 300` | `minWidth` + gerekirse `flex: 1` |
| Filtre değişince anında fetch | draft / applied + Apply |
| `tableKey` olmadan server filtre | `tableKey` ile remount |
| `AdminPageShell` / `AdminLayout` üretmek | Hedef proje layout'u |
| Satır aksiyonunda `Button medium` | `IconButton size="small"` (mevcut) |
| `GridLegacy` filtre barı | `Stack` + responsive direction |

---

## Implementasyon fazları

### Faz 1 — Düşük risk
- [x] Filtre barı: `Grid` → `Stack` + responsive
- [x] Filtre `minWidth` tablosu (alan tipine göre)
- [x] Search → `outlined` Apply, Reset → `text`
- [x] `tableKey` + `resetPage` entegrasyonu

### Faz 2 — Core bileşenler
- [x] `core.table.hbs` güncellendi → `CoreTable.tsx` içinde `AdminTable` + hook
- [x] `use-admin-server-pagination.hbs` → `useAdminServerPagination.ts`
- [x] `FrontendGenerator`: hook + `core.table` (ayrı `core.admin-table` yok)

### Faz 3 — Tablo rewrite
- [x] `table.hbs`: `GridColDef[]` + `AdminTable`
- [x] `handlebars-fe-table.ts`: kolon genişliği emitter (tip → width/flex/minWidth)
- [x] `table-cell.hbs` mantığı → `renderCell` (`shared/feTableCell.ts`)
- [x] `page.hbs`: `useAdminServerPagination` + `tableKey` + pagination fetch
- [x] `AdminTable` ayrı dosya (`core.admin-table.hbs`); `CoreTable.tsx` eski haliyle korundu

---

## Hızlı kontrol listesi (PR / generate sonrası)

- [ ] `@mui/x-data-grid` + `AdminTable` kullanıldı mı?
- [ ] Filtre `TextField` hepsi `size="small"` mı?
- [ ] `minWidth` değerleri tip tablosuna uygun mu?
- [ ] `Stack direction={{ xs: 'column', md: 'row' }}` + `flexWrap` var mı?
- [ ] Başlık `CoreText headingMedium/semiBold` mı?
- [ ] `useAdminServerPagination(25)` + `tableKey` var mı?
- [ ] Satır aksiyonları `IconButton size="small"` mı?
- [ ] Kolonlarda default `minWidth` tanımlı mı?
- [ ] `AdminPageShell` / `AdminLayout` üretilmedi mi?

---

## Dosya haritası (generator)

```
src/main/templates/frontend/
  core.table.hbs              ← CoreTable (legacy MUI Table + cell sx)
  core.admin-table.hbs        ← AdminTable (DataGrid)
  core.text.hbs               ← CoreText
  core.typography-scale.hbs   ← TypographyScale
  core.modal.hbs              ← CoreModal
  use-admin-server-pagination.hbs

src/main/utils/
  handlebars-fe-table.ts    ← filtre + kolon emission
  handlebars-fe-frontend.ts ← page helpers

src/shared/
  feTypography.ts           ← kilitli variant'lar
```

---

## Referans

Detaylı kaynak kod ve örnek sayfa: `UIRule.md` (StockExchange admin — DailyReportWatchlist referansı).
