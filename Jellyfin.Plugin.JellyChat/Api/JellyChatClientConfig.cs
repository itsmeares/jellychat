using Jellyfin.Plugin.JellyChat.Configuration;

namespace Jellyfin.Plugin.JellyChat.Api;

/// <summary>
/// Server defaults the web client combines with each user's own preferences.
/// </summary>
public sealed class JellyChatClientConfig
{
    /// <summary>
    /// Gets or sets the default theme.
    /// </summary>
    public string Theme { get; set; } = "violet";

    /// <summary>
    /// Gets or sets the default layout.
    /// </summary>
    public string Layout { get; set; } = "docked";

    /// <summary>
    /// Gets or sets the side the user's own messages sit on.
    /// </summary>
    public string MessageSide { get; set; } = "left";

    /// <summary>
    /// Gets or sets the default message style.
    /// </summary>
    public string MessageStyle { get; set; } = "bubbles";

    /// <summary>
    /// Gets or sets a value indicating whether the floating layout hides itself while a video plays.
    /// </summary>
    public bool AutoHide { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether the keyboard shortcut is available.
    /// </summary>
    public bool ShortcutEnabled { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether users may choose their own look.
    /// </summary>
    public bool AllowUserAppearance { get; set; } = true;

    /// <summary>
    /// Gets or sets the Custom theme preset it starts from.
    /// </summary>
    public string CustomBase { get; set; } = "violet";

    /// <summary>
    /// Gets or sets the Custom theme corner style.
    /// </summary>
    public string CustomCorners { get; set; } = "soft";

    /// <summary>
    /// Gets or sets a value indicating whether the Custom theme is see-through.
    /// </summary>
    public bool CustomGlass { get; set; }

    /// <summary>
    /// Creates the client configuration from the stored plugin configuration, replacing invalid values with defaults.
    /// </summary>
    /// <param name="configuration">The stored plugin configuration.</param>
    /// <returns>The normalized client configuration.</returns>
    internal static JellyChatClientConfig From(PluginConfiguration configuration)
    {
        System.ArgumentNullException.ThrowIfNull(configuration);
        return new JellyChatClientConfig
        {
            Theme = JellyChatThemeValues.Theme(configuration.DefaultTheme),
            Layout = JellyChatThemeValues.Layout(configuration.DefaultLayout),
            MessageSide = JellyChatThemeValues.Side(configuration.DefaultMessageSide),
            MessageStyle = JellyChatThemeValues.Style(configuration.DefaultMessageStyle),
            AutoHide = configuration.DefaultAutoHide,
            ShortcutEnabled = configuration.ShortcutEnabled,
            AllowUserAppearance = configuration.AllowUserAppearance,
            CustomBase = JellyChatThemeValues.Base(configuration.CustomBase),
            CustomCorners = JellyChatThemeValues.Corners(configuration.CustomCorners),
            CustomGlass = configuration.CustomGlass
        };
    }
}
