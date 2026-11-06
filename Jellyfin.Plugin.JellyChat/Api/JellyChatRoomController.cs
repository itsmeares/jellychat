using System;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using Jellyfin.Plugin.JellyChat.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.JellyChat.Api;

/// <summary>
/// Room state and password endpoints.
/// </summary>
[ApiController]
[Route("JellyChat")]
[Authorize]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public class JellyChatRoomController : ControllerBase
{
    private readonly JellyChatCallerResolver _callerResolver;
    private readonly JellyChatEventStore _eventStore;

    /// <summary>
    /// Initializes a new instance of the <see cref="JellyChatRoomController"/> class.
    /// </summary>
    /// <param name="callerResolver">Resolves the caller and their room.</param>
    /// <param name="eventStore">The in-memory event store.</param>
    public JellyChatRoomController(JellyChatCallerResolver callerResolver, JellyChatEventStore eventStore)
    {
        _callerResolver = callerResolver;
        _eventStore = eventStore;
    }

    /// <summary>
    /// Gets the caller's current JellyChat room, if the caller's session is in a SyncPlay group.
    /// </summary>
    /// <param name="senderSessionId">Current client session identifier.</param>
    /// <returns>The current room state.</returns>
    [HttpGet("Room")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public ActionResult<JellyChatRoomInfo> GetRoom([FromQuery] string? senderSessionId)
    {
        if (!_callerResolver.TryResolve(User, Request.Headers, senderSessionId, out var caller, out int status, out string error))
        {
            return StatusCode(status, error);
        }

        return Ok(CreateRoomInfo(caller, _eventStore));
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

        if (!TryResolveRoom(request.SenderSessionId, out var caller, out var room, out var failure))
        {
            return failure!;
        }

        return _eventStore.TryUnlock(room, caller.Session.Id, caller.UserId, request.Password, out var access)
            ? Ok(CreateRoomInfo(caller, room, access))
            : StatusCode(StatusCodes.Status403Forbidden, "Incorrect password.");
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

        if (!TryResolveRoom(request.SenderSessionId, out var caller, out var room, out var failure))
        {
            return failure!;
        }

        if (_eventStore.TrySetPassword(room, caller.Session.Id, caller.UserId, request.Password, out var access))
        {
            return Ok(CreateRoomInfo(caller, room, access));
        }

        return access.IsOwner
            ? StatusCode(StatusCodes.Status409Conflict, "Room password changed while the request was being processed.")
            : StatusCode(StatusCodes.Status403Forbidden, "Only the current JellyChat room owner can manage the password.");
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
        if (!TryResolveRoom(senderSessionId, out var caller, out var room, out var failure))
        {
            return failure!;
        }

        return _eventStore.TryDisablePassword(room, caller.Session.Id, caller.UserId, out var access)
            ? Ok(CreateRoomInfo(caller, room, access))
            : StatusCode(StatusCodes.Status403Forbidden, "Only the current JellyChat room owner can manage the password.");
    }

    internal static JellyChatRoomInfo CreateRoomInfo(JellyChatCaller caller, JellyChatEventStore eventStore)
    {
        var access = caller.Room is null ? null : eventStore.ReconcileRoom(caller.Room, caller.Session.Id, caller.UserId);
        return CreateRoomInfo(caller, caller.Room, access);
    }

    internal static JellyChatRoomInfo CreateRoomInfo(JellyChatCaller caller, JellyChatSyncPlayRoomSnapshot? room, JellyChatRoomAccessState? access)
    {
        return new JellyChatRoomInfo
        {
            InGroup = room is not null,
            GroupId = room?.GroupId.ToString() ?? string.Empty,
            GroupName = room?.GroupName ?? string.Empty,
            SessionId = caller.Session.Id,
            DeviceId = caller.Session.DeviceId ?? string.Empty,
            Participants = room?.Participants
                .Select(static participant => participant.UserName)
                .Where(static userName => !string.IsNullOrWhiteSpace(userName))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList() ?? [],
            ExactMembership = true,
            MembershipSource = room is null ? "current-session-not-in-syncplay" : "current-session-syncplay-map",
            PasswordProtected = access?.PasswordProtected ?? false,
            Authorized = access?.Authorized ?? false,
            IsOwner = access?.IsOwner ?? false
        };
    }

    private bool TryResolveRoom(
        string? preferredSessionId,
        out JellyChatCaller caller,
        out JellyChatSyncPlayRoomSnapshot room,
        out ObjectResult? failure)
    {
        room = null!;
        failure = null;
        if (!_callerResolver.TryResolve(User, Request.Headers, preferredSessionId, out caller, out int status, out string error))
        {
            failure = StatusCode(status, error);
            return false;
        }

        if (caller.Room is null)
        {
            failure = StatusCode(StatusCodes.Status403Forbidden, "Current session is not an active member of a SyncPlay group.");
            return false;
        }

        room = caller.Room;
        return true;
    }
}
