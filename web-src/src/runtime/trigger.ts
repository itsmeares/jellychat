import type { TriggerMode } from "../types";
import { detectRuntimeShell } from "./layout";
import { buttonId, countDebugNodes, rootId } from "./util";

export type TriggerMount = {
  host: HTMLElement | null;
  mode: TriggerMode;
  hostFound: boolean;
  selector: string;
  error?: string | null;
  route?: string;
  activeRootSelector?: string;
  videoHostCandidateCount?: number;
  headerHostCandidateCount?: number;
  desktopFallbackHostCount?: number;
  desktopFallbackDuplicateCount?: number;
  desktopFallbackParentSelector?: string;
};

const nativeVideoSelectors = [
  '.osdHeader [class*="MuiToolbar-root"] > div:has(> button)',
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
  '.skinHeader:not(.osdHeader) [class*="MuiToolbar-root"] > div:has(> button)',
  'header div:has(> button[aria-label="SyncPlay"])',
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
let lastDesktopFallbackHostCount = 0;
let lastDesktopFallbackDuplicateCount = 0;
let lastDesktopFallbackParentSelector = "";

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

function cleanupDesktopFallbackHosts(): { host: HTMLElement | null; count: number } {
  const hosts = Array.from(document.querySelectorAll<HTMLElement>("#" + desktopFallbackHostId + ', [data-jellychat-host="desktop-overlay-fallback"]'));
  const preferredHost = hosts.find((host) => host.id === desktopFallbackHostId) || hosts[0] || null;
  hosts.forEach((host) => {
    if (host !== preferredHost) {
      host.remove();
    }
  });

  return { host: preferredHost, count: hosts.length };
}

function getOrCreateDesktopFallbackHost(): HTMLElement {
  const cleanup = cleanupDesktopFallbackHosts();
  let host = cleanup.host;
  const parent = getDesktopFallbackParent();
  if (!parent) {
    throw new Error("Desktop fallback parent not available.");
  }

  lastDesktopFallbackDuplicateCount = Math.max(0, cleanup.count - 1);
  lastDesktopFallbackParentSelector = describeElementSelector(parent);

  if (!host) {
    host = document.createElement("div");
    host.id = desktopFallbackHostId;
    host.className = "jellyChatDesktopTriggerHost";
    host.setAttribute("data-jellychat-host", "desktop-overlay-fallback");
  }

  if (host.parentElement !== parent) {
    parent.appendChild(host);
  }

  lastDesktopFallbackHostCount = document.querySelectorAll("#" + desktopFallbackHostId + ', [data-jellychat-host="desktop-overlay-fallback"]').length;
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

function isUsableHost(element: Element | null): element is HTMLElement {
  if (!element || !element.isConnected || isWithinJellyChatElement(element)) {
    return false;
  }

  if (["button", "svg", "path", "input", "textarea", "select", "script", "style", "link"].includes(tag(element))) {
    return false;
  }

  return true;
}

function queryHosts(selectors: string[], root: ParentNode): HTMLElement[] {
  const hosts: HTMLElement[] = [];
  selectors.forEach((selector) => {
    try {
      root.querySelectorAll<HTMLElement>(selector).forEach((element) => {
        if (isUsableHost(element) && !hosts.includes(element)) {
          hosts.push(element);
        }
      });
    } catch {
      // Ignore browser-specific selector failures.
    }
  });
  return hosts;
}

function getNativeHeaderHost(): HTMLElement | null {
  const legacy = document.querySelector(".headerRight");
  if (legacy instanceof HTMLElement && legacy.offsetParent !== null && isUsableHost(legacy)) {
    return legacy;
  }

  const userMenuButton = document.querySelector('[aria-controls="app-user-menu"]');
  const toolbar = userMenuButton?.closest<HTMLElement>(".MuiToolbar-root")
    || document.querySelector<HTMLElement>(".MuiAppBar-root .MuiToolbar-root");
  if (!toolbar) {
    return null;
  }

  let userMenuBox = userMenuButton;
  while (userMenuBox && userMenuBox.parentElement !== toolbar) {
    userMenuBox = userMenuBox.parentElement;
  }

  const buttonsTray = userMenuBox?.previousElementSibling || null;
  return isUsableHost(buttonsTray) ? buttonsTray : null;
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
  window.JellyChatDebug.triggerRoute = mount.route || "";
  window.JellyChatDebug.triggerActiveRootSelector = mount.activeRootSelector || "";
  window.JellyChatDebug.triggerVideoHostCandidateCount = mount.videoHostCandidateCount || 0;
  window.JellyChatDebug.triggerHeaderHostCandidateCount = mount.headerHostCandidateCount || 0;
  window.JellyChatDebug.triggerCandidateCount = (mount.videoHostCandidateCount || 0) + (mount.headerHostCandidateCount || 0);
  window.JellyChatDebug.isJellyfinDesktop = runtimeShell.isJellyfinDesktop;
  window.JellyChatDebug.desktopTriggerFallbackActive = mount.mode === "desktop-overlay-fallback";
  window.JellyChatDebug.desktopFallbackHostCount = mount.desktopFallbackHostCount || 0;
  window.JellyChatDebug.desktopFallbackDuplicateCount = mount.desktopFallbackDuplicateCount || 0;
  window.JellyChatDebug.desktopFallbackParentSelector = mount.desktopFallbackParentSelector || "";
  window.setTimeout(countDebugNodes, 0);
}

export function resolveTriggerMount(): TriggerMount {
  const activeRoot = (document.fullscreenElement || document.body || document.documentElement) as ParentNode;
  const route = (String(window.location.pathname || "") + String(window.location.hash || "")).trim();
  const videoRoute = isVideoRoute();
  const activeRootSelector = describeElementSelector(activeRoot instanceof Element ? activeRoot : null);
  const videoHosts = videoRoute ? queryHosts(nativeVideoSelectors, activeRoot) : [];
  const headerHosts = queryHosts(nativeHeaderSelectors, document);
  if (videoRoute) {
    const videoHost = bestHost(videoHosts, true);
    if (videoHost) {
      const mount = {
        host: videoHost,
        mode: "native-video-osd" as const,
        hostFound: true,
        selector: describeElementSelector(videoHost),
        route,
        activeRootSelector,
        videoHostCandidateCount: videoHosts.length,
        headerHostCandidateCount: headerHosts.length
      };
      updateDebug(mount);
      return mount;
    }

    const mount = {
      host: null,
      mode: "native-missing" as const,
      hostFound: false,
      selector: "",
      route,
      activeRootSelector,
      videoHostCandidateCount: videoHosts.length,
      headerHostCandidateCount: headerHosts.length,
      error: null
    };
    updateDebug(mount);
    return mount;
  }

  const headerHost = getNativeHeaderHost() || bestHost(headerHosts, true);
  if (headerHost) {
    const mount = {
      host: headerHost,
      mode: "native-header" as const,
      hostFound: true,
      selector: describeElementSelector(headerHost),
      route,
      activeRootSelector,
      videoHostCandidateCount: videoHosts.length,
      headerHostCandidateCount: headerHosts.length
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
        route,
        activeRootSelector,
        videoHostCandidateCount: videoHosts.length,
        headerHostCandidateCount: headerHosts.length,
        desktopFallbackHostCount: lastDesktopFallbackHostCount,
        desktopFallbackDuplicateCount: lastDesktopFallbackDuplicateCount,
        desktopFallbackParentSelector: lastDesktopFallbackParentSelector,
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
        route,
        activeRootSelector,
        videoHostCandidateCount: videoHosts.length,
        headerHostCandidateCount: headerHosts.length,
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
    route,
    activeRootSelector,
    videoHostCandidateCount: videoHosts.length,
    headerHostCandidateCount: headerHosts.length,
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
