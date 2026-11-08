using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Session;
using Microsoft.AspNetCore.Http;

namespace Jellyfin.Plugin.JellyChat.Infrastructure;

/// <summary>
/// Works out who is calling and which SyncPlay room they are in.
/// </summary>
public sealed class JellyChatCallerResolver
{
    private readonly ISessionManager _sessionManager;
    private readonly IUserManager _userManager;
    private readonly JellyChatSyncPlayStateResolver _syncPlayStateResolver;

    /// <summary>
    /// Initializes a new instance of the <see cref="JellyChatCallerResolver"/> class.
    /// </summary>
    /// <param name="sessionManager">The Jellyfin session manager.</param>
    /// <param name="userManager">The Jellyfin user manager.</param>
    /// <param name="syncPlayStateResolver">The SyncPlay state resolver.</param>
    public JellyChatCallerResolver(
        ISessionManager sessionManager,
        IUserManager userManager,
        JellyChatSyncPlayStateResolver syncPlayStateResolver)
    {
        _sessionManager = sessionManager;
        _userManager = userManager;
        _syncPlayStateResolver = syncPlayStateResolver;
    }

    /// <summary>
    /// Resolves the caller. On failure returns the HTTP status and message to send back.
    /// </summary>
    /// <param name="user">The request principal.</param>
    /// <param name="headers">The request headers.</param>
    /// <param name="preferredSessionId">An optional session id sent by the client.</param>
    /// <param name="caller">The resolved caller.</param>
    /// <param name="status">The HTTP status on failure.</param>
    /// <param name="error">The error message on failure.</param>
    /// <returns>True when the caller was resolved.</returns>
    internal bool TryResolve(
        ClaimsPrincipal user,
        IHeaderDictionary headers,
        string? preferredSessionId,
        out JellyChatCaller caller,
        out int status,
        out string error)
    {
        caller = null!;
        status = StatusCodes.Status200OK;
        error = string.Empty;

        Guid userId = ResolveUserId(user);
        if (userId == Guid.Empty)
        {
            status = StatusCodes.Status400BadRequest;
            error = "Could not resolve current user id.";
            return false;
        }

        var session = ResolveSession(_sessionManager.Sessions.ToList(), userId, ResolveDeviceId(user, headers), preferredSessionId);
        if (session is null)
        {
            status = StatusCodes.Status409Conflict;
            error = "Current Jellyfin session could not be resolved.";
            return false;
        }

        var resolution = _syncPlayStateResolver.ResolveSession(session.Id);
        if (!resolution.LookupAvailable)
        {
            status = StatusCodes.Status409Conflict;
            error = "Current SyncPlay state could not be resolved.";
            return false;
        }

        var room = resolution.Room is not null && IsActiveParticipant(resolution.Room, session, userId) ? resolution.Room : null;
        caller = new JellyChatCaller(userId, session, room);
        return true;
    }

    /// <summary>
    /// Gets the name shown next to the caller's messages.
    /// </summary>
    /// <param name="userId">The user id.</param>
    /// <param name="session">The user's session.</param>
    /// <returns>A usable display name.</returns>
    internal string ResolveSenderName(Guid userId, SessionInfo session)
    {
        string? userName = _userManager.GetUserById(userId)?.Username;
        if (IsUsableUserName(userName))
        {
            return userName!;
        }

        return IsUsableUserName(session.UserName) ? session.UserName! : "Someone";
    }

    private static bool IsActiveParticipant(JellyChatSyncPlayRoomSnapshot room, SessionInfo session, Guid userId)
    {
        return room.Participants.Any(participant =>
            string.Equals(participant.SessionId, session.Id, StringComparison.Ordinal)
            && participant.UserId == userId);
    }

    private static bool IsUsableUserName(string? value)
    {
        string trimmed = value?.Trim() ?? string.Empty;
        return trimmed.Length > 0
            && !string.Equals(trimmed, bool.TrueString, StringComparison.OrdinalIgnoreCase)
            && !string.Equals(trimmed, bool.FalseString, StringComparison.OrdinalIgnoreCase);
    }

    private static Guid ResolveUserId(ClaimsPrincipal user)
    {
        string? claim = user.Claims
            .FirstOrDefault(static claim => string.Equals(claim.Type, "Jellyfin-UserId", StringComparison.OrdinalIgnoreCase))?.Value;
        return Guid.TryParse(claim, out Guid userId) ? userId : Guid.Empty;
    }

    private static SessionInfo? ResolveSession(List<SessionInfo> sessions, Guid userId, string deviceId, string? preferredSessionId)
    {
        var own = sessions.Where(session => session.UserId == userId).ToList();
        if (!string.IsNullOrWhiteSpace(preferredSessionId))
        {
            var preferred = own.FirstOrDefault(session => string.Equals(session.Id, preferredSessionId, StringComparison.Ordinal));
            if (preferred is not null
                && (deviceId.Length == 0
                    ? own.Count == 1
                    : string.Equals(preferred.DeviceId, deviceId, StringComparison.OrdinalIgnoreCase)))
            {
                return preferred;
            }
        }

        if (deviceId.Length > 0)
        {
            var byDevice = own.Where(session => string.Equals(session.DeviceId, deviceId, StringComparison.OrdinalIgnoreCase)).ToList();
            if (byDevice.Count > 0)
            {
                return byDevice.Count == 1 ? byDevice[0] : byDevice.OrderByDescending(static session => session.LastActivityDate).First();
            }
        }

        return own.Count == 1 ? own[0] : null;
    }

    private static string ResolveDeviceId(ClaimsPrincipal user, IHeaderDictionary headers)
    {
        string? claim = user.Claims
            .FirstOrDefault(static claim => claim.Type.Contains("DeviceId", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(claim.Value))?.Value;
        if (claim is not null)
        {
            return claim.Trim();
        }

        foreach (string headerName in new[] { "X-Emby-Authorization", "Authorization" })
        {
            string deviceId = ReadHeaderParameter(headers[headerName].ToString(), "DeviceId");
            if (deviceId.Length > 0)
            {
                return deviceId;
            }
        }

        return string.Empty;
    }

    private static string ReadHeaderParameter(string headerValue, string key)
    {
        string header = headerValue.Trim();
        const string Prefix = "MediaBrowser ";
        if (header.StartsWith(Prefix, StringComparison.OrdinalIgnoreCase))
        {
            header = header[Prefix.Length..];
        }

        foreach (string part in header.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            string[] pieces = part.Split('=', 2, StringSplitOptions.TrimEntries);
            if (pieces.Length == 2 && string.Equals(pieces[0], key, StringComparison.OrdinalIgnoreCase))
            {
                return pieces[1].Trim('"');
            }
        }

        return string.Empty;
    }
}
