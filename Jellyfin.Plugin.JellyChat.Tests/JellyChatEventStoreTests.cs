using Jellyfin.Plugin.JellyChat.Api;
using Jellyfin.Plugin.JellyChat.Infrastructure;
using System.Security.Cryptography;
using System.Text;

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
    public void LeaveAndRejoinBetweenReconciliationsRevokesGrantAndMovesJoinOrder()
    {
        var store = new JellyChatEventStore();
        var groupId = Guid.NewGuid();
        var ownerMembership = new object();
        var oldSecondMembership = new object();
        var newSecondMembership = new object();
        var thirdMembership = new object();
        var room = CreateRoom(
            groupId,
            Member("owner-session", OwnerUserId, ownerMembership),
            Member("second-session", SecondUserId, oldSecondMembership),
            Member("third-session", ThirdUserId, thirdMembership));
        Assert.True(store.TryGetRecent(room, "second-session", SecondUserId, null, 100, out _));
        Assert.True(store.TrySetPassword(room, "owner-session", OwnerUserId, "secret", out _));

        room = CreateRoom(
            groupId,
            Member("owner-session", OwnerUserId, ownerMembership),
            Member("second-session", SecondUserId, newSecondMembership),
            Member("third-session", ThirdUserId, thirdMembership));
        Assert.False(store.ReconcileRoom(room, "second-session", SecondUserId).Authorized);

        room = CreateRoom(
            groupId,
            Member("second-session", SecondUserId, newSecondMembership),
            Member("third-session", ThirdUserId, thirdMembership));
        Assert.True(store.ReconcileRoom(room, "third-session", ThirdUserId).IsOwner);
        Assert.False(store.ReconcileRoom(room, "second-session", SecondUserId).IsOwner);
    }

    [Fact]
    public void OwnerLeaveAndRejoinBetweenReconciliationsTransfersOwnership()
    {
        var store = new JellyChatEventStore();
        var groupId = Guid.NewGuid();
        var oldOwnerMembership = new object();
        var newOwnerMembership = new object();
        var secondMembership = new object();
        var room = CreateRoom(
            groupId,
            Member("owner-session", OwnerUserId, oldOwnerMembership),
            Member("second-session", SecondUserId, secondMembership));
        Assert.True(store.TrySetPassword(room, "owner-session", OwnerUserId, "secret", out _));

        room = CreateRoom(
            groupId,
            Member("owner-session", OwnerUserId, newOwnerMembership),
            Member("second-session", SecondUserId, secondMembership));

        Assert.True(store.ReconcileRoom(room, "second-session", SecondUserId).IsOwner);
        var rejoinedOwnerAccess = store.ReconcileRoom(room, "owner-session", OwnerUserId);
        Assert.False(rejoinedOwnerAccess.IsOwner);
        Assert.False(rejoinedOwnerAccess.Authorized);
    }

    [Fact]
    public async Task PasswordHashingDoesNotHoldSharedRoomLock()
    {
        CancellationToken cancellationToken = TestContext.Current.CancellationToken;
        using var hashingStarted = new ManualResetEventSlim();
        using var releaseHashing = new ManualResetEventSlim();
        bool blockHashing = false;
        var store = new JellyChatEventStore((password, salt) =>
        {
            if (blockHashing && string.Equals(password, "secret", StringComparison.Ordinal))
            {
                hashingStarted.Set();
                if (!releaseHashing.Wait(TimeSpan.FromSeconds(5), cancellationToken))
                {
                    throw new TimeoutException("Test password hashing was not released.");
                }
            }

            return TestHash(password, salt);
        });
        var lockedRoom = CreateRoom(("owner-session", OwnerUserId), ("locked-session", SecondUserId));
        Assert.True(store.TrySetPassword(lockedRoom, "owner-session", OwnerUserId, "secret", out _));
        var otherRoom = CreateRoom(("other-owner", ThirdUserId));
        blockHashing = true;

        Task<bool> unlockTask = Task.Run(() => store.TryUnlock(
            lockedRoom,
            "locked-session",
            SecondUserId,
            "secret",
            out _), cancellationToken);
        try
        {
            Assert.True(hashingStarted.Wait(TimeSpan.FromSeconds(2), cancellationToken));
            Task<bool> otherRoomWrite = Task.Run(() => store.TryAddOrGet(
                otherRoom,
                CreateEvent(otherRoom.GroupId, "other-owner", ThirdUserId, "chat.message"),
                out _), cancellationToken);
            Task reconciliation = Task.Run(
                () => store.ReconcileActiveRooms([lockedRoom, otherRoom]),
                cancellationToken);
            Task concurrentOperations = Task.WhenAll(otherRoomWrite, reconciliation);
            Task completed = await Task.WhenAny(concurrentOperations, Task.Delay(TimeSpan.FromSeconds(1), cancellationToken));
            Assert.Same(concurrentOperations, completed);
            await concurrentOperations;
            Assert.True(await otherRoomWrite);
        }
        finally
        {
            releaseHashing.Set();
        }

        Assert.True(await unlockTask);
    }

    [Fact]
    public async Task ConcurrentPasswordChangeRejectsStaleUnlock()
    {
        CancellationToken cancellationToken = TestContext.Current.CancellationToken;
        using var hashingStarted = new ManualResetEventSlim();
        using var releaseHashing = new ManualResetEventSlim();
        bool blockOldPassword = false;
        var store = new JellyChatEventStore((password, salt) =>
        {
            if (blockOldPassword && string.Equals(password, "old-password", StringComparison.Ordinal))
            {
                hashingStarted.Set();
                if (!releaseHashing.Wait(TimeSpan.FromSeconds(5), cancellationToken))
                {
                    throw new TimeoutException("Test password hashing was not released.");
                }
            }

            return TestHash(password, salt);
        });
        var room = CreateRoom(("owner-session", OwnerUserId), ("locked-session", SecondUserId));
        Assert.True(store.TrySetPassword(room, "owner-session", OwnerUserId, "old-password", out _));
        blockOldPassword = true;

        Task<(bool Unlocked, JellyChatRoomAccessState Access)> staleUnlock = Task.Run(() =>
        {
            bool unlocked = store.TryUnlock(room, "locked-session", SecondUserId, "old-password", out var access);
            return (unlocked, access);
        }, cancellationToken);
        Assert.True(hashingStarted.Wait(TimeSpan.FromSeconds(2), cancellationToken));
        Assert.True(store.TrySetPassword(room, "owner-session", OwnerUserId, "new-password", out _));
        releaseHashing.Set();

        var staleResult = await staleUnlock;
        Assert.False(staleResult.Unlocked);
        Assert.False(staleResult.Access.Authorized);
        Assert.True(store.TryUnlock(room, "locked-session", SecondUserId, "new-password", out var currentAccess));
        Assert.True(currentAccess.Authorized);
    }

    [Fact]
    public async Task ConcurrentPasswordManagementDoesNotOverwriteNewerChange()
    {
        CancellationToken cancellationToken = TestContext.Current.CancellationToken;
        using var hashingStarted = new ManualResetEventSlim();
        using var releaseHashing = new ManualResetEventSlim();
        var store = new JellyChatEventStore((password, salt) =>
        {
            if (string.Equals(password, "slow-password", StringComparison.Ordinal))
            {
                hashingStarted.Set();
                if (!releaseHashing.Wait(TimeSpan.FromSeconds(5), cancellationToken))
                {
                    throw new TimeoutException("Test password hashing was not released.");
                }
            }

            return TestHash(password, salt);
        });
        var room = CreateRoom(("owner-session", OwnerUserId), ("locked-session", SecondUserId));

        Task<bool> slowChange = Task.Run(() => store.TrySetPassword(
            room,
            "owner-session",
            OwnerUserId,
            "slow-password",
            out _), cancellationToken);
        Assert.True(hashingStarted.Wait(TimeSpan.FromSeconds(2), cancellationToken));
        Assert.True(store.TrySetPassword(room, "owner-session", OwnerUserId, "new-password", out _));
        releaseHashing.Set();

        Assert.False(await slowChange);
        Assert.False(store.TryUnlock(room, "locked-session", SecondUserId, "slow-password", out _));
        Assert.True(store.TryUnlock(room, "locked-session", SecondUserId, "new-password", out _));
    }

    [Fact]
    public async Task ConcurrentRoomDestructionRejectsUnlockWithoutResurrectingRoom()
    {
        CancellationToken cancellationToken = TestContext.Current.CancellationToken;
        using var hashingStarted = new ManualResetEventSlim();
        using var releaseHashing = new ManualResetEventSlim();
        bool blockHashing = false;
        var store = new JellyChatEventStore((password, salt) =>
        {
            if (blockHashing)
            {
                hashingStarted.Set();
                if (!releaseHashing.Wait(TimeSpan.FromSeconds(5), cancellationToken))
                {
                    throw new TimeoutException("Test password hashing was not released.");
                }
            }

            return TestHash(password, salt);
        });
        var groupId = Guid.NewGuid();
        var room = CreateRoom(groupId, ("owner-session", OwnerUserId), ("locked-session", SecondUserId));
        Assert.True(store.TrySetPassword(room, "owner-session", OwnerUserId, "secret", out _));
        blockHashing = true;

        Task<bool> unlockTask = Task.Run(() => store.TryUnlock(
            room,
            "locked-session",
            SecondUserId,
            "secret",
            out _), cancellationToken);
        Assert.True(hashingStarted.Wait(TimeSpan.FromSeconds(2), cancellationToken));
        store.ReconcileActiveRooms([]);
        releaseHashing.Set();
        Assert.False(await unlockTask);

        var freshRoom = CreateRoom(groupId, ("fresh-session", ThirdUserId));
        var freshAccess = store.ReconcileRoom(freshRoom, "fresh-session", ThirdUserId);
        Assert.True(freshAccess.IsOwner);
        Assert.False(freshAccess.PasswordProtected);
    }

    [Fact]
    public void PasswordManagementRejectsInvalidCallerBeforeHashing()
    {
        int hashCount = 0;
        var store = new JellyChatEventStore((password, salt) =>
        {
            Interlocked.Increment(ref hashCount);
            return TestHash(password, salt);
        });
        var room = CreateRoom(("owner-session", OwnerUserId), ("second-session", SecondUserId));

        Assert.False(store.TrySetPassword(room, "second-session", SecondUserId, "secret", out _));
        Assert.False(store.TrySetPassword(room, "missing-session", OwnerUserId, "secret", out _));
        Assert.Equal(0, hashCount);
        Assert.True(store.TrySetPassword(room, "owner-session", OwnerUserId, "secret", out _));
        Assert.Equal(1, hashCount);
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
                "User " + participant.UserId.ToString("N")[..4],
                participant.SessionId)).ToList());
    }

    private static JellyChatSyncPlayRoomSnapshot CreateRoom(Guid groupId, params TestMember[] participants)
    {
        return new JellyChatSyncPlayRoomSnapshot(
            groupId,
            "Test room",
            participants.Select(participant => new JellyChatSyncPlayParticipant(
                participant.SessionId,
                participant.UserId,
                "User " + participant.UserId.ToString("N")[..4],
                participant.MembershipIdentity)).ToList());
    }

    private static TestMember Member(string sessionId, Guid userId, object membershipIdentity)
    {
        return new TestMember(sessionId, userId, membershipIdentity);
    }

    private static byte[] TestHash(string password, byte[] salt)
    {
        return SHA256.HashData(Encoding.UTF8.GetBytes(password).Concat(salt).ToArray());
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

    private sealed record TestMember(string SessionId, Guid UserId, object MembershipIdentity);
}
