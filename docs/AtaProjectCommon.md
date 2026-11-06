# AtaProjectCommon

SharedFrame, StockExchange, Varlik360 ve CeyizDefterim için. Bu hostlardaki üretilmiş dosya Generator ile yazılır. Generator deposunun kendi kaynağı (`src/`, `packages/admin-base`, şablonlar, doğrulama betikleri) bu kuralla üretilmez.

## Generator'ın yazdığı

- Admin config: `apps/admin/src/modules/<modül>/<modül>.generated.config.ts` ve `modules/resources.generated.ts`. Yeni bir entity admin ekranı hostta sayfa, tablo, servis veya route olarak yazılmaz; paket config'i çizer.
- Backend'de ilk satırı Generator damgası olan dosyalar. İş kuralı hook'a, ek uç ilgili custom bloğa veya `*.Custom.cs` / `*Hooks.cs` dosyasına gider.

## Elle kalan

- Bir kez oluşan `<modül>.generated.ts`: `extendResource` ile aksiyon, hücre, ikon.
- Hook, custom blok, `*.Custom.cs`.
- Entity CRUD olmayan sayfalar: login, dashboard, logs, metrics, jobs, screen.

## Üretim

Electron arayüzündeki Generate ile aynı fonksiyonlar (`generateFrontend`, `generateBackend`, `generatePythonBackend`, `generateDotnetBackend`). Komut Generator kökünden çalışır:

```
node scripts/host.mjs admin-config <host> [Entity] [--dry-run]
node scripts/host.mjs generate <host> [Entity] [--dry-run]
```

`admin-config` manifest satırından admin config yazar. `generate` backend'i yazar. Entity verilmezse manifestteki modüllerin hepsi gelir. `--dry-run` yolu basar, dosya yazmaz.

Yığın `workspace.backendStack` alanındadır; yoksa proje kökünden tespit edilir. Admin dizini `workspace.frontendPath` host'un içindeyse odur; yol boşsa veya başka bir projenin klasörünü gösteriyorsa `<host>/apps/admin` kullanılır.

Python'a özel kurulum, içe aktarma ve önizleme `scripts/python-host.mjs` içindedir. Admin config ve backend üretimi bu hostlar için `scripts/host.mjs` olur.

## Kuralın durduğu yer

Metin tek yerdedir: bu dosya ve `.cursor/rules/AtaProjectCommon.mdc`. SharedFrame, StockExchange, Varlik360 ve CeyizDefterim kendi `.cursor/rules/AtaProjectCommon.mdc` dosyasında buna symlink tutar. Host tek başına açıldığında Cursor o kuralı okur; üretim komutu Generator'ın mutlak yolunu kullanır. Metin değişince yalnız Generator'daki dosya düzenlenir.

## Paket davranışı

Config'in anlatamadığı admin arayüzü `packages/admin-base` içine yazılır. Önce `npm run playground` (http://localhost:5191) ile doğrulanır, sonra host paketi kullanır. Bileşen admin projelerine kopyalanmaz.
