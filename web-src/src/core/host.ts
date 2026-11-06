type NativeHost = Window & { jmpInfo?: unknown; NativeShell?: unknown };

export function isNativeShell(host: NativeHost = window as NativeHost): boolean {
  return !!(host.NativeShell || host.jmpInfo);
}

export function isVideoRoute(): boolean {
  return /\/video(?:\?|$|\/)/i.test(window.location.hash || window.location.pathname) || !!document.querySelector("video");
}

export function findVideo(): HTMLVideoElement | null {
  return document.querySelector<HTMLVideoElement>("video.htmlvideoplayer") || document.querySelector<HTMLVideoElement>("video");
}

export function portalTarget(): HTMLElement {
  return (document.fullscreenElement as HTMLElement | null) || document.body;
}

export function headerHost(): HTMLElement | null {
  return document.querySelector<HTMLElement>('button[aria-label="SyncPlay"]')?.parentElement || null;
}

export function isPhonePortrait(): boolean {
  return window.matchMedia("(max-width: 640px) and (orientation: portrait)").matches;
}

export function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}
