# Plan: İstemci veri katmanı (mobil / web)

Durum: **C0–C3 tamam (2026-10-21; C3 simülatör kontrolü bekliyor).** Referans istemci: Varlik360 `apps/mobile`. Nasıl çalıştığı: [frontend/client-data-layer.md](../frontend/client-data-layer.md). Kapı: `node scripts/verify/regen-client.mjs`. Sıradaki: C3 simülatör kontrolü (kullanıcı), C4 (Generator arayüzü).

## 1. Hedef

- Mobil ve web istemcilerinde **UI üretilmez**; yalnızca veri katmanı üretilir: tipler, servis çağrıları ve RTK state (thunk + slice).
- Girdi admin config'iyle aynı: NormalizedModel v2 + manifest v3 + [api-contract.md](../api-contract.md). Üretici BE stack'ini bilmez; Express ve .NET arkası için aynı çıktı.
- Kaynak **normal uçlar**: modülün `api.normalOperations`'ında olmayan operasyon için servis fonksiyonu / thunk üretilmez. Admin uçları istemciye gelmez.
- Ekranların import yolları değişmez (`@/services/<x>.service`, `@/store/thunks/<x>.thunk`, `@/store/slices/<x>.slice`).

## 2. Kararlar

| # | Konu | Karar |
| --- | --- | --- |
| 1 | Kapsam | Tipler + servis + thunk + slice. Ekran, bileşen, hook yok. |
| 2 | State | RTK `createAsyncThunk` + `createSlice` (iki projede de bu). RTK Query / TanStack Query yok: ekranlar değişmeli olurdu. |
| 3 | Referans | Varlik360 mobile isimleri: `services/<x>.service.ts`, `store/thunks/<x>.thunk.ts`, `store/slices/<x>.slice.ts`; fonksiyon adları `getAll`, `getById`, `create`, `update`, `delete<E>`; thunk adları `fetch<E>List`, `fetch<E>ById`, `create<E>`, `update<E>`, `delete<E>`; selector `Get<E>State`. |
| 4 | Dosya sahipliği | Admin'deki gibi işaret yorumu yok. `<x>.<katman>.generated.ts` her üretimde yeniden yazılır; `<x>.<katman>.ts` bir kez oluşur, kullanıcınındır (başlıksız = kullanıcı dosyası kuralı). |
| 5 | Thunk uzantısı | Üretilmiş dosya bir fabrika verir: `createTransactionsThunks(hooks)`. Kullanıcı dosyası thunk'ları bu fabrikayla kurar ve `after*` hook'larını (başarı sonrası dispatch vb.) orada yazar. Böylece hook'lar kendi modülünün thunk'larını import döngüsü olmadan çağırabilir. |
| 6 | Slice uzantısı | Üretilmiş dosya parçaları verir: `<e>InitialState`, `<e>BaseReducers`, `add<E>BaseCases(builder, thunks)`. `createSlice` kullanıcı dosyasında kurulur, kendi state'i ve reducer'ları oraya eklenir. |
| 7 | rootReducer | Otomatik değiştirilmez. Yeni slice için Generator bildirimde eklenecek satırları verir (admin'de route enjeksiyonunu bırakma gerekçesiyle aynı). |
| 8 | İstemci tanımı | Manifest `workspace.clients[]`: `{ id, label, root, preset }`. Model başına seçim `api.clients[<id>]` (katman açma / kapama). |
| 9 | Preset | İlk preset `redux-rn` (Varlik360 mobile): klasörler, `API` / `LocalResponse` / `RootState` import yolları, istek bayraklarının taşınması (`headers` — mobile interceptor `config.headers.skipLoading` okuyor). Web için ikinci preset C5'ten sonra. |
| 10 | URL | Normal router'ın mount yolu BE app dosyasından okunur (admin'deki `findAdminMountPath` gibi); bulunamazsa `baseUrl` + modül adı. |
| 11 | Ortak tipler | `ListPaginationBody`, `PaginatedList` bugün her servis dosyasında kopya. Tek `services/common.generated.ts`'e alınır, servisler re-export eder (bugünkü importlar kırılmaz). |
| 12 | Liste sayfalama | Liste thunk'ı standart `append?: boolean` alır: `true` ise slice öğeleri ekler ve istek `skipLoading` ile gider (sonsuz kaydırma; bugün transactions'ta elle yazılı). |
| 13 | Şablonlar | Eski `frontend/service|thunk|slice.hbs` (`ae7fa61^`) başlangıç noktası; `src/main/templates/client-redux/` altına, bağlam TS'te saf fonksiyon. |
| 14 | Normal uç kuralları | Tek saf kaynak `src/shared/normalApi.ts` (`resolveNormalApi`); istemci bunu kullanır. Express / .NET aynı kuralı kendi içinde tekrarlıyor; ileride ikisi de buna geçmeli. |
| 16 | `readonly` | Create ve update'te yazılmaz: .NET'teki kural, Express şablon yardımcıları (`zodField`, `zodFieldScoped`) ve sözleşme §5 buna hizalandı (2026-10-21; Varlik360 regen çıktısı değişmedi). |
| 15 | Update sonrası ilişki | Cevapta ilişki id (sözleşme §4). Slice `merge<E>Saved`: id değişmediyse populate edilmiş obje kalır, değiştiyse `{ id }` (sonraki okumada dolar). |

## 3. Üretilen dosyalar (modül başına)

| Dosya | Sahibi | İçerik |
| --- | --- | --- |
| `services/<x>.service.generated.ts` | G | Okuma tipi `I<E>`, `I<E>Input` (create), update input, `Get<E>Query`, `Get<E>ListBody`; açık normal operasyonların fonksiyonları |
| `services/<x>.service.ts` | K | `export * from './<x>.service.generated'` + özel uçlar |
| `store/thunks/<x>.thunk.generated.ts` | G | Cevap tipleri, `create<E>Thunks(hooks?)` |
| `store/thunks/<x>.thunk.ts` | K | `export const { … } = create<E>Thunks({ … })` + özel thunk'lar |
| `store/slices/<x>.slice.generated.ts` | G | State tipi, initial state, base reducer'lar, `add<E>BaseCases` |
| `store/slices/<x>.slice.ts` | K | `createSlice`, actions, default reducer, `Get<E>State` |
| `services/common.generated.ts` | G | Ortak liste tipleri (istemci başına bir tane) |

### Tip eşlemesi (sözleşme §4–§5)

- `id: string`; tarih okumada `string` (ISO); `decimal` `string`; `hidden` alanlar tipte yok; `writeOnly` yalnızca input'ta.
- Okuma tipinde ilişki, `relationPopulateFields` kadar populate edilmiş obje (`{ id; <alanlar> }`, tipler hedef modelden). Input'ta yalnızca id.
- Opsiyonel: `required` değilse `?`; .NET `null` yazar → okuma tipinde `| null` (sözleşme §4).

### Bilinen hata (üretimde düzelir)

- Bugünkü slice'ların delete case'i `action.payload.data`'yı silinen id sanıyor; sözleşmede delete `data: null` döner, kayıt state'ten hiç silinmiyor. Yeni üretim id'yi `action.meta.arg`'dan alır.

## 4. Aşamalar

| Aşama | İş | Kapı |
| --- | --- | --- |
| C0 | Bu plan | — |
| C1 ✅ | Tipler + servis üretimi, `redux-rn` preset, harness `scripts/verify/regen-client.mjs` | Varlik360 manifest'inden boş klasöre üretim; mobile kopyasında `tsc` |
| C2 ✅ | Thunk + slice (fabrika + parçalar) | Aynı harness, birim testler (reducer'lar) |
| C3 ✅ | Varlik360 mobile taşıma: 8 üretilmiş modülün elle değişiklikleri K dosyalarına | mobile `tsc` taban çizgisi aynı; simülatör en son |
| C4 | Generator arayüzü: hedef listesi (BE / Admin / istemciler), model başına istemci + katman seçimi, generate bildirimi | Electron'da elle |
| C5 | SharedFrame web (.NET arkası): ikinci preset ya da preset seçenekleri, `mappers.ts`'nin daralması | web `tsc` + Docker API'ye karşı smoke |

## 5. Varlik360 mobile envanteri (2026-10-21)

Üretilmiş (başlıklı) servis / thunk / slice: 8 modül. Manifest normal operasyonlarıyla:

| Modül | normalOperations | Mobile'da elle değişen |
| --- | --- | --- |
| transactions | list, getOne, update, delete | create → `custom-create` + `premiumUx` header; liste `append` + sayfa boyutu; thunk'larda başarı sonrası dashboard / liste yenileme |
| notifications | hepsi | `unreadCount`, `readAllNotifications` |
| userWatchList | getOne, create, update, delete | liste `get-all-with-price-values` (özel uç) |
| symbols | list, getOne | C3'te bakılacak |
| symbolTypes | list, getOne | — |
| appVersionConfigs | list, getOne (auth yok) | — |
| users | update | slice yok; URL'de baştaki `/` eksik |
| dailyPortfolio | yok | yalnızca özel uçlar → G dosyası boş kalır, her şey K'de |

Başlıksız (kullanıcı) modüller dokunulmaz: alpha, americanEtf, asset, auth, dailyFxRates, deepDive, peers, quotes, stock(s), trFund, userAssetCategories, marketNews, common.

## 6. C3 iş listesi (`regen-client --adopt`, 2026-10-21)

Eski üretilmiş 8 modülün servis / thunk / slice'ı stub'la değişince ekranlarda 64 yeni `tsc` hatası (taban 2). Gruplar:

- **Özel uçlar / thunk'lar / state → K dosyalarına:** `getDashboardPortfolio`, `getPortfolioSnapshots`, `IDailyPortfolioSnapshot` (dailyPortfolio); `getAllWithPriceValues`, `IUserWatchListWithPriceValues`, `GetUserWatchListListBody` (userWatchList); `readAllNotifications`, `unreadCount` (notifications); `claimMissingSymbols` (symbols); transactions `create` (`custom-create` + `premiumUx`), sayfa boyutu, başarı sonrası yenilemeler.
- **BE'nin modelde olmayan alanları:** `IUsers.nameInitial`, `hasPassword` (BE'de hesaplanıyor). K dosyasında modül genişletmesiyle: `declare module './users.service.generated' { interface IUsers { … } }`.
- **Daralan ilişki tipleri:** `symbolId` artık `{ id; value; displayText; … }` (populate kadar); string bekleyen helper'lar (`quotes.helper`, `portfolio.helper`) ve tam `ISymbols` bekleyen yerler.
- **Enum:** `baseCurrency` literal birleşimi ↔ mobile'ın `BaseCurrency` enum'u.
- **Users slice:** mobile'da yok; `users.thunk.ts` `usersThunks` vermediği için oluşturulmuyor (uyarı).
- `store/index.ts`: yeni slice'lar (users) elle eklenir.

### C3 sonucu (2026-10-21, commit yok)

Mobile'da 8 modül yeni düzende; eski üretilmiş dosyalar scratchpad'de (`mobile-old/`, yedek `mobile-backup/c3-before.tgz`). Mobile `tsc` 2 (taban), ESLint temiz, Generator tekrar çalışınca mobile'a hiçbir şey yazmıyor, gerçek `rootReducer` Node'da kuruluyor (18 slice).

- Üretici eklentileri (taşıma sırasında çıktı): `RequestOptions.headers` + hook `requestOptions` (`premiumUx`), hook `mapRow` (symbols `normalizeSymbol`), users için `layers: { slice: false }` (kullanıcı `auth.slice`'ta).
- Kullanıcı dosyalarına taşınan: dailyPortfolio ve userAssetCategories (yalnızca özel uçlar; Generator yalnız satır tipini üretir, thunk / slice kullanıcının; userAssetCategories `getMine` cevabı için `IUserAssetCategoriesMine`), transactions (`custom-create` + `TRANSACTIONS_PAGE_SIZE` + yenilemeler), notifications (`readAllNotifications`, `unreadCount`), userWatchList (fiyatlı liste, `customItems`, paywall header), symbols (`claimMissingSymbols`, normalize), users (`auth.slice`'a yazan `afterUpdate`, BE alanları `nameInitial` / `hasPassword`).
- Ekran / helper dokunuşları: `updateUsers({ id, data })` (4 çağrı, eskiden `userId`), `PortfolioItem.symbol: SymbolRef` + helper'larda `SymbolTypeRef`, WatchList `baseCurrency` yedeği, `auth.slice` `initialUser` yer tutucu alanları (`isVerified` / `isActive` `null` → `false`; okuyan yok).
- Davranış farkları (simülatörde bakılacak): update sonrası satır birleştirilir (eskiden cevapla değişiyordu, populate edilmiş ilişkiler id'ye dönüyordu); delete kaydı listeden gerçekten siler (eskiden `data` `null` olduğu için silmiyordu, liste yenilemesi gizliyordu); `read-all` URL'ine baştaki `/` eklendi.
- Mobile'a özel (Generator dışı) düzenleme: `/api/v1/alpha/*`'a giden 7 servis / 7 thunk / 7 slice tek `alpha.service.ts` / `alpha.thunk.ts` / `alpha.slice.ts`'e birleştirildi (tek düz `AlphaState`, `GetAlphaState`); mobile kuralı `Varlik360/.cursor/rules/frontend.mobile.mdc` yeni düzene göre yazıldı (`pending` istisnası: `skipLoading` isteklerinin yerel yükleniyor bayrağı).
- Bulunan: RTK aynı action için ikinci `addCase`'te fırlatır; ilk taşımada notifications / userWatchList'te vardı, `addMatcher`'a çevrildi, harness'e çalışma anı kontrolü eklendi.

## 7. Açık sorular

- Okuma tipindeki populate obje, bugünkü `IUsers` / `ISymbols` (tam tip) kullanımından dar. Ekranlar populate edilmeyen alan okuyorsa `tsc` yakalar (bu gerçek bir hata: alan çalışma anında yok). Sayı §6'da.
- Notifications normalde `create` açık; mobile kullanıyor mu? C3'te kontrol.
