using System.Globalization;
using System.Text;
using __App__.Application.Common.Errors;

namespace __App__.Application.Auth;

/// <summary>Auth metinleri: istek dili <c>en</c> ise İngilizce, değilse Türkçe (<see cref="Messages"/> gibi).</summary>
public static class AuthMessages
{
    private static string T(string tr, string en) => CultureInfo.CurrentUICulture.TwoLetterISOLanguageName == "en" ? en : tr;

    public static string InvalidToken => T("Geçersiz veya süresi dolmuş token", "Invalid or expired token");
    public static string InvalidCredentials => T("E-posta veya şifre hatalı", "Wrong e-mail or password");
    public static string Suspended => T("Hesap askıya alınmış", "Account is suspended");
    public static string EmailNotVerified => T("E-posta adresi doğrulanmamış", "E-mail address is not verified");
    public static string LoggedIn => T("Giriş yapıldı", "Signed in");
    public static string LoggedOut => T("Çıkış yapıldı", "Signed out");
    public static string WrongPassword => T("Mevcut şifre hatalı", "Current password is wrong");
    public static string PasswordChanged => T("Şifre güncellendi", "Password updated");
    public static string PasswordTooShort => T("Şifre en az 8 karakter olmalı", "Password must be at least 8 characters");
    public static string PasswordTooLong => T("Şifre çok uzun (en fazla 72 bayt)", "Password is too long (at most 72 bytes)");
    public static string PasswordWeak => T("Şifre en az bir harf ve bir rakam içermeli", "Password must contain a letter and a digit");
    public static string InvalidEmail => T("Geçerli bir e-posta adresi girin", "Enter a valid e-mail address");
    public static string NameRequired => T("Ad gerekli", "Name is required");
    public static string OtpSent => T("Doğrulama kodu e-posta adresine gönderildi", "A verification code was sent to the e-mail address");
    public static string InvalidCode => T("Kod geçersiz veya süresi dolmuş", "Code is invalid or expired");
    public static string EmailVerified => T("E-posta doğrulandı", "E-mail verified");
    public static string EmailRequired => T("Sağlayıcı e-posta adresi vermedi", "The provider did not share an e-mail address");
    public static string EmailInUse => T("Bu e-posta başka bir hesapta kayıtlı; o hesapla giriş yapın", "This e-mail belongs to another account; sign in with that account");
    public static string AccountDeleted => T("Hesap silindi", "Account deleted");
    public static string AdminNotAllowed => T("Bu işlem admin hesapları için kapalı", "This action is not available for admin accounts");
    public static string AdminPasswordOnly => T("Admin hesapları yalnız e-posta ve şifreyle giriş yapar", "Admin accounts sign in with e-mail and password only");
    public static string PasswordAlreadySet => T("Hesabın şifresi zaten var; şifre değiştirmeyi kullanın", "This account already has a password; use change password");
    public static string PasswordCreated => T("Şifre oluşturuldu", "Password created");
    public static string TooManyRequestsHeader => T("Çok fazla istek", "Too many requests");
    public static string TooManyRequests => T("Çok fazla deneme; biraz sonra tekrar deneyin", "Too many attempts; try again later");
    // @if register|password-reset
    public static string VerifySubject => T("__App__ doğrulama kodu", "__App__ verification code");
    public static string ResetSubject => T("__App__ şifre sıfırlama kodu", "__App__ password reset code");
    /// <summary>{0}: kod, {1}: dakika.</summary>
    public static string CodeText => T("Kodunuz: {0}. {1} dakika geçerlidir.", "Your code: {0}. Valid for {1} minutes.");
    // @endif
}

public static class AuthErrors
{
    public static Error InvalidCredentials() => new(ErrorCodes.Unauthorized, Messages.UnauthorizedHeader, AuthMessages.InvalidCredentials);
    public static Error InvalidToken() => new(ErrorCodes.Unauthorized, Messages.UnauthorizedHeader, AuthMessages.InvalidToken);
    public static Error Suspended() => new(ErrorCodes.Forbidden, Messages.ForbiddenHeader, AuthMessages.Suspended);
    public static Error EmailNotVerified() => new(ErrorCodes.EmailNotVerified, Messages.ForbiddenHeader, AuthMessages.EmailNotVerified);
    public static Error AdminNotAllowed() => new(ErrorCodes.Forbidden, Messages.ForbiddenHeader, AuthMessages.AdminNotAllowed);
    public static Error AdminPasswordOnly() => new(ErrorCodes.Forbidden, Messages.ForbiddenHeader, AuthMessages.AdminPasswordOnly);
    public static Error TooManyRequests() => new(ErrorCodes.TooManyRequests, AuthMessages.TooManyRequestsHeader, AuthMessages.TooManyRequests);
}

/// <summary>En az 8 karakter, en fazla 72 bayt (bcrypt sınırı), en az bir harf ve bir rakam.</summary>
public static class PasswordPolicy
{
    public static string? Check(string? password)
    {
        if (string.IsNullOrEmpty(password) || password.Length < 8)
        {
            return AuthMessages.PasswordTooShort;
        }

        if (Encoding.UTF8.GetByteCount(password) > 72)
        {
            return AuthMessages.PasswordTooLong;
        }

        return password.Any(char.IsLetter) && password.Any(char.IsDigit) ? null : AuthMessages.PasswordWeak;
    }
}
