# Release

This checklist is for publishing JellyChat plugin releases.

## Version Bump Checklist

1. Update `Directory.Build.props`:
   - `<Version>`
   - `<AssemblyVersion>`
   - `<FileVersion>`
2. Update `build.yaml` `version`.
3. Update `web-src/package.json` and `web-src/package-lock.json` package metadata.
4. Keep `manifest.json` unchanged until a real GitHub release asset exists. The release workflow adds the new manifest entry after the release is published.
5. Run the validation commands below before tagging.

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
Jellyfin.Plugin.JellyChat/bin/Release/net9.0/publish/
```

## Zip Packaging

Set the version and create the release zip from the contents of the publish directory:

```powershell
$version = "1.0.0"
$publish = "Jellyfin.Plugin.JellyChat/bin/Release/net9.0/publish"
$zip = "artifacts/Jellyfin.Plugin.JellyChat_$version.zip"

New-Item -ItemType Directory -Force artifacts | Out-Null
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path "$publish/*" -DestinationPath $zip -Force
```

The GitHub release asset must be named:

```text
Jellyfin.Plugin.JellyChat_<version>.zip
```

For v1.0.0:

```text
Jellyfin.Plugin.JellyChat_1.0.0.zip
```

## GitHub Release

Create a tag and release named with a leading `v`:

```bash
git tag v1.0.0
git push origin v1.0.0
gh release create v1.0.0 artifacts/Jellyfin.Plugin.JellyChat_1.0.0.zip --title "v1.0.0" --notes-file RELEASE_NOTES.md
```

The release notes become the manifest changelog after the release workflow flattens markdown whitespace, so keep them concise and user-facing.

## Manifest Update Flow

Publishing a GitHub release triggers `.github/workflows/release.yaml`.

The workflow:

- Downloads `Jellyfin.Plugin.JellyChat_<version>.zip`.
- Computes the MD5 checksum.
- Adds or replaces the matching version entry in `manifest.json`.
- Updates `Directory.Build.props` to the release version.
- Opens or updates a pull request named `release: update manifest and version to <version>`.

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
dotnet publish Jellyfin.Plugin.JellyChat/Jellyfin.Plugin.JellyChat.csproj -c Release
git diff --check
```

Check the README and docs for old pre-stable labels, generic caveat sections, and stale release examples before tagging.

After release:

```bash
gh release view v1.0.0
```
