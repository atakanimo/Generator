/** Türkçe metinler. `crud` bloğu Generator'ın ortak CRUD mesajları (`BaseCrudService`); modül başına anahtar yok. */
const tr = {
  common: {
    serviceUnavailable: 'Servis şu an kullanılamıyor',
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
    deleteSuccess: 'Kayıt başarıyla silindi',
    exportUnknownField: 'Bu alan dışa aktarılamaz: {{field}}',
    exportHeaders: '`headers`, `fields` ile aynı sayıda olmalı.',
    exportTooMany: 'Dışa aktarılacak çok fazla kayıt var; en fazla {{limit}}. Filtreleri daraltın.'
  },
  auth: {
    noToken: 'Token sağlanmadı',
    invalidToken: 'Geçersiz veya süresi dolmuş token',
    invalidCredentials: 'E-posta veya şifre hatalı',
    suspended: 'Hesap askıya alınmış',
    emailNotVerified: 'E-posta adresi doğrulanmamış',
    loggedIn: 'Giriş yapıldı',
    loggedOut: 'Çıkış yapıldı',
    wrongPassword: 'Mevcut şifre hatalı',
    passwordChanged: 'Şifre güncellendi',
    passwordTooShort: 'Şifre en az 8 karakter olmalı',
    passwordTooLong: 'Şifre çok uzun (en fazla 72 bayt)',
    passwordWeak: 'Şifre en az bir harf ve bir rakam içermeli',
    otpSent: 'Doğrulama kodu e-posta adresine gönderildi',
    invalidCode: 'Kod geçersiz veya süresi dolmuş',
    emailVerified: 'E-posta doğrulandı',
    emailRequired: 'Sağlayıcı e-posta adresi vermedi',
    emailInUse: 'Bu e-posta başka bir hesapta kayıtlı; o hesapla giriş yapın',
    accountDeleted: 'Hesap silindi',
    adminNotAllowed: 'Bu işlem admin hesapları için kapalı',
    adminPasswordOnly: 'Admin hesapları yalnız e-posta ve şifreyle giriş yapar',
    passwordAlreadySet: 'Hesabın şifresi zaten var; şifre değiştirmeyi kullanın',
    passwordCreated: 'Şifre oluşturuldu',
    tooManyRequests: 'Çok fazla deneme; biraz sonra tekrar deneyin',
    mail: {
      verifySubject: '__App__ doğrulama kodu',
      resetSubject: '__App__ şifre sıfırlama kodu',
      codeText: 'Kodunuz: {{code}}. {{minutes}} dakika geçerlidir.'
    }
  },
  rateLimit: {
    tooManyRequests: 'Çok fazla istek'
  }
};

export default tr;
