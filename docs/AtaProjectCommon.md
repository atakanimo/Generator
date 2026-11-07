# AtaProjectCommon

SharedFrame, StockExchange, Varlik360 ve CeyizDefterim için. Bu hostlardaki üretilmiş dosya Generator ile yazılır. Generator deposunun kendi kaynağı (`src/`, `packages/admin-base`, şablonlar, doğrulama betikleri) bu kuralla üretilmez.

## Öncelik

Dosya adı ve yeri için Generator'ın bir çıktısı varsa (admin iskeleti `src/generator-assets/admin-base/_skeleton`, istemci veri katmanı `docs/frontend/client-data-layer.md`, backend damgalı dosyalar) doğru yer odur; host kodu ona taşınır. Generator'ın çıktısı olmayan yerde host kuralı seçer.

## Kapsam

- **Admin (`apps/admin`): zorunlu.** Her hostta entity admin ekranı ve admin config Generator ile yazılır; elle CRUD modülü (sayfa, tablo, servis, thunk, slice, route) açılmaz.
- **Kullanıcı uygulamaları (`apps/web`, `apps/mobile`): zorunlu değil.** Veri katmanı (servis, thunk, slice) Generator ile üretilebilir ya da elle yazılabilir; ekranlar her zaman elle yazılır. Üretilmiş bir dosya (`*.generated.ts`, ilk satır damgalı) yine elle düzenlenmez; özel kod başlıksız dosyaya gider.
- **Backend:** damgalı dosyalar Generator'ındır (aşağıda).
- **Auth her yerde istisnadır.** Generator auth üretemez; admin, web ve mobilde auth servisi / thunk'ı / slice'ı elle yazılır ve mevcut haliyle kalır. TanStack'e ya da Generator çıktısına taşınmaz.

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

Admin frontend kuralı da aynı düzendedir: kaynak `.cursor/rules/frontend.admin.mdc`, dört host `.cursor/rules/frontend.admin.mdc` symlink'i tutar. Web (`frontend.web.mdc`) ve mobil (`frontend.mobile.mdc`) kuralları her hostun kendi dosyasıdır; `frontend.common.mdc` yoktur.

## Paket davranışı

Config'in anlatamadığı admin arayüzü `packages/admin-base` içine yazılır. Önce `npm run playground` (http://localhost:5191) ile doğrulanır, sonra host paketi kullanır. Bileşen admin projelerine kopyalanmaz.
