# Task: AdminTable — ID kolonlarında kopyalama (relation dahil)

## Problem

Generate edilen entity tablolarında ID benzeri kolonların davranışı tutarsız.

**Gözlemlenen örnek (SymbolTypes tablosu):**

| Kolon | Görünen | Kopyalama |
|-------|---------|-----------|
| Id (`_id`) | `6a2de3…7de0` | Var |
| User Id (`userId`, relation) | `hasan` | **Yok** |
| Symbol Id (`symbolId`, relation) | `Ons Altın` | **Yok** |
| Created At / Updated At | tarih | — |
| Actions | ikonlar | — |

Kullanıcı beklentisi: **Id’de olduğu gibi User Id ve Symbol Id’de de kopyalama ikonu olsun.**

- [x] Task uygulandı (`emitFeTableRelationIdCopyCellJsx` — label + copy ham id)

## Doğru davranış (kabul kriterleri)

### 1) Ham ID kolonları (`_id`, `id`, relation olmayan `*Id`)

- Kısaltılmış ID gösterimi (ör. `6a2de3…7de0`)
- Yanında **copy** ikonu
- Kopyalanan değer: ham id string

### 2) Relation + ID kolonları (`userId`, `symbolId`, `includeRelation: true`)

- **Görünen metin relation label kalsın** (ör. `hasan`, `Ons Altın`) — populate / `relationProperty` davranışı bozulmayacak
- Yanında **copy** ikonu olacak
- Kopyalanan değer: **relation label değil, ham id**
  - Populate object ise: `obj._id ?? obj.id`
  - Scalar string/ObjectId ise: o string

### 3) Kolon genişlikleri

- Sadece **default** `width` / `minWidth` (şema tipine göre)
- **`maxWidth` / `flex: 0` ile kilitleme yok** — kullanıcı DataGrid’de kolonu yeniden boyutlandırabilmeli
- Relation kolonları: mevcut default (`flex: 1`, `minWidth: 120`) korunur
- ID kolonları: default öneri `width: 120`, `minWidth: 100` (kilit değil)

### 4) ID kolon adı tespiti

Aşağıdakiler ID kolonu sayılır (`description` gibi alanlar **sayılmaz**):

- `_id`, `id`
- `userId`, `symbolId` gibi `Id` ile biten camelCase
- `user_id` gibi `_id` ile biten snake_case

## Yapılmayacaklar

- Relation kolonunda yalnızca kısaltılmış ObjectId göstermek (label kaybolmasın)
- Tüm id kolonlarını sabit px’e kilitlemek
- `includeRelation: true` iken copy’yi tamamen kapatmak (mevcut hata)

## Teknik notlar (implementasyon için)

- Dosya: `src/shared/feTableCell.ts` → `emitFeTableRowCellJsx`, `emitFeTableIdCopyCellJsx`, `feTableHasIdCopyCellFields`
- `table.hbs`: `ContentCopyIcon` import’u id **veya** relation-id kolonu varsa gerekli
- `isFeTableIdCopyField` şu an `includeRelation === true` ise copy’yi kapatıyor — **bu kaldırılacak / relation dalı ayrı cell üretecek**

## Test planı

1. `_id` kolonu: kısaltılmış id + copy → panoya tam id
2. `userId` + relation: ekranda kullanıcı adı + copy → panoya `userId` (object id veya string)
3. `symbolId` + relation: ekranda sembol adı + copy → panoya `symbolId`
4. `createdAt` / `updatedAt`: copy ikonu yok
5. DataGrid kolon başlığından sürükleyerek genişlik değiştirilebiliyor

## Referans

- `UIRulesLocal.md` — AdminTable / kolon defaults
- `UIRule.md` — `CopyIdCell` (kısaltılmış ID + kopyala)
