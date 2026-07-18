using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using Jellyfin.Plugin.JellyChat.Infrastructure;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Session;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.JellyChat.Api;

/// <summary>
/// JellyChat room event API endpoints.
/// </summary>
[ApiController]
[Route("JellyChat")]
[Authorize]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public class JellyChatController : ControllerBase
{
    private const string ChatMessageEventType = "chat.message";
    private const string ReactionEmojiEventType = "reaction.emoji";
    private const string PlaybackStartEventType = "playback.start";
    private const string PlaybackPlayEventType = "playback.play";
    private const string PlaybackPauseEventType = "playback.pause";
    private const string PlaybackSeekEventType = "playback.seek";
    private const string TypingUpdateEventType = "typing.update";
    private const string SystemNoticeEventType = "system.notice";
    private const int DefaultEventLimit = 100;
    private const int MaxEventLimit = 200;
    private const int MaxReplyEventIdLength = 128;
    private const int MaxReplyUserIdLength = 128;
    private const int MaxReplyUserNameLength = 80;
    private const int MaxReplyPreviewLength = 140;
    private const int MaxReplyCreatedAtLength = 64;

    private readonly ISessionManager _sessionManager;
    private readonly IUserManager _userManager;
    private readonly JellyChatSyncPlayStateResolver _syncPlayStateResolver;
    private readonly JellyChatEventStore _eventStore;

    /// <summary>
    /// Initializes a new instance of the <see cref="JellyChatController"/> class.
    /// </summary>
    /// <param name="sessionManager">The Jellyfin session manager.</param>
    /// <param name="userManager">The Jellyfin user manager.</param>
    /// <param name="syncPlayStateResolver">The authoritative Jellyfin SyncPlay state resolver.</param>
    /// <param name="eventStore">The in-memory event store.</param>
    public JellyChatController(
        ISessionManager sessionManager,
        IUserManager userManager,
        JellyChatSyncPlayStateResolver syncPlayStateResolver,
        JellyChatEventStore eventStore)
    {
        _sessionManager = sessionManager;
        _userManager = userManager;
        _syncPlayStateResolver = syncPlayStateResolver;
        _eventStore = eventStore;
    }

    /// <summary>
    /// Stores an event for the caller's active SyncPlay group.
    /// </summary>
    /// <param name="request">The event request payload.</param>
    /// <returns>The stored event snapshot.</returns>
    [HttpPost("Events")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public ActionResult<JellyChatEvent> CreateEvent([FromBody, Required] JellyChatEventRequest request)
    {
        if (request is null)
        {
            return BadRequest("Request body is required.");
        }

        Guid userId = ResolveCurrentUserId();
        if (userId == Guid.Empty)
        {
            return BadRequest("Could not resolve current user id.");
        }

        var allSessions = _sessionManager.Sessions.ToList();
        var controllingSession = ResolveCallerSession(allSessions, userId, request.SenderSessionId);
        if (controllingSession is null)
        {
            return StatusCode(StatusCodes.Status409Conflict, "Current Jellyfin session could not be resolved.");
        }

        var activeGroup = _syncPlayStateResolver.ResolveSession(controllingSession.Id);
        if (!activeGroup.LookupAvailable)
        {
            return StatusCode(StatusCodes.Status409Conflict, "Current SyncPlay state could not be resolved.");
        }

        var targetGroup = activeGroup.Room;
        if (targetGroup is null || !IsActiveParticipant(targetGroup, controllingSession, userId))
        {
            return StatusCode(StatusCodes.Status403Forbidden, "Current session is not in the requested SyncPlay group.");
        }

        if (!RequestMatchesActiveGroup(request.GroupId, targetGroup.GroupId))
        {
            return StatusCode(StatusCodes.Status403Forbidden, "Current session is not in the requested SyncPlay group.");
        }

        string userName = ResolveSenderName(userId, controllingSession);
        if (!TryCreateEvent(request, targetGroup.GroupId, userId, userName, controllingSession.Id, out var roomEvent, out string error))
        {
            return BadRequest(error);
        }

        if (!_eventStore.TryAddOrGet(targetGroup, roomEvent, out var storedEvent))
        {
            return StatusCode(StatusCodes.Status403Forbidden, "JellyChat room is locked.");
        }

        return Ok(storedEvent);
    }

    /// <summary>
    /// Gets recent events for a SyncPlay group.
    /// </summary>
    /// <param name="groupId">SyncPlay group identifier.</param>
    /// <param name="senderSessionId">Current client session identifier.</param>
    /// <param name="afterSequence">Optional event sequence cursor.</param>
    /// <param name="limit">Optional result limit.</param>
    /// <returns>Recent event snapshots.</returns>
    [HttpGet("Events")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public ActionResult<IReadOnlyList<JellyChatEvent>> GetEvents(
        [FromQuery, Required] string groupId,
        [FromQuery] string? senderSessionId,
        [FromQuery] long? afterSequence,
        [FromQuery] int? limit)
    {
        Guid userId = ResolveCurrentUserId();
        if (userId == Guid.Empty)
        {
            return BadRequest("Could not resolve current user id.");
        }

        if (!Guid.TryParse(groupId, out var parsedGroupId) || parsedGroupId == Guid.Empty)
        {
            return BadRequest("Valid groupId is required.");
        }

        if (afterSequence < 0)
        {
            return BadRequest("afterSequence must be zero or greater.");
        }

        var allSessions = _sessionManager.Sessions.ToList();
        var controllingSession = ResolveCallerSession(allSessions, userId, senderSessionId);
        if (controllingSession is null)
        {
            return StatusCode(StatusCodes.Status409Conflict, "Current Jellyfin session could not be resolved.");
        }

        var activeGroup = _syncPlayStateResolver.ResolveSession(controllingSession.Id);
        if (!activeGroup.LookupAvailable)
        {
            return StatusCode(StatusCodes.Status409Conflict, "Current SyncPlay state could not be resolved.");
        }

        var targetGroup = activeGroup.Room;
        if (targetGroup is null
            || targetGroup.GroupId != parsedGroupId
            || !IsActiveParticipant(targetGroup, controllingSession, userId))
        {
            return StatusCode(StatusCodes.Status403Forbidden, "Current session is not an active member of the requested SyncPlay group.");
        }

        int cappedLimit = Math.Clamp(limit.GetValueOrDefault(DefaultEventLimit), 1, MaxEventLimit);
        if (!_eventStore.TryGetRecent(targetGroup, controllingSession.Id, userId, afterSequence, cappedLimit, out var events))
        {
            return StatusCode(StatusCodes.Status403Forbidden, "JellyChat room is locked.");
        }

        return Ok(events);
    }

    /// <summary>
    /// Gets the caller's current JellyChat room, if the caller's session is in a SyncPlay group.
    /// </summary>
    /// <param name="senderSessionId">Current client session identifier.</param>
    /// <returns>The current room state for the caller's session.</returns>
    [HttpGet("Room")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public ActionResult<JellyChatRoomInfo> GetRoom([FromQuery] string? senderSessionId)
    {
        Guid userId = ResolveCurrentUserId();
        if (userId == Guid.Empty)
        {
            return BadRequest("Could not resolve current user id.");
        }

        var allSessions = _sessionManager.Sessions.ToList();
        var controllingSession = ResolveCallerSession(allSessions, userId, senderSessionId);
        if (controllingSession is null)
        {
            return StatusCode(StatusCodes.Status409Conflict, "Current Jellyfin session could not be resolved.");
        }

        var activeGroup = _syncPlayStateResolver.ResolveSession(controllingSession.Id);
        if (!activeGroup.LookupAvailable)
        {
            return StatusCode(StatusCodes.Status409Conflict, "Current SyncPlay state could not be resolved.");
        }

        var room = activeGroup.Room;
        if (room is null || !IsActiveParticipant(room, controllingSession, userId))
        {
            return Ok(CreateRoomInfo(controllingSession, null, null));
        }

        var accessState = _eventStore.ReconcileRoom(room, controllingSession.Id, userId);
        return Ok(CreateRoomInfo(controllingSession, room, accessState));
    }

    /// <summary>
    /// Unlocks the caller's current JellyChat room for the authenticated session.
    /// </summary>
    /// <param name="request">The password submission.</param>
    /// <returns>The updated room state.</returns>
    [HttpPost("Room/Unlock")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public ActionResult<JellyChatRoomInfo> UnlockRoom([FromBody, Required] JellyChatRoomPasswordRequest request)
    {
        if (request is null || request.Password is null)
        {
            return BadRequest("Password is required.");
        }

        if (!TryResolveCurrentRoom(request.SenderSessionId, out var session, out var room, out Guid userId, out var errorResult))
        {
            return errorResult;
        }

        if (!_eventStore.TryUnlock(room, session.Id, userId, request.Password, out var accessState))
        {
            return StatusCode(StatusCodes.Status403Forbidden, "Incorrect password.");
        }

        return Ok(CreateRoomInfo(session, room, accessState));
    }

    /// <summary>
    /// Enables or changes the caller's current JellyChat room password.
    /// </summary>
    /// <param name="request">The password change.</param>
    /// <returns>The updated room state.</returns>
    [HttpPut("Room/Password")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public ActionResult<JellyChatRoomInfo> SetRoomPassword([FromBody, Required] JellyChatRoomPasswordRequest request)
    {
        if (request is null || string.IsNullOrEmpty(request.Password))
        {
            return BadRequest("Password must contain at least one character.");
        }

        if (!TryResolveCurrentRoom(request.SenderSessionId, out var session, out var room, out Guid userId, out var errorResult))
        {
            return errorResult;
        }

        if (!_eventStore.TrySetPassword(room, session.Id, userId, request.Password, out var accessState))
        {
            if (accessState.IsOwner)
            {
                return StatusCode(StatusCodes.Status409Conflict, "Room password changed while the request was being processed.");
            }

            return StatusCode(StatusCodes.Status403Forbidden, "Only the current JellyChat room owner can manage the password.");
        }

        return Ok(CreateRoomInfo(session, room, accessState));
    }

    /// <summary>
    /// Disables password protection for the caller's current JellyChat room.
    /// </summary>
    /// <param name="senderSessionId">Current client session identifier.</param>
    /// <returns>The updated room state.</returns>
    [HttpDelete("Room/Password")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public ActionResult<JellyChatRoomInfo> DisableRoomPassword([FromQuery] string? senderSessionId)
    {
        if (!TryResolveCurrentRoom(senderSessionId, out var session, out var room, out Guid userId, out var errorResult))
        {
            return errorResult;
        }

        if (!_eventStore.TryDisablePassword(room, session.Id, userId, out var accessState))
        {
            return StatusCode(StatusCodes.Status403Forbidden, "Only the current JellyChat room owner can manage the password.");
        }

        return Ok(CreateRoomInfo(session, room, accessState));
    }

    private bool TryResolveCurrentRoom(
        string? preferredSessionId,
        out SessionInfo session,
        out JellyChatSyncPlayRoomSnapshot room,
        out Guid userId,
        out ObjectResult errorResult)
    {
        userId = ResolveCurrentUserId();
        session = null!;
        room = null!;
        if (userId == Guid.Empty)
        {
            errorResult = StatusCode(StatusCodes.Status400BadRequest, "Could not resolve current user id.");
            return false;
        }

        var allSessions = _sessionManager.Sessions.ToList();
        var controllingSession = ResolveCallerSession(allSessions, userId, preferredSessionId);
        if (controllingSession is null)
        {
            errorResult = StatusCode(StatusCodes.Status409Conflict, "Current Jellyfin session could not be resolved.");
            return false;
        }

        var activeGroup = _syncPlayStateResolver.ResolveSession(controllingSession.Id);
        if (!activeGroup.LookupAvailable)
        {
            errorResult = StatusCode(StatusCodes.Status409Conflict, "Current SyncPlay state could not be resolved.");
            return false;
        }

        if (activeGroup.Room is null || !IsActiveParticipant(activeGroup.Room, controllingSession, userId))
        {
            errorResult = StatusCode(StatusCodes.Status403Forbidden, "Current session is not an active member of a SyncPlay group.");
            return false;
        }

        session = controllingSession;
        room = activeGroup.Room;
        errorResult = StatusCode(StatusCodes.Status500InternalServerError, "Unexpected room resolution error.");
        return true;
    }

    private static bool RequestMatchesActiveGroup(string? requestedGroupId, Guid activeGroupId)
    {
        return string.IsNullOrWhiteSpace(requestedGroupId)
            || (Guid.TryParse(requestedGroupId, out var parsedGroupId) && parsedGroupId == activeGroupId);
    }

    private static bool IsActiveParticipant(JellyChatSyncPlayRoomSnapshot room, SessionInfo session, Guid userId)
    {
        return room.Participants.Any(participant =>
            string.Equals(participant.SessionId, session.Id, StringComparison.Ordinal)
            && participant.UserId == userId);
    }

    private static JellyChatRoomInfo CreateRoomInfo(
        SessionInfo session,
        JellyChatSyncPlayRoomSnapshot? room,
        JellyChatRoomAccessState? accessState)
    {
        return new JellyChatRoomInfo
        {
            InGroup = room is not null,
            GroupId = room?.GroupId.ToString() ?? string.Empty,
            GroupName = room?.GroupName ?? string.Empty,
            SessionId = session.Id,
            DeviceId = session.DeviceId ?? string.Empty,
            Participants = room?.Participants
                .Select(static participant => participant.UserName)
                .Where(static userName => !string.IsNullOrWhiteSpace(userName))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList() ?? [],
            ExactMembership = true,
            MembershipSource = room is null ? "current-session-not-in-syncplay" : "current-session-syncplay-map",
            PasswordProtected = accessState?.PasswordProtected ?? false,
            Authorized = accessState?.Authorized ?? false,
            IsOwner = accessState?.IsOwner ?? false
        };
    }

    private static bool TryCreateEvent(
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
        if (string.IsNullOrEmpty(type))
        {
            error = "Type is required.";
            return false;
        }

        if (!ArePlaybackPositionsValid(request, out error))
        {
            return false;
        }

        if (!string.Equals(type, ChatMessageEventType, StringComparison.Ordinal) && request.ReplyTo is not null)
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
            ClientEventId = NormalizeOptionalText(request.ClientEventId)
        };

        switch (type)
        {
            case ChatMessageEventType:
                return TryApplyTextEvent(request, roomEvent, "Text is required.", allowReply: true, out error);
            case ReactionEmojiEventType:
                return TryApplyReactionEvent(request, roomEvent, out error);
            case PlaybackStartEventType:
                ApplyPlaybackEvent(request, roomEvent, "start", includeSeekTarget: false);
                return true;
            case PlaybackPlayEventType:
                ApplyPlaybackEvent(request, roomEvent, "play", includeSeekTarget: false);
                return true;
            case PlaybackPauseEventType:
                ApplyPlaybackEvent(request, roomEvent, "pause", includeSeekTarget: false);
                return true;
            case PlaybackSeekEventType:
                return TryApplySeekEvent(request, roomEvent, out error);
            case TypingUpdateEventType:
                return TryApplyTypingEvent(request, roomEvent, out error);
            case SystemNoticeEventType:
                return TryApplyTextEvent(request, roomEvent, "Text is required for system.notice.", allowReply: false, out error);
            default:
                error = "Unsupported event type.";
                return false;
        }
    }

    private static bool TryApplyTextEvent(
        JellyChatEventRequest request,
        JellyChatEvent roomEvent,
        string errorMessage,
        bool allowReply,
        out string error)
    {
        string? text = NormalizeOptionalText(request.Text);
        if (string.IsNullOrEmpty(text))
        {
            error = errorMessage;
            return false;
        }

        roomEvent.Text = text;
        if (allowReply && !TryApplyReplyTarget(request.ReplyTo, roomEvent, out error))
        {
            return false;
        }

        error = string.Empty;
        return true;
    }

    private static bool TryApplyReplyTarget(JellyChatReplyTarget? replyTo, JellyChatEvent roomEvent, out string error)
    {
        error = string.Empty;
        if (replyTo is null)
        {
            return true;
        }

        string? eventId = NormalizeOptionalText(replyTo.EventId);
        string? messagePreview = NormalizeOptionalText(replyTo.MessagePreview);
        if (string.IsNullOrEmpty(eventId) || string.IsNullOrEmpty(messagePreview))
        {
            error = "ReplyTo requires EventId and MessagePreview.";
            return false;
        }

        roomEvent.ReplyTo = new JellyChatReplyTarget
        {
            EventId = Truncate(eventId, MaxReplyEventIdLength),
            UserId = Truncate(NormalizeOptionalText(replyTo.UserId) ?? string.Empty, MaxReplyUserIdLength),
            UserName = Truncate(NormalizeOptionalText(replyTo.UserName) ?? "Someone", MaxReplyUserNameLength),
            MessagePreview = Truncate(CollapseWhitespace(messagePreview), MaxReplyPreviewLength),
            CreatedAt = Truncate(NormalizeOptionalText(replyTo.CreatedAt) ?? string.Empty, MaxReplyCreatedAtLength)
        };
        return true;
    }

    private static bool TryApplyReactionEvent(JellyChatEventRequest request, JellyChatEvent roomEvent, out string error)
    {
        string? emoji = NormalizeOptionalText(request.Emoji);
        if (string.IsNullOrEmpty(emoji))
        {
            error = "Emoji is required.";
            return false;
        }

        roomEvent.Emoji = emoji;
        roomEvent.PositionSeconds = request.PositionSeconds;
        roomEvent.ItemId = NormalizeOptionalText(request.ItemId);
        roomEvent.ItemName = NormalizeOptionalText(request.ItemName);
        error = string.Empty;
        return true;
    }

    private static bool TryApplyTypingEvent(JellyChatEventRequest request, JellyChatEvent roomEvent, out string error)
    {
        if (!request.IsTyping.HasValue)
        {
            error = "IsTyping is required.";
            return false;
        }

        roomEvent.IsTyping = request.IsTyping.Value;
        error = string.Empty;
        return true;
    }

    private static bool TryApplySeekEvent(JellyChatEventRequest request, JellyChatEvent roomEvent, out string error)
    {
        if (!request.FromPositionTicks.HasValue && !request.ToPositionTicks.HasValue)
        {
            error = "playback.seek requires FromPositionTicks or ToPositionTicks.";
            return false;
        }

        ApplyPlaybackEvent(request, roomEvent, "seek", includeSeekTarget: true);
        error = string.Empty;
        return true;
    }

    private static void ApplyPlaybackEvent(
        JellyChatEventRequest request,
        JellyChatEvent roomEvent,
        string playbackAction,
        bool includeSeekTarget)
    {
        roomEvent.PlaybackAction = playbackAction;
        roomEvent.FromPositionTicks = request.FromPositionTicks;
        roomEvent.ToPositionTicks = includeSeekTarget ? request.ToPositionTicks : null;
        roomEvent.ItemId = NormalizeOptionalText(request.ItemId);
        roomEvent.ItemName = NormalizeOptionalText(request.ItemName);
    }

    private static bool ArePlaybackPositionsValid(JellyChatEventRequest request, out string error)
    {
        if (request.FromPositionTicks < 0)
        {
            error = "FromPositionTicks must be zero or greater.";
            return false;
        }

        if (request.ToPositionTicks < 0)
        {
            error = "ToPositionTicks must be zero or greater.";
            return false;
        }

        if (request.PositionSeconds < 0)
        {
            error = "PositionSeconds must be zero or greater.";
            return false;
        }

        error = string.Empty;
        return true;
    }

    private static string? NormalizeOptionalText(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Trim();
    }

    private static string CollapseWhitespace(string value)
    {
        return string.Join(" ", value.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
    }

    private static string Truncate(string value, int maxLength)
    {
        if (value.Length <= maxLength)
        {
            return value;
        }

        return value[..maxLength].Trim();
    }

    private string ResolveSenderName(Guid userId, SessionInfo controllingSession)
    {
        var user = _userManager.GetUserById(userId);
        if (IsUsableUserName(user?.Username))
        {
            return user!.Username;
        }

        if (IsUsableUserName(controllingSession.UserName))
        {
            return controllingSession.UserName!;
        }

        return "Someone";
    }

    private static bool IsUsableUserName(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        string trimmed = value.Trim();
        return !string.Equals(trimmed, bool.TrueString, StringComparison.OrdinalIgnoreCase)
            && !string.Equals(trimmed, bool.FalseString, StringComparison.OrdinalIgnoreCase);
    }

    private Guid ResolveCurrentUserId()
    {
        var userIdClaim = User.Claims.FirstOrDefault(claim => string.Equals(claim.Type, "Jellyfin-UserId", StringComparison.OrdinalIgnoreCase))?.Value;
        if (string.IsNullOrWhiteSpace(userIdClaim))
        {
            return Guid.Empty;
        }

        if (Guid.TryParse(userIdClaim, out var userId))
        {
            return userId;
        }

        return Guid.Empty;
    }

    private SessionInfo? ResolveCallerSession(List<SessionInfo> sessions, Guid userId, string? preferredSessionId)
    {
        string requestDeviceId = ResolveRequestDeviceId();
        if (!string.IsNullOrWhiteSpace(preferredSessionId))
        {
            var preferred = sessions.FirstOrDefault(session =>
                string.Equals(session.Id, preferredSessionId, StringComparison.Ordinal)
                && session.UserId == userId);
            if (preferred is not null
                && (string.IsNullOrWhiteSpace(requestDeviceId)
                    || string.Equals(preferred.DeviceId, requestDeviceId, StringComparison.OrdinalIgnoreCase)))
            {
                if (!string.IsNullOrWhiteSpace(requestDeviceId))
                {
                    return preferred;
                }

                return sessions.Count(session => session.UserId == userId) == 1 ? preferred : null;
            }

            return preferred is not null && sessions.Count(session => session.UserId == userId) == 1 ? preferred : null;
        }

        if (!string.IsNullOrWhiteSpace(requestDeviceId))
        {
            var deviceMatches = sessions
                .Where(session => session.UserId == userId
                    && string.Equals(session.DeviceId, requestDeviceId, StringComparison.OrdinalIgnoreCase))
                .ToList();
            if (deviceMatches.Count == 1)
            {
                return deviceMatches[0];
            }

            if (deviceMatches.Count > 1)
            {
                return null;
            }
        }

        var fromUser = sessions
            .Where(session => session.UserId == userId)
            .ToList();
        if (fromUser.Count == 1)
        {
            return fromUser[0];
        }

        return null;
    }

    private string ResolveRequestDeviceId()
    {
        foreach (var claim in User.Claims)
        {
            if (claim.Type.Contains("DeviceId", StringComparison.OrdinalIgnoreCase)
                && !string.IsNullOrWhiteSpace(claim.Value))
            {
                return claim.Value.Trim();
            }
        }

        foreach (string headerName in new[] { "X-Emby-Authorization", "Authorization" })
        {
            string headerValue = Request.Headers[headerName].ToString();
            string deviceId = GetAuthorizationHeaderParameter(headerValue, "DeviceId");
            if (!string.IsNullOrWhiteSpace(deviceId))
            {
                return deviceId;
            }
        }

        return string.Empty;
    }

    private static string GetAuthorizationHeaderParameter(string headerValue, string key)
    {
        if (string.IsNullOrWhiteSpace(headerValue))
        {
            return string.Empty;
        }

        string normalizedHeader = headerValue.Trim();
        const string mediaBrowserPrefix = "MediaBrowser ";
        if (normalizedHeader.StartsWith(mediaBrowserPrefix, StringComparison.OrdinalIgnoreCase))
        {
            normalizedHeader = normalizedHeader[mediaBrowserPrefix.Length..];
        }

        foreach (string part in normalizedHeader.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            string[] pieces = part.Split('=', 2, StringSplitOptions.TrimEntries);
            if (pieces.Length != 2 || !string.Equals(pieces[0], key, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            return pieces[1].Trim().Trim('"');
        }

        return string.Empty;
    }
}
