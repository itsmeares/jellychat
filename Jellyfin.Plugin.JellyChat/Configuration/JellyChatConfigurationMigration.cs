namespace Jellyfin.Plugin.JellyChat.Configuration;

/// <summary>
/// Moves JellyChat 2.x appearance settings into the 3.x Custom theme.
/// </summary>
internal static class JellyChatConfigurationMigration
{
    /// <summary>
    /// The schema version written by this release.
    /// </summary>
    internal const int CurrentSchemaVersion = 3;

    /// <summary>
    /// Migrates the configuration in place.
    /// </summary>
    /// <param name="configuration">The configuration to migrate.</param>
    /// <returns>True when the configuration changed and should be saved.</returns>
    internal static bool Apply(PluginConfiguration configuration)
    {
        System.ArgumentNullException.ThrowIfNull(configuration);
        if (configuration.SchemaVersion >= CurrentSchemaVersion)
        {
            return false;
        }

        bool hasLegacyColors = !string.IsNullOrWhiteSpace(configuration.AccentColor)
            || !string.IsNullOrWhiteSpace(configuration.DrawerBackgroundColor)
            || !string.IsNullOrWhiteSpace(configuration.PanelBackgroundColor)
            || !string.IsNullOrWhiteSpace(configuration.TextColor);
        if (hasLegacyColors)
        {
            configuration.DefaultTheme = "custom";
            configuration.CustomBase = "violet";
            configuration.CustomAccent = Prefer(configuration.CustomAccent, configuration.AccentColor);
            configuration.CustomBackground = Prefer(configuration.CustomBackground, configuration.DrawerBackgroundColor);
            configuration.CustomSurface = Prefer(configuration.CustomSurface, configuration.PanelBackgroundColor);
            configuration.CustomText = Prefer(configuration.CustomText, configuration.TextColor);
        }

        configuration.SchemaVersion = CurrentSchemaVersion;
        return true;
    }

    private static string Prefer(string current, string legacy)
    {
        return string.IsNullOrWhiteSpace(current) ? legacy?.Trim() ?? string.Empty : current;
    }
}
