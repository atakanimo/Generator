// @auth-file register|password-reset
using System.Net;
using System.Net.Mail;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using __App__.Application.Auth;

namespace __App__.Infrastructure.Auth;

/// <summary>
/// <c>Smtp__Host</c> ayarlıysa SMTP (<c>Smtp__Port</c>, <c>Smtp__User</c>, <c>Smtp__Password</c>, <c>Mail__From</c>);
/// değilse e-posta log'a yazılır (geliştirme ve testler kodu oradan okur).
/// </summary>
public sealed class MailSender(IConfiguration configuration, ILogger<MailSender> logger) : IMailSender
{
    public async Task SendAsync(string to, string subject, string text, CancellationToken cancellationToken)
    {
        var host = configuration["Smtp:Host"];
        if (string.IsNullOrWhiteSpace(host))
        {
            logger.LogInformation("mail.console to={To} subject={Subject} text={Text}", to, subject, text);
            return;
        }

        var user = configuration["Smtp:User"];
        using var client = new SmtpClient(host, configuration.GetValue("Smtp:Port", 587)) { EnableSsl = true };
        if (!string.IsNullOrEmpty(user))
        {
            client.Credentials = new NetworkCredential(user, configuration["Smtp:Password"]);
        }

        using var message = new MailMessage(configuration["Mail:From"] ?? user ?? "no-reply@localhost", to, subject, text);
        await client.SendMailAsync(message, cancellationToken);
    }
}
