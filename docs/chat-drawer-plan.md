# JellyChat Drawer Plan

## Current Architecture

JellyChat is a Jellyfin server plugin with an authenticated room event API and an injected web client script.

- `Jellyfin.Plugin.JellyChat/Api/JellyChatController.cs` exposes `POST /JellyChat/Events` and `GET /JellyChat/Events`.
- `Jellyfin.Plugin.JellyChat/Infrastructure/JellyChatEventStore.cs` keeps a bounded in-memory event stream for each SyncPlay group.
- `Jellyfin.Plugin.JellyChat/Web/jellychat.js` is embedded as a resource and injected into Jellyfin Web.
- `Jellyfin.Plugin.JellyChat/Infrastructure/JellyChatWebInjectionStartupService.cs` registers a File Transformation callback.
- `Jellyfin.Plugin.JellyChat/Infrastructure/JellyChatWebTransformer.cs` injects the embedded script into `index.html`.

## Event Stream Direction

The drawer now uses one room event stream for chat messages and future room activity.

- Jellyfin SyncPlay remains responsible for playback synchronization.
- JellyChat uses SyncPlay group/session data only to find the current room context.
- Chat messages are stored as `chat.message` events and rendered by the injected drawer.
- Reaction and playback action events are accepted by the backend for early v0.2 compatibility, but the drawer does not yet render overlay reactions or playback timelines.
- No external WebSocket server, new port, React app, persistent storage, or new realtime channel is added.

## Memory Leak Guard

The injected client uses a hard `window.__JELLYCHAT_LOADED__` singleton guard before mounting UI. Drawer DOM, style injection, global event listeners, and the SyncPlay refresh interval are each registered at most once per browser page lifetime. Runtime state is exposed at `window.JellyChatDebug`, including mount, listener, interval, event cursor, and last-error fields for quick browser-console checks.
