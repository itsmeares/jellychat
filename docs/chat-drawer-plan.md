# JellyChat Drawer Plan

## Current Architecture

JellyChat is a Jellyfin server plugin with an authenticated room event API and an injected web client script.

- `Jellyfin.Plugin.JellyChat/Api/JellyChatController.cs` exposes `POST /JellyChat/Events` and `GET /JellyChat/Events`.
- `Jellyfin.Plugin.JellyChat/Api/JellyChatAssetsController.cs` exposes `GET /JellyChat/Assets/jellychat.css` and `GET /JellyChat/Assets/jellychat.js`.
- `Jellyfin.Plugin.JellyChat/Infrastructure/JellyChatEventStore.cs` keeps a bounded in-memory event stream for each SyncPlay group.
- `Jellyfin.Plugin.JellyChat/Web/jellychat.js` and `Jellyfin.Plugin.JellyChat/Web/jellychat.css` are embedded as resources and served by plugin-owned asset endpoints.
- `Jellyfin.Plugin.JellyChat/Infrastructure/JellyChatWebInjectionMiddleware.cs` injects same-origin external asset tags into Jellyfin Web `index.html`.
- JellyChat v0.5.0 and later do not require Jellyfin File Transformation. Older versions before v0.5.0 did.

## Event Stream Direction

The drawer now uses one room event stream for chat messages and future room activity.

- Jellyfin SyncPlay remains responsible for playback synchronization.
- JellyChat uses SyncPlay group/session data only to find the current room context.
- Chat messages are stored as `chat.message` events and rendered by the injected drawer.
- Reaction and playback action events are accepted by the backend for early v0.2 compatibility, but the drawer does not yet render overlay reactions or playback timelines.
- No external WebSocket server, new port, persistent storage, or new realtime channel is added.

## Memory Leak Guard

The injected React client uses a hard `window.__JELLYCHAT_LOADED__` singleton guard before mounting UI. The React root, chat button, global event listeners, and the SyncPlay refresh interval are each registered at most once per browser page lifetime. Runtime state is exposed at `window.JellyChatDebug`, including mount, listener, interval, event cursor, and last-error fields for quick browser-console checks.
