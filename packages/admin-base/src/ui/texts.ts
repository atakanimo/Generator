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
    invalidJson: 'Geçerli bir JSON girin',
    loginWelcome: 'Tekrar hoş geldiniz',
    loginSubtitle: 'Hesabınıza giriş yapın',
    loginEmail: 'E-posta adresi',
    loginPassword: 'Şifre',
    loginRememberMe: 'Beni hatırla',
    loginSubmit: 'Giriş yap',
    loginForgotPassword: 'Şifrenizi mi unuttunuz?',
    loginEmailInvalid: 'Geçerli bir e-posta adresi girin',
    loginLanguage: 'Dil',
    loginTheme: 'Tema'
  }
} as const;

export type AdminTextKey = keyof (typeof adminBaseTexts)['ataAdmin'];

/**
 * İngilizce karşılıklar. Host iki dili de i18next'e ekler (yoksa paket her dilde Türkçe varsayılanı gösterir):
 * `i18n.addResourceBundle('en', 'translation', adminBaseTextsEn, true, false)` ve `tr` için `adminBaseTexts`.
 */
export const adminBaseTextsEn: { ataAdmin: Record<AdminTextKey, string> } = {
  ataAdmin: {
    create: 'Add new',
    createTitle: 'New {{resource}}',
    editTitle: 'Edit {{resource}}',
    edit: 'Edit',
    delete: 'Delete',
    save: 'Save',
    cancel: 'Cancel',
    confirm: 'Confirm',
    close: 'Close',
    apply: 'Apply',
    reset: 'Clear',
    all: 'All',
    yes: 'Yes',
    no: 'No',
    min: 'Min',
    max: 'Max',
    from: 'From',
    to: 'To',
    addItem: 'Add',
    removeItem: 'Remove',
    key: 'Key',
    value: 'Value',
    copy: 'Copy',
    copied: 'Copied',
    copyFailed: 'Could not copy',
    actions: 'Actions',
    detail: 'Detail',
    total: '{{count}} records',
    selected: '{{count}} selected',
    noRows: 'No records',
    rowsPerPage: 'Rows per page:',
    displayedRows: '{{from}}–{{to}} of {{count}}',
    itemCount: '{{count}} items',
    deleteTitle: 'Delete this record?',
    deleteDescription: 'This cannot be undone.',
    required: 'Required',
    invalidNumber: 'Enter a valid number',
    invalidDecimal: 'Enter a valid decimal (e.g. 12.50)',
    invalidDate: 'Enter a valid date',
    invalidJson: 'Enter valid JSON',
    loginWelcome: 'Welcome back',
    loginSubtitle: 'Sign in to your account',
    loginEmail: 'Email address',
    loginPassword: 'Password',
    loginRememberMe: 'Remember me',
    loginSubmit: 'Sign in',
    loginForgotPassword: 'Forgot your password?',
    loginEmailInvalid: 'Enter a valid email address',
    loginLanguage: 'Language',
    loginTheme: 'Theme'
  }
};

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
