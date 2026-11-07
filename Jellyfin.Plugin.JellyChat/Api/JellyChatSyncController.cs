using System;
using System.Collections.Generic;
using System.Globalization;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.JellyChat.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.JellyChat.Api;

/// <summary>
/// One long-poll endpoint that returns the room and new events, and waits while nothing has changed.
/// </summary>
[ApiController]
[Route("JellyChat")]
[Authorize]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public class JellyChatSyncController : ControllerBase
{
    internal const int MaxWaitSeconds = 25;
    internal static readonly TimeSpan MembershipRecheck = TimeSpan.FromSeconds(1);

    private readonly JellyChatCallerResolver _callerResolver;
    private readonly JellyChatEventStore _eventStore;

    /// <summary>
    /// Initializes a new instance of the <see cref="JellyChatSyncController"/> class.
    /// </summary>
    /// <param name="callerResolver">Resolves the caller and their room.</param>
    /// <param name="eventStore">The in-memory event store.</param>
    public JellyChatSyncController(JellyChatCallerResolver callerResolver, JellyChatEventStore eventStore)
    {
        _callerResolver = callerResolver;
        _eventStore = eventStore;
    }

    /// <summary>
    /// Returns the room and new events. When nothing changed, waits up to <paramref name="waitSeconds"/> for a change.
    /// </summary>
    /// <param name="afterSequence">The last event sequence the client has seen.</param>
    /// <param name="roomVersion">The room version from the previous response.</param>
    /// <param name="waitSeconds">How long to wait for a change, up to 25 seconds.</param>
    /// <param name="senderSessionId">Optional session identifier.</param>
    /// <param name="cancellationToken">Cancelled when the client disconnects.</param>
    /// <returns>The room, new events, and the room version.</returns>
    [HttpGet("Sync")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<JellyChatSyncResponse>> Sync(
        [FromQuery] long? afterSequence,
        [FromQuery] string? roomVersion,
        [FromQuery] int? waitSeconds,
        [FromQuery] string? senderSessionId,
        CancellationToken cancellationToken)
    {
        if (afterSequence < 0)
        {
            return BadRequest("afterSequence must be zero or greater.");
        }

        TimeSpan wait = TimeSpan.FromSeconds(Math.Clamp(waitSeconds.GetValueOrDefault(), 0, MaxWaitSeconds));
        DateTime deadline = DateTime.UtcNow + wait;
        while (true)
        {
            Task change = _eventStore.ChangeToken;
            if (!_callerResolver.TryResolve(User, Request.Headers, senderSessionId, out var caller, out int status, out string error))
            {
                return StatusCode(status, error);
            }

            JellyChatRoomInfo room = JellyChatRoomController.CreateRoomInfo(caller, _eventStore);
            IReadOnlyList<JellyChatEvent> events = [];
            if (caller.Room is not null && room.Authorized)
            {
                _eventStore.TryGetRecent(caller.Room, caller.Session.Id, caller.UserId, afterSequence, JellyChatEventsController.DefaultEventLimit, out events);
            }

            string version = ComputeVersion(room);
            TimeSpan remaining = deadline - DateTime.UtcNow;
            bool roomChanged = string.IsNullOrEmpty(roomVersion) || !string.Equals(roomVersion, version, StringComparison.Ordinal);
            if (events.Count > 0 || roomChanged || remaining <= TimeSpan.Zero)
            {
                return Ok(new JellyChatSyncResponse { Room = room, Events = events, RoomVersion = version });
            }

            try
            {
                await Task.WhenAny(change, Task.Delay(remaining < MembershipRecheck ? remaining : MembershipRecheck, cancellationToken)).ConfigureAwait(false);
                cancellationToken.ThrowIfCancellationRequested();
            }
            catch (OperationCanceledException)
            {
                return Ok(new JellyChatSyncResponse { Room = room, Events = [], RoomVersion = version });
            }
        }
    }

    internal static string ComputeVersion(JellyChatRoomInfo room)
    {
        return string.Join(
            '|',
            room.InGroup.ToString(),
            room.GroupId,
            room.GroupName,
            string.Join(',', room.Participants),
            room.PasswordProtected.ToString(),
            room.Authorized.ToString(),
            room.IsOwner.ToString(),
            room.SessionId.Length.ToString(CultureInfo.InvariantCulture));
    }
}
