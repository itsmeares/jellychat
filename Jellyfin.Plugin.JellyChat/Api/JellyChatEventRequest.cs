namespace Jellyfin.Plugin.JellyChat.Api;

/// <summary>
/// Request payload for creating a JellyChat room event.
/// </summary>
public class JellyChatEventRequest
{
    /// <summary>
    /// Gets or sets the preferred SyncPlay group identifier.
    /// </summary>
    public string? GroupId { get; set; }

    /// <summary>
    /// Gets or sets the event type.
    /// </summary>
    public string? Type { get; set; }

    /// <summary>
    /// Gets or sets the text payload.
    /// </summary>
    public string? Text { get; set; }

    /// <summary>
    /// Gets or sets optional reply target metadata for chat messages.
    /// </summary>
    public JellyChatReplyTarget? ReplyTo { get; set; }

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
    /// Gets or sets the playback position in seconds.
    /// </summary>
    public double? PositionSeconds { get; set; }

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

    /// <summary>
    /// Gets or sets whether the sender is typing.
    /// </summary>
    public bool? IsTyping { get; set; }

    /// <summary>
    /// Gets or sets the sender session identifier from the web client.
    /// </summary>
    public string? SenderSessionId { get; set; }

    /// <summary>
    /// Gets or sets comma-separated participant hints from SyncPlay group payloads.
    /// </summary>
    public string? ParticipantsCsv { get; set; }
}
