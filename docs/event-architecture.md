# JellyChat Event Architecture

JellyChat uses a bounded room event stream keyed by Jellyfin SyncPlay group id. The stream is the shared backend shape for chat messages, emoji reactions, playback action log entries, and future room events.

## Boundaries

- Jellyfin SyncPlay owns playback synchronization.
- JellyChat does not issue playback commands and does not implement sync logic.
- Playback events such as `playback.play`, `playback.pause`, and `playback.seek` are timeline/log entries only.
- No external WebSocket server, separate frontend app, or additional network port is used.
- JellyChat v0.5.0 and later inject Jellyfin Web assets through plugin-owned middleware and `/JellyChat/Assets/*` endpoints. File Transformation was required only by older versions before v0.5.0.
- Event history is in memory only and resets when Jellyfin or the plugin restarts.
- GIF support is intentionally out of scope for this step.

## API

- `POST /JellyChat/Events` stores a validated event for the caller's active SyncPlay group.
- `GET /JellyChat/Events?groupId=<id>&afterSequence=<optional>&limit=<optional>` returns recent event snapshots for a visible SyncPlay group.
- Server-owned fields are `Id`, `Sequence`, `UserId`, `UserName`, `SessionId`, and `CreatedAtUtc`.
- `ClientEventId` is used for best-effort dedupe inside retained in-memory history.

Supported event types for this step:

- `chat.message`
- `reaction.emoji`
- `playback.play`
- `playback.pause`
- `playback.seek`
- `system.notice`

## Storage

`JellyChatEventStore` keeps up to 200 recent events per SyncPlay group. Each group has a monotonic `Sequence` that starts at 1 after server/plugin startup. Store methods return snapshots so controller callers cannot mutate retained history.
