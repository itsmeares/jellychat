using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Linq;
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
    private const string SystemNoticeEventType = "system.notice";
    private const int DefaultEventLimit = 100;
    private const int MaxEventLimit = 200;

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
        var controllingSession = ResolveControllingSession(allSessions, userId, request.SenderSessionId);
        if (controllingSession is null)
        {
            return BadRequest("Current session not found.");
        }

        var visibleGroups = _syncPlayManager.ListGroups(controllingSession, new ListGroupsRequest());
        var targetGroup = ResolveTargetGroup(visibleGroups, request.GroupId, ParseParticipantHints(request.ParticipantsCsv));
        if (targetGroup is null)
        {
            return BadRequest("Current SyncPlay group not found.");
        }

        if (!IsActiveGroupMember(controllingSession, targetGroup))
        {
            return BadRequest("Current session is not an active member of the SyncPlay group.");
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
    /// <param name="afterSequence">Optional event sequence cursor.</param>
    /// <param name="limit">Optional result limit.</param>
    /// <returns>Recent event snapshots.</returns>
    [HttpGet("Events")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public ActionResult<IReadOnlyList<JellyChatEvent>> GetEvents(
        [FromQuery, Required] string groupId,
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
        var controllingSession = ResolveControllingSession(allSessions, userId, null);
        if (controllingSession is null)
        {
            return BadRequest("Current session not found.");
        }

        var visibleGroups = _syncPlayManager.ListGroups(controllingSession, new ListGroupsRequest());
        if (visibleGroups.All(group => group.GroupId != parsedGroupId))
        {
            return BadRequest("Current SyncPlay group not found.");
        }

        int cappedLimit = Math.Clamp(limit.GetValueOrDefault(DefaultEventLimit), 1, MaxEventLimit);
        return Ok(_eventStore.GetRecent(parsedGroupId, afterSequence, cappedLimit));
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
                return TryApplyTextEvent(request, roomEvent, "Text is required.", out error);
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
            case SystemNoticeEventType:
                return TryApplyTextEvent(request, roomEvent, "Text is required for system.notice.", out error);
            default:
                error = "Unsupported event type.";
                return false;
        }
    }

    private static bool TryApplyTextEvent(
        JellyChatEventRequest request,
        JellyChatEvent roomEvent,
        string errorMessage,
        out string error)
    {
        string? text = NormalizeOptionalText(request.Text);
        if (string.IsNullOrEmpty(text))
        {
            error = errorMessage;
            return false;
        }

        roomEvent.Text = text;
        error = string.Empty;
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

    private static bool IsActiveGroupMember(SessionInfo session, GroupInfoDto group)
    {
        var participantTokens = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var participant in group.Participants)
        {
            AddParticipantToken(participantTokens, participant);
        }

        if (participantTokens.Count == 0)
        {
            return false;
        }

        foreach (var token in GetSessionParticipantTokens(session))
        {
            if (participantTokens.Contains(token))
            {
                return true;
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

    private static IEnumerable<string> GetSessionParticipantTokens(SessionInfo session)
    {
        return new[]
        {
            session.Id,
            session.UserId == Guid.Empty ? string.Empty : session.UserId.ToString(),
            session.UserName,
            session.DeviceName,
            session.DeviceId,
            session.Client
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

    private static SessionInfo? ResolveControllingSession(List<SessionInfo> sessions, Guid userId, string? preferredSessionId)
    {
        if (!string.IsNullOrWhiteSpace(preferredSessionId))
        {
            var preferred = sessions.FirstOrDefault(session =>
                string.Equals(session.Id, preferredSessionId, StringComparison.Ordinal)
                && session.UserId == userId);
            if (preferred is not null)
            {
                return preferred;
            }
        }

        var fromUser = sessions
            .Where(session => session.UserId == userId)
            .OrderByDescending(session => session.LastActivityDate)
            .FirstOrDefault();
        if (fromUser is not null)
        {
            return fromUser;
        }

        return null;
    }
}
