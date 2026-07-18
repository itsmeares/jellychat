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
    private readonly Func<string, byte[], byte[]> _passwordHasher;

    /// <summary>
    /// Initializes a new instance of the <see cref="JellyChatEventStore"/> class.
    /// </summary>
    public JellyChatEventStore()
        : this(HashPassword)
    {
    }

    internal JellyChatEventStore(Func<string, byte[], byte[]> passwordHasher)
    {
        _passwordHasher = passwordHasher;
    }

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
            return CreateAccessState(state, room, sessionId, userId);
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
            if (!TryAuthorizeContentAccess(state, room, roomEvent.SessionId, roomEvent.UserId))
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
            if (!TryAuthorizeContentAccess(state, room, sessionId, userId))
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
        GroupRoomState passwordState;
        byte[] passwordSalt;
        byte[] expectedHash;
        long passwordRevision;
        lock (_syncLock)
        {
            var state = ReconcileRoomLocked(room);
            if (!IsActiveParticipant(state, room, sessionId, userId))
            {
                accessState = CreateAccessState(state, room, sessionId, userId);
                return false;
            }

            if (!state.PasswordProtected || IsOwner(state, userId))
            {
                state.AuthorizedSessions.Add(sessionId);
                accessState = CreateAccessState(state, room, sessionId, userId);
                return true;
            }

            passwordState = state;
            passwordSalt = state.PasswordSalt!.ToArray();
            expectedHash = state.PasswordHash!.ToArray();
            passwordRevision = state.PasswordRevision;
        }

        byte[]? submittedHash = null;
        try
        {
            submittedHash = _passwordHasher(password, passwordSalt);
            lock (_syncLock)
            {
                if (!_rooms.TryGetValue(room.GroupId, out var currentState)
                    || !ReferenceEquals(currentState, passwordState))
                {
                    accessState = NoAccessState();
                    return false;
                }

                if (!IsActiveParticipant(currentState, room, sessionId, userId))
                {
                    accessState = CreateAccessState(currentState, room, sessionId, userId);
                    return false;
                }

                if (!currentState.PasswordProtected || IsOwner(currentState, userId))
                {
                    currentState.AuthorizedSessions.Add(sessionId);
                    accessState = CreateAccessState(currentState, room, sessionId, userId);
                    return true;
                }

                if (currentState.PasswordRevision != passwordRevision)
                {
                    accessState = CreateAccessState(currentState, room, sessionId, userId);
                    return false;
                }

                bool matched = CryptographicOperations.FixedTimeEquals(submittedHash, expectedHash);
                if (matched)
                {
                    currentState.AuthorizedSessions.Add(sessionId);
                }

                accessState = CreateAccessState(currentState, room, sessionId, userId);
                return matched;
            }
        }
        finally
        {
            CryptographicOperations.ZeroMemory(passwordSalt);
            CryptographicOperations.ZeroMemory(expectedHash);
            if (submittedHash is not null)
            {
                CryptographicOperations.ZeroMemory(submittedHash);
            }
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
                accessState = CreateAccessState(currentState, room, sessionId, userId);
                return false;
            }
        }

        GroupRoomState passwordState;
        long passwordRevision;
        lock (_syncLock)
        {
            var state = ReconcileRoomLocked(room);
            if (!IsActiveParticipant(state, room, sessionId, userId) || !IsOwner(state, userId))
            {
                accessState = CreateAccessState(state, room, sessionId, userId);
                return false;
            }

            passwordState = state;
            passwordRevision = state.PasswordRevision;
        }

        byte[] salt = RandomNumberGenerator.GetBytes(PasswordSaltLength);
        byte[]? hash = null;
        bool passwordStored = false;
        try
        {
            hash = _passwordHasher(password, salt);
            lock (_syncLock)
            {
                if (!_rooms.TryGetValue(room.GroupId, out var currentState)
                    || !ReferenceEquals(currentState, passwordState))
                {
                    accessState = NoAccessState();
                    return false;
                }

                if (!IsActiveParticipant(currentState, room, sessionId, userId) || !IsOwner(currentState, userId))
                {
                    accessState = CreateAccessState(currentState, room, sessionId, userId);
                    return false;
                }

                if (currentState.PasswordRevision != passwordRevision)
                {
                    accessState = CreateAccessState(currentState, room, sessionId, userId);
                    return false;
                }

                ClearPassword(currentState);
                currentState.PasswordSalt = salt;
                currentState.PasswordHash = hash;
                currentState.PasswordRevision += 1;
                passwordStored = true;
                AuthorizeOwnerSessions(currentState);
                accessState = CreateAccessState(currentState, room, sessionId, userId);
                return true;
            }
        }
        finally
        {
            if (!passwordStored)
            {
                CryptographicOperations.ZeroMemory(salt);
                if (hash is not null)
                {
                    CryptographicOperations.ZeroMemory(hash);
                }
            }
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
            if (!IsActiveParticipant(state, room, sessionId, userId) || !IsOwner(state, userId))
            {
                accessState = CreateAccessState(state, room, sessionId, userId);
                return false;
            }

            ClearPassword(state);
            state.PasswordRevision += 1;
            accessState = CreateAccessState(state, room, sessionId, userId);
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
        var replacedSessionIds = room.Participants
            .Where(participant => state.Participants.TryGetValue(participant.SessionId, out var existing)
                && (existing.UserId != participant.UserId
                    || !ReferenceEquals(existing.MembershipIdentity, participant.MembershipIdentity)))
            .Select(static participant => participant.SessionId)
            .ToHashSet(StringComparer.Ordinal);
        foreach (string departedSessionId in state.Participants.Keys
            .Where(sessionId => !activeSessionIds.Contains(sessionId) || replacedSessionIds.Contains(sessionId))
            .ToList())
        {
            state.Participants.Remove(departedSessionId);
            state.AuthorizedSessions.Remove(departedSessionId);
            state.TypingBySession.Remove(departedSessionId);
        }

        TransferOwnershipIfNeeded(state);

        foreach (var participant in room.Participants)
        {
            if (state.Participants.TryGetValue(participant.SessionId, out var existing))
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
                participant.MembershipIdentity,
                state.NextJoinOrder);
        }

        if (state.Participants.Count == 0)
        {
            DestroyRoom(room.GroupId);
            return state;
        }

        TransferOwnershipIfNeeded(state);

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

    private static void TransferOwnershipIfNeeded(GroupRoomState state)
    {
        if (state.OwnerUserId != Guid.Empty
            && state.Participants.Values.Any(participant => participant.UserId == state.OwnerUserId))
        {
            return;
        }

        state.OwnerUserId = state.Participants.Values
            .OrderBy(static participant => participant.JoinOrder)
            .Select(static participant => participant.UserId)
            .FirstOrDefault();
    }

    private static bool TryAuthorizeContentAccess(
        GroupRoomState state,
        JellyChatSyncPlayRoomSnapshot room,
        string sessionId,
        Guid userId)
    {
        if (!IsActiveParticipant(state, room, sessionId, userId))
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

    private static bool IsActiveParticipant(
        GroupRoomState state,
        JellyChatSyncPlayRoomSnapshot room,
        string sessionId,
        Guid userId)
    {
        var roomParticipant = room.Participants.FirstOrDefault(participant =>
            string.Equals(participant.SessionId, sessionId, StringComparison.Ordinal)
            && participant.UserId == userId);
        return roomParticipant is not null
            && state.Participants.TryGetValue(sessionId, out var participant)
            && participant.UserId == userId
            && ReferenceEquals(participant.MembershipIdentity, roomParticipant.MembershipIdentity);
    }

    private static bool IsOwner(GroupRoomState state, Guid userId)
    {
        return userId != Guid.Empty && state.OwnerUserId == userId;
    }

    private static JellyChatRoomAccessState CreateAccessState(
        GroupRoomState state,
        JellyChatSyncPlayRoomSnapshot room,
        string sessionId,
        Guid userId)
    {
        bool isActiveParticipant = IsActiveParticipant(state, room, sessionId, userId);
        bool isOwner = isActiveParticipant && IsOwner(state, userId);
        return new JellyChatRoomAccessState(
            state.PasswordProtected,
            isActiveParticipant
                && (!state.PasswordProtected || isOwner || state.AuthorizedSessions.Contains(sessionId)),
            isOwner);
    }

    private static JellyChatRoomAccessState NoAccessState()
    {
        return new JellyChatRoomAccessState(false, false, false);
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

        public long PasswordRevision { get; set; }

        public bool PasswordProtected => PasswordHash is not null && PasswordSalt is not null;

        public Dictionary<string, RoomParticipantState> Participants { get; } = new(StringComparer.Ordinal);

        public HashSet<string> AuthorizedSessions { get; } = new(StringComparer.Ordinal);

        public List<JellyChatEvent> Events { get; } = [];

        public Dictionary<string, JellyChatEvent> TypingBySession { get; } = new(StringComparer.Ordinal);
    }

    private sealed class RoomParticipantState
    {
        public RoomParticipantState(string sessionId, Guid userId, string userName, object membershipIdentity, long joinOrder)
        {
            SessionId = sessionId;
            UserId = userId;
            UserName = userName;
            MembershipIdentity = membershipIdentity;
            JoinOrder = joinOrder;
        }

        public string SessionId { get; }

        public Guid UserId { get; }

        public string UserName { get; set; }

        public object MembershipIdentity { get; }

        public long JoinOrder { get; }
    }
}
