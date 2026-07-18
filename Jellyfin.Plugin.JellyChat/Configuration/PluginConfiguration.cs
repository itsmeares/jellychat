using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.JellyChat.Configuration;

/// <summary>
/// Plugin configuration.
/// </summary>
public class PluginConfiguration : BasePluginConfiguration
{
    /// <summary>
    /// Gets or sets the JellyChat accent color.
    /// </summary>
    public string AccentColor { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the JellyChat drawer background color.
    /// </summary>
    public string DrawerBackgroundColor { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the JellyChat panel and input background color.
    /// </summary>
    public string PanelBackgroundColor { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the JellyChat border color.
    /// </summary>
    public string BorderColor { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the JellyChat text color.
    /// </summary>
    public string TextColor { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets server-wide custom CSS loaded after JellyChat styles.
    /// </summary>
    public string CustomCss { get; set; } = string.Empty;
}
