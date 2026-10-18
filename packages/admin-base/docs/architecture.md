# Mimari

Paket, Generator'ın ürettiği config'ten admin ekranlarını çizer. Katmanlar alttan üste bağımlıdır: `contract` ← `schema` ← `data` ← `react` ← `ui`. Dışa açılan her şey `src/index.ts`'ten export edilir.

```
ResourceSchema (config) ─┐
                         ├→ AtaAdminProvider (registry + DataProvider + t)
Host axios (interceptor) ┘        │
                                  ├→ hooks (TanStack Query) → DataProvider → HTTP (sözleşme)
                                  └→ ResourcePage → tablo, filtre, form drawer, aksiyonlar
createAdminRoutes(resources) → host route + menü dizisi
```

## Klasörler

| Yol | İçerik | Ne zaman dokunulur |
| --- | --- | --- |
| `src/contract/api.ts` | Sözleşme tipleri: `ApiResponse`, `ListBody`, `PaginatedList`, `Id`, filtre değerleri | Sözleşme değişince (Generator `docs/api-contract.md` ile birlikte) |
| `src/schema/fields.ts` | `FieldKind`, `FieldConfig` türleri, satır / filtre tip çıkarımı (`InferFields`, `InferFilters`) | Yeni alan türü ya da alan özelliği |
| `src/schema/resource.ts` | `ResourceSchema`, `defineResourceSchema`, `canPerform`, `InferRow` | Resource düzeyi ayar |
| `src/schema/extend.ts` | `extendResource`: aksiyonlar, hücre / form override'ları, slot'lar, ikon | El yazısı genişletme API'si |
| `src/schema/relation.ts` | İlişki id / etiket yardımcıları, `canSearchRelation` | İlişki davranışı |
| `src/schema/write.ts` | `toWriteBody`: formdan create / update body'si (readonly, `hideOn*` düşer, ilişki → id) | Yazma kuralları |
| `src/data/dataProvider.ts` | `DataProvider` arayüzü (BE'den bağımsız) | Yeni işlem türü |
| `src/data/restProvider.ts` | `createAtaRestProvider`: sözleşmedeki uçları host axios'u ile çağırır, istek bayraklarını koyar | Uç ya da bayrak değişince |
| `src/data/axiosFlags.ts` | `skipLoading` / `skipSuccessToast` axios modül genişletmesi | — |
| `src/data/resourceApi.ts` | `bindResourceApi`: tek resource'a bağlı API | — |
| `src/data/queryClient.ts` | Varsayılan QueryClient (`retry: false`, odakta yenileme yok) | Önbellek davranışı |
| `src/react/context.tsx` | `AtaAdminProvider`, `useAtaAdmin`: registry, provider, `t`, tarih yerel ayarı, `getCurrentUserId` | Provider prop'ları |
| `src/react/hooks.ts` | `useResourceList / One / Mutations / Action`, `useRelationOptions`, `resourceKeys` | Veri çekme |
| `src/ui/ResourcePage.tsx` | Liste sayfası: başlık, toolbar, filtre, DataGrid, satır aksiyonları, silme onayı | Sayfa düzeni |
| `src/ui/table/` | Kolonlar (`columns.tsx`), hücreler (`cells.tsx`), JSON penceresi | Tablo görünümü |
| `src/ui/filters/` | `FilterBar`, `buildListFilters` (taslak → `filters`) | Filtre türleri |
| `src/ui/form/` | `ResourceFormDrawer`, `FormFields`, `values.ts` (başlangıç / body), `rules.ts` (doğrulama) | Form |
| `src/ui/inputs/RelationAutocomplete.tsx` | Hedefin `get-all`'u ile ilişki seçici | Autocomplete |
| `src/ui/actions/actions.tsx` | Satır / toplu / toolbar aksiyon düğmeleri ve girdi diyaloğu | Aksiyonlar |
| `src/ui/routes.tsx` | `createAdminRoutes` | Route / menü kaydı |
| `src/ui/texts.ts`, `useAdminTexts.ts`, `format.ts` | Türkçe varsayılan metinler (`ataAdmin.*`), metin hook'u, değer biçimleme (`valueSummary`) | Metin / biçim |
| `playground/` | Sahte BE (`mockBackend.ts`) + örnek resource'lar | Elle deneme |
| `test/` | vitest testleri; `types.test.ts` tip çıkarımını `tsc` ile doğrular | Her davranış değişikliği |

## İlkeler

- Paket BE / DB bilmez; yalnızca sözleşmeyi bilir. Yol türetmez: her resource `endpoint`'ini verir.
- Hata ve toast göstermez; bunlar host interceptor'ındadır. İstemci doğrulama hataları alanın altında gösterilir.
- Form kuralları config'ten türer (zod yok); son söz BE'dedir.
- Metinler host'un `t`'sinden gelir; yoksa Türkçe varsayılanlar.
