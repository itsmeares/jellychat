# Release

JellyChat release assets are built, tested, packaged, and published by GitHub Actions. The operator does not build or upload the ZIP locally.

## Version Formats

- **Release version**: `MAJOR.MINOR.PATCH`, for example `2.1.2`. Used by the Git tag, GitHub Release, ZIP name, and frontend package metadata.
- **Plugin version**: `MAJOR.MINOR.PATCH.0`, for example `2.1.2.0`. Used by the assembly, `build.yaml`, and `manifest.json`.

## 1. Merge a Version-Bump PR

Update these files before running the release workflow:

- `Directory.Build.props`: `<Version>`, `<AssemblyVersion>`, and `<FileVersion>` use the four-part plugin version.
- `build.yaml`: `version` uses the four-part plugin version. The release workflow does not use its `changelog` as release notes.
- `web-src/package.json` and `web-src/package-lock.json`: `version` uses the three-part release version.

Do not update `manifest.json`; the release workflow adds its entry after it has built the real ZIP and calculated its checksum.

The normal pull-request checks must pass before merging the version bump.

## 2. Run the Release Workflow

From GitHub:

1. Open **Actions** → **🚀 Release** → **Run workflow**.
2. Select `main`.
3. Enter the three-part `version` without `v`, such as `2.1.2`.
4. Enter a concise user-facing `changelog`.
5. Enable `prerelease` only when required.
6. Run the workflow.

The workflow validates the committed versions and checks that the tag does not already exist. It then:

- builds and verifies the frontend assets;
- runs the .NET release tests;
- publishes and ZIPs the plugin on a GitHub-hosted runner;
- computes the ZIP MD5 checksum;
- creates a draft GitHub Release and uploads the ZIP;
- opens the `automation/update-manifest-<plugin-version>` PR;
- publishes the release after that PR exists.

Only one release workflow can run at a time.

## 3. Merge the Manifest PR

1. Wait for the generated PR checks to pass.
2. Confirm its `manifest.json` entry uses the expected version, release URL, checksum, and changelog.
3. Merge the PR.
4. Verify the raw `main` manifest includes the new version.

`RELEASE_PR_TOKEN` is optional. When it is absent, the workflow uses `GITHUB_TOKEN`, and GitHub may require a maintainer to approve the generated PR checks.

## Failure Recovery

- Failures before draft creation leave no tag or release.
- Failures after draft creation leave a non-public draft. Inspect the failed step, delete the draft and its tag from the GitHub Releases UI, then rerun the workflow.
- Existing public releases and tags are never overwritten; use a new patch version instead.

## Local Validation

Local validation is optional because the release workflow repeats it on a clean runner:

```bash
cd web-src
npm ci
npm run build
cd ..
dotnet test Jellyfin.Plugin.JellyChat.sln -c Release
git diff --check
```
