using System;
using System.Text.RegularExpressions;

namespace Jellyfin.Plugin.JellyChat.Configuration;

/// <summary>
/// Validates and normalizes theme values before they reach CSS or the client.
/// </summary>
internal static partial class JellyChatThemeValues
{
    internal static string Theme(string? value) => OneOf(value, "violet", ["violet", "glass", "custom"]);

    internal static string Layout(string? value) => OneOf(value, "docked", ["docked", "floating"]);

    internal static string Side(string? value) => OneOf(value, "left", ["left", "right"]);

    internal static string Style(string? value) => OneOf(value, "bubbles", ["bubbles", "flat"]);

    internal static string Base(string? value) => OneOf(value, "violet", ["violet", "glass"]);

    internal static string Corners(string? value) => OneOf(value, "soft", ["sharp", "soft", "pill"]);

    internal static int Blur(int value) => Math.Clamp(value, 0, 60);

    /// <summary>
    /// Returns the trimmed color when it is a safe CSS color, otherwise an empty string.
    /// </summary>
    /// <param name="value">The raw admin input.</param>
    /// <returns>A safe color or an empty string.</returns>
    internal static string Color(string? value)
    {
        string trimmed = value?.Trim() ?? string.Empty;
        return trimmed.Length is > 0 and <= 80 && SafeColor().IsMatch(trimmed) ? trimmed : string.Empty;
    }

    private static string OneOf(string? value, string fallback, string[] allowed)
    {
        string normalized = value?.Trim().ToLowerInvariant() ?? string.Empty;
        return Array.IndexOf(allowed, normalized) >= 0 ? normalized : fallback;
    }

    [GeneratedRegex(@"^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20}|(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\([0-9a-zA-Z%.,/\s+-]{1,60}\))$", RegexOptions.CultureInvariant)]
    private static partial Regex SafeColor();
}
