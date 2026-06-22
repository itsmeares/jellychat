using System;

namespace Jellyfin.Plugin.SyncPlayChat.Api;

/// <summary>
/// A stored JellyChat room event.
/// </summary>
public class JellyChatEvent
{
    /// <summary>
    /// Gets or sets the event identifier.
    /// </summary>
    public Guid Id { get; set; }

    /// <summary>
    /// Gets or sets the per-group event sequence.
    /// </summary>
    public long Sequence { get; set; }

    /// <summary>
    /// Gets or sets the SyncPlay group identifier.
    /// </summary>
    public Guid GroupId { get; set; }

    /// <summary>
    /// Gets or sets the event type.
    /// </summary>
    public string Type { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the Jellyfin user identifier.
    /// </summary>
    public Guid UserId { get; set; }

    /// <summary>
    /// Gets or sets the Jellyfin user name.
    /// </summary>
    public string UserName { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the Jellyfin session identifier.
    /// </summary>
    public string SessionId { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the event creation timestamp.
    /// </summary>
    public DateTime CreatedAtUtc { get; set; }

    /// <summary>
    /// Gets or sets the text payload.
    /// </summary>
    public string? Text { get; set; }

    /// <summary>
    /// Gets or sets the emoji payload.
    /// </summary>
    public string? Emoji { get; set; }

    /// <summary>
    /// Gets or sets the playback action payload.
    /// </summary>
    public string? PlaybackAction { get; set; }

    /// <summary>
    /// Gets or sets the source playback position in ticks.
    /// </summary>
    public long? FromPositionTicks { get; set; }

    /// <summary>
    /// Gets or sets the target playback position in ticks.
    /// </summary>
    public long? ToPositionTicks { get; set; }

    /// <summary>
    /// Gets or sets the related Jellyfin item identifier.
    /// </summary>
    public string? ItemId { get; set; }

    /// <summary>
    /// Gets or sets the related Jellyfin item name.
    /// </summary>
    public string? ItemName { get; set; }

    /// <summary>
    /// Gets or sets the client-generated event identifier.
    /// </summary>
    public string? ClientEventId { get; set; }
}
