type NativeHost = Window & { jmpInfo?: unknown; NativeShell?: unknown };

export function isNativeShell(host: NativeHost = window as NativeHost): boolean {
  return !!(host.NativeShell || host.jmpInfo);
}

export function isVideoRoute(): boolean {
  return /\/video(?:\?|$|\/)/i.test(window.location.hash || window.location.pathname);
}

/** The playback element only, never an embedded preview video on Home. */
export function findVideo(): HTMLVideoElement | null {
  return document.querySelector<HTMLVideoElement>(".videoPlayerContainer video, video.htmlvideoplayer");
}

export function portalTarget(): HTMLElement {
  const full = document.fullscreenElement as HTMLElement | null;
  return full && full !== document.documentElement && full !== document.body && !(full instanceof HTMLVideoElement) ? full : document.body;
}

export const syncPlayButton = 'button[aria-controls="app-sync-play-menu"]';

export function headerHost(): HTMLElement | null {
  return document.querySelector<HTMLElement>(syncPlayButton)?.parentElement || null;
}

export function isPhonePortrait(): boolean {
  return window.matchMedia("(max-width: 640px) and (orientation: portrait)").matches;
}

export function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}
