# Product

## Register

product

## Users

JellyChat serves Jellyfin users watching together in SyncPlay. They are already focused on playback and need chat, reactions, replies, and room state to stay close to the Jellyfin viewing experience instead of feeling like a separate app.

## Product Purpose

JellyChat adds a lightweight SyncPlay chat drawer to Jellyfin Web through a plugin-owned event stream and injected frontend. Success means viewers can talk, react, and follow room activity without leaving playback, opening extra services, or fighting the video controls.

## Brand Personality

Native, calm, compact. JellyChat should feel like it belongs inside Jellyfin: quiet surfaces, readable text, subtle activity states, and controls that match familiar Jellyfin interaction patterns.

## Anti-references

JellyChat should not feel like a social network overlay, a heavy chat app, a marketing-styled redesign, or a loud notification layer. Avoid decorative chrome, noisy bubbles, oversized empty states, and new feature surfaces that do not directly support SyncPlay chat.

## Design Principles

- Preserve playback first: chat should support watching together, not compete with video.
- Fit Jellyfin: reuse the native-feeling dark surface, compact spacing, and restrained accent vocabulary.
- Stay readable under motion and dim rooms: text, focus states, and transient feedback must remain clear.
- Keep room state honest: not-in-room, disabled, and transient states should explain what is happening without alarm.
- Polish existing behavior before adding new behavior.

## Accessibility & Inclusion

Target WCAG AA basics for the injected UI: readable contrast, keyboard access, visible focus states, clear labels, touch targets that work on iPad-sized layouts, and reduced-motion handling for drawer transitions, highlight jumps, and reactions.
