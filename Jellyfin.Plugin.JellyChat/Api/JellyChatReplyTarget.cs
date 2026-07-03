namespace Jellyfin.Plugin.JellyChat.Api;

/// <summary>
/// Lightweight metadata describing the message a chat event replies to.
/// </summary>
public class JellyChatReplyTarget
{
    /// <summary>
    /// Gets or sets the target event identifier.
    /// </summary>
    public string EventId { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the target sender identifier.
    /// </summary>
    public string UserId { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the target sender display name.
    /// </summary>
    public string UserName { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets a compact preview of the target message.
    /// </summary>
    public string MessagePreview { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the target creation timestamp.
    /// </summary>
    public string CreatedAt { get; set; } = string.Empty;
}
