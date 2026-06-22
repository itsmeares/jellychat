import { drawerId, drawerWidthPx, floatingHostId, markerClass, mobileLayoutMaxWidthPx, rootId } from "./util";
import { countDebugNodes, logDebug } from "./util";

const fullscreenSurfaceAttribute = "data-jellychat-fullscreen-surface";
const fullscreenSurfaceClass = "jellychat-fullscreen-player-surface";
const positionedSurfaceClass = "jellychat-positioned-surface";

let normalMountHost: HTMLElement | null = null;
let lastFullscreenHost: HTMLElement | null = null;
let lastLayoutMode = "";
let layoutResizeTimer = 0;
let fullscreenLayoutSurfaces: Element[] = [];
let lastFullscreenLayoutSignature = "";

function debug(): Record<string, unknown> {
  return window.JellyChatDebug || {};
}

function tag(element: Element | null): string {
  return element && element.tagName ? element.tagName.toLowerCase() : "";
}

function className(element: Element | null): string {
  return element && typeof (element as HTMLElement).className === "string" ? (element as HTMLElement).className : "";
}

function elementId(element: Element | null): string {
  return element && typeof (element as HTMLElement).id === "string" ? (element as HTMLElement).id : "";
}

function setElementClass(element: Element | null, name: string, isEnabled: boolean): void {
  if (element && element.classList) {
    element.classList.toggle(name, isEnabled);
  }
}

function getNormalMountHost(): HTMLElement {
  if (!normalMountHost || !normalMountHost.isConnected) {
    normalMountHost = document.body;
  }

  return normalMountHost;
}

function getFullscreenHost(): HTMLElement | null {
  return document.fullscreenElement as HTMLElement | null;
}

export function getActiveMountHost(): HTMLElement {
  return getFullscreenHost() || getNormalMountHost();
}

function clearFullscreenHostClasses(element: Element | null): void {
  if (!element || !element.classList) {
    return;
  }

  element.classList.remove(
    "jellychat-fullscreen-host",
    "jellychat-fullscreen-docked",
    "jellychat-drawer-open",
    "jellychat-docked",
    "jellychat-mobile"
  );
  (element as HTMLElement).style.removeProperty("--jellychat-drawer-width");
}

function isJellyChatElement(element: Element | null): boolean {
  return !!(element
    && (element.id === floatingHostId
      || element.id === drawerId
      || element.id === rootId
      || element.hasAttribute("data-jellychat-host")
      || element.hasAttribute("data-jellychat-root")
      || element.hasAttribute("data-jellychat-button")));
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

function isSkippableSurfaceElement(element: Element | null): boolean {
  if (!element || element.nodeType !== 1 || isWithinJellyChatElement(element)) {
    return true;
  }

  const name = tag(element);
  return ["script", "style", "link", "button", "input", "textarea", "select", "svg"].includes(name);
}

function elementMatches(element: Element | null, selector: string): boolean {
  if (!element || typeof element.matches !== "function") {
    return false;
  }

  try {
    return element.matches(selector);
  } catch {
    return false;
  }
}

function elementLooksLikeTopControllerOnly(element: Element | null): boolean {
  if (!element || tag(element) === "video") {
    return false;
  }

  const label = (className(element) + " " + elementId(element)).toLowerCase();
  return !element.querySelector("video")
    && /(header|top|titlebar|toolbar|appbar|topbar)/i.test(label)
    && !/(bottom|progress|timeline|seek|transport)/i.test(label);
}

function elementLooksLikePlayerSurface(element: Element | null): boolean {
  if (!element || isSkippableSurfaceElement(element) || elementLooksLikeTopControllerOnly(element)) {
    return false;
  }

  if (/video|player|osd|fullscreen|htmlvideoplayer|nowplaying/i.test(className(element) + " " + elementId(element))) {
    return true;
  }

  return !!(element.querySelector("video")
    || element.querySelector(".videoOsdBottom")
    || element.querySelector(".osdControls")
    || element.querySelector('[class*="videoOsd"]')
    || element.querySelector('[class*="VideoOsd"]')
    || element.querySelector('[class*="videoPlayer"]')
    || element.querySelector('[class*="VideoPlayer"]'));
}

function rect(element: Element | null): DOMRect | null {
  if (!element || typeof element.getBoundingClientRect !== "function") {
    return null;
  }

  try {
    return element.getBoundingClientRect();
  } catch {
    return null;
  }
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

function uniqueElements<T extends Element>(elements: Array<T | null | undefined>): T[] {
  const unique: T[] = [];
  elements.forEach((element) => {
    if (element && !unique.includes(element)) {
      unique.push(element);
    }
  });
  return unique;
}

function querySelectorList(root: Element, selectors: string[]): Element[] {
  const matches: Element[] = [];
  selectors.forEach((selector) => {
    try {
      root.querySelectorAll(selector).forEach((element) => {
        if (!isWithinJellyChatElement(element)) {
          matches.push(element);
        }
      });
    } catch {
      // Ignore browser-specific selector failures.
    }
  });

  return uniqueElements(matches);
}

function findVideoElement(host: Element): Element | null {
  const videos: Element[] = [];
  if (tag(host) === "video") {
    videos.push(host);
  }

  host.querySelectorAll("video").forEach((video) => {
    if (!isWithinJellyChatElement(video)) {
      videos.push(video);
    }
  });

  return uniqueElements(videos).sort((first, second) => {
    const firstRect = rect(first);
    const secondRect = rect(second);
    return (secondRect ? secondRect.width * secondRect.height : 0) - (firstRect ? firstRect.width * firstRect.height : 0);
  })[0] || null;
}

function controlsSelectors(): string[] {
  return [
    ".videoOsdBottom",
    ".videoOsdBottom-maincontrols",
    ".videoOsdControls",
    ".osdControls",
    ".playbackControls",
    ".playerControls",
    ".nowPlayingBar",
    ".progressContainer",
    '[class*="videoOsdBottom"]',
    '[class*="VideoOsdBottom"]',
    '[class*="videoOsdControls"]',
    '[class*="VideoOsdControls"]',
    '[class*="osdControls"]',
    '[class*="OsdControls"]',
    '[class*="playbackControls"]',
    '[class*="PlaybackControls"]',
    '[class*="progress"]',
    '[class*="Progress"]',
    '[class*="timeline"]',
    '[class*="Timeline"]',
    '[role="slider"]',
    '[role="progressbar"]',
    'input[type="range"]',
    "progress"
  ];
}

function controlScore(element: Element, host: Element): number {
  if (isSkippableSurfaceElement(element) || tag(element) === "video") {
    return -1000;
  }

  const label = (className(element) + " " + elementId(element)).toLowerCase();
  let score = 0;
  if (/bottom/.test(label)) score += 28;
  if (/osd/.test(label)) score += 18;
  if (/control|transport|playback|button/.test(label)) score += 14;
  if (/progress|timeline|seek|slider/.test(label)) score += 12;
  if (/player|nowplaying/.test(label)) score += 5;
  if (/header|top|titlebar|toolbar|appbar|topbar/.test(label) && !/bottom/.test(label)) score -= 30;
  if (element.querySelector("video")) score -= 24;
  if (element.querySelector('button,[role="button"],input[type="range"],[role="slider"],progress,[aria-valuenow]')) score += 10;
  if (elementMatches(element, '[role="slider"],[role="progressbar"],input[type="range"],progress')) score += 10;

  const elementRect = rect(element);
  const hostRect = rect(host);
  if (elementRect && hostRect && elementRect.width > 0 && elementRect.height > 0) {
    if (elementRect.width >= hostRect.width * 0.35) score += 8;
    if (elementRect.top + elementRect.height / 2 >= hostRect.top + hostRect.height * 0.5) score += 14;
    if (elementRect.bottom >= hostRect.bottom - Math.max(96, hostRect.height * 0.22)) score += 8;
    if (elementRect.height <= hostRect.height * 0.45) score += 4;
  }

  return score;
}

function findControlsElement(host: Element): Element | null {
  let candidates = querySelectorList(host, controlsSelectors());
  if (candidates.length === 0) {
    candidates = Array.from(host.querySelectorAll('div,section,nav,form,[role="slider"],[role="progressbar"]')).filter((element) => {
      if (isWithinJellyChatElement(element)) return false;
      const label = (className(element) + " " + elementId(element)).toLowerCase();
      return /bottom|osd|control|transport|playback|progress|timeline|seek|slider|nowplaying/.test(label)
        || !!element.querySelector('button,[role="button"],input[type="range"],[role="slider"],progress,[aria-valuenow]');
    });
  }

  let bestElement: Element | null = null;
  let bestScore = -1000;
  candidates.forEach((candidate) => {
    const score = controlScore(candidate, host);
    if (score > bestScore) {
      bestScore = score;
      bestElement = candidate;
    }
  });

  return bestScore > 0 ? bestElement : null;
}

function lowestCommonAncestor(first: Element | null, second: Element | null, host: Element): Element | null {
  if (!first || !second || !host.contains(first) || !host.contains(second)) {
    return null;
  }

  const ancestors: Element[] = [];
  let current: Element | null = first;
  while (current && current.nodeType === 1) {
    ancestors.push(current);
    if (current === host) break;
    current = current.parentElement;
  }

  current = second;
  while (current && current.nodeType === 1) {
    if (ancestors.includes(current)) {
      return current;
    }
    if (current === host) break;
    current = current.parentElement;
  }

  return null;
}

function directChildUnderHost(element: Element | null, host: Element): Element | null {
  let current = element;
  while (current && current.parentElement && current.parentElement !== host) {
    current = current.parentElement;
  }

  return current && current.parentElement === host ? current : null;
}

function usableSurface(element: Element | null, host: Element, video: Element | null, controls: Element | null): boolean {
  if (!element || element === host || isSkippableSurfaceElement(element) || tag(element) === "video") return false;
  if (elementLooksLikeTopControllerOnly(element)) return false;
  if (video && !element.contains(video)) return false;
  if (controls && !element.contains(controls)) return false;
  return true;
}

function fallbackSurfaces(host: Element, video: Element | null, controls: Element | null): Element[] {
  const direct = uniqueElements([directChildUnderHost(video, host), directChildUnderHost(controls, host)])
    .filter((element) => !isSkippableSurfaceElement(element) && !elementLooksLikeTopControllerOnly(element));
  if (direct.length > 0) return direct;

  const children = Array.from(host.children).filter((element) => !isSkippableSurfaceElement(element) && !elementLooksLikeTopControllerOnly(element));
  const likely = children.filter(elementLooksLikePlayerSurface);
  if (likely.length > 0) return likely;
  if (children.length === 1) return children;
  return children.filter((element) => {
    const elementRect = rect(element);
    return !!(elementRect && elementRect.width > 160 && elementRect.height > 120);
  });
}

function inspectPlayerSurface(host: Element): { video: Element | null; controls: Element | null; surface: Element | null; fallback: Element[] } {
  const video = findVideoElement(host);
  const controls = findControlsElement(host);
  let surface: Element | null = null;

  if (video && controls) {
    const common = lowestCommonAncestor(video, controls, host);
    if (usableSurface(common, host, video, controls)) {
      surface = common;
    }
  }

  return {
    video,
    controls,
    surface,
    fallback: surface ? [] : fallbackSurfaces(host, video, controls)
  };
}

function markSurface(element: Element): void {
  if (isWithinJellyChatElement(element)) {
    return;
  }

  element.setAttribute(fullscreenSurfaceAttribute, "true");
  element.classList.add(fullscreenSurfaceClass);
  const position = window.getComputedStyle ? window.getComputedStyle(element).position : "";
  element.classList.toggle(positionedSurfaceClass, ["absolute", "fixed", "sticky"].includes(position));
}

function clearDockedLayout(): void {
  const knownSurfaces = fullscreenLayoutSurfaces.slice();
  document.querySelectorAll("[" + fullscreenSurfaceAttribute + "], ." + fullscreenSurfaceClass).forEach((element) => {
    if (!knownSurfaces.includes(element)) knownSurfaces.push(element);
  });

  knownSurfaces.forEach((element) => {
    element.removeAttribute(fullscreenSurfaceAttribute);
    element.classList.remove(fullscreenSurfaceClass, positionedSurfaceClass);
  });

  fullscreenLayoutSurfaces = [];
}

function updateSurfaceDebug(host: Element | null, detection: ReturnType<typeof inspectPlayerSurface> | null, surfaces: Element[], shouldDock: boolean): void {
  const primary = surfaces[0] || null;
  const state = debug();
  state.fullscreenHostTag = tag(host);
  state.fullscreenHostId = elementId(host);
  state.fullscreenHostClass = className(host);
  state.videoElementFound = !!detection?.video;
  state.controlsElementFound = !!detection?.controls;
  state.fullscreenPlayerSurfaceSelector = surfaces.map(describeElementSelector).join(", ");
  state.fullscreenPlayerSurfaceTag = tag(primary);
  state.fullscreenPlayerSurfaceId = elementId(primary);
  state.fullscreenPlayerSurfaceClass = className(primary);
  state.videoReservedWidth = shouldDock && surfaces.length > 0 ? drawerWidthPx : 0;
}

function applyDockedLayout(host: Element | null, shouldDock: boolean): Element[] {
  clearDockedLayout();
  if (!host) {
    updateSurfaceDebug(null, null, [], false);
    return [];
  }

  const detection = inspectPlayerSurface(host);
  const surfaces = shouldDock ? uniqueElements([detection.surface, ...detection.fallback]) : [];
  surfaces.forEach(markSurface);
  fullscreenLayoutSurfaces = surfaces;
  updateSurfaceDebug(host, detection, surfaces, shouldDock);

  const signature = [shouldDock ? "dock" : "overlay", describeElementSelector(host), surfaces.map(describeElementSelector).join(",")].join("|");
  if (signature !== lastFullscreenLayoutSignature) {
    lastFullscreenLayoutSignature = signature;
    logDebug("Fullscreen player surface detection", { shouldDock, host: describeElementSelector(host), chosenPlayerSurface: surfaces.map(describeElementSelector).join(", ") });
  }

  if (shouldDock && window.JellyChatDebug) {
    window.JellyChatDebug.lastFullscreenLayoutAt = new Date().toISOString();
  }

  return surfaces;
}

export function updateMountDebug(parent: Element | null): void {
  if (!window.JellyChatDebug) return;
  window.JellyChatDebug.rootParentTag = tag(parent);
  window.JellyChatDebug.rootParentClass = className(parent);
  countDebugNodes();
}

export function moveJellyChatRootToHost(host: HTMLElement): void {
  const root = document.getElementById(rootId);
  if (!root || root.parentElement === host) {
    updateMountDebug(root ? root.parentElement : host);
    return;
  }

  host.appendChild(root);
  updateMountDebug(root.parentElement);
  if (window.JellyChatDebug) {
    window.JellyChatDebug.rootMoveCount = Number(window.JellyChatDebug.rootMoveCount || 0) + 1;
  }
}

export function isDrawerOpen(): boolean {
  const drawer = document.getElementById(drawerId);
  return !!(drawer && drawer.classList.contains("is-open"));
}

function detectVideoRoute(): boolean {
  const routeText = String(window.location.pathname || "") + " " + String(window.location.hash || "");
  if (/video|playback|nowplaying|livetv/i.test(routeText)) {
    return true;
  }

  return !!(document.querySelector("video")
    || document.querySelector(".videoOsdBottom")
    || document.querySelector(".osdControls")
    || document.querySelector('[class*="videoOsd"]')
    || document.querySelector('[class*="VideoOsd"]')
    || document.querySelector('[class*="videoPlayer"]')
    || document.querySelector('[class*="VideoPlayer"]'));
}

function setLayoutClass(name: string, enabled: boolean): void {
  document.body?.classList.toggle(name, enabled);
  document.documentElement?.classList.toggle(name, enabled);
}

function layoutMode(drawerOpen: boolean, mobile: boolean, fullscreen: boolean): string {
  if (fullscreen) return drawerOpen && !mobile ? "fullscreen-docked" : "fullscreen-overlay";
  if (mobile) return "mobile";
  return "normal-docked";
}

function isDocked(mode: string, drawerOpen: boolean): boolean {
  return drawerOpen && (mode === "normal-docked" || mode === "fullscreen-docked");
}

function updateFullscreenHostClasses(host: Element | null, drawerOpen: boolean, mode: string, mobile: boolean): void {
  if (lastFullscreenHost && lastFullscreenHost !== host) {
    clearFullscreenHostClasses(lastFullscreenHost);
  }

  lastFullscreenHost = host as HTMLElement | null;
  if (!host) return;

  setElementClass(host, "jellychat-fullscreen-host", true);
  setElementClass(host, "jellychat-drawer-open", drawerOpen);
  setElementClass(host, "jellychat-fullscreen-docked", mode === "fullscreen-docked" && drawerOpen);
  setElementClass(host, "jellychat-docked", isDocked(mode, drawerOpen));
  setElementClass(host, "jellychat-mobile", mobile);
  (host as HTMLElement).style.setProperty("--jellychat-drawer-width", drawerWidthPx + "px");
}

export function updateLayout(reason: string): void {
  if (!document.body) return;

  const fullscreenHost = getFullscreenHost();
  const fullscreenActive = !!fullscreenHost;
  const targetHost = fullscreenHost || getNormalMountHost();
  moveJellyChatRootToHost(targetHost);

  const drawerOpen = isDrawerOpen();
  const videoRoute = detectVideoRoute();
  const mobile = window.innerWidth <= mobileLayoutMaxWidthPx;
  const mode = layoutMode(drawerOpen, mobile, fullscreenActive);
  const docked = isDocked(mode, drawerOpen);
  const shouldDockPlayerSurface = docked && drawerOpen && videoRoute && !mobile;

  document.body.style.setProperty("--jellychat-drawer-width", drawerWidthPx + "px");
  document.documentElement.style.setProperty("--jellychat-drawer-width", drawerWidthPx + "px");
  updateFullscreenHostClasses(fullscreenHost, drawerOpen, mode, mobile);
  const playerSurfaces = applyDockedLayout(fullscreenHost || (videoRoute ? document.body : null), shouldDockPlayerSurface);

  setLayoutClass("jellychat-drawer-open", drawerOpen);
  setLayoutClass("jellychat-video-route", videoRoute);
  setLayoutClass("jellychat-docked", docked);
  setLayoutClass("jellychat-mobile", mode === "mobile" || (fullscreenActive && mobile));
  setLayoutClass("jellychat-fullscreen", fullscreenActive);

  if (window.JellyChatDebug) {
    if (reason === "fullscreenchange") {
      window.JellyChatDebug.lastFullscreenChangeAt = new Date().toISOString();
    }

    window.JellyChatDebug.layoutMode = mode;
    window.JellyChatDebug.isVideoRoute = videoRoute;
    window.JellyChatDebug.isFullscreen = fullscreenActive;
    window.JellyChatDebug.drawerOpen = drawerOpen;
    window.JellyChatDebug.triggerPlacement = fullscreenActive ? "fullscreen-safe" : (mobile ? "mobile" : (videoRoute ? "video-safe" : "normal"));
    window.JellyChatDebug.drawerWidth = drawerWidthPx;
    window.JellyChatDebug.lastLayoutUpdateAt = new Date().toISOString();
    window.JellyChatDebug.fullscreenElementTag = tag(fullscreenHost);
    window.JellyChatDebug.fullscreenHostTag = tag(fullscreenHost);
    window.JellyChatDebug.fullscreenHostId = elementId(fullscreenHost);
    window.JellyChatDebug.fullscreenHostClass = className(fullscreenHost);
    window.JellyChatDebug.controlsOverlapAvoided = !drawerOpen
      || (shouldDockPlayerSurface && playerSurfaces.length > 0)
      || (mode === "fullscreen-overlay" && mobile)
      || (!fullscreenActive && docked)
      || mode === "mobile"
      || !videoRoute;
  }

  updateMountDebug(targetHost);
  if (lastLayoutMode !== mode) {
    logDebug("Layout mode changed", { mode, reason, videoRoute, drawerOpen });
    lastLayoutMode = mode;
  }
}

export function scheduleLayoutUpdate(reason: string): void {
  if (layoutResizeTimer) {
    window.clearTimeout(layoutResizeTimer);
  }

  layoutResizeTimer = window.setTimeout(() => {
    layoutResizeTimer = 0;
    updateLayout(reason);
  }, 80);
}
