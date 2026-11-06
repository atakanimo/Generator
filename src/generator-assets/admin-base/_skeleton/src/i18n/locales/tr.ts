export const tr = {
  common: {
    name: '__App__',
    dashboard: 'Gösterge Paneli',
    login: 'Giriş Yap',
    logout: 'Çıkış Yap',
    error: 'Hata',
    save: 'Kaydet',
    cancel: 'İptal',
    edit: 'Düzenle',
    delete: 'Sil',
    view: 'Görüntüle',
    search: 'Ara',
    refresh: 'Yenile'
  },
  // @atakanimo/ata-admin-base: kaynak başlıkları (menü + sayfa). Anahtar = resource adı (`modules/<m>`); yoksa config etiketi.
  admin: {} as Record<string, { title: string }>,
  layout: {
    envProduction: 'Production',
    envTest: 'Test'
  },
  auth: {
    adminOnly: 'Bu panele yalnızca admin kullanıcılar girebilir.'
  },
  dashboard: {
    welcome: 'Gösterge Paneline Hoş Geldiniz',
    resources: 'Kaynaklar'
  }
};

export default tr;
