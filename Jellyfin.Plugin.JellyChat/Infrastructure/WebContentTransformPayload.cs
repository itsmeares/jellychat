namespace Jellyfin.Plugin.JellyChat.Infrastructure;

/// <summary>
/// Payload shape passed by File Transformation callback.
/// </summary>
public sealed class WebContentTransformPayload
{
    /// <summary>
    /// Gets or sets the original file contents.
    /// </summary>
    public string Contents { get; set; } = string.Empty;
}
