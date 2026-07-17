# Troubleshooting

Open the browser developer console in the Jellyfin Web client when checking JellyChat runtime state.

## Chat Button Missing

Try these checks:

- Restart Jellyfin after installing or updating the plugin.
- Confirm JellyChat is installed and enabled in the Jellyfin plugin dashboard.
- Open `/JellyChat/Assets/jellychat.js` and `/JellyChat/Assets/jellychat.css` in the same Jellyfin browser session and confirm both load.
- If Jellyfin uses a base path, include it, such as `/jellyfin/JellyChat/Assets/jellychat.js`.
- On `/web/index.html`, view source and confirm a `JellyChat:start` marker is present.

Useful console check:

```js
window.JellyChatDebug.getSummary()
```

Look at trigger and asset status:

```js
window.JellyChatDebug.getSummary().status
window.JellyChatDebug.getSummary().counts
```

Fields such as `triggerMode`, `triggerHostFound`, `triggerCandidateCount`, `desktopTriggerFallbackActive`, `assetCssLoaded`, and `assetJsLoaded` are the quickest signal.

## Messages Not Appearing On Another Device

JellyChat rooms follow Jellyfin SyncPlay groups. If messages stay local:

- Confirm both clients are signed in, playing media, and joined to the same SyncPlay group.
- Reopen the drawer to force a fresh room/event poll.
- Confirm the other client is not still on an old page load after a plugin update.
- Check whether messages begin appearing after leaving and rejoining the SyncPlay group.

Useful console check:

```js
window.JellyChatDebug.getSummary().status
```

Check `currentGroupId`, `syncPlayInGroup`, `syncPlayActiveGroupId`, `syncPlayResolutionState`, `lastApiStatus`, and `lastApiError`.

## JellyChat Room Locked

A JellyChat room password does not block SyncPlay membership or playback. If the lock screen remains after submitting the password:

- Confirm the password with the current room owner.
- Confirm this browser session is still in the expected SyncPlay group.
- Unlock each device separately, even when the devices use the same Jellyfin account.
- Ask the current owner to change or explicitly disable protection if the password is no longer available.

Leaving and rejoining revokes that session's previous access. If the final SyncPlay participant leaves, the room is destroyed; a later group starts with fresh ownership, access, password, and history state.

Useful console check:

```js
window.JellyChatDebug.getSummary().status
```

Check `roomPasswordProtected`, `roomAuthorized`, `roomIsOwner`, `lastApiStatus`, and `lastApiError`. Debug output contains access flags only, not the room password or recoverable password data.

## SyncPlay And Session Resolution

Same-account multi-device setups can expose more than one Jellyfin session for the same user. JellyChat tries to resolve the current client from available session and device signals.

Useful checks:

```js
window.JellyChatDebug.getSummary().status
window.JellyChatDebug.dump().details.events
```

Look at `currentSessionId`, `currentDeviceId`, `currentApiDeviceId`, `currentClientName`, `syncPlayMembershipSource`, `syncPlayCurrentUserSessionCount`, `syncPlayAmbiguousSession`, and `lastSyncPlayResolutionError`.

If `syncPlayAmbiguousSession` is `true`, compare the current browser/device with `syncPlayCurrentUserSessionIds` and `syncPlayMatchedSessionIds` in `window.JellyChatDebug.dump().details.events`.

## Reverse Proxy Or Base-Path Issues

JellyChat uses same-origin asset and API URLs. Behind a reverse proxy, the Jellyfin base path must be preserved.

Check:

- `/JellyChat/Assets/jellychat.js` or `/jellyfin/JellyChat/Assets/jellychat.js`, depending on the Jellyfin base path.
- `/JellyChat/Assets/jellychat.css` or `/jellyfin/JellyChat/Assets/jellychat.css`.
- Browser network requests for `/JellyChat/Events`.

Useful console checks:

```js
window.JellyChatDebug.getSummary().status
window.JellyChatDebug.getSummary().last
```

Look at `assetBasePath`, `assetBasePathSource`, `assetBasePathError`, `injectedAssetBaseUrl`, `lastApiPath`, `lastApiUrlPath`, `lastApiUrlSource`, `lastApiUrlError`, `lastApiStatus`, and `lastApiError`.

## Sharing Debug Details

For bug reports, include:

```js
window.JellyChatDebug.getSummary()
```

If the issue involves SyncPlay/session resolution or layout, include:

```js
window.JellyChatDebug.dump()
```

Do not share tokens, cookies, server URLs you consider private, or unrelated browser-console output.
