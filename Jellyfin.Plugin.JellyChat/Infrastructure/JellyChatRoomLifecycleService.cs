using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Hosting;

namespace Jellyfin.Plugin.JellyChat.Infrastructure;

/// <summary>
/// Reconciles temporary JellyChat room state with active SyncPlay groups.
/// </summary>
public sealed class JellyChatRoomLifecycleService : BackgroundService
{
    private static readonly TimeSpan ReconciliationInterval = TimeSpan.FromSeconds(1);
    private readonly JellyChatSyncPlayStateResolver _syncPlayStateResolver;
    private readonly JellyChatEventStore _eventStore;

    /// <summary>
    /// Initializes a new instance of the <see cref="JellyChatRoomLifecycleService"/> class.
    /// </summary>
    /// <param name="syncPlayStateResolver">The authoritative SyncPlay state resolver.</param>
    /// <param name="eventStore">The temporary JellyChat room store.</param>
    public JellyChatRoomLifecycleService(
        JellyChatSyncPlayStateResolver syncPlayStateResolver,
        JellyChatEventStore eventStore)
    {
        _syncPlayStateResolver = syncPlayStateResolver;
        _eventStore = eventStore;
    }

    /// <inheritdoc />
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(ReconciliationInterval);
        do
        {
            if (_syncPlayStateResolver.TryGetActiveRooms(out var rooms))
            {
                _eventStore.ReconcileActiveRooms(rooms);
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false));
    }
}
