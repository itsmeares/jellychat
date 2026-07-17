namespace Jellyfin.Plugin.JellyChat.Infrastructure;

internal sealed class JellyChatSyncPlayRoomResolution
{
    public JellyChatSyncPlayRoomResolution(bool lookupAvailable, JellyChatSyncPlayRoomSnapshot? room)
    {
        LookupAvailable = lookupAvailable;
        Room = room;
    }

    public bool LookupAvailable { get; }

    public JellyChatSyncPlayRoomSnapshot? Room { get; }
}
