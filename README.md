# JellyChat

JellyChat is a Jellyfin plugin MVP that adds a SyncPlay chat drawer to Jellyfin web clients. It uses a plugin-owned room event stream and an injected React frontend; it does not use an external WebSocket server or any new network ports.

## Current MVP

- Adds a chat drawer for active SyncPlay sessions in the Jellyfin web client.
- Stores recent room events in plugin-owned in-memory history, grouped by SyncPlay group.
- Sends chat messages as `chat.message` events.
- Shows ephemeral typing presence through `typing.update` events.
- Supports drawer width and background preferences in the browser.
- Mounts the JellyChat trigger into native Jellyfin header or video OSD controls when possible.
- Refreshes recent events through the plugin API.
- Does not use Jellyfin toast notifications as the chat transport.
- Does not run a separate WebSocket service.
- Does not require opening or configuring additional ports.
- Uses self-contained Jellyfin Web injection through JellyChat-owned middleware and asset endpoints.
- Injects `jellychat.css` and `jellychat.js` into Jellyfin web through JellyChat-owned middleware and asset endpoints.

## Current Limitations

- Event history is in memory only and is lost when Jellyfin or the plugin restarts.
- History is bounded to recent events per SyncPlay group.
- The drawer is designed for Jellyfin web clients; native client support is not part of this MVP.
- SyncPlay group detection depends on the session and group data exposed by the running Jellyfin server/client combination.
- The drawer is injected into Jellyfin web and may need follow-up adjustments if Jellyfin changes its web client markup.
- Fullscreen behavior has only a basic MVP check, not exhaustive device coverage.

## Plugin Metadata

- Repo name: `JellyChat`
- Install folder: `JellyChat`
- Jellyfin display name: `JellyChat`
- Internal project path: `Jellyfin.Plugin.JellyChat`
- Version: `0.6.0`
- Plugin ID: `a69744cc-2281-48bf-adef-8e451a16ff71`
- Framework: `net9.0`
- Description: JellyChat drawer backed by a plugin-owned in-memory event stream, with no toast chat transport, external WebSocket server, or new ports.

## Prerequisites

- Tested with Jellyfin 10.11.x.
- Built against `Jellyfin.Controller` / `Jellyfin.Model` `10.11.8`.
- Target ABI: `10.11.0.0`.
- .NET SDK 9.0 for building.
- JellyChat v0.5.0 and later do not require Jellyfin File Transformation.
  - Older JellyChat versions before v0.5.0 required File Transformation for Jellyfin Web injection.

## Frontend Build

JellyChat's injected frontend lives in `web-src` and builds stable asset names into `Jellyfin.Plugin.JellyChat/Web`:

```bash
cd web-src
npm install
npm run build
```

The build emits:

```text
Jellyfin.Plugin.JellyChat/Web/jellychat.css
Jellyfin.Plugin.JellyChat/Web/jellychat.js
```

`dotnet publish` runs `npm run build` only. Run `npm install` or `npm ci` as a separate setup step before publishing.

At runtime, JellyChat serves those assets from same-origin plugin endpoints:

```text
/JellyChat/Assets/jellychat.css
/JellyChat/Assets/jellychat.js
```

When Jellyfin is served behind a subpath such as `/jellyfin`, injected asset
URLs include that base path, for example `/jellyfin/JellyChat/Assets/jellychat.js`.

## Repository Install

In Jellyfin, go to:

```text
Dashboard -> Plugins -> Manage Repositories -> New Repository
```

Use:

```text
Repository Name: JellyChat
Repository URL: https://raw.githubusercontent.com/itsmeares/jellychat/main/manifest.json
```

Save the repository, install `JellyChat` from the plugin catalog, then restart Jellyfin.

## Manual Install on Windows

From the repository root, publish the plugin:

```powershell
dotnet publish .\Jellyfin.Plugin.JellyChat\Jellyfin.Plugin.JellyChat.csproj -c Release
```

Clean the old plugin and copy the publish output into a Jellyfin plugin folder:

```powershell
$pluginFolder = "C:\ProgramData\Jellyfin\Server\plugins\JellyChat"
$publishFolder = ".\Jellyfin.Plugin.JellyChat\bin\Release\net9.0\publish"

Remove-Item $pluginFolder -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $pluginFolder | Out-Null
Copy-Item "$publishFolder\*" $pluginFolder -Recurse -Force
```

Restart Jellyfin after copying the files.

For direct installs that use the local app data Jellyfin path instead:

```powershell
$pluginFolder = "$env:LOCALAPPDATA\jellyfin\plugins\JellyChat"
$publishFolder = ".\Jellyfin.Plugin.JellyChat\bin\Release\net9.0\publish"

Remove-Item $pluginFolder -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $pluginFolder | Out-Null
Copy-Item "$publishFolder\*" $pluginFolder -Recurse -Force
```

Use the plugin directory for your Jellyfin server data path.

## Local Development Deploy

From repository root:

```bash
./scripts/deploy-dev.sh
```

What it does:

- Publishes the solution in Debug.
- Copies publish output to Jellyfin plugin directory.

Environment overrides:

```bash
JELLYFIN_DATA_DIR="$HOME/Library/Application Support/jellyfin" \
PLUGIN_DIR="$HOME/Library/Application Support/jellyfin/plugins/JellyChat" \
./scripts/deploy-dev.sh
```

Notes:

- `PLUGIN_DIR` takes precedence over `JELLYFIN_DATA_DIR`.
- Default `JELLYFIN_DATA_DIR` is `$HOME/Library/Application Support/jellyfin`.
- Restart Jellyfin after deploy.

## Release Build

Build the frontend assets, then publish the v0.6.0 release output:

```bash
cd web-src
npm run build
cd ..
dotnet publish Jellyfin.Plugin.JellyChat/Jellyfin.Plugin.JellyChat.csproj -c Release
```

The publish output is written to:

```text
Jellyfin.Plugin.JellyChat/bin/Release/net9.0/publish/
```

Create the release zip from the contents of the publish directory:

```powershell
$publish = "Jellyfin.Plugin.JellyChat/bin/Release/net9.0/publish"
New-Item -ItemType Directory -Force artifacts | Out-Null
Compress-Archive -Path "$publish/*" -DestinationPath "artifacts/Jellyfin.Plugin.JellyChat_0.6.0.zip" -Force
```

Create a GitHub release tagged `v0.6.0` and attach `Jellyfin.Plugin.JellyChat_0.6.0.zip`. The release workflow opens a manifest update pull request with the release asset URL, checksum, timestamp, and version entry after the release is published.

## Testing Checklist

- Desktop to iPad SyncPlay chat.
- iPad to desktop SyncPlay chat.
- SyncPlay group detection before and after joining a group.
- Message send from the drawer.
- Message history refresh on the other client.
- Drawer behavior on the video player page.
- Basic fullscreen check with the drawer open and closed.

## Troubleshooting

- Chat button does not appear:
  - Verify the user is in an active SyncPlay group.
  - Restart Jellyfin after plugin deploy/update.
  - Open `/JellyChat/Assets/jellychat.js` and `/JellyChat/Assets/jellychat.css` in the same browser session and confirm both return `200`. If Jellyfin uses a subpath, include that base path.
  - Open `/web/index.html`, view source, and confirm one `JellyChat:start` marker block is present.
  - Check the browser console for `[JellyChat] self-contained assets loaded` and other JellyChat injection or asset logs.
- Messages do not appear on another device:
  - Confirm both devices are in the same SyncPlay group.
  - Refresh or reopen the drawer to force an event poll.
  - Check the browser console for `[JellyChat] self-contained assets loaded` and other `[JellyChat]` logs.
  - Check `window.JellyChatDebug.injectionMode`, `window.JellyChatDebug.assetMode`, and `window.JellyChatDebug.lastInjectionError`.

## Acknowledgements

JellyChat started as a fork of [AbhayVAshokan/jellyfin-syncplay-chat](https://github.com/AbhayVAshokan/jellyfin-syncplay-chat), the original Syncplay Chat plugin for Jellyfin.

This project has since been renamed, refactored, and extended with a plugin-owned room event backend, a React/Vite injected frontend, JellyChat internal plugin identity, and additional Jellyfin web layout work.

Thanks to the original Syncplay Chat project for providing the starting point.

## License

This repository includes a GPL-3.0 license file. If GPL-3.0 terms apply to your distribution, distribute JellyChat under GPL-3.0 and preserve the required notices.
