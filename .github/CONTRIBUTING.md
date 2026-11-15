# Contributing

JellyChat is maintained by one person. Contributions are welcome, but opening a pull request does not create an obligation to merge it.

## Read this first

- Use issues for bugs and feature ideas. Open an issue before starting a large change.
- Keep pull requests small enough to understand in one sitting.
- Do not mix unrelated changes together.

## What fits

- focused bug, reliability, or security fixes
- changes that make JellyChat feel more like part of Jellyfin
- support for more Jellyfin clients and screen sizes
- tests for a real regression

## What probably does not fit

Please discuss these before opening a pull request:

- features that need an extra server, port, or database
- storing chat history on disk
- broad rewrites or drive-by refactors
- a large bundle of changes that is difficult to review

## Opening a pull request

The PR title becomes its line in the release notes, so write it for people running JellyChat. Start it with `feat`, `fix`, `perf`, `docs`, or `chore`, and an optional area, for example `fix(header): match the Jellyfin header buttons`. [`docs/release.md`](../docs/release.md#release-notes) lists how titles are grouped.

Explain what changed and why. Name the Jellyfin version and clients you tested on. For UI changes, include before and after screenshots. For motion or timing changes, include a short video.

## AI-assisted contributions

AI tools are allowed here. They do not change the contribution standard: understand the important parts of your change, check the behavior, and be able to explain it when someone asks.

Do not have an agent open a pull request, write public replies, or answer maintainer questions without checking the content yourself. Pull requests that look like unreviewed generated output may be closed without review.

## Development setup

[`docs/development.md`](../docs/development.md) covers the layout, builds, and deploying to a test Jellyfin. Before opening a pull request, run:

```bash
cd web-src
npm ci
npm test
npm run build
cd ..
node --test scripts/release-notes.test.mjs
dotnet test Jellyfin.Plugin.JellyChat.sln -c Release
```

Commit the rebuilt `Jellyfin.Plugin.JellyChat/Web/jellychat.js` and `jellychat.css`. CI fails when they do not match the source.

Test against a throwaway Jellyfin with test users and media, not a server people use.

## Issues and security

- Use the GitHub issue forms for bug reports and feature requests.
- Do not open public issues for security problems. Follow [`SECURITY.md`](./SECURITY.md).
