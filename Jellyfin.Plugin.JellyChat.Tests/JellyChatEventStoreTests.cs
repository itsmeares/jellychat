using Jellyfin.Plugin.JellyChat.Api;
using Jellyfin.Plugin.JellyChat.Infrastructure;

namespace Jellyfin.Plugin.JellyChat.Tests;

public sealed class JellyChatEventStoreTests
{
    private static readonly Guid OwnerUserId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid SecondUserId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid ThirdUserId = Guid.Parse("33333333-3333-3333-3333-333333333333");

    [Fact]
    public void CreatorOwnsRoomAndOnlyOwnerCanSetPassword()
    {
        var store = new JellyChatEventStore();
        var room = CreateRoom(("owner-session", OwnerUserId), ("second-session", SecondUserId));

        var ownerAccess = store.ReconcileRoom(room, "owner-session", OwnerUserId);
        var secondAccess = store.ReconcileRoom(room, "second-session", SecondUserId);

        Assert.True(ownerAccess.IsOwner);
        Assert.True(ownerAccess.Authorized);
        Assert.False(secondAccess.IsOwner);
        Assert.True(secondAccess.Authorized);
        Assert.False(store.TrySetPassword(room, "owner-session", OwnerUserId, string.Empty, out _));
        Assert.False(store.TrySetPassword(room, "second-session", SecondUserId, "no", out _));
        Assert.True(store.TrySetPassword(room, "owner-session", OwnerUserId, "x", out var protectedOwnerAccess));
        Assert.True(protectedOwnerAccess.PasswordProtected);
        Assert.True(protectedOwnerAccess.Authorized);
    }

    [Fact]
    public void ExistingGrantSurvivesPasswordTransitionsButSameAccountSessionDoesNotInherit()
    {
        var store = new JellyChatEventStore();
        var room = CreateRoom(("owner-session", OwnerUserId), ("second-session", SecondUserId));

        Assert.True(store.TryGetRecent(room, "second-session", SecondUserId, null, 100, out _));
        Assert.True(store.TrySetPassword(room, "owner-session", OwnerUserId, "first", out _));
        Assert.True(store.ReconcileRoom(room, "second-session", SecondUserId).Authorized);
        Assert.True(store.TrySetPassword(room, "owner-session", OwnerUserId, "second", out _));
        Assert.True(store.ReconcileRoom(room, "second-session", SecondUserId).Authorized);

        room = CreateRoom(
            room.GroupId,
            ("owner-session", OwnerUserId),
            ("second-session", SecondUserId),
            ("same-account-new-session", SecondUserId));
        Assert.False(store.ReconcileRoom(room, "same-account-new-session", SecondUserId).Authorized);
        Assert.False(store.TryUnlock(room, "same-account-new-session", SecondUserId, "wrong", out var wrongAccess));
        Assert.False(wrongAccess.Authorized);
        Assert.True(store.TryUnlock(room, "same-account-new-session", SecondUserId, "second", out var unlockedAccess));
        Assert.True(unlockedAccess.Authorized);

        Assert.True(store.TryDisablePassword(room, "owner-session", OwnerUserId, out var disabledAccess));
        Assert.False(disabledAccess.PasswordProtected);
        room = CreateRoom(
            room.GroupId,
            ("owner-session", OwnerUserId),
            ("second-session", SecondUserId),
            ("same-account-new-session", SecondUserId),
            ("ungranted-session", ThirdUserId));
        Assert.True(store.ReconcileRoom(room, "ungranted-session", ThirdUserId).Authorized);
        Assert.True(store.TrySetPassword(room, "owner-session", OwnerUserId, "third", out _));
        Assert.False(store.ReconcileRoom(room, "ungranted-session", ThirdUserId).Authorized);
        Assert.True(store.ReconcileRoom(room, "second-session", SecondUserId).Authorized);
    }

    [Fact]
    public void OwnershipTransfersByJoinOrderAfterAllOwnerSessionsLeave()
    {
        var store = new JellyChatEventStore();
        var groupId = Guid.NewGuid();
        var room = CreateRoom(
            groupId,
            ("owner-first", OwnerUserId),
            ("owner-second", OwnerUserId),
            ("second-session", SecondUserId),
            ("third-session", ThirdUserId));

        Assert.True(store.TrySetPassword(room, "owner-first", OwnerUserId, "secret", out _));
        room = CreateRoom(
            groupId,
            ("owner-second", OwnerUserId),
            ("second-session", SecondUserId),
            ("third-session", ThirdUserId));
        Assert.True(store.ReconcileRoom(room, "owner-second", OwnerUserId).IsOwner);

        room = CreateRoom(groupId, ("second-session", SecondUserId), ("third-session", ThirdUserId));
        var secondOwnerAccess = store.ReconcileRoom(room, "second-session", SecondUserId);
        Assert.True(secondOwnerAccess.IsOwner);
        Assert.True(secondOwnerAccess.Authorized);

        room = CreateRoom(
            groupId,
            ("second-session", SecondUserId),
            ("third-session", ThirdUserId),
            ("owner-rejoined", OwnerUserId));
        room = CreateRoom(groupId, ("third-session", ThirdUserId), ("owner-rejoined", OwnerUserId));
        Assert.True(store.ReconcileRoom(room, "third-session", ThirdUserId).IsOwner);
        Assert.False(store.ReconcileRoom(room, "owner-rejoined", OwnerUserId).IsOwner);
    }

    [Fact]
    public void LeavingRevokesGrantAndRejoiningMovesSessionToEnd()
    {
        var store = new JellyChatEventStore();
        var groupId = Guid.NewGuid();
        var room = CreateRoom(groupId, ("owner-session", OwnerUserId), ("second-session", SecondUserId));
        Assert.True(store.TryGetRecent(room, "second-session", SecondUserId, null, 100, out _));
        Assert.True(store.TrySetPassword(room, "owner-session", OwnerUserId, "secret", out _));

        store.ReconcileActiveRooms([CreateRoom(groupId, ("owner-session", OwnerUserId))]);
        room = CreateRoom(groupId, ("owner-session", OwnerUserId), ("second-session", SecondUserId));
        Assert.False(store.ReconcileRoom(room, "second-session", SecondUserId).Authorized);
    }

    [Fact]
    public void LockedSessionCannotReadOrWriteAnyEventType()
    {
        var store = new JellyChatEventStore();
        var room = CreateRoom(("owner-session", OwnerUserId), ("locked-session", SecondUserId));
        Assert.True(store.TrySetPassword(room, "owner-session", OwnerUserId, "secret", out _));
        Assert.False(store.TryGetRecent(room, "locked-session", SecondUserId, null, 100, out var events));
        Assert.Empty(events);

        foreach (string type in new[]
        {
            "chat.message",
            "reaction.emoji",
            "playback.start",
            "playback.play",
            "playback.pause",
            "playback.seek",
            "typing.update",
            "system.notice"
        })
        {
            var roomEvent = CreateEvent(room.GroupId, "locked-session", SecondUserId, type);
            Assert.False(store.TryAddOrGet(room, roomEvent, out _));
        }
    }

    [Fact]
    public void FinalParticipantCleanupRemovesHistoryPasswordGrantsAndOwnership()
    {
        var store = new JellyChatEventStore();
        var groupId = Guid.NewGuid();
        var room = CreateRoom(groupId, ("owner-session", OwnerUserId), ("second-session", SecondUserId));
        Assert.True(store.TryGetRecent(room, "second-session", SecondUserId, null, 100, out _));
        Assert.True(store.TrySetPassword(room, "owner-session", OwnerUserId, "secret", out _));
        Assert.True(store.TryAddOrGet(room, CreateEvent(groupId, "owner-session", OwnerUserId, "chat.message"), out _));

        store.ReconcileActiveRooms([]);

        var freshRoom = CreateRoom(groupId, ("fresh-session", ThirdUserId));
        var freshAccess = store.ReconcileRoom(freshRoom, "fresh-session", ThirdUserId);
        Assert.True(freshAccess.IsOwner);
        Assert.True(freshAccess.Authorized);
        Assert.False(freshAccess.PasswordProtected);
        Assert.True(store.TryGetRecent(freshRoom, "fresh-session", ThirdUserId, null, 100, out var events));
        Assert.Empty(events);
    }

    private static JellyChatSyncPlayRoomSnapshot CreateRoom(params (string SessionId, Guid UserId)[] participants)
    {
        return CreateRoom(Guid.NewGuid(), participants);
    }

    private static JellyChatSyncPlayRoomSnapshot CreateRoom(Guid groupId, params (string SessionId, Guid UserId)[] participants)
    {
        return new JellyChatSyncPlayRoomSnapshot(
            groupId,
            "Test room",
            participants.Select(participant => new JellyChatSyncPlayParticipant(
                participant.SessionId,
                participant.UserId,
                "User " + participant.UserId.ToString("N")[..4])).ToList());
    }

    private static JellyChatEvent CreateEvent(Guid groupId, string sessionId, Guid userId, string type)
    {
        return new JellyChatEvent
        {
            GroupId = groupId,
            SessionId = sessionId,
            UserId = userId,
            UserName = "Test user",
            Type = type,
            Text = type == "chat.message" ? "hello" : null,
            ClientEventId = Guid.NewGuid().ToString("N")
        };
    }
}
