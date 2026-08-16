# Docked Drawer Background Fix

## Problem

Opening JellyChat on a video route immediately insets the player surface while the drawer slides into place over 190 ms. The newly exposed host area has no JellyChat-owned background, so the browser or Jellyfin host canvas can appear white. The same white surface shows through the translucent drawer when its background alpha is reduced.

## Decision

Give only docked video hosts a black `background-color` in `web-src/src/styles.css`:

- `body.jellychat-video-route.jellychat-docked` covers normal browser playback.
- `.jellychat-fullscreen-host.jellychat-fullscreen-docked` covers fullscreen playback, including iPad WebKit.

The declaration will not use `!important`, allowing intentional downstream custom CSS overrides. The existing drawer animation, opacity setting, player sizing, and layout runtime remain unchanged.

Jellium/Jellyfin Desktop safe mode is excluded: `desktop-video-safe` is not considered docked, so neither selector matches. The background also paints behind child video content rather than introducing an overlay; a video that continues beneath the drawer remains visible.

## Alternatives Rejected

- Keeping the video full-width would place part of it beneath the drawer and change docking semantics.
- Synchronizing player resizing with the drawer transition would add state and still leave the low-alpha background undefined.
- Adding a dedicated backing element would introduce unnecessary markup and stacking behavior.

## Validation

- Build the frontend and confirm the generated CSS asset is updated.
- Run `git diff --check`.
- Manually verify right and left drawers during open/close and at minimum/default/full background alpha on web and iPad when available.

## Success Criteria

No white host canvas is visible beside or through JellyChat while the drawer is docked on a video route. Jellium/Jellyfin Desktop keeps its video-backed translucent drawer. Non-video routes, mobile portrait sheet mode, and user custom CSS remain unaffected.
