/** Host'un i18next `t` fonksiyonuyla uyumlu imza. */
export type Translate = (key: string, options?: { defaultValue?: string; [name: string]: unknown }) => string;

/**
 * Paketin kendi metinleri (`ataAdmin.*`) — varsayılan Türkçe.
 * Host isterse i18next'e `addResourceBundle(lng, ns, { ataAdmin: ... })` ile ekler; yoksa bu değerler kullanılır.
 */
export const adminBaseTexts = {
  ataAdmin: {
    create: 'Yeni ekle',
    createTitle: 'Yeni {{resource}}',
    editTitle: '{{resource}} düzenle',
    edit: 'Düzenle',
    delete: 'Sil',
    save: 'Kaydet',
    cancel: 'Vazgeç',
    confirm: 'Onayla',
    close: 'Kapat',
    apply: 'Uygula',
    reset: 'Temizle',
    all: 'Tümü',
    yes: 'Evet',
    no: 'Hayır',
    min: 'En az',
    max: 'En çok',
    from: 'Başlangıç',
    to: 'Bitiş',
    addItem: 'Ekle',
    removeItem: 'Kaldır',
    key: 'Anahtar',
    value: 'Değer',
    copy: 'Kopyala',
    copied: 'Kopyalandı',
    copyFailed: 'Kopyalanamadı',
    actions: 'İşlemler',
    detail: 'Detay',
    total: 'Toplam {{count}} kayıt',
    selected: '{{count}} seçili',
    noRows: 'Kayıt yok',
    rowsPerPage: 'Sayfa başına satır:',
    displayedRows: '{{from}}–{{to}} / {{count}}',
    itemCount: '{{count}} öğe',
    deleteTitle: 'Kayıt silinsin mi?',
    deleteDescription: 'Bu işlem geri alınamaz.',
    required: 'Zorunlu alan',
    invalidNumber: 'Geçerli bir sayı girin',
    invalidDecimal: 'Geçerli bir ondalık sayı girin (ör. 12.50)',
    invalidDate: 'Geçerli bir tarih girin',
    invalidJson: 'Geçerli bir JSON girin'
  }
} as const;

export type AdminTextKey = keyof (typeof adminBaseTexts)['ataAdmin'];

export function interpolate(template: string, vars?: Record<string, unknown>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name: string) => (vars?.[name] != null ? String(vars[name]) : ''));
}

/** Host `t` vermezse: `defaultValue`'yu interpolate eder. */
export const fallbackTranslate: Translate = (key, options) => interpolate(options?.defaultValue ?? key, options);

/** `userId` → `User id`, `user-subscriptions` → `User subscriptions`. */
export function humanize(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map(w => w.toLowerCase());
  if (words.length === 0) return name;
  return words.join(' ').replace(/^./, c => c.toUpperCase());
}
