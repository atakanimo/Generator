namespace __App__.Application.Common.Errors;

/// <summary>Kullanıcıya giden metinler. Yerelleştirme (Accept-Language) sonraki aşamada.</summary>
public static class Messages
{
    public const string Success = "İşlem başarılı.";
    public const string Created = "Kayıt oluşturuldu.";
    public const string Updated = "Kayıt güncellendi.";
    public const string Deleted = "Kayıt silindi.";

    public const string BadRequestHeader = "Geçersiz istek";
    public const string InvalidBody = "İstek gövdesi geçersiz.";
    public const string InvalidSort = "Bu alana göre sıralanamaz: {0}";
    public const string UnauthorizedHeader = "Yetkisiz";
    public const string Unauthorized = "Bu işlem için giriş yapmalısınız.";
    public const string ForbiddenHeader = "Erişim engellendi";
    public const string Forbidden = "Bu işlem için yetkiniz yok.";
    public const string NotFoundHeader = "Bulunamadı";
    public const string NotFound = "Kayıt bulunamadı.";
    public const string ConflictHeader = "Çakışma";
    public const string Duplicate = "Bu değer zaten kullanılıyor: {0}";
    public const string ReferenceNotFound = "İlişkili kayıt bulunamadı: {0}";
    public const string InUse = "Kayıt başka kayıtlar tarafından kullanılıyor.";
    public const string InternalHeader = "Sunucu hatası";
    public const string Internal = "Beklenmeyen bir hata oluştu.";
}
