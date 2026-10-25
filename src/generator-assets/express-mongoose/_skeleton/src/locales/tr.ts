/** Türkçe metinler. `crud` bloğu Generator'ın ortak CRUD mesajları (`BaseCrudService`); modül başına anahtar yok. */
const tr = {
  common: {
    success: 'Başarılı',
    failed: 'Başarısız',
    error: 'Hata',
    unauthorized: 'Yetkisiz erişim',
    forbidden: 'İzin reddedildi',
    badRequest: 'Geçersiz istek',
    notFound: 'Bulunamadı',
    invalidJson: 'İstek gövdesi geçerli bir JSON değil',
    internalServerError: 'Sunucu hatası',
    duplicateValue: 'Eklemek istediğiniz değer zaten mevcut'
  },
  crud: {
    listFailed: 'Kayıtlar alınamadı',
    getByIdFailed: 'Kayıt bilgisi alınamadı',
    createFailed: 'Kayıt oluşturulamadı',
    updateFailed: 'Kayıt güncellenemedi',
    deleteFailed: 'Kayıt silinemedi',
    notFound: 'Kayıt bulunamadı veya yetkisiz erişim',
    deleteSuccess: 'Kayıt başarıyla silindi'
  },
  auth: {
    noToken: 'Token sağlanmadı',
    invalidToken: 'Geçersiz veya süresi dolmuş token'
  },
  rateLimit: {
    tooManyRequests: 'Çok fazla istek'
  }
};

export default tr;
