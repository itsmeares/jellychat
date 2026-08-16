# Automated Release Publishing

## Problem

JellyChat releases currently require a local frontend build, .NET test and publish, ZIP creation, and `gh release create`. The existing release workflow starts only after that release is published; it downloads the already-built ZIP, computes its checksum, and opens the manifest update PR. This makes the release asset depend on the operator's machine and leaves several manual steps outside CI.

## Goals

- Build every release asset on a clean GitHub-hosted runner.
- Reduce the operator flow to merging a version-bump PR, running one workflow form, and merging the generated manifest PR.
- Keep the existing three-part release version and four-part plugin version convention.
- Publish no public release unless validation, build, packaging, and manifest PR creation have succeeded.
- Add no release framework or third-party release dependency.

## Decision

Convert `.github/workflows/release.yaml` into a manually dispatched, single-workflow release pipeline. Keeping build, release creation, and manifest publication in one workflow avoids relying on a second workflow event: GitHub does not normally create another workflow run for events caused by the repository `GITHUB_TOKEN`.

The workflow accepts:

- `version`: required `MAJOR.MINOR.PATCH`, without a leading `v`.
- `changelog`: required concise release and manifest text.
- `prerelease`: optional boolean, defaulting to `false`.

Only one release workflow may run at a time. The job uses `contents: write` and `pull-requests: write`, matching the external state it must create.

## Flow

1. Check out `main` and reject runs launched from another ref.
2. Validate the version format and derive `vMAJOR.MINOR.PATCH` plus `MAJOR.MINOR.PATCH.0`.
3. Verify `Directory.Build.props`, `build.yaml`, `web-src/package.json`, and `web-src/package-lock.json` already contain the requested versions.
4. Reject an existing tag or GitHub release with the same version.
5. Install frontend dependencies, build the frontend, and fail if committed frontend assets change.
6. Run the .NET release tests and publish the plugin.
7. ZIP the contents of the publish directory as `Jellyfin.Plugin.JellyChat_<version>.zip` and compute its MD5 checksum.
8. Create a draft GitHub release targeting the checked-out `main` commit and upload the ZIP.
9. Add or replace the manifest entry, update the existing version files defensively, and open or update the existing `automation/update-manifest-<plugin-version>` PR.
10. Publish the draft release only after the manifest branch and PR exist.

The manifest PR remains a manual merge gate. Its checks confirm the committed frontend assets and plugin tests before the repository advertises the new version on `main`.

## Failure Behavior

- A validation, build, test, or packaging failure creates no tag or release.
- A failure after draft creation leaves a non-public draft release for inspection or deletion.
- A failure before the final publish step cannot expose a release whose manifest PR was never created.
- An existing public tag or release is never overwritten.
- The existing optional `RELEASE_PR_TOKEN` remains supported for generated PR checks; otherwise the workflow uses `GITHUB_TOKEN` and GitHub may require manual approval for the PR checks.

## Repository Changes

- Replace the event-driven logic in `.github/workflows/release.yaml` with the manual build-and-publish flow.
- Update `Jellyfin.Plugin.JellyChat.Tests/JellyChatReleaseWorkflowTests.cs` to cover dispatch inputs, version separation, runner-side packaging, draft publication, and manifest PR creation.
- Rewrite `docs/release.md` around the new operator flow and retain recovery instructions for a leftover draft.

No application or plugin runtime code changes.

## Validation

- Run `npm ci` and `npm run build` and verify generated assets are unchanged.
- Run the release workflow tests and the full .NET test project.
- Run `git diff --check`.
- Confirm GitHub accepts the workflow YAML on the pull request.
- After merge, use the workflow for the next real release; no test tag or release is created by this PR.

## Non-Goals

- Automatic semantic version selection from commit messages.
- Release Please, Semantic Release, or a custom release service.
- Automatic merging of the generated manifest PR.
- Replacing the existing normal pull-request and main-branch build workflow.
