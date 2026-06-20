# SyncPlay Chat Drawer Plan

## Current Architecture

SyncPlay Chat is a Jellyfin server plugin with a small authenticated API and an injected web client script.

- `Jellyfin.Plugin.SyncPlayChat/Api/SyncPlayChatController.cs` exposes `POST /SyncPlayChat/Send`.
- The controller resolves the current Jellyfin user/session, uses SyncPlay group information as the room context, and sends a Jellyfin `MessageCommand` toast to matching sessions.
- `Jellyfin.Plugin.SyncPlayChat/Web/sync-chat.js` is embedded as a resource and injected into Jellyfin Web.
- `Jellyfin.Plugin.SyncPlayChat/Infrastructure/SyncChatWebInjectionStartupService.cs` registers a File Transformation callback.
- `Jellyfin.Plugin.SyncPlayChat/Infrastructure/SyncChatWebTransformer.cs` injects the embedded script into `index.html`.

## Target Architecture

The first drawer milestone keeps the existing backend behavior and moves only the web UI toward a native-feeling chat surface.

- Jellyfin SyncPlay remains responsible for playback synchronization.
- SyncPlay group/session data is used only to infer the current chat context.
- The injected client owns a Teleparty-style right-side drawer with local, non-persistent sent-message rendering.
- The existing `POST /SyncPlayChat/Send` endpoint remains the only send transport for now.
- No external WebSocket server, new port, Node/Bun backend, persistent storage, or new realtime channel is added.

## Files Changed For This Milestone

- `docs/chat-drawer-plan.md`
- `Jellyfin.Plugin.SyncPlayChat/Web/sync-chat.js`

No plugin identity, GUID, package metadata, release manifest, or C# API contracts should change for this milestone.

## Known Risks For Jellyfin 10.11.x

- The injected script depends on Jellyfin Web DOM structure and private CSS class names for placing the chat entry button; these may shift across Jellyfin Web updates.
- The script uses legacy/global web-client APIs such as `window.ApiClient`, which may not be stable across all Jellyfin Web builds or wrapper clients.
- SyncPlay session and group payload shapes vary, so group detection is intentionally defensive and may still miss edge cases.
- Script injection depends on the separate File Transformation plugin being installed, enabled, and compatible.
- A fixed right-side drawer must coexist with Jellyfin Web overlays, video OSD controls, dialogs, and fullscreen behavior without blocking core playback controls.
