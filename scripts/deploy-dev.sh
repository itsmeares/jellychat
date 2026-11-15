#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${PLUGIN_DIR:-}" && -z "${JELLYFIN_DATA_DIR:-}" ]]; then
  echo "Set PLUGIN_DIR to the JellyChat plugin folder, or JELLYFIN_DATA_DIR to the Jellyfin data folder." >&2
  exit 1
fi
PLUGIN_DIR="${PLUGIN_DIR:-$JELLYFIN_DATA_DIR/plugins/JellyChat}"

if command -v dotnet >/dev/null; then
  dotnet publish "$REPO_ROOT/Jellyfin.Plugin.JellyChat/Jellyfin.Plugin.JellyChat.csproj" -c Debug -o "$REPO_ROOT/out/debug"
else
  (cd "$REPO_ROOT/web-src" && npm run build)
  docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp -v "$REPO_ROOT:/src" -w /src mcr.microsoft.com/dotnet/sdk:10.0 \
    dotnet publish Jellyfin.Plugin.JellyChat/Jellyfin.Plugin.JellyChat.csproj -c Debug -o out/debug -p:SkipWebBuild=true
fi

mkdir -p "$PLUGIN_DIR"
rsync -a --delete "$REPO_ROOT/out/debug/" "$PLUGIN_DIR/"

echo "Deployed to: $PLUGIN_DIR"
echo "Restart Jellyfin to load the plugin."
