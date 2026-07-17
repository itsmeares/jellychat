using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using Jellyfin.Plugin.JellyChat.Api;

namespace Jellyfin.Plugin.JellyChat.Infrastructure;

/// <summary>
/// In-memory JellyChat room state and event store.
/// </summary>
public class JellyChatEventStore
{
    private const int MaxEventsPerGroup = 200;
    private const int PasswordSaltLength = 16;
    private const int PasswordHashLength = 32;
    private const int PasswordIterations = 100000;
    private const string TypingUpdateEventType = "typing.update";
    private static readonly TimeSpan TypingEventTtl = TimeSpan.FromSeconds(6);
    private readonly Dictionary<Guid, GroupRoomState> _rooms = [];
    private readonly object _syncLock = new object();

    internal void ReconcileActiveRooms(IReadOnlyList<JellyChatSyncPlayRoomSnapshot> activeRooms)
    {
        lock (_syncLock)
        {
            var activeGroupIds = activeRooms.Select(static room => room.GroupId).ToHashSet();
            foreach (Guid groupId in _rooms.Keys.Where(groupId => !activeGroupIds.Contains(groupId)).ToList())
            {
                DestroyRoom(groupId);
            }

            foreach (var room in activeRooms)
            {
                ReconcileRoomLocked(room);
            }
        }
    }

    internal JellyChatRoomAccessState ReconcileRoom(JellyChatSyncPlayRoomSnapshot room, string sessionId, Guid userId)
    {
        lock (_syncLock)
        {
            var state = ReconcileRoomLocked(room);
            return CreateAccessState(state, sessionId, userId);
        }
    }

    internal bool TryAddOrGet(
        JellyChatSyncPlayRoomSnapshot room,
        JellyChatEvent roomEvent,
        out JellyChatEvent storedEvent)
    {
        lock (_syncLock)
        {
            var state = ReconcileRoomLocked(room);
            if (!TryAuthorizeContentAccess(state, roomEvent.SessionId, roomEvent.UserId))
            {
                storedEvent = new JellyChatEvent();
                return false;
            }

            if (!string.IsNullOrWhiteSpace(roomEvent.ClientEventId))
            {
                var existing = state.Events.FirstOrDefault(stored =>
                    stored.UserId == roomEvent.UserId
                    && string.Equals(stored.ClientEventId, roomEvent.ClientEventId, StringComparison.Ordinal));
                if (existing is not null)
                {
                    storedEvent = Snapshot(existing);
                    return true;
                }
            }

            var addedEvent = Snapshot(roomEvent);
            addedEvent.Id = Guid.NewGuid();
            addedEvent.Sequence = state.NextSequence;
            addedEvent.CreatedAtUtc = DateTime.UtcNow;
            state.NextSequence += 1;

            if (string.Equals(addedEvent.Type, TypingUpdateEventType, StringComparison.Ordinal))
            {
                state.TypingBySession[addedEvent.SessionId] = addedEvent;
                PruneTyping(state);
                storedEvent = Snapshot(addedEvent);
                return true;
            }

            state.Events.Add(addedEvent);
            if (state.Events.Count > MaxEventsPerGroup)
            {
                state.Events.RemoveRange(0, state.Events.Count - MaxEventsPerGroup);
            }

            storedEvent = Snapshot(addedEvent);
            return true;
        }
    }

    internal bool TryGetRecent(
        JellyChatSyncPlayRoomSnapshot room,
        string sessionId,
        Guid userId,
        long? afterSequence,
        int limit,
        out IReadOnlyList<JellyChatEvent> events)
    {
        lock (_syncLock)
        {
            var state = ReconcileRoomLocked(room);
            if (!TryAuthorizeContentAccess(state, sessionId, userId))
            {
                events = [];
                return false;
            }

            long cursor = afterSequence.GetValueOrDefault(0);
            PruneTyping(state);
            events = state.Events
                .Where(roomEvent => roomEvent.Sequence > cursor)
                .Concat(state.TypingBySession.Values.Where(roomEvent => roomEvent.Sequence > cursor))
                .TakeLast(Math.Clamp(limit, 1, MaxEventsPerGroup))
                .OrderBy(static roomEvent => roomEvent.Sequence)
                .Select(Snapshot)
                .ToList();
            return true;
        }
    }

    internal bool TryUnlock(
        JellyChatSyncPlayRoomSnapshot room,
        string sessionId,
        Guid userId,
        string password,
        out JellyChatRoomAccessState accessState)
    {
        lock (_syncLock)
        {
            var state = ReconcileRoomLocked(room);
            if (!IsActiveParticipant(state, sessionId, userId))
            {
                accessState = CreateAccessState(state, sessionId, userId);
                return false;
            }

            if (!state.PasswordProtected || IsOwner(state, userId))
            {
                state.AuthorizedSessions.Add(sessionId);
                accessState = CreateAccessState(state, sessionId, userId);
                return true;
            }

            byte[] submittedHash = HashPassword(password, state.PasswordSalt!);
            bool matched = CryptographicOperations.FixedTimeEquals(submittedHash, state.PasswordHash!);
            CryptographicOperations.ZeroMemory(submittedHash);
            if (matched)
            {
                state.AuthorizedSessions.Add(sessionId);
            }

            accessState = CreateAccessState(state, sessionId, userId);
            return matched;
        }
    }

    internal bool TrySetPassword(
        JellyChatSyncPlayRoomSnapshot room,
        string sessionId,
        Guid userId,
        string password,
        out JellyChatRoomAccessState accessState)
    {
        if (string.IsNullOrEmpty(password))
        {
            lock (_syncLock)
            {
                var currentState = ReconcileRoomLocked(room);
                accessState = CreateAccessState(currentState, sessionId, userId);
                return false;
            }
        }

        byte[] salt = RandomNumberGenerator.GetBytes(PasswordSaltLength);
        byte[] hash = HashPassword(password, salt);
        lock (_syncLock)
        {
            var state = ReconcileRoomLocked(room);
            if (!IsActiveParticipant(state, sessionId, userId) || !IsOwner(state, userId))
            {
                CryptographicOperations.ZeroMemory(hash);
                CryptographicOperations.ZeroMemory(salt);
                accessState = CreateAccessState(state, sessionId, userId);
                return false;
            }

            ClearPassword(state);
            state.PasswordSalt = salt;
            state.PasswordHash = hash;
            AuthorizeOwnerSessions(state);
            accessState = CreateAccessState(state, sessionId, userId);
            return true;
        }
    }

    internal bool TryDisablePassword(
        JellyChatSyncPlayRoomSnapshot room,
        string sessionId,
        Guid userId,
        out JellyChatRoomAccessState accessState)
    {
        lock (_syncLock)
        {
            var state = ReconcileRoomLocked(room);
            if (!IsActiveParticipant(state, sessionId, userId) || !IsOwner(state, userId))
            {
                accessState = CreateAccessState(state, sessionId, userId);
                return false;
            }

            ClearPassword(state);
            accessState = CreateAccessState(state, sessionId, userId);
            return true;
        }
    }

    private static byte[] HashPassword(string password, byte[] salt)
    {
        return Rfc2898DeriveBytes.Pbkdf2(
            password,
            salt,
            PasswordIterations,
            HashAlgorithmName.SHA256,
            PasswordHashLength);
    }

    private static void ClearPassword(GroupRoomState state)
    {
        if (state.PasswordHash is not null)
        {
            CryptographicOperations.ZeroMemory(state.PasswordHash);
        }

        if (state.PasswordSalt is not null)
        {
            CryptographicOperations.ZeroMemory(state.PasswordSalt);
        }

        state.PasswordHash = null;
        state.PasswordSalt = null;
    }

    private void DestroyRoom(Guid groupId)
    {
        if (!_rooms.Remove(groupId, out var state))
        {
            return;
        }

        ClearPassword(state);
        state.AuthorizedSessions.Clear();
        state.Participants.Clear();
        state.Events.Clear();
        state.TypingBySession.Clear();
    }

    private GroupRoomState ReconcileRoomLocked(JellyChatSyncPlayRoomSnapshot room)
    {
        if (!_rooms.TryGetValue(room.GroupId, out var state))
        {
            state = new GroupRoomState(room.GroupId);
            _rooms[room.GroupId] = state;
        }

        state.GroupName = room.GroupName;
        var activeSessionIds = room.Participants.Select(static participant => participant.SessionId).ToHashSet(StringComparer.Ordinal);
        foreach (string departedSessionId in state.Participants.Keys.Where(sessionId => !activeSessionIds.Contains(sessionId)).ToList())
        {
            state.Participants.Remove(departedSessionId);
            state.AuthorizedSessions.Remove(departedSessionId);
            state.TypingBySession.Remove(departedSessionId);
        }

        foreach (var participant in room.Participants)
        {
            if (state.Participants.TryGetValue(participant.SessionId, out var existing)
                && existing.UserId == participant.UserId)
            {
                existing.UserName = participant.UserName;
                continue;
            }

            state.Participants.Remove(participant.SessionId);
            state.AuthorizedSessions.Remove(participant.SessionId);
            state.NextJoinOrder += 1;
            state.Participants[participant.SessionId] = new RoomParticipantState(
                participant.SessionId,
                participant.UserId,
                participant.UserName,
                state.NextJoinOrder);
        }

        if (state.Participants.Count == 0)
        {
            DestroyRoom(room.GroupId);
            return state;
        }

        if (state.OwnerUserId == Guid.Empty || !state.Participants.Values.Any(participant => participant.UserId == state.OwnerUserId))
        {
            state.OwnerUserId = state.Participants.Values
                .OrderBy(static participant => participant.JoinOrder)
                .Select(static participant => participant.UserId)
                .First();
        }

        AuthorizeOwnerSessions(state);
        return state;
    }

    private static void AuthorizeOwnerSessions(GroupRoomState state)
    {
        foreach (var participant in state.Participants.Values.Where(participant => participant.UserId == state.OwnerUserId))
        {
            state.AuthorizedSessions.Add(participant.SessionId);
        }
    }

    private static bool TryAuthorizeContentAccess(GroupRoomState state, string sessionId, Guid userId)
    {
        if (!IsActiveParticipant(state, sessionId, userId))
        {
            return false;
        }

        if (!state.PasswordProtected || IsOwner(state, userId))
        {
            state.AuthorizedSessions.Add(sessionId);
            return true;
        }

        return state.AuthorizedSessions.Contains(sessionId);
    }

    private static bool IsActiveParticipant(GroupRoomState state, string sessionId, Guid userId)
    {
        return state.Participants.TryGetValue(sessionId, out var participant) && participant.UserId == userId;
    }

    private static bool IsOwner(GroupRoomState state, Guid userId)
    {
        return userId != Guid.Empty && state.OwnerUserId == userId;
    }

    private static JellyChatRoomAccessState CreateAccessState(GroupRoomState state, string sessionId, Guid userId)
    {
        bool isOwner = IsActiveParticipant(state, sessionId, userId) && IsOwner(state, userId);
        return new JellyChatRoomAccessState(
            state.PasswordProtected,
            !state.PasswordProtected || isOwner || state.AuthorizedSessions.Contains(sessionId),
            isOwner);
    }

    private static void PruneTyping(GroupRoomState state)
    {
        var cutoff = DateTime.UtcNow - TypingEventTtl;
        foreach (string sessionId in state.TypingBySession
            .Where(pair => pair.Value.CreatedAtUtc < cutoff)
            .Select(static pair => pair.Key)
            .ToList())
        {
            state.TypingBySession.Remove(sessionId);
        }
    }

    private static JellyChatEvent Snapshot(JellyChatEvent source)
    {
        return new JellyChatEvent
        {
            Id = source.Id,
            Sequence = source.Sequence,
            GroupId = source.GroupId,
            Type = source.Type,
            UserId = source.UserId,
            UserName = source.UserName,
            SessionId = source.SessionId,
            CreatedAtUtc = source.CreatedAtUtc,
            Text = source.Text,
            ReplyTo = SnapshotReplyTarget(source.ReplyTo),
            Emoji = source.Emoji,
            PlaybackAction = source.PlaybackAction,
            FromPositionTicks = source.FromPositionTicks,
            ToPositionTicks = source.ToPositionTicks,
            PositionSeconds = source.PositionSeconds,
            ItemId = source.ItemId,
            ItemName = source.ItemName,
            ClientEventId = source.ClientEventId,
            IsTyping = source.IsTyping
        };
    }

    private static JellyChatReplyTarget? SnapshotReplyTarget(JellyChatReplyTarget? source)
    {
        if (source is null)
        {
            return null;
        }

        return new JellyChatReplyTarget
        {
            EventId = source.EventId,
            UserId = source.UserId,
            UserName = source.UserName,
            MessagePreview = source.MessagePreview,
            CreatedAt = source.CreatedAt
        };
    }

    private sealed class GroupRoomState
    {
        public GroupRoomState(Guid groupId)
        {
            GroupId = groupId;
        }

        public Guid GroupId { get; }

        public string GroupName { get; set; } = string.Empty;

        public Guid OwnerUserId { get; set; }

        public long NextJoinOrder { get; set; }

        public long NextSequence { get; set; } = 1;

        public byte[]? PasswordSalt { get; set; }

        public byte[]? PasswordHash { get; set; }

        public bool PasswordProtected => PasswordHash is not null && PasswordSalt is not null;

        public Dictionary<string, RoomParticipantState> Participants { get; } = new(StringComparer.Ordinal);

        public HashSet<string> AuthorizedSessions { get; } = new(StringComparer.Ordinal);

        public List<JellyChatEvent> Events { get; } = [];

        public Dictionary<string, JellyChatEvent> TypingBySession { get; } = new(StringComparer.Ordinal);
    }

    private sealed class RoomParticipantState
    {
        public RoomParticipantState(string sessionId, Guid userId, string userName, long joinOrder)
        {
            SessionId = sessionId;
            UserId = userId;
            UserName = userName;
            JoinOrder = joinOrder;
        }

        public string SessionId { get; }

        public Guid UserId { get; }

        public string UserName { get; set; }

        public long JoinOrder { get; }
    }
}
