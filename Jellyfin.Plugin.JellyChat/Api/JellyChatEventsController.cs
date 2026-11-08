using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using Jellyfin.Plugin.JellyChat.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.JellyChat.Api;

/// <summary>
/// Chat, reaction, typing and playback event endpoints.
/// </summary>
[ApiController]
[Route("JellyChat")]
[Authorize]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public class JellyChatEventsController : ControllerBase
{
    internal const int DefaultEventLimit = 100;
    internal const int MaxEventLimit = 200;

    private readonly JellyChatCallerResolver _callerResolver;
    private readonly JellyChatEventStore _eventStore;

    /// <summary>
    /// Initializes a new instance of the <see cref="JellyChatEventsController"/> class.
    /// </summary>
    /// <param name="callerResolver">Resolves the caller and their room.</param>
    /// <param name="eventStore">The in-memory event store.</param>
    public JellyChatEventsController(JellyChatCallerResolver callerResolver, JellyChatEventStore eventStore)
    {
        _callerResolver = callerResolver;
        _eventStore = eventStore;
    }

    /// <summary>
    /// Stores an event for the caller's active SyncPlay group.
    /// </summary>
    /// <param name="request">The event request payload.</param>
    /// <returns>The stored event.</returns>
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

        if (!_callerResolver.TryResolve(User, Request.Headers, request.SenderSessionId, out var caller, out int status, out string error))
        {
            return StatusCode(status, error);
        }

        var room = caller.Room;
        if (room is null || !MatchesRoom(request.GroupId, room.GroupId))
        {
            return StatusCode(StatusCodes.Status403Forbidden, "Current session is not in the requested SyncPlay group.");
        }

        string userName = _callerResolver.ResolveSenderName(caller.UserId, caller.Session);
        if (!JellyChatEventValidator.TryCreate(request, room.GroupId, caller.UserId, userName, caller.Session.Id, out var roomEvent, out error))
        {
            return BadRequest(error);
        }

        return _eventStore.TryAddOrGet(room, roomEvent, out var stored)
            ? Ok(stored)
            : StatusCode(StatusCodes.Status403Forbidden, "JellyChat room is locked.");
    }

    /// <summary>
    /// Gets recent events for the caller's SyncPlay group.
    /// </summary>
    /// <param name="groupId">SyncPlay group identifier.</param>
    /// <param name="senderSessionId">Current client session identifier.</param>
    /// <param name="afterSequence">Optional event sequence cursor.</param>
    /// <param name="limit">Optional result limit.</param>
    /// <returns>Recent events.</returns>
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
        if (!Guid.TryParse(groupId, out var parsedGroupId) || parsedGroupId == Guid.Empty)
        {
            return BadRequest("Valid groupId is required.");
        }

        if (afterSequence < 0)
        {
            return BadRequest("afterSequence must be zero or greater.");
        }

        if (!_callerResolver.TryResolve(User, Request.Headers, senderSessionId, out var caller, out int status, out string error))
        {
            return StatusCode(status, error);
        }

        var room = caller.Room;
        if (room is null || room.GroupId != parsedGroupId)
        {
            return StatusCode(StatusCodes.Status403Forbidden, "Current session is not an active member of the requested SyncPlay group.");
        }

        int cappedLimit = Math.Clamp(limit.GetValueOrDefault(DefaultEventLimit), 1, MaxEventLimit);
        return _eventStore.TryGetRecent(room, caller.Session.Id, caller.UserId, afterSequence, cappedLimit, out var events)
            ? Ok(events)
            : StatusCode(StatusCodes.Status403Forbidden, "JellyChat room is locked.");
    }

    private static bool MatchesRoom(string? requestedGroupId, Guid activeGroupId)
    {
        return string.IsNullOrWhiteSpace(requestedGroupId)
            || (Guid.TryParse(requestedGroupId, out var parsed) && parsed == activeGroupId);
    }
}
