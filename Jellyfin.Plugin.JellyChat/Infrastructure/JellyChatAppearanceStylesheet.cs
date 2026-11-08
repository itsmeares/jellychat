using System;
using System.Security.Cryptography;
using System.Text;
using Jellyfin.Plugin.JellyChat.Configuration;

namespace Jellyfin.Plugin.JellyChat.Infrastructure;

/// <summary>
/// Builds the server-wide Custom theme CSS.
/// </summary>
internal static class JellyChatAppearanceStylesheet
{
    /// <summary>
    /// Builds CSS variables for the Custom theme. Empty or unsafe values are skipped so the preset color shows through.
    /// </summary>
    /// <param name="configuration">The plugin configuration.</param>
    /// <returns>The generated asset.</returns>
    public static JellyChatAppearanceAsset Build(PluginConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(configuration);

        var builder = new StringBuilder();
        builder.AppendLine(":root {");
        AppendColor(builder, configuration.CustomAccent, "--jellychat-custom-accent", "--jellychat-accent");
        AppendColor(builder, configuration.CustomBackground, "--jellychat-custom-background", "--jellychat-drawer-background");
        AppendColor(builder, configuration.CustomSurface, "--jellychat-custom-surface", "--jellychat-panel-background");
        AppendColor(builder, configuration.CustomText, "--jellychat-custom-text", "--jellychat-text");
        builder.Append("  --jellychat-custom-blur: ")
            .Append(JellyChatThemeValues.Blur(configuration.CustomGlassBlur))
            .AppendLine("px;");
        builder.AppendLine("}");

        return Digest(Encoding.UTF8.GetBytes(builder.ToString()));
    }

    /// <summary>
    /// Builds the admin's custom CSS asset.
    /// </summary>
    /// <param name="configuration">The plugin configuration.</param>
    /// <returns>The generated asset.</returns>
    public static JellyChatAppearanceAsset BuildCustomCss(PluginConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        return Digest(Encoding.UTF8.GetBytes(configuration.CustomCss ?? string.Empty));
    }

    private static void AppendColor(StringBuilder builder, string raw, string name, string legacyName)
    {
        string value = JellyChatThemeValues.Color(raw);
        if (value.Length == 0)
        {
            return;
        }

        builder.Append("  ").Append(name).Append(": ").Append(value).AppendLine(";");
        builder.Append("  ").Append(legacyName).Append(": ").Append(value).AppendLine(";");
    }

    private static JellyChatAppearanceAsset Digest(byte[] content)
    {
        byte[] digest = SHA256.HashData(content);
        return new JellyChatAppearanceAsset(content, Convert.ToHexString(digest)[..12]);
    }
}
