using System.Collections.Generic;

namespace Jellyfin.Plugin.JellyChat.Api;

/// <summary>
/// One answer to a Sync request: the current room, any new events, and a token that changes when the room changes.
/// </summary>
public sealed class JellyChatSyncResponse
{
    /// <summary>
    /// Gets or sets the caller's current room state.
    /// </summary>
    public JellyChatRoomInfo Room { get; set; } = new();

    /// <summary>
    /// Gets or sets events newer than the requested cursor.
    /// </summary>
    public IReadOnlyList<JellyChatEvent> Events { get; set; } = [];

    /// <summary>
    /// Gets or sets a token describing the room. Send it back on the next request.
    /// </summary>
    public string RoomVersion { get; set; } = string.Empty;
}
