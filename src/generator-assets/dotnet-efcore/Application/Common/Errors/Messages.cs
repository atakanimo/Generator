using System.Globalization;

namespace __App__.Application.Common.Errors;

/// <summary>Kullanıcıya giden metinler: istek dili (<c>Accept-Language</c>, <c>UseRequestLocalization</c>) <c>en</c> ise İngilizce, değilse Türkçe.</summary>
public static class Messages
{
    private static string T(string tr, string en) => CultureInfo.CurrentUICulture.TwoLetterISOLanguageName == "en" ? en : tr;

    public static string Success => T("İşlem başarılı.", "Operation successful.");
    public static string Created => T("Kayıt oluşturuldu.", "Record created.");
    public static string Updated => T("Kayıt güncellendi.", "Record updated.");
    public static string Deleted => T("Kayıt silindi.", "Record deleted.");

    public static string BadRequestHeader => T("Geçersiz istek", "Bad request");
    public static string InvalidBody => T("İstek gövdesi geçersiz.", "Invalid request body.");
    public static string InvalidValue => T("Geçersiz değer: {0}", "Invalid value: {0}");
    public static string InvalidSort => T("Bu alana göre sıralanamaz: {0}", "Cannot sort by this field: {0}");
    public static string UnauthorizedHeader => T("Yetkisiz", "Unauthorized");
    public static string Unauthorized => T("Bu işlem için giriş yapmalısınız.", "You must sign in for this action.");
    public static string ForbiddenHeader => T("Erişim engellendi", "Access denied");
    public static string Forbidden => T("Bu işlem için yetkiniz yok.", "You are not allowed to perform this action.");
    public static string NotFoundHeader => T("Bulunamadı", "Not found");
    public static string NotFound => T("Kayıt bulunamadı.", "Record not found.");
    public static string ConflictHeader => T("Çakışma", "Conflict");
    public static string Duplicate => T("Bu değer zaten kullanılıyor: {0}", "This value is already in use: {0}");
    public static string ReferenceNotFound => T("İlişkili kayıt bulunamadı: {0}", "Related record not found: {0}");
    public static string InUse => T("Kayıt başka kayıtlar tarafından kullanılıyor.", "Record is used by other records.");
    public static string InternalHeader => T("Sunucu hatası", "Server error");
    public static string Internal => T("Beklenmeyen bir hata oluştu.", "An unexpected error occurred.");
}
