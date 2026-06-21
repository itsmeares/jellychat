using System;
using System.Collections.Generic;
using System.Linq;
using Jellyfin.Plugin.SyncPlayChat.Api;

namespace Jellyfin.Plugin.SyncPlayChat.Infrastructure;

/// <summary>
/// In-memory SyncPlay chat history store.
/// </summary>
public class SyncPlayChatMessageStore
{
    private const int MaxMessagesPerGroup = 100;
    private readonly Dictionary<Guid, List<SyncPlayChatMessage>> _messagesByGroup = [];
    private readonly object _syncLock = new object();

    /// <summary>
    /// Adds a message to the bounded group history.
    /// </summary>
    /// <param name="groupId">SyncPlay group identifier.</param>
    /// <param name="userId">Jellyfin user identifier.</param>
    /// <param name="userName">Jellyfin user name.</param>
    /// <param name="text">Message text.</param>
    /// <returns>The stored message.</returns>
    public SyncPlayChatMessage Add(Guid groupId, Guid userId, string userName, string text)
    {
        var message = new SyncPlayChatMessage
        {
            Id = Guid.NewGuid(),
            GroupId = groupId,
            UserId = userId,
            UserName = userName,
            Text = text,
            CreatedAtUtc = DateTime.UtcNow
        };

        lock (_syncLock)
        {
            if (!_messagesByGroup.TryGetValue(groupId, out var messages))
            {
                messages = [];
                _messagesByGroup[groupId] = messages;
            }

            messages.Add(message);
            if (messages.Count > MaxMessagesPerGroup)
            {
                messages.RemoveRange(0, messages.Count - MaxMessagesPerGroup);
            }
        }

        return message;
    }

    /// <summary>
    /// Gets recent messages from a group history.
    /// </summary>
    /// <param name="groupId">SyncPlay group identifier.</param>
    /// <param name="afterMessageId">Optional message identifier cursor.</param>
    /// <param name="limit">Maximum number of messages.</param>
    /// <returns>Recent messages.</returns>
    public IReadOnlyList<SyncPlayChatMessage> GetRecent(Guid groupId, Guid? afterMessageId, int limit)
    {
        lock (_syncLock)
        {
            if (!_messagesByGroup.TryGetValue(groupId, out var messages))
            {
                return [];
            }

            IEnumerable<SyncPlayChatMessage> query = messages;
            if (afterMessageId.HasValue)
            {
                int index = messages.FindIndex(message => message.Id == afterMessageId.Value);
                if (index >= 0)
                {
                    query = messages.Skip(index + 1);
                }
            }

            return query
                .TakeLast(Math.Clamp(limit, 1, MaxMessagesPerGroup))
                .ToList();
        }
    }
}
