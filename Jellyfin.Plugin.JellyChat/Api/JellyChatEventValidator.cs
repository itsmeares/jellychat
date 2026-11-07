using System;
using Jellyfin.Plugin.JellyChat.Infrastructure;

namespace Jellyfin.Plugin.JellyChat.Api;

/// <summary>
/// Validates incoming event requests and turns them into stored events.
/// </summary>
internal static class JellyChatEventValidator
{
    private const int MaxReplyEventIdLength = 128;
    private const int MaxReplyUserIdLength = 128;
    private const int MaxReplyUserNameLength = 80;
    private const int MaxReplyPreviewLength = 140;
    private const int MaxReplyCreatedAtLength = 64;
    private const int MaxTextLength = 2000;
    private const int MaxEmojiLength = 32;
    private const int MaxIdLength = 128;
    private const int MaxItemNameLength = 300;

    internal static bool TryCreate(
        JellyChatEventRequest request,
        Guid groupId,
        Guid userId,
        string userName,
        string sessionId,
        out JellyChatEvent roomEvent,
        out string error)
    {
        roomEvent = new JellyChatEvent();
        error = string.Empty;

        string type = (request.Type ?? string.Empty).Trim().ToLowerInvariant();
        if (type.Length == 0)
        {
            error = "Type is required.";
            return false;
        }

        if (!ArePositionsValid(request, out error) || !AreLengthsValid(request, out error))
        {
            return false;
        }

        if (!string.Equals(type, "chat.message", StringComparison.Ordinal) && request.ReplyTo is not null)
        {
            error = "ReplyTo is only supported for chat.message.";
            return false;
        }

        roomEvent = new JellyChatEvent
        {
            GroupId = groupId,
            Type = type,
            UserId = userId,
            UserName = userName,
            SessionId = sessionId,
            ClientEventId = Normalize(request.ClientEventId)
        };

        switch (type)
        {
            case "chat.message":
                return TryApplyText(request, roomEvent, "Text is required.", allowReply: true, out error);
            case "system.notice":
                return TryApplyText(request, roomEvent, "Text is required for system.notice.", allowReply: false, out error);
            case "reaction.emoji":
                return TryApplyReaction(request, roomEvent, out error);
            case "playback.start":
                ApplyPlayback(request, roomEvent, "start", includeSeekTarget: false);
                return true;
            case "playback.play":
                ApplyPlayback(request, roomEvent, "play", includeSeekTarget: false);
                return true;
            case "playback.pause":
                ApplyPlayback(request, roomEvent, "pause", includeSeekTarget: false);
                return true;
            case "playback.seek":
                if (!request.FromPositionTicks.HasValue && !request.ToPositionTicks.HasValue)
                {
                    error = "playback.seek requires FromPositionTicks or ToPositionTicks.";
                    return false;
                }

                ApplyPlayback(request, roomEvent, "seek", includeSeekTarget: true);
                return true;
            case "typing.update":
                if (!request.IsTyping.HasValue)
                {
                    error = "IsTyping is required.";
                    return false;
                }

                roomEvent.IsTyping = request.IsTyping.Value;
                return true;
            default:
                error = "Unsupported event type.";
                return false;
        }
    }

    private static bool TryApplyText(
        JellyChatEventRequest request,
        JellyChatEvent roomEvent,
        string missingMessage,
        bool allowReply,
        out string error)
    {
        string? text = Normalize(request.Text);
        if (string.IsNullOrEmpty(text))
        {
            error = missingMessage;
            return false;
        }

        roomEvent.Text = text;
        error = string.Empty;
        return !allowReply || TryApplyReplyTarget(request.ReplyTo, roomEvent, out error);
    }

    private static bool TryApplyReplyTarget(JellyChatReplyTarget? replyTo, JellyChatEvent roomEvent, out string error)
    {
        error = string.Empty;
        if (replyTo is null)
        {
            return true;
        }

        string? eventId = Normalize(replyTo.EventId);
        string? preview = Normalize(replyTo.MessagePreview);
        if (string.IsNullOrEmpty(eventId) || string.IsNullOrEmpty(preview))
        {
            error = "ReplyTo requires EventId and MessagePreview.";
            return false;
        }

        roomEvent.ReplyTo = new JellyChatReplyTarget
        {
            EventId = Truncate(eventId, MaxReplyEventIdLength),
            UserId = Truncate(Normalize(replyTo.UserId) ?? string.Empty, MaxReplyUserIdLength),
            UserName = Truncate(Normalize(replyTo.UserName) ?? "Someone", MaxReplyUserNameLength),
            MessagePreview = Truncate(string.Join(' ', preview.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries)), MaxReplyPreviewLength),
            CreatedAt = Truncate(Normalize(replyTo.CreatedAt) ?? string.Empty, MaxReplyCreatedAtLength)
        };
        return true;
    }

    private static bool TryApplyReaction(JellyChatEventRequest request, JellyChatEvent roomEvent, out string error)
    {
        string? emoji = Normalize(request.Emoji);
        if (string.IsNullOrEmpty(emoji))
        {
            error = "Emoji is required.";
            return false;
        }

        roomEvent.Emoji = emoji;
        roomEvent.PositionSeconds = request.PositionSeconds;
        roomEvent.ItemId = Normalize(request.ItemId);
        roomEvent.ItemName = Normalize(request.ItemName);
        error = string.Empty;
        return true;
    }

    private static void ApplyPlayback(JellyChatEventRequest request, JellyChatEvent roomEvent, string action, bool includeSeekTarget)
    {
        roomEvent.PlaybackAction = action;
        roomEvent.FromPositionTicks = request.FromPositionTicks;
        roomEvent.ToPositionTicks = includeSeekTarget ? request.ToPositionTicks : null;
        roomEvent.ItemId = Normalize(request.ItemId);
        roomEvent.ItemName = Normalize(request.ItemName);
    }

    private static bool AreLengthsValid(JellyChatEventRequest request, out string error)
    {
        error = string.Empty;
        if ((request.Text?.Length ?? 0) > MaxTextLength)
        {
            error = "Text is too long.";
        }
        else if ((request.Emoji?.Length ?? 0) > MaxEmojiLength)
        {
            error = "Emoji is too long.";
        }
        else if ((request.ClientEventId?.Length ?? 0) > MaxIdLength || (request.ItemId?.Length ?? 0) > MaxIdLength)
        {
            error = "ClientEventId and ItemId must be 128 characters or fewer.";
        }
        else if ((request.ItemName?.Length ?? 0) > MaxItemNameLength)
        {
            error = "ItemName is too long.";
        }

        return error.Length == 0;
    }

    private static bool ArePositionsValid(JellyChatEventRequest request, out string error)
    {
        error = string.Empty;
        if (request.FromPositionTicks < 0)
        {
            error = "FromPositionTicks must be zero or greater.";
        }
        else if (request.ToPositionTicks < 0)
        {
            error = "ToPositionTicks must be zero or greater.";
        }
        else if (request.PositionSeconds < 0)
        {
            error = "PositionSeconds must be zero or greater.";
        }

        return error.Length == 0;
    }

    private static string? Normalize(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string Truncate(string value, int maxLength) => value.Length <= maxLength ? value : value[..maxLength].Trim();
}
