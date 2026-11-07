# Troubleshooting

Open the browser developer console in the Jellyfin Web client when checking JellyChat state.

## Quick check

```js
JellyChat.debug()
```

The snapshot shows whether you are signed in, which SyncPlay group JellyChat sees, the last event number it received, and the settings it resolved. It contains no tokens and no password data.

## Chat button missing

- Restart Jellyfin after installing or updating the plugin.
- Confirm JellyChat is installed and enabled in the Jellyfin plugin dashboard.
- Open `/JellyChat/Assets/jellychat.js` and `/JellyChat/Assets/jellychat.css` in the same browser session and confirm both load. If Jellyfin uses a base path, include it, such as `/jellyfin/JellyChat/Assets/jellychat.js`.
- Join a SyncPlay group. The header button only shows while you are in a group.
- Check `JellyChat.debug().room.inGroup`. If it is `false` while you are in a group, check the Jellyfin server log for SyncPlay errors.

If the header button is hidden but you are in a group, press `C` or open the player and use the JellyChat button there.

## Messages not appearing on another device

- Both clients must be signed in and joined to the same SyncPlay group.
- Reload the page after a plugin update. An old page keeps running the old script.
- Compare `JellyChat.debug().room.groupId` on both devices. They must match.

## Room locked

A room password does not block SyncPlay or playback. If the lock screen stays after you submit the password:

- Confirm the password with the room owner.
- Unlock each device separately, even on the same account.
- Ask the owner to change or remove the password.

Leaving and rejoining the group revokes that session's access. When the last participant leaves, the room and its password are discarded.

## Settings do not save

User settings are stored in your Jellyfin user's display preferences under the `jellychat` client. If a change does not stick, check that your user can reach `/DisplayPreferences/jellychat` and that the browser can store `localStorage` (the settings keep a local copy). The server owner may also have turned off **Let users change their look**, which locks theme, layout, message side and style.

## Reverse proxy or base path

JellyChat uses same-origin URLs. Behind a reverse proxy, keep the Jellyfin base path. Check these requests in the browser network tab:

- `/JellyChat/Assets/jellychat.js` and `/JellyChat/Assets/jellychat.css`
- `/JellyChat/Sync`. This is a long poll that normally stays open for up to 25 seconds. If your proxy closes idle requests sooner than that, raise its read timeout above 30 seconds.

## Sharing debug details

For bug reports, include the output of `JellyChat.debug()` and the Jellyfin version. Do not share tokens, cookies or private server URLs.
