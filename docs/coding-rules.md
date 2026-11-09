# Kod yazma kuralları

Generator deposunun kendi kod kuralları. Host projelerin kuralları `src/generator-assets/cursor-rules/`'tadır; stack'e özel üretim ayrıntıları `backend/*.md`.

## Model

- **Tek tip: NormalizedModel v2** ([normalized-model.md](normalized-model.md)). Parser, manifest, IPC, renderer ve emitter'lar aynı tipi kullanır. Paralel model tipi, ara şekil ya da köprü eklenmez.
- Ham model dosyası şablona verilmez. Akış: keşif → parse → NormalizedModel → şablon bağlamı → sıralı üretim → güvenli yazım.
- Modelde stack ismi yok; stack'e özel bilgi yalnızca `native` altında.

## Legacy / fallback yok

- Eski şekil için dönüştürücü, uyumluluk dalı, "eski sürüm okunursa" yolu yazılmaz. Eski veri bir kez taşınır ya da yok sayılır (ör. eski manifest: satırlar yok sayılır, dosya yedeklenir).
- Kullanılmayan kod silinir; yorum satırına alınmaz.
- Bir köprü gerçekten gerekiyorsa kaldırılacağı adımla birlikte yazılır ve o adımda silinir.

## Üretilen dosyalar

- Generated dosyada (Generator başlığı olan) **custom blok dışına kod yazılmaz**; regenerate'te silinir.
- İş kuralı servis hook'una (`<m>.hooks.ts`), ek uç / metot / şema / filtre anahtarı ilgili custom bloğa.
- Başlıksız dosya kullanıcıya aittir; Generator ona dokunmaz.
- Şablonda iş mantığı yok. Yanlış: `{{#if (eq type "string")}}…{{/if}}`. Doğru: helper / emitter (`{{tsType type}}`, `{{zodField this "create"}}`). Kararlar `templateHelpers.ts` / `handlebars-*.ts`'te. Helper'lar marker üretmez.
- Core asset'ler eksikse oluşturulur, asla ezilmez.

## Sözleşme

- Her BE stack'i [api-contract.md](api-contract.md)'ye uyar. JSON'da `id` (asla `_id`), iç içe `filters`, `decimal` string, strict body.
- `id` / `_id` ayrılmış alan adlarıdır.

## Doğrulama

- Değişikliğe uyan kapılar çalıştırılır ([verification.md](verification.md)). Generator `tsc` hata sayısı (`src/generator-assets` hariç) artmaz.
- Sıra: önce ucuz kontroller (tsc, birim testleri, smoke), sonra regen / config kapıları, **tarayıcı ve Electron kontrolü en son**, toplu.
- Uzun betikler (regen `--planned --core-overlay`) arka planda çalıştırılır.
- Gerçek proje klasörüne (Varlik360) doğrulama için yazılmaz; kopya kullanılır.
- Sonuç olduğu gibi raporlanır: kalan hata sayısı, atlanan kapı, denenmeyen senaryo.

## Commit

- Kullanıcı istemeden commit atılmaz, push yapılmaz, git index'ine dokunulmaz.
- Commit yalnızca o işte değişen dosyaları içerir.
