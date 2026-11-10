using System.Text;
using __App__.Application.Common.Errors;

namespace __App__.Application.Auth;

public static class AuthMessages
{
    public const string InvalidToken = "Auth.InvalidToken";
    public const string InvalidCredentials = "Auth.InvalidCredentials";
    public const string Suspended = "Auth.Suspended";
    public const string EmailNotVerified = "Auth.EmailNotVerified";
    public const string LoggedIn = "Auth.LoggedIn";
    public const string LoggedOut = "Auth.LoggedOut";
    public const string WrongPassword = "Auth.WrongPassword";
    public const string PasswordChanged = "Auth.PasswordChanged";
    public const string PasswordTooShort = "Auth.PasswordTooShort";
    public const string PasswordTooLong = "Auth.PasswordTooLong";
    public const string PasswordWeak = "Auth.PasswordWeak";
    public const string InvalidEmail = "Auth.InvalidEmail";
    public const string NameRequired = "Auth.NameRequired";
    public const string OtpSent = "Auth.OtpSent";
    public const string InvalidCode = "Auth.InvalidCode";
    public const string EmailVerified = "Auth.EmailVerified";
    public const string EmailRequired = "Auth.EmailRequired";
    public const string EmailInUse = "Auth.EmailInUse";
    public const string AccountDeleted = "Auth.AccountDeleted";
    public const string AdminNotAllowed = "Auth.AdminNotAllowed";
    public const string AdminPasswordOnly = "Auth.AdminPasswordOnly";
    public const string PasswordAlreadySet = "Auth.PasswordAlreadySet";
    public const string PasswordCreated = "Auth.PasswordCreated";
    // @if register|password-reset
    public const string VerifySubject = "Auth.VerifySubject";
    public const string ResetSubject = "Auth.ResetSubject";
    public const string CodeText = "Auth.CodeText\u001F{0}\u001F{1}";
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
    public static Error TooManyRequests() => new(ErrorCodes.TooManyRequests, Messages.TooManyRequestsHeader, Messages.TooManyRequests);
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
