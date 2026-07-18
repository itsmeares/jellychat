# Development

JellyChat is a Jellyfin server plugin with an injected React frontend for Jellyfin Web.

## Repo Layout

- `Jellyfin.Plugin.JellyChat/`: .NET plugin project, API controllers, plugin configuration, embedded web assets, and Jellyfin Web injection middleware.
- `Jellyfin.Plugin.JellyChat/Api/`: room access, `/JellyChat/Events`, and `/JellyChat/Assets/*` APIs.
- `Jellyfin.Plugin.JellyChat/Infrastructure/`: in-memory room state, authoritative SyncPlay resolution, asset provider, and web injection startup/middleware.
- `Jellyfin.Plugin.JellyChat.Tests/`: room lifecycle, ownership, password, and access-control tests.
- `Jellyfin.Plugin.JellyChat/Web/`: generated `jellychat.css` and `jellychat.js` served by the plugin.
- `web-src/`: React/Vite/TypeScript source for the injected Jellyfin Web client.
- `scripts/deploy-dev.sh`: local debug publish and plugin-folder copy helper.
- `docs/`: project documentation for development, release, and troubleshooting.

## Frontend Build

Install frontend dependencies once:

```bash
cd web-src
npm ci
```

Build the injected frontend:

```bash
npm run build
```

The build writes stable asset names into the plugin project:

```text
Jellyfin.Plugin.JellyChat/Web/jellychat.css
Jellyfin.Plugin.JellyChat/Web/jellychat.js
```

`dotnet publish` runs `npm run build` when `web-src/node_modules` exists. It does not install frontend dependencies, so run `npm ci` separately.

## .NET Publish

From the repository root:

```bash
dotnet publish Jellyfin.Plugin.JellyChat/Jellyfin.Plugin.JellyChat.csproj -c Release
```

Publish output is written to:

```text
Jellyfin.Plugin.JellyChat/bin/Release/net9.0/publish/
```

For debug builds:

```bash
dotnet publish Jellyfin.Plugin.JellyChat.sln -c Debug
```

## Local Dev Deploy

From the repository root:

```bash
./scripts/deploy-dev.sh
```

The script publishes Debug output and copies it to the Jellyfin plugin directory. By default it uses:

```text
$HOME/Library/Application Support/jellyfin/plugins/JellyChat
```

Override the target as needed:

```bash
PLUGIN_DIR="/path/to/jellyfin/plugins/JellyChat" ./scripts/deploy-dev.sh
```

or:

```bash
JELLYFIN_DATA_DIR="/path/to/jellyfin" ./scripts/deploy-dev.sh
```

Restart Jellyfin after each deploy.

## Useful Debug Commands

Build checks:

```bash
cd web-src
npm run build
cd ..
dotnet publish Jellyfin.Plugin.JellyChat/Jellyfin.Plugin.JellyChat.csproj -c Release
git diff --check
```

Browser console checks:

```js
window.JellyChatDebug.getSummary()
window.JellyChatDebug.dump()
window.JellyChatDebug.reset()
```

Useful asset and API checks from an authenticated Jellyfin browser session:

```text
/JellyChat/Assets/jellychat.css
/JellyChat/Assets/jellychat.js
/JellyChat/Room
/JellyChat/Events
```

If Jellyfin runs under a base path, include that base path, for example `/jellyfin/JellyChat/Assets/jellychat.js`.

## Frontend Assets And Event API

JellyChat v0.5.0 and later do not use Jellyfin File Transformation. The plugin injects same-origin external asset tags into Jellyfin Web and serves the built files from:

```text
GET /JellyChat/Assets/jellychat.css
GET /JellyChat/Assets/jellychat.js
```

Room activity uses the plugin-owned event API:

```text
GET  /JellyChat/Events
POST /JellyChat/Events
```

Room metadata and password actions use:

```text
GET    /JellyChat/Room
POST   /JellyChat/Room/Unlock
PUT    /JellyChat/Room/Password
DELETE /JellyChat/Room/Password
```

Room ownership, password hashes, session access grants, join order, history, typing state, and other temporary room data stay in memory. They are reconciled against authenticated Jellyfin sessions and authoritative SyncPlay membership. The final participant leaving destroys the complete JellyChat room state. API responses expose only the protection, current-session access, and current-user ownership flags needed by the frontend; they never return the password or its hash.

Jellyfin SyncPlay still owns playback synchronization. JellyChat only uses SyncPlay room/session data to decide which chat room the current client belongs to.
