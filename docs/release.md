# Release

This checklist is for publishing JellyChat plugin releases.

## Version Formats

Each release uses two related version formats:

- **Release version** (`MAJOR.MINOR.PATCH`), for example `2.0.0`: Git tag `v2.0.0`, GitHub release title, zip name `Jellyfin.Plugin.JellyChat_2.0.0.zip`, and frontend package metadata.
- **Plugin version** (`MAJOR.MINOR.PATCH.0`), for example `2.0.0.0`: `Directory.Build.props`, assembly/file versions, `build.yaml`, and the `manifest.json` version entry.

The release workflow validates the three-part tag and appends `.0` when writing Jellyfin plugin metadata. The manifest source URL continues to use the three-part tag and asset name.

## Version Bump Checklist

1. Choose the three-part release version, such as `2.0.0`, and derive the four-part plugin version, such as `2.0.0.0`.
2. Update `Directory.Build.props` to the four-part plugin version:
   - `<Version>`
   - `<AssemblyVersion>`
   - `<FileVersion>`
3. Update `build.yaml` `version` to the four-part plugin version.
4. Update `web-src/package.json` and `web-src/package-lock.json` to the three-part release version.
5. Keep `manifest.json` unchanged until a real GitHub release asset exists. The release workflow adds the four-part plugin version after the release is published.
6. Run the validation commands below before tagging.

## Build Commands

Install frontend dependencies if needed:

```bash
cd web-src
npm ci
```

Build the frontend:

```bash
npm run build
cd ..
```

Publish the plugin:

```bash
dotnet publish Jellyfin.Plugin.JellyChat/Jellyfin.Plugin.JellyChat.csproj -c Release
```

Publish output:

```text
Jellyfin.Plugin.JellyChat/bin/Release/net10.0/publish/
```

## Zip Packaging

Set the version and create the release zip from the contents of the publish directory:

```powershell
$releaseVersion = "2.0.0"
$publish = "Jellyfin.Plugin.JellyChat/bin/Release/net10.0/publish"
$zip = "artifacts/Jellyfin.Plugin.JellyChat_$releaseVersion.zip"

New-Item -ItemType Directory -Force artifacts | Out-Null
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path "$publish/*" -DestinationPath $zip -Force
```

The GitHub release asset must be named:

```text
Jellyfin.Plugin.JellyChat_<version>.zip
```

For v2.0.0:

```text
Jellyfin.Plugin.JellyChat_2.0.0.zip
```

## GitHub Release

Create a tag and release named with a leading `v`:

```bash
git tag v2.0.0
git push origin v2.0.0
gh release create v2.0.0 artifacts/Jellyfin.Plugin.JellyChat_2.0.0.zip --title "JellyChat v2.0.0" --prerelease --notes-file RELEASE_NOTES.md
```

The release notes become the manifest changelog after the release workflow flattens markdown whitespace, so keep them concise and user-facing.

## Manifest Update Flow

Publishing a GitHub release triggers `.github/workflows/release.yaml`.

The workflow:

- Validates a three-part `vMAJOR.MINOR.PATCH` release tag.
- Downloads `Jellyfin.Plugin.JellyChat_<MAJOR.MINOR.PATCH>.zip`.
- Computes the MD5 checksum.
- Adds or replaces the four-part `MAJOR.MINOR.PATCH.0` entry in `manifest.json`, pointing to the three-part release asset.
- Updates `Directory.Build.props` and `build.yaml` to the four-part plugin version.
- Opens or updates a pull request named `release: update manifest and version to <MAJOR.MINOR.PATCH.0>`.

After the workflow PR opens:

1. Wait for checks to pass.
2. Confirm `manifest.json` points to the published release asset.
3. Merge the manifest PR.
4. Verify the raw `main` manifest includes the new version.

## Validation

Run before release:

```bash
cd web-src
npm run build
cd ..
dotnet test Jellyfin.Plugin.JellyChat.sln -c Release
dotnet publish Jellyfin.Plugin.JellyChat/Jellyfin.Plugin.JellyChat.csproj -c Release
git diff --check
```

Check the README and docs for old pre-stable labels, generic caveat sections, and stale release examples before tagging.

After release:

```bash
gh release view v2.0.0
```
