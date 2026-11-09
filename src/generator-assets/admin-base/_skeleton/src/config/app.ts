// Panelin ayarları: tema anahtarı ve ana sayfa. Panel adı i18n'de (`common.name`).
export const APP_CONFIG = {
  /** `localStorage` anahtarları. */
  storage: {
    themeMode: '__app__.theme_mode'
  },
  /** Girişten sonra ve bilinmeyen yollarda açılan sayfa. */
  homePath: '/dashboard'
} as const;
