# JellyChat

JellyChat is a Jellyfin 12 plugin that adds chat to SyncPlay watch parties. A .NET plugin keeps each room's events in memory and adds a React client to Jellyfin Web. The SyncPlay group is the room.

## What JellyChat does not compromise on

1. **No extra services.** It runs inside Jellyfin. No extra server, port, database or WebSocket server.
2. **Nothing on disk.** Chat lives in memory, 200 events per room. Settings live in plugin configuration and Jellyfin display preferences.
3. **Feels like Jellyfin.** It reuses Jellyfin's own controls and styles where they exist and never fights playback controls. `PRODUCT.md` is the design brief.

## Where code lives

- `Jellyfin.Plugin.JellyChat/Api/` holds the HTTP routes: `/JellyChat/Sync` (one long poll for events, room and membership), `/JellyChat/Events`, `/JellyChat/Room`, `/JellyChat/Config` and `/JellyChat/Assets`.
- `Jellyfin.Plugin.JellyChat/Infrastructure/` holds the in-memory event store, room access and password state, SyncPlay membership checks, and the middleware that adds the client to Jellyfin Web.
- `Jellyfin.Plugin.JellyChat/Configuration/` holds the admin page and plugin settings.
- `Jellyfin.Plugin.JellyChat/Web/` holds the built `jellychat.js` and `jellychat.css`. They are generated, but committed, and CI checks that they match the source.
- `web-src/src/core/` holds client state with no React: API calls, the sync loop, the room store, settings, playback tracking and the emoji catalog.
- `web-src/src/ui/` holds the React UI. `App.tsx` decides what shows, `Triggers.tsx` has the header button, `Dock.tsx` and `Floating.tsx` are the two layouts.
- `web-src/src/theme/jellychat.css` holds all client styles. Theme colors are `--jc-*` variables.
- `scripts/` holds the dev deploy, release notes and screenshot scripts.
- `docs/` has development, release and troubleshooting notes.

## Build and test

```bash
cd web-src && npm ci && npm test && npm run build && cd ..
node --test scripts/release-notes.test.mjs
dotnet test Jellyfin.Plugin.JellyChat.sln -c Release
```

Commit the rebuilt files in `Jellyfin.Plugin.JellyChat/Web/` with any change under `web-src/`.

If `dotnet` is not installed, run it in a container. The csproj runs `npm run build` when `web-src/node_modules` exists, and the SDK image has no npm, so build the web assets first and pass `-p:SkipWebBuild=true`:

```bash
docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp -v "$PWD:/src" -w /src \
  mcr.microsoft.com/dotnet/sdk:10.0 dotnet test Jellyfin.Plugin.JellyChat.sln -c Release -p:SkipWebBuild=true
```

## Test in a real Jellyfin

Test only on a throwaway Jellyfin with test users and test media, never on a server people use. One way:

1. Publish to a folder: `PLUGIN_DIR=/path/to/demo/plugin ./scripts/deploy-dev.sh`.
2. Run `jellyfin/jellyfin:12.4` on its own Docker network and named volumes, with that folder mounted at `/config/plugins/JellyChat`.
3. Finish setup through the API: `POST /Startup/Configuration`, `/Startup/User`, `/Startup/Complete`. Then create two users with `POST /Users/New` and add a Movies library.
4. Make a test video with the ffmpeg in the image, `/usr/lib/jellyfin-ffmpeg/ffmpeg -f lavfi -i testsrc2=...`.
5. Log in as two users in two browsers, create a SyncPlay group with one, and join with the other.
6. `scripts/screenshots.mjs` drives the same setup with Playwright.

Restart the container after each deploy. Remove the container, network and volumes when done.

## Jellyfin Web quirks

- **Header buttons are MUI.** Jellyfin 12 builds its header buttons as `IconButton` inside `Tooltip`, so themes and custom CSS style them through `MuiIconButton-root` and similar classes. The JellyChat header button copies the SyncPlay button's classes instead of styling itself. Copy Jellyfin's classes before writing new CSS for anything that sits next to Jellyfin's controls.
- **The player listens on `document`.** Jellyfin's video player changes the volume on any `wheel` event and acts on key presses that reach `document`. JellyChat stops wheel events at its root and key events in its inputs. Anything new that scrolls or takes typing needs the same guard.
- **Jellyfin re-renders the page.** The header and player DOM get replaced on navigation. Find Jellyfin elements again through a `MutationObserver`, like `useHeaderSlot` does, instead of keeping references.
- **The minimum server version.** `Jellyfin.Controller` and `Jellyfin.Model` are pinned to 12.0.0, and `targetAbi` in `build.yaml` is `12.0.0.0`. Raising them drops older 12.x servers, so change both together and only on purpose. Renovate leaves them alone.

## Pull requests and releases

- The PR title becomes its line in the release notes. Use `feat`, `fix`, `perf`, `docs` or `chore` with an optional area, for example `fix(header): match the Jellyfin header buttons`. `docs/release.md` has the grouping rules.
- Follow `.github/pull_request_template.md`. End the PR body with the model and agent tool you used.
- Releases run from the Release workflow on `main`. It sets the versions, builds, tests, writes the notes and opens the `automation/update-manifest-*` PR. Never edit versions or `manifest.json` entries by hand.
