using System;
using System.Collections.Generic;
using System.Linq;
using Jellyfin.Plugin.JellyChat.Api;

namespace Jellyfin.Plugin.JellyChat.Infrastructure;

/// <summary>
/// In-memory JellyChat room event store.
/// </summary>
public class JellyChatEventStore
{
    private const int MaxEventsPerGroup = 200;
    private const string TypingUpdateEventType = "typing.update";
    private static readonly TimeSpan TypingEventTtl = TimeSpan.FromSeconds(6);
    private readonly Dictionary<Guid, GroupEventState> _eventsByGroup = [];
    private readonly object _syncLock = new object();

    /// <summary>
    /// Adds an event to bounded group history, or returns an existing deduped event.
    /// </summary>
    /// <param name="roomEvent">The event to store.</param>
    /// <returns>The stored event snapshot.</returns>
    public JellyChatEvent AddOrGet(JellyChatEvent roomEvent)
    {
        lock (_syncLock)
        {
            if (!_eventsByGroup.TryGetValue(roomEvent.GroupId, out var state))
            {
                state = new GroupEventState();
                _eventsByGroup[roomEvent.GroupId] = state;
            }

            if (!string.IsNullOrWhiteSpace(roomEvent.ClientEventId))
            {
                var existing = state.Events.FirstOrDefault(stored =>
                    stored.UserId == roomEvent.UserId
                    && string.Equals(stored.ClientEventId, roomEvent.ClientEventId, StringComparison.Ordinal));
                if (existing is not null)
                {
                    return Snapshot(existing);
                }
            }

            var storedEvent = Snapshot(roomEvent);
            storedEvent.Id = Guid.NewGuid();
            storedEvent.Sequence = state.NextSequence;
            storedEvent.CreatedAtUtc = DateTime.UtcNow;
            state.NextSequence += 1;

            if (string.Equals(storedEvent.Type, TypingUpdateEventType, StringComparison.Ordinal))
            {
                state.TypingBySession[storedEvent.SessionId] = storedEvent;
                PruneTyping(state);
                return Snapshot(storedEvent);
            }

            state.Events.Add(storedEvent);

            if (state.Events.Count > MaxEventsPerGroup)
            {
                state.Events.RemoveRange(0, state.Events.Count - MaxEventsPerGroup);
            }

            return Snapshot(storedEvent);
        }
    }

    /// <summary>
    /// Gets recent event snapshots from a group.
    /// </summary>
    /// <param name="groupId">SyncPlay group identifier.</param>
    /// <param name="afterSequence">Optional event sequence cursor.</param>
    /// <param name="limit">Maximum number of events.</param>
    /// <returns>Recent event snapshots.</returns>
    public IReadOnlyList<JellyChatEvent> GetRecent(Guid groupId, long? afterSequence, int limit)
    {
        lock (_syncLock)
        {
            if (!_eventsByGroup.TryGetValue(groupId, out var state))
            {
                return [];
            }

            long cursor = afterSequence.GetValueOrDefault(0);
            PruneTyping(state);
            return state.Events
                .Where(roomEvent => roomEvent.Sequence > cursor)
                .Concat(state.TypingBySession.Values.Where(roomEvent => roomEvent.Sequence > cursor))
                .TakeLast(Math.Clamp(limit, 1, MaxEventsPerGroup))
                .OrderBy(static roomEvent => roomEvent.Sequence)
                .Select(Snapshot)
                .ToList();
        }
    }

    private static void PruneTyping(GroupEventState state)
    {
        var cutoff = DateTime.UtcNow - TypingEventTtl;
        foreach (var sessionId in state.TypingBySession
            .Where(pair => pair.Value.CreatedAtUtc < cutoff)
            .Select(pair => pair.Key)
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

    private sealed class GroupEventState
    {
        public long NextSequence { get; set; } = 1;

        public List<JellyChatEvent> Events { get; } = [];

        public Dictionary<string, JellyChatEvent> TypingBySession { get; } = new(StringComparer.Ordinal);
    }
}
