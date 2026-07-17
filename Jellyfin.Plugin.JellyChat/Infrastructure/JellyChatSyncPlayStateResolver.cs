using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Reflection;
using MediaBrowser.Controller.SyncPlay;
using MediaBrowser.Model.SyncPlay;

namespace Jellyfin.Plugin.JellyChat.Infrastructure;

/// <summary>
/// Resolves authoritative SyncPlay room membership from Jellyfin server state.
/// </summary>
public sealed class JellyChatSyncPlayStateResolver
{
    private readonly ISyncPlayManager _syncPlayManager;

    /// <summary>
    /// Initializes a new instance of the <see cref="JellyChatSyncPlayStateResolver"/> class.
    /// </summary>
    /// <param name="syncPlayManager">The Jellyfin SyncPlay manager.</param>
    public JellyChatSyncPlayStateResolver(ISyncPlayManager syncPlayManager)
    {
        _syncPlayManager = syncPlayManager;
    }

    internal JellyChatSyncPlayRoomResolution ResolveSession(string sessionId)
    {
        object? map = GetSessionGroupMap();
        if (map is null || map is not IEnumerable entries)
        {
            return new JellyChatSyncPlayRoomResolution(false, null);
        }

        foreach (object entry in entries)
        {
            object? key = ReadObjectMember(entry, "Key");
            if (!string.Equals(Convert.ToString(key, CultureInfo.InvariantCulture), sessionId, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            object? internalGroup = ReadObjectMember(entry, "Value");
            return new JellyChatSyncPlayRoomResolution(true, internalGroup is null ? null : ReadRoomSnapshot(internalGroup));
        }

        return new JellyChatSyncPlayRoomResolution(true, null);
    }

    internal bool TryGetActiveRooms(out IReadOnlyList<JellyChatSyncPlayRoomSnapshot> rooms)
    {
        rooms = [];
        object? map = GetSessionGroupMap();
        if (map is null || map is not IEnumerable entries)
        {
            return false;
        }

        try
        {
            var internalGroups = new HashSet<object>(ReferenceEqualityComparer.Instance);
            foreach (object entry in entries)
            {
                object? internalGroup = ReadObjectMember(entry, "Value");
                if (internalGroup is not null)
                {
                    internalGroups.Add(internalGroup);
                }
            }

            var snapshots = new List<JellyChatSyncPlayRoomSnapshot>(internalGroups.Count);
            foreach (object internalGroup in internalGroups)
            {
                var snapshot = ReadRoomSnapshot(internalGroup);
                if (snapshot is null)
                {
                    return false;
                }

                snapshots.Add(snapshot);
            }

            rooms = snapshots;
            return true;
        }
        catch (InvalidOperationException)
        {
            return false;
        }
        catch (TargetInvocationException)
        {
            return false;
        }
    }

    private object? GetSessionGroupMap()
    {
        var field = _syncPlayManager.GetType().GetField("_sessionToGroupMap", BindingFlags.Instance | BindingFlags.NonPublic);
        return field?.GetValue(_syncPlayManager);
    }

    private static JellyChatSyncPlayRoomSnapshot? ReadRoomSnapshot(object internalGroup)
    {
        var getInfo = internalGroup.GetType().GetMethod(
            "GetInfo",
            BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic,
            binder: null,
            types: Type.EmptyTypes,
            modifiers: null);
        if (getInfo is null)
        {
            return null;
        }

        lock (internalGroup)
        {
            if (getInfo.Invoke(internalGroup, null) is not GroupInfoDto groupInfo)
            {
                return null;
            }

            object? participantMap = ReadObjectMember(internalGroup, "_participants");
            if (participantMap is not IDictionary dictionary)
            {
                return null;
            }

            var participants = new List<JellyChatSyncPlayParticipant>(dictionary.Count);
            foreach (object participant in dictionary.Values)
            {
                string sessionId = Convert.ToString(ReadObjectMember(participant, "SessionId"), CultureInfo.InvariantCulture) ?? string.Empty;
                string userName = Convert.ToString(ReadObjectMember(participant, "UserName"), CultureInfo.InvariantCulture) ?? string.Empty;
                object? rawUserId = ReadObjectMember(participant, "UserId");
                Guid userId = rawUserId is Guid parsedUserId ? parsedUserId : Guid.Empty;
                if (!string.IsNullOrWhiteSpace(sessionId) && userId != Guid.Empty)
                {
                    participants.Add(new JellyChatSyncPlayParticipant(sessionId, userId, userName));
                }
            }

            return new JellyChatSyncPlayRoomSnapshot(groupInfo.GroupId, groupInfo.GroupName, participants);
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
}
