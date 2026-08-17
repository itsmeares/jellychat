# Release

JellyChat release assets are built, tested, packaged, and published by GitHub Actions. The operator does not build or upload the ZIP locally.

## Version Formats

- **Release version**: `MAJOR.MINOR.PATCH`, for example `2.1.2`. Used by the Git tag, GitHub Release, ZIP name, and frontend package metadata.
- **Plugin version**: `MAJOR.MINOR.PATCH.0`, for example `2.1.2.0`. Used by the assembly, `build.yaml`, and `manifest.json`.

## 1. Run the Release Workflow

From GitHub:

1. Open **Actions** → **🚀 Release** → **Run workflow**.
2. Select `main`.
3. Enter the three-part `version` without `v`, such as `2.1.2`.
4. Enter a concise user-facing `changelog`.
5. Enable `prerelease` only when required.
6. Run the workflow.

The workflow validates its inputs and checks that the tag does not already exist. It then:

- updates `Directory.Build.props`, `build.yaml`, `web-src/package.json`, and `web-src/package-lock.json` from the workflow inputs;
- uses the changelog input for `build.yaml`, the GitHub Release notes, and `manifest.json`;
- builds and verifies the frontend assets;
- runs the .NET release tests;
- publishes and ZIPs the plugin on a GitHub-hosted runner;
- computes the ZIP MD5 checksum;
- creates a draft GitHub Release and uploads the ZIP;
- opens the `automation/update-manifest-<plugin-version>` PR;
- publishes the release after that PR exists.

Only one release workflow can run at a time.

## 2. Merge the Release Metadata PR

1. Wait for the generated PR checks to pass.
2. Confirm the version files and `manifest.json` entry use the expected version, release URL, checksum, and changelog.
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
