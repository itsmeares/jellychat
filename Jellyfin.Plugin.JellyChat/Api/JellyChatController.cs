using System;
using System.Collections;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Globalization;
using System.Linq;
using System.Reflection;
using Jellyfin.Plugin.JellyChat.Infrastructure;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Session;
using MediaBrowser.Controller.SyncPlay;
using MediaBrowser.Controller.SyncPlay.Requests;
using MediaBrowser.Model.SyncPlay;
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
    private readonly ISyncPlayManager _syncPlayManager;
    private readonly JellyChatEventStore _eventStore;

    /// <summary>
    /// Initializes a new instance of the <see cref="JellyChatController"/> class.
    /// </summary>
    /// <param name="sessionManager">The Jellyfin session manager.</param>
    /// <param name="userManager">The Jellyfin user manager.</param>
    /// <param name="syncPlayManager">The Jellyfin SyncPlay manager.</param>
    /// <param name="eventStore">The in-memory event store.</param>
    public JellyChatController(
        ISessionManager sessionManager,
        IUserManager userManager,
        ISyncPlayManager syncPlayManager,
        JellyChatEventStore eventStore)
    {
        _sessionManager = sessionManager;
        _userManager = userManager;
        _syncPlayManager = syncPlayManager;
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

        var visibleGroups = _syncPlayManager.ListGroups(controllingSession, new ListGroupsRequest());
        bool allowUserParticipantMatch = CanUseUserParticipantMatch(allSessions, userId);
        var activeGroup = ResolveActiveSyncPlayGroup(controllingSession);
        var targetGroup = ResolveTargetGroup(visibleGroups, request.GroupId, ParseParticipantHints(request.ParticipantsCsv));
        if (targetGroup is null)
        {
            return StatusCode(StatusCodes.Status403Forbidden, "Current session is not in the requested SyncPlay group.");
        }

        if (!CanAccessTargetGroup(controllingSession, targetGroup, activeGroup, allowUserParticipantMatch))
        {
            return StatusCode(StatusCodes.Status403Forbidden, "Current session is not an active member of the SyncPlay group.");
        }

        string userName = ResolveSenderName(userId, controllingSession);
        if (!TryCreateEvent(request, targetGroup.GroupId, userId, userName, controllingSession.Id, out var roomEvent, out string error))
        {
            return BadRequest(error);
        }

        return Ok(_eventStore.AddOrGet(roomEvent));
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

        var visibleGroups = _syncPlayManager.ListGroups(controllingSession, new ListGroupsRequest());
        bool allowUserParticipantMatch = CanUseUserParticipantMatch(allSessions, userId);
        var activeGroup = ResolveActiveSyncPlayGroup(controllingSession);
        var targetGroup = visibleGroups.FirstOrDefault(group => group.GroupId == parsedGroupId);
        if (targetGroup is null || !CanAccessTargetGroup(controllingSession, targetGroup, activeGroup, allowUserParticipantMatch))
        {
            return StatusCode(StatusCodes.Status403Forbidden, "Current session is not an active member of the requested SyncPlay group.");
        }

        int cappedLimit = Math.Clamp(limit.GetValueOrDefault(DefaultEventLimit), 1, MaxEventLimit);
        return Ok(_eventStore.GetRecent(parsedGroupId, afterSequence, cappedLimit));
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

        var activeGroup = ResolveActiveSyncPlayGroup(controllingSession);
        if (activeGroup.LookupAvailable)
        {
            return Ok(CreateRoomInfo(
                controllingSession,
                activeGroup.Group,
                activeGroup.Group is null ? "current-session-not-in-syncplay" : "current-session-syncplay-map",
                exactMembership: true));
        }

        var visibleGroups = _syncPlayManager.ListGroups(controllingSession, new ListGroupsRequest());
        bool allowUserParticipantMatch = CanUseUserParticipantMatch(allSessions, userId);
        var fallbackGroup = visibleGroups.FirstOrDefault(group => IsActiveGroupMember(controllingSession, group, allowUserParticipantMatch));
        return Ok(CreateRoomInfo(
            controllingSession,
            fallbackGroup,
            fallbackGroup is null ? "current-session-not-in-syncplay" : "current-session-syncplay-list",
            exactMembership: false));
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

    private static GroupInfoDto? ResolveTargetGroup(List<GroupInfoDto> groups, string? requestedGroupId, List<string> participants)
    {
        if (groups.Count == 0)
        {
            return null;
        }

        if (!string.IsNullOrWhiteSpace(requestedGroupId)
            && Guid.TryParse(requestedGroupId, out var parsedGroupId))
        {
            var direct = groups.FirstOrDefault(group => group.GroupId == parsedGroupId);
            if (direct is not null)
            {
                return direct;
            }

            return null;
        }

        if (!string.IsNullOrWhiteSpace(requestedGroupId))
        {
            return null;
        }

        if (participants.Count > 0)
        {
            var participantSet = new HashSet<string>(participants.Where(static p => !string.IsNullOrWhiteSpace(p)), StringComparer.OrdinalIgnoreCase);
            var best = groups
                .OrderByDescending(group => group.Participants.Count(p => participantSet.Contains(p)))
                .FirstOrDefault();

            if (best is not null)
            {
                return best;
            }
        }

        return groups[0];
    }

    private static JellyChatRoomInfo CreateRoomInfo(SessionInfo session, GroupInfoDto? group, string membershipSource, bool exactMembership)
    {
        return new JellyChatRoomInfo
        {
            InGroup = group is not null,
            GroupId = group?.GroupId.ToString() ?? string.Empty,
            GroupName = group?.GroupName ?? string.Empty,
            SessionId = session.Id,
            DeviceId = session.DeviceId ?? string.Empty,
            Participants = group?.Participants ?? [],
            ExactMembership = exactMembership,
            MembershipSource = membershipSource
        };
    }

    private static bool CanAccessTargetGroup(SessionInfo session, GroupInfoDto targetGroup, SyncPlayGroupResolution activeGroup, bool allowUserParticipantMatch)
    {
        if (activeGroup.LookupAvailable)
        {
            return activeGroup.Group?.GroupId == targetGroup.GroupId;
        }

        return IsActiveGroupMember(session, targetGroup, allowUserParticipantMatch);
    }

    private SyncPlayGroupResolution ResolveActiveSyncPlayGroup(SessionInfo session)
    {
        var field = _syncPlayManager.GetType().GetField("_sessionToGroupMap", BindingFlags.Instance | BindingFlags.NonPublic);
        if (field is null)
        {
            return new SyncPlayGroupResolution(false, null);
        }

        object? map = field.GetValue(_syncPlayManager);
        if (map is null || !TryReadSessionGroupMap(map, session.Id, out var internalGroup))
        {
            return new SyncPlayGroupResolution(false, null);
        }

        if (internalGroup is null)
        {
            return new SyncPlayGroupResolution(true, null);
        }

        var groupInfo = ReadInternalGroupInfo(internalGroup);
        return groupInfo is null
            ? new SyncPlayGroupResolution(false, null)
            : new SyncPlayGroupResolution(true, groupInfo);
    }

    private static bool TryReadSessionGroupMap(object map, string sessionId, out object? internalGroup)
    {
        internalGroup = null;
        if (map is not IEnumerable entries)
        {
            return false;
        }

        foreach (object entry in entries)
        {
            object? key = ReadObjectMember(entry, "Key");
            if (!string.Equals(Convert.ToString(key, CultureInfo.InvariantCulture), sessionId, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            internalGroup = ReadObjectMember(entry, "Value");
            return true;
        }

        return true;
    }

    private static GroupInfoDto? ReadInternalGroupInfo(object internalGroup)
    {
        var method = internalGroup.GetType().GetMethod(
            "GetInfo",
            BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic,
            binder: null,
            types: Type.EmptyTypes,
            modifiers: null);
        if (method is null)
        {
            return null;
        }

        lock (internalGroup)
        {
            return method.Invoke(internalGroup, null) as GroupInfoDto;
        }
    }

    private static object? ReadObjectMember(object? source, string memberName)
    {
        if (source is null)
        {
            return null;
        }

        var property = source.GetType().GetProperty(memberName, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
        if (property is not null)
        {
            return property.GetValue(source);
        }

        var field = source.GetType().GetField(memberName, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
        return field?.GetValue(source);
    }

    private static bool IsActiveGroupMember(SessionInfo session, GroupInfoDto group, bool allowUserParticipantMatch)
    {
        if (SessionHasSyncPlayGroup(session, group.GroupId))
        {
            return true;
        }

        var participantTokens = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var participant in group.Participants)
        {
            AddParticipantToken(participantTokens, participant);
        }

        if (participantTokens.Count == 0)
        {
            return false;
        }

        foreach (var token in GetStrictSessionParticipantTokens(session))
        {
            if (participantTokens.Contains(token))
            {
                return true;
            }
        }

        if (allowUserParticipantMatch)
        {
            foreach (var token in GetUserParticipantTokens(session))
            {
                if (participantTokens.Contains(token))
                {
                    return true;
                }
            }
        }

        return false;
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

    private static List<string> ParseParticipantHints(string? participantsCsv)
    {
        if (string.IsNullOrWhiteSpace(participantsCsv))
        {
            return [];
        }

        return participantsCsv
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(static part => !string.IsNullOrWhiteSpace(part))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static bool SessionHasSyncPlayGroup(SessionInfo session, Guid groupId)
    {
        foreach (string candidate in GetSessionSyncPlayGroupIds(session))
        {
            if (Guid.TryParse(candidate, out var parsed) && parsed == groupId)
            {
                return true;
            }
        }

        return false;
    }

    private static bool CanUseUserParticipantMatch(List<SessionInfo> sessions, Guid userId)
    {
        return sessions.Count(session => session.UserId == userId) == 1;
    }

    private static IEnumerable<string> GetSessionSyncPlayGroupIds(SessionInfo session)
    {
        string[] paths =
        [
            "SyncPlayGroupId",
            "SyncPlayGroup",
            "PlayState.SyncPlayGroupId",
            "PlayState.SyncPlayGroup",
            "PlayState.SyncPlayInfo.GroupId",
            "AdditionalData.SyncPlayGroupId"
        ];

        foreach (string path in paths)
        {
            foreach (string value in GetObjectTextValues(ReadNestedProperty(session, path)))
            {
                yield return value;
            }
        }
    }

    private static IEnumerable<string> GetStrictSessionParticipantTokens(SessionInfo session)
    {
        return new[]
        {
            session.Id,
            session.DeviceName,
            session.DeviceId,
            session.Client
        }
        .Where(static token => !string.IsNullOrWhiteSpace(token))
        .SelectMany(static token => new[] { token!.Trim(), NormalizeParticipantToken(token) })
        .Where(static token => !string.IsNullOrWhiteSpace(token))
        .Distinct(StringComparer.OrdinalIgnoreCase);
    }

    private static IEnumerable<string> GetUserParticipantTokens(SessionInfo session)
    {
        string userId = session.UserId == Guid.Empty ? string.Empty : session.UserId.ToString();
        return new[]
        {
            userId,
            session.UserName
        }
        .Where(static token => !string.IsNullOrWhiteSpace(token))
        .SelectMany(static token => new[] { token!.Trim(), NormalizeParticipantToken(token) })
        .Where(static token => !string.IsNullOrWhiteSpace(token))
        .Distinct(StringComparer.OrdinalIgnoreCase);
    }

    private static void AddParticipantToken(HashSet<string> tokens, string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return;
        }

        string trimmed = value.Trim();
        tokens.Add(trimmed);
        tokens.Add(NormalizeParticipantToken(trimmed));
    }

    private static string NormalizeParticipantToken(string value)
    {
        return new string(value.Where(char.IsLetterOrDigit).ToArray());
    }

    private static object? ReadNestedProperty(object? source, string path)
    {
        object? current = source;
        foreach (string part in path.Split('.', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (current is null)
            {
                return null;
            }

            if (current is System.Collections.IDictionary dictionary)
            {
                object? matchedKey = dictionary.Keys
                    .Cast<object>()
                    .FirstOrDefault(candidate => string.Equals(Convert.ToString(candidate, CultureInfo.InvariantCulture), part, StringComparison.OrdinalIgnoreCase));
                if (matchedKey is null)
                {
                    return null;
                }

                current = dictionary[matchedKey];
                continue;
            }

            var property = current.GetType().GetProperties()
                .FirstOrDefault(candidate => string.Equals(candidate.Name, part, StringComparison.OrdinalIgnoreCase));
            if (property is null)
            {
                return null;
            }

            current = property.GetValue(current);
        }

        return current;
    }

    private static IEnumerable<string> GetObjectTextValues(object? value)
    {
        if (value is null)
        {
            yield break;
        }

        if (value is string text)
        {
            if (!string.IsNullOrWhiteSpace(text))
            {
                yield return text.Trim();
            }

            yield break;
        }

        if (value is Guid guid && guid != Guid.Empty)
        {
            yield return guid.ToString();
            yield break;
        }

        foreach (string propertyName in new[] { "GroupId", "Id" })
        {
            var nested = value.GetType().GetProperties()
                .FirstOrDefault(candidate => string.Equals(candidate.Name, propertyName, StringComparison.OrdinalIgnoreCase));
            if (nested is null)
            {
                continue;
            }

            foreach (string nestedValue in GetObjectTextValues(nested.GetValue(value)))
            {
                yield return nestedValue;
            }
        }
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

            return null;
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

    private sealed class SyncPlayGroupResolution
    {
        public SyncPlayGroupResolution(bool lookupAvailable, GroupInfoDto? group)
        {
            LookupAvailable = lookupAvailable;
            Group = group;
        }

        public bool LookupAvailable { get; }

        public GroupInfoDto? Group { get; }
    }
}
