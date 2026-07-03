using System.Collections.Generic;

namespace Jellyfin.Plugin.JellyChat.Api;

/// <summary>
/// JellyChat room state for the caller's current Jellyfin session.
/// </summary>
public sealed class JellyChatRoomInfo
{
    /// <summary>
    /// Gets or sets a value indicating whether the caller's session is in a SyncPlay group.
    /// </summary>
    public bool InGroup { get; set; }

    /// <summary>
    /// Gets or sets the SyncPlay group identifier.
    /// </summary>
    public string GroupId { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the SyncPlay group name.
    /// </summary>
    public string GroupName { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the caller's Jellyfin session identifier.
    /// </summary>
    public string SessionId { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the caller's Jellyfin device identifier.
    /// </summary>
    public string DeviceId { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the participant display names exposed by Jellyfin SyncPlay.
    /// </summary>
    public IReadOnlyList<string> Participants { get; set; } = [];

    /// <summary>
    /// Gets or sets a value indicating whether membership came from session-scoped SyncPlay state.
    /// </summary>
    public bool ExactMembership { get; set; }

    /// <summary>
    /// Gets or sets the source used to resolve membership.
    /// </summary>
    public string MembershipSource { get; set; } = string.Empty;
}
