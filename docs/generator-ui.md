# Generator arayüzü

Electron uygulaması: main (`src/main`), preload, renderer (`src/renderer/src`, React + Redux). Renderer ↔ main sözleşmesi tek kaynaktan: `src/shared/ipcTypes.ts` (`ElectronAPI`, sonuç tipleri). IPC katmanı yalnızca köprüdür; iş üreticilerde ve `shared` modüllerdedir.

## Ekranlar

| Ekran | Dosya | Görevi |
| --- | --- | --- |
| Proje seçimi | `pages/ProjectSelectPage.tsx` | BE proje klasörü, tarama (`project:scan`). Yol sabit değildir: son açılan proje geri gelir, kayıt yoksa alan boştur. |
| Schema Designer | `pages/SchemaDesignPage.tsx` | Model seçimi, alan tablosu, BE / FE generate |
| Model editörü | `components/AddModelModal.tsx` | Model oluşturma / düzenleme (model dosyasını yazar) |
| API ayarları | `components/ModelApiSettingsPanel.tsx` | Model başına normal işlemler, auth, admin |
| Yeni admin paneli | `components/NewAdminPanelDialog.tsx` | Boş klasöre ata-admin-base paneli; backend diyaloğunda "Admin paneli de kur" ([frontend/admin-host.md](frontend/admin-host.md)) |

## Schema Designer

- Model açılınca `project:parseModel` birleşik v2 modeli ve dosya hash'ini döner ([normalized-model.md](normalized-model.md)).
- Alan tablosu: Label, In Table, Searchable, Filter Type, Readonly, Hidden, Admin only, Relation, UI Component, Default Value. Ayarlar `project:saveSchemaConfig` ile manifest v3'e yazılır.
- UI Component seçenekleri `uiComponentOptionsFor(field)`'dan (`shared/modelMerge.ts`): yalnızca kind'a uyan bileşenler; object / map / json / unknown için seçim kapalı.
- İlişki diyaloğu: hedef model, `display`, `populate`. Ana alan bağlı değilken `nestedSchemas` bağlantısı sessizce düşürülmez.
- FE bölümünde yalnızca config'in okuduğu ayarlar var: FE proje yolu, generate modu, Enable Update / Delete. FE dosya seçimi ya da "mevcut dosyaları güncelle" yok. Admin dizini `adminDir` ile seçilir (`scripts/host.mjs`): `workspace.frontendPath` seçilen backend'in içindeyse odur, değilse `<backend>/apps/admin`. `generateFrontend(model, frontendPath, backendPath, features, baseUrl)` bütün IPC imzasıdır.
- Generate: `project:generateBackend` / `generateFrontend` (Backend Only / Frontend Only / ikisi). Model dosyası açıldıktan sonra diskte değiştiyse generate yazmaz, uyarı gösterir.
- Eski manifest `workspace` anahtarları (`selectedFrontendFiles`, `updateExistingFrontendFiles`, `isAdminUser`) okunmaz, sonraki yazımda düşer.

## Model editörü

- `project:loadModelDraft` / `createModel` / `updateModel`. `ModelDraft = { model: NormalizedModel; seed? }`.
- v2 alanları yerinde düzenlenir. Dokunulmayan alan parse edildiği gibi kaydedilir; düzenlenen alan `normalizeEditedField`'dan geçer.
- "Type" seçimi `kind` + `isArray` görünümüdür (`editorTypeOf` / `withEditorType`); `json` / `unknown` salt okunur `Other`.
- Enum değerleri ve default girilebilir. `id` / `_id` alan adı reddedilir.
- Kullanıcıya ait (başlıksız) model dosyası kaydedilmez. Model dosyası BE generate ile aynı bağlamdan yazılır (`buildMongooseModelContext`).

## Çalıştırma

- `npm run dev`: Electron build + Vite (5190) + Electron.
- Yalnızca renderer: `npm run web:dev` (`.claude/launch.json` → `generator-renderer`); IPC olmadan sınırlıdır.
- Arayüzü otomasyonla sürmek: `npm run build:electron`, `npx vite --port 5190 --strictPort`, `npx electron . --remote-debugging-port=9333`; CDP `Runtime.evaluate` / `Page.captureScreenshot`.

## Kod düzeni

- Üreticiler `BaseGenerator`'dan türer. Dosya ve şablon işleri `fileUtils`, `templateEngine`, `validationUtils`, `errorHandler`, `logger` üzerinden; elle `fs` + compile yok.
- CREATE / UPDATE / SKIP / MERGE loglanır. Hata olursa durulur, adım + stack loglanır, açık hata döner.
