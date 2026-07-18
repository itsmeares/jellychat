using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using Jellyfin.Plugin.JellyChat.Configuration;

namespace Jellyfin.Plugin.JellyChat.Infrastructure;

/// <summary>
/// Builds server-wide JellyChat appearance CSS.
/// </summary>
internal static class JellyChatAppearanceStylesheet
{
    private static readonly IReadOnlyList<int> AccentMixPercentages =
    [10, 12, 14, 16, 18, 20, 34, 42, 46, 52, 55, 58, 65, 72, 75, 78, 85];

    private static readonly IReadOnlyList<AppearanceColor> Colors =
    [
        new AppearanceColor(
            configuration => configuration.AccentColor,
            ["--jellychat-accent", "--jellychat-accent-bright", "--jellychat-accent-highlight"],
            true),
        new AppearanceColor(
            configuration => configuration.DrawerBackgroundColor,
            ["--jellychat-drawer-background"]),
        new AppearanceColor(
            configuration => configuration.PanelBackgroundColor,
            [
                "--jellychat-panel-background",
                "--jellychat-panel-background-extra-faint",
                "--jellychat-panel-background-faint",
                "--jellychat-panel-background-soft",
                "--jellychat-panel-background-medium",
                "--jellychat-panel-background-raised",
                "--jellychat-panel-background-selected",
                "--jellychat-panel-background-emphasis",
                "--jellychat-panel-background-trigger",
                "--jellychat-panel-background-overlay",
                "--jellychat-panel-background-active",
                "--jellychat-panel-background-popover",
                "--jellychat-panel-background-popover-soft"
            ]),
        new AppearanceColor(
            configuration => configuration.BorderColor,
            [
                "--jellychat-border-faint",
                "--jellychat-border-soft",
                "--jellychat-border",
                "--jellychat-border-medium",
                "--jellychat-border-semi-strong",
                "--jellychat-border-strong",
                "--jellychat-border-robust",
                "--jellychat-border-prominent"
            ]),
        new AppearanceColor(
            configuration => configuration.TextColor,
            [
                "--jellychat-text",
                "--jellychat-text-strong",
                "--jellychat-text-heading",
                "--jellychat-text-secondary",
                "--jellychat-text-tertiary",
                "--jellychat-text-control",
                "--jellychat-text-muted",
                "--jellychat-text-dim",
                "--jellychat-text-soft",
                "--jellychat-text-disabled"
            ])
    ];

    /// <summary>
    /// Builds color overrides followed by unmodified custom CSS.
    /// </summary>
    /// <param name="configuration">Current plugin configuration.</param>
    /// <returns>Generated appearance asset.</returns>
    public static JellyChatAppearanceAsset Build(PluginConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(configuration);

        var builder = new StringBuilder();
        foreach (AppearanceColor color in Colors)
        {
            string value = color.GetValue(configuration)?.Trim() ?? string.Empty;
            if (value.Length == 0)
            {
                continue;
            }

            builder.Append("@supports (color: ").Append(value).AppendLine(") {");
            builder.AppendLine(":root {");
            foreach (string propertyName in color.PropertyNames)
            {
                builder.Append("  ").Append(propertyName).Append(": ").Append(value).AppendLine(";");
            }

            if (color.IncludeAccentVariants)
            {
                foreach (int percentage in AccentMixPercentages)
                {
                    builder.Append("  --jellychat-accent-")
                        .Append(percentage)
                        .Append(": color-mix(in srgb, ")
                        .Append(value)
                        .Append(' ')
                        .Append(percentage)
                        .AppendLine("%, transparent);");
                }

                builder.AppendLine("  --jellychat-accent-soft: var(--jellychat-accent-16);");
                builder.AppendLine("  --jellychat-focus: var(--jellychat-accent-85);");
            }

            builder.AppendLine("}");
            builder.AppendLine("}");
        }

        string customCss = configuration.CustomCss ?? string.Empty;
        if (builder.Length > 0 && customCss.Length > 0)
        {
            builder.AppendLine();
        }

        builder.Append(customCss);
        string css = builder.ToString();
        byte[] content = Encoding.UTF8.GetBytes(css);
        byte[] digest = SHA256.HashData(content);
        return new JellyChatAppearanceAsset(content, Convert.ToHexString(digest)[..12]);
    }

    private sealed record AppearanceColor(
        Func<PluginConfiguration, string> GetValue,
        IReadOnlyList<string> PropertyNames,
        bool IncludeAccentVariants = false);
}
