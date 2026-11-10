using System.Globalization;
using System.Resources;

namespace __App__.Application.Common.Errors;

public static class MessageLocalizer
{
    public const char Separator = '\u001F';

    private static readonly ResourceManager[] Resources = Load("Messages", "AuthMessages", "CommonMessages");

    public static string Localize(string? text) => Localize(text, CultureInfo.CurrentUICulture);

    public static string Localize(string? text, string language) => Localize(text, CultureInfo.GetCultureInfo(language));

    public static string Localize(string? text, CultureInfo culture)
    {
        if (string.IsNullOrEmpty(text)) return text ?? string.Empty;

        var parts = text.Split(Separator);
        var template = Resources.Select(resources => resources.GetString(parts[0], culture)).FirstOrDefault(value => value is not null);
        if (template is null) return text;
        return parts.Length == 1 ? template : string.Format(culture, template, parts[1..]);
    }

    private static ResourceManager[] Load(params string[] names)
    {
        var assembly = typeof(MessageLocalizer).Assembly;
        var embedded = assembly.GetManifestResourceNames();
        return names
            .Select(name => $"__App__.Application.Resources.{name}")
            .Where(baseName => embedded.Contains($"{baseName}.resources"))
            .Select(baseName => new ResourceManager(baseName, assembly))
            .ToArray();
    }
}
