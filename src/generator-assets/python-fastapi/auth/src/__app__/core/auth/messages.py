"""Auth mesajları (tr / en); isteğin dili `core.http.contract.current_language()`."""

from __future__ import annotations

from __app__.core.http.contract import current_language

_TEXT: dict[str, dict[str, str]] = {
    "tr": {
        "noToken": "Token sağlanmadı",
        "invalidToken": "Geçersiz veya süresi dolmuş token",
        "invalidCredentials": "E-posta veya şifre hatalı",
        "suspended": "Hesap askıya alınmış",
        "emailNotVerified": "E-posta adresi doğrulanmamış",
        "loggedIn": "Giriş yapıldı",
        "loggedOut": "Çıkış yapıldı",
        "wrongPassword": "Mevcut şifre hatalı",
        "passwordChanged": "Şifre güncellendi",
        "passwordTooShort": "Şifre en az 8 karakter olmalı",
        "passwordTooLong": "Şifre çok uzun (en fazla 72 bayt)",
        "passwordWeak": "Şifre en az bir harf ve bir rakam içermeli",
        "otpSent": "Doğrulama kodu e-posta adresine gönderildi",
        "invalidCode": "Kod geçersiz veya süresi dolmuş",
        "emailVerified": "E-posta doğrulandı",
        "emailRequired": "Sağlayıcı e-posta adresi vermedi",
        "emailInUse": "Bu e-posta başka bir hesapta kayıtlı; o hesapla giriş yapın",
        "accountDeleted": "Hesap silindi",
        "adminNotAllowed": "Bu işlem admin hesapları için kapalı",
        "adminPasswordOnly": "Admin hesapları yalnız e-posta ve şifreyle giriş yapar",
        "passwordAlreadySet": "Hesabın şifresi zaten var; şifre değiştirmeyi kullanın",
        "passwordCreated": "Şifre oluşturuldu",
        "tooManyRequests": "Çok fazla deneme; biraz sonra tekrar deneyin",
        "notFound": "Kayıt bulunamadı",
        "verifySubject": "__App__ doğrulama kodu",
        "resetSubject": "__App__ şifre sıfırlama kodu",
        "codeText": "Kodunuz: {code}. {minutes} dakika geçerlidir.",
    },
    "en": {
        "noToken": "No token provided",
        "invalidToken": "Invalid or expired token",
        "invalidCredentials": "Wrong e-mail or password",
        "suspended": "Account is suspended",
        "emailNotVerified": "E-mail address is not verified",
        "loggedIn": "Signed in",
        "loggedOut": "Signed out",
        "wrongPassword": "Current password is wrong",
        "passwordChanged": "Password updated",
        "passwordTooShort": "Password must be at least 8 characters",
        "passwordTooLong": "Password is too long (at most 72 bytes)",
        "passwordWeak": "Password must contain a letter and a digit",
        "otpSent": "A verification code was sent to the e-mail address",
        "invalidCode": "Code is invalid or expired",
        "emailVerified": "E-mail verified",
        "emailRequired": "The provider did not share an e-mail address",
        "emailInUse": "This e-mail belongs to another account; sign in with that account",
        "accountDeleted": "Account deleted",
        "adminNotAllowed": "This action is not available for admin accounts",
        "adminPasswordOnly": "Admin accounts sign in with e-mail and password only",
        "passwordAlreadySet": "This account already has a password; use change password",
        "passwordCreated": "Password created",
        "tooManyRequests": "Too many attempts; try again later",
        "notFound": "Record not found",
        "verifySubject": "__App__ verification code",
        "resetSubject": "__App__ password reset code",
        "codeText": "Your code: {code}. Valid for {minutes} minutes.",
    },
}


def auth_text(key: str, **values: object) -> str:
    table = _TEXT.get(current_language(), _TEXT["tr"])
    return table.get(key, _TEXT["tr"].get(key, key)).format(**values)
