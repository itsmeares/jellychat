import type { TriggerMode } from "../types";
import { detectRuntimeShell } from "./layout";
import { buttonId, countDebugNodes, rootId } from "./util";

export type TriggerMount = {
  host: HTMLElement | null;
  mode: TriggerMode;
  hostFound: boolean;
  selector: string;
  error?: string | null;
};

const nativeVideoSelectors = [
  ".videoOsdHeader .headerRight",
  ".videoOsdHeader .headerRightItems",
  ".videoOsdHeader .buttons",
  ".videoOsdTop .headerRight",
  ".videoOsdTop .headerRightItems",
  ".videoOsdTop .buttons",
  ".videoOsdTopControls",
  ".videoOsdControls .headerRight",
  ".osdHeader .headerRight",
  ".osdTop .headerRight",
  '[class*="videoOsdHeader"] [class*="headerRight"]',
  '[class*="VideoOsdHeader"] [class*="headerRight"]',
  '[class*="videoOsdTop"] [class*="headerRight"]',
  '[class*="VideoOsdTop"] [class*="headerRight"]',
  '[class*="videoOsdTopControls"]',
  '[class*="VideoOsdTopControls"]'
];

const nativeHeaderSelectors = [
  ".skinHeader .headerRight",
  ".skinHeader .headerRightItems",
  ".skinHeader .headerButtons",
  ".headerRight",
  ".headerRightItems",
  ".headerButtons",
  ".mainDrawerButton + .headerRight",
  '[class*="skinHeader"] [class*="headerRight"]',
  '[class*="SkinHeader"] [class*="headerRight"]',
  '[class*="headerRightItems"]',
  '[class*="headerButtons"]'
];

let lastFocusedTrigger: HTMLElement | null = null;
const desktopFallbackHostId = "jellyChatDesktopTriggerHost";

function tag(element: Element | null): string {
  return element && element.tagName ? element.tagName.toLowerCase() : "";
}

function className(element: Element | null): string {
  return element && typeof (element as HTMLElement).className === "string" ? (element as HTMLElement).className : "";
}

function elementId(element: Element | null): string {
  return element && typeof (element as HTMLElement).id === "string" ? (element as HTMLElement).id : "";
}

function describeElementSelector(element: Element | null): string {
  if (!element) {
    return "";
  }

  if ((element as HTMLElement).id) {
    return "#" + (element as HTMLElement).id;
  }

  const classes = className(element).trim().split(/\s+/).filter(Boolean).slice(0, 3).join(".");
  return tag(element) + (classes ? "." + classes : "");
}

function isJellyChatElement(element: Element | null): boolean {
  return !!(element
    && (element.id === rootId
      || element.id === desktopFallbackHostId
      || element.id === buttonId
      || element.hasAttribute("data-jellychat-host")
      || element.hasAttribute("data-jellychat-root")
      || element.hasAttribute("data-jellychat-button")));
}

function getDesktopFallbackParent(): HTMLElement | null {
  const fullscreenHost = document.fullscreenElement as HTMLElement | null;
  return fullscreenHost || document.body || document.documentElement;
}

function getOrCreateDesktopFallbackHost(): HTMLElement {
  let host = document.getElementById(desktopFallbackHostId) as HTMLElement | null;
  const parent = getDesktopFallbackParent();
  if (!parent) {
    throw new Error("Desktop fallback parent not available.");
  }

  if (!host) {
    host = document.createElement("div");
    host.id = desktopFallbackHostId;
    host.className = "jellyChatDesktopTriggerHost";
    host.setAttribute("data-jellychat-host", "desktop-overlay-fallback");
  }

  if (host.parentElement !== parent) {
    parent.appendChild(host);
  }

  return host;
}

function isWithinJellyChatElement(element: Element | null): boolean {
  let current = element;
  while (current && current.nodeType === 1) {
    if (isJellyChatElement(current)) {
      return true;
    }

    current = current.parentElement;
  }

  return false;
}

function isVideoRoute(): boolean {
  const routeText = String(window.location.pathname || "") + " " + String(window.location.hash || "");
  return /video|playback|nowplaying|livetv/i.test(routeText)
    || !!(document.querySelector("video")
      || document.querySelector(".videoOsdHeader")
      || document.querySelector(".videoOsdTop")
      || document.querySelector(".videoOsdBottom")
      || document.querySelector('[class*="videoOsd"]')
      || document.querySelector('[class*="VideoOsd"]')
      || document.querySelector('[class*="videoPlayer"]')
      || document.querySelector('[class*="VideoPlayer"]'));
}

function isVisibleHost(element: Element | null): element is HTMLElement {
  if (!element || !element.isConnected || isWithinJellyChatElement(element)) {
    return false;
  }

  if (["button", "svg", "path", "input", "textarea", "select", "script", "style", "link"].includes(tag(element))) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width < 30 || rect.height < 24) {
    return false;
  }

  const style = window.getComputedStyle(element);
  return style.display !== "none"
    && style.visibility !== "hidden"
    && Number(style.opacity || "1") > 0.05;
}

function queryHosts(selectors: string[], root: ParentNode): HTMLElement[] {
  const hosts: HTMLElement[] = [];
  selectors.forEach((selector) => {
    try {
      root.querySelectorAll<HTMLElement>(selector).forEach((element) => {
        if (isVisibleHost(element) && !hosts.includes(element)) {
          hosts.push(element);
        }
      });
    } catch {
      // Ignore browser-specific selector failures.
    }
  });
  return hosts;
}

function bestHost(hosts: HTMLElement[], preferRight: boolean): HTMLElement | null {
  return hosts.sort((first, second) => {
    const firstRect = first.getBoundingClientRect();
    const secondRect = second.getBoundingClientRect();
    const firstScore = (preferRight ? firstRect.right : firstRect.width) + (firstRect.top < window.innerHeight * 0.35 ? 80 : 0);
    const secondScore = (preferRight ? secondRect.right : secondRect.width) + (secondRect.top < window.innerHeight * 0.35 ? 80 : 0);
    return secondScore - firstScore;
  })[0] || null;
}

function updateDebug(mount: TriggerMount): void {
  if (!window.JellyChatDebug) {
    return;
  }

  const runtimeShell = detectRuntimeShell();
  window.JellyChatDebug.triggerMode = mount.mode;
  window.JellyChatDebug.triggerPlacement = mount.mode;
  window.JellyChatDebug.triggerHostFound = mount.hostFound;
  window.JellyChatDebug.triggerHostSelector = mount.selector;
  window.JellyChatDebug.lastTriggerMountError = mount.error || null;
  window.JellyChatDebug.isJellyfinDesktop = runtimeShell.isJellyfinDesktop;
  window.JellyChatDebug.desktopTriggerFallbackActive = mount.mode === "desktop-overlay-fallback";
  window.setTimeout(countDebugNodes, 0);
}

export function resolveTriggerMount(): TriggerMount {
  const activeRoot = (document.fullscreenElement || document.body || document.documentElement) as ParentNode;
  if (isVideoRoute()) {
    const videoHost = bestHost(queryHosts(nativeVideoSelectors, activeRoot), true);
    if (videoHost) {
      const mount = {
        host: videoHost,
        mode: "native-video-osd" as const,
        hostFound: true,
        selector: describeElementSelector(videoHost)
      };
      updateDebug(mount);
      return mount;
    }
  }

  const headerHost = bestHost(queryHosts(nativeHeaderSelectors, document), true);
  if (headerHost) {
    const mount = {
      host: headerHost,
      mode: "native-header" as const,
      hostFound: true,
      selector: describeElementSelector(headerHost)
    };
    updateDebug(mount);
    return mount;
  }

  const runtimeShell = detectRuntimeShell();
  if (runtimeShell.isJellyfinDesktop) {
    try {
      const fallbackHost = getOrCreateDesktopFallbackHost();
      const mount = {
        host: fallbackHost,
        mode: "desktop-overlay-fallback" as const,
        hostFound: true,
        selector: "#" + desktopFallbackHostId,
        error: null
      };
      updateDebug(mount);
      return mount;
    } catch (err) {
      const mount = {
        host: null,
        mode: "native-missing" as const,
        hostFound: false,
        selector: "",
        error: err instanceof Error ? err.message : "Desktop fallback trigger host failed."
      };
      updateDebug(mount);
      return mount;
    }
  }

  const mount = {
    host: null,
    mode: "native-missing" as const,
    hostFound: false,
    selector: "",
    error: "No native Jellyfin trigger host found."
  };
  updateDebug(mount);
  return mount;
}

export function rememberTriggerFocus(element: HTMLElement): void {
  lastFocusedTrigger = element;
}

export function restoreTriggerFocus(): void {
  const target = lastFocusedTrigger && lastFocusedTrigger.isConnected
    ? lastFocusedTrigger
    : document.querySelector<HTMLElement>("[data-jellychat-button]");
  if (!target) {
    return;
  }

  try {
    target.focus({ preventScroll: true });
  } catch {
    target.focus();
  }
}
