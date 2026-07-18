namespace Jellyfin.Plugin.JellyChat.Infrastructure;

internal sealed class JellyChatRoomAccessState
{
    public JellyChatRoomAccessState(bool passwordProtected, bool authorized, bool isOwner)
    {
        PasswordProtected = passwordProtected;
        Authorized = authorized;
        IsOwner = isOwner;
    }

    public bool PasswordProtected { get; }

    public bool Authorized { get; }

    public bool IsOwner { get; }
}
