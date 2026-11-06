using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.JellyChat.Configuration;

/// <summary>
/// Plugin configuration.
/// </summary>
public class PluginConfiguration : BasePluginConfiguration
{
    /// <summary>
    /// Gets or sets the configuration schema version. Zero means the file was written by JellyChat 2.x or is new.
    /// </summary>
    public int SchemaVersion { get; set; }

    /// <summary>
    /// Gets or sets the default theme: <c>violet</c>, <c>glass</c> or <c>custom</c>.
    /// </summary>
    public string DefaultTheme { get; set; } = "violet";

    /// <summary>
    /// Gets or sets the default layout: <c>docked</c> or <c>floating</c>.
    /// </summary>
    public string DefaultLayout { get; set; } = "docked";

    /// <summary>
    /// Gets or sets which side the user's own messages sit on: <c>left</c> or <c>right</c>.
    /// </summary>
    public string DefaultMessageSide { get; set; } = "left";

    /// <summary>
    /// Gets or sets the default message style: <c>bubbles</c> or <c>flat</c>.
    /// </summary>
    public string DefaultMessageStyle { get; set; } = "bubbles";

    /// <summary>
    /// Gets or sets a value indicating whether the floating layout hides itself while a video plays.
    /// </summary>
    public bool DefaultAutoHide { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether the open and close keyboard shortcut is available.
    /// </summary>
    public bool ShortcutEnabled { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether users may choose their own theme, layout and message style.
    /// </summary>
    public bool AllowUserAppearance { get; set; } = true;

    /// <summary>
    /// Gets or sets the preset the Custom theme starts from: <c>violet</c> or <c>glass</c>.
    /// </summary>
    public string CustomBase { get; set; } = "violet";

    /// <summary>
    /// Gets or sets the Custom theme accent color.
    /// </summary>
    public string CustomAccent { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the Custom theme background color.
    /// </summary>
    public string CustomBackground { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the Custom theme surface color, used for bubbles and the input.
    /// </summary>
    public string CustomSurface { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the Custom theme text color.
    /// </summary>
    public string CustomText { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the Custom theme corner style: <c>sharp</c>, <c>soft</c> or <c>pill</c>.
    /// </summary>
    public string CustomCorners { get; set; } = "soft";

    /// <summary>
    /// Gets or sets a value indicating whether the Custom theme uses a see-through blurred background.
    /// </summary>
    public bool CustomGlass { get; set; }

    /// <summary>
    /// Gets or sets the Custom theme blur strength in pixels.
    /// </summary>
    public int CustomGlassBlur { get; set; } = 20;

    /// <summary>
    /// Gets or sets server-wide custom CSS loaded after JellyChat styles.
    /// </summary>
    public string CustomCss { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the JellyChat 2.x accent color. Kept so old settings can be migrated.
    /// </summary>
    public string AccentColor { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the JellyChat 2.x drawer background color. Kept so old settings can be migrated.
    /// </summary>
    public string DrawerBackgroundColor { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the JellyChat 2.x panel background color. Kept so old settings can be migrated.
    /// </summary>
    public string PanelBackgroundColor { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the JellyChat 2.x border color. Kept so old settings can be migrated.
    /// </summary>
    public string BorderColor { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the JellyChat 2.x text color. Kept so old settings can be migrated.
    /// </summary>
    public string TextColor { get; set; } = string.Empty;
}
