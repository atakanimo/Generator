# @atakanimo/ata-admin-base

Generator'ın ürettiği admin FE'nin çalışma zamanı. Generator sayfa/tablo/modal kodu yazmaz; her entity için BE/DB'den bağımsız bir **config** üretir, ekrana basmak bu paketin işidir.

Sözleşme: [`docs/api-contract.md`](../../docs/api-contract.md)

## Dokümanlar

| Doküman | Konu |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | Ne nerede: klasör haritası, veri akışı |
| [docs/resource-config.md](docs/resource-config.md) | Config: `ResourceSchema`, alan türleri, `extendResource` |
| [docs/host-integration.md](docs/host-integration.md) | Host projeye kurulum |
| [docs/development.md](docs/development.md) | Komutlar, playground, testler, yayın |

## Durum (npm'de; yayın: `npm run release`)

Hazır: liste sayfası (filtre, sunucu sayfalama / sıralama, satır ve toplu aksiyonlar, silme onayı), form drawer (bütün alan türleri, istemci doğrulaması), dinamik create varsayılanları, `createAdminRoutes`. Henüz yok: sayfalar arası "tümünü seç", kaydedilmemiş değişiklik uyarısı, iki seviye populate.

## Kararlar

| Konu | Karar |
| --- | --- |
| Tarih | dayjs (`@mui/x-date-pickers` + `AdapterDayjs`) |
| Metinler | Paketin tüm metinleri host'un i18next `t` fonksiyonundan gelir |
| Route / menü | Paket admin route'larını ve sol menü öğelerini kendisi üretir; Generator host'a route / reducer enjekte etmez |
| Yetki | Admin paneline yalnızca admin rolü girer; panel içinde başka yetki seviyesi yok |
| Kapsam | FE çıktısı yalnızca admin. BE admin + normal servisleri üretmeye devam eder; normal route'ları mobil kullanır (model başına işlem alt kümesi, kendi `userId`'si ile) |
| Geçiş | Eski admin modülleri kademeli taşınır; eski sayfalar ve paket yan yana çalışır |
| Form | react-hook-form; kurallar (required, sayı, decimal formatı, tarih) config'ten türetilir, zod yok — son söz BE'de |
| Form kabı | Sağdan açılan Drawer (create / edit) |
| Update body | Formdaki tüm yazılabilir alanlar gönderilir (`toWriteBody`: readonly / `hideOnUpdate` / şema dışı alanlar düşer, ilişkiler id'ye iner); boşaltılan opsiyonel tekil alan `null` gider, BE alanı temizler (0.1.8) |
| Alan hataları | İstemci doğrulama hataları alanın altında; API hataları yalnızca host interceptor toast'u |
