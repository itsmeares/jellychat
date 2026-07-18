using System;

namespace Jellyfin.Plugin.JellyChat.Infrastructure;

internal sealed class JellyChatSyncPlayParticipant
{
    public JellyChatSyncPlayParticipant(string sessionId, Guid userId, string userName, object membershipIdentity)
    {
        SessionId = sessionId;
        UserId = userId;
        UserName = userName;
        MembershipIdentity = membershipIdentity;
    }

    public string SessionId { get; }

    public Guid UserId { get; }

    public string UserName { get; }

    public object MembershipIdentity { get; }
}
