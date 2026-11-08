using System;
using MediaBrowser.Controller.Session;

namespace Jellyfin.Plugin.JellyChat.Infrastructure;

/// <summary>
/// The authenticated caller, their Jellyfin session, and the SyncPlay room that session is in.
/// </summary>
/// <param name="UserId">The caller's user id.</param>
/// <param name="Session">The caller's Jellyfin session.</param>
/// <param name="Room">The room the session is an active member of, or null.</param>
internal sealed record JellyChatCaller(Guid UserId, SessionInfo Session, JellyChatSyncPlayRoomSnapshot? Room);
