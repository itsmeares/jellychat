namespace Jellyfin.Plugin.JellyChat.Api;

/// <summary>
/// Request for unlocking or setting a temporary JellyChat room password.
/// </summary>
public sealed class JellyChatRoomPasswordRequest
{
    /// <summary>
    /// Gets or sets the validated Jellyfin session hint from the web client.
    /// </summary>
    public string? SenderSessionId { get; set; }

    /// <summary>
    /// Gets or sets the submitted password.
    /// </summary>
    public string? Password { get; set; }
}
