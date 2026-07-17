using System;
using System.Collections.Generic;

namespace Jellyfin.Plugin.JellyChat.Infrastructure;

internal sealed class JellyChatSyncPlayRoomSnapshot
{
    public JellyChatSyncPlayRoomSnapshot(Guid groupId, string groupName, IReadOnlyList<JellyChatSyncPlayParticipant> participants)
    {
        GroupId = groupId;
        GroupName = groupName;
        Participants = participants;
    }

    public Guid GroupId { get; }

    public string GroupName { get; }

    public IReadOnlyList<JellyChatSyncPlayParticipant> Participants { get; }
}
