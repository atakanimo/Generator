# Admin dashboard

`AdminDashboard` ana sayfa iskeletidir. Kullanıcı, trafik veya deep dive bilmez. Host hazır dizileri verir; dizi ne kadar uzunsa o kadar öğe basılır. Boş dizi (veya prop verilmemesi) o bölümü hiç çizmez.

Üç admin (Alpha Terminal, Varlık360, SharedFrame) aynı bileşeni kullanır. Fetch ve “API cevabını diziye çevirme” host’tadır.

```tsx
<AdminDashboard cards={cards} graphs={graphs} tables={tables} links={links} />
```

`AtaAdminProvider` içinde durur (`useAdminTexts`: boş tablo `ataAdmin.noRows`, aralık grubu `ataAdmin.dashboardRange`).

## Ne zaman ne basılır

| Prop | Boş / yok | Dolu |
| --- | --- | --- |
| `cards` | Kart şeridi yok | Her kayıt bir kart: üstte ince birincil çizgi, etiket, büyük sayı. Izgara `auto-fit`, en dar 180px. |
| `graphs` | Grafik yok | Her kayıt bir grafik. `type: 'line'` alanlı çizgi, `type: 'bar'` çubuk. |
| `tables` | Tablo yok | Her kayıt bir tablo. Satır yoksa `ataAdmin.noRows`. |
| `links` | Kısayol yok | Her kayıt bir bağlantı kartı (`react-router` `Link`). `subtitle` yoksa yalnız başlık. |

Sıra her zaman kart, grafik, tablo, kısayol.

## Grafik yerleşimi

`groupDashboardGraphs` satırları kurar:

- `fullWidth: true` kendi satırında, genişlik 12.
- `fullWidth` olmayanlar geliş sırasıyla aynı satırda toplanır. Satır eşit bölünür: 2 grafik yarı yarıya, 3 grafik üçe. Dar ekranda her grafik alta iner.
- Araya `fullWidth` girerse açık grup kapanır. Sonraki grafikler yeni satırdadır.

Örnek: `[tam, yarım, yarım, tam]` → üç satır. Ortadaki satır iki eşit kolon.

## Aralık düğmesi

`range` verilirse başlığın yanında seçenekler basılır.

```ts
range: {
  options: [{ value: '1h', label: '1s' }, { value: '7d', label: '7g' }],
  value: '7d',
  onChange: (value) => { /* host bu aralıkla seriyi yeniden kurar */ }
}
```

Seçenek listesi ve etiket host’tan gelir. Aynı seçeneğe tekrar basmak `onChange` çağırmaz. `range` yoksa düğme çıkmaz. `emptyMessage` doluyken düğme durur, grafik yerine o metin basılır (ör. API log kapalı).

## Tablo hücresi

Kolon `kind: 'status'` ve hücre metinse renkli chip: `success` / `succeeded`, `partial` / `processing`, `failed`, `skipped` / `deleted`. Tanınmayan durum (`market_closed` dahil) nötr chip. `kind` yoksa hücre olduğu gibi basılır. Boş hücre `—`.

## Host’un verdiği örnek

Alpha ve Varlık360 ana sayfa: birkaç sayı kartı, tam genişlik trafik grafiği (`1h | 2h | 7d | 1mo`), son işler tablosu, dashboard hariç rota kısayolları.

SharedFrame: kullanıcı kartı ve Hangfire iş tablosu. Trafik grafiği geçilmez; istek günlüğü yoktur, bu yüzden aralık düğmesi de görünmez.

`/metrics` sayfaları bu bileşene bağlanmaz.
