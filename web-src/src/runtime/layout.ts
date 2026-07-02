import type { DrawerSide } from "../types";
import { drawerId, drawerWidthPx, floatingHostId, markerClass, mobileLayoutMaxWidthPx, rootId } from "./util";
import { countDebugNodes, logDebug } from "./util";

const fullscreenSurfaceAttribute = "data-jellychat-fullscreen-surface";
const fullscreenSurfaceClass = "jellychat-fullscreen-player-surface";
const positionedSurfaceClass = "jellychat-positioned-surface";
const normalContentInsetClass = "jellychat-content-inset-surface";
const headerControlsInsetClass = "jellychat-header-controls-inset-surface";
const playerControlsInsetClass = "jellychat-player-controls-inset-surface";
const playerProgressInsetClass = "jellychat-player-progress-inset-surface";
const playerSubtitlesInsetClass = "jellychat-player-subtitles-inset-surface";
const insetTargetClass = "jellychat-inset-target";
const blockInsetClass = "jellychat-inset-block";
const fixedInsetClass = "jellychat-inset-positioned";
const drawerSideStorageKey = "jellychat.drawerSide";
const floatingHiddenClass = "jellychat-floating-hidden";
const floatingIdleDelayMs = 1200;
const emptyInsetValue = "0px";

let normalMountHost: HTMLElement | null = null;
let lastFullscreenHost: HTMLElement | null = null;
let lastLayoutMode = "";
let layoutResizeTimer = 0;
let floatingButtonTimer = 0;
let fullscreenLayoutSurfaces: Element[] = [];
let normalContentInsetSurfaces: Element[] = [];
let headerControlsInsetSurfaces: Element[] = [];
let playerControlsInsetSurfaces: Element[] = [];
let playerProgressInsetSurfaces: Element[] = [];
let playerSubtitlesInsetSurfaces: Element[] = [];
let lastFullscreenLayoutSignature = "";
const styleSnapshots = new WeakMap<HTMLElement, string>();
let controlsVisibilityObserver: MutationObserver | null = null;
let observedControlsElement: Element | null = null;
let observedControlsTargets: Element[] = [];
let floatingPointerInside = false;

type JellyChatLayoutRect = {
  leftInset: number;
  rightInset: number;
  drawerWidth: number;
  drawerSide: DrawerSide;
  drawerOpen: boolean;
  isVideoRoute: boolean;
  isFullscreen: boolean;
};

type JellyChatVisibleRect = {
  left: string;
  right: string;
  width: string;
};

type RuntimeShellInfo = {
  runtimeShell: string;
  clientShell: string;
  isJellyfinDesktop: boolean;
};

function debug(): Record<string, unknown> {
  return window.JellyChatDebug || {};
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function callString(value: unknown): string {
  if (typeof value !== "function") {
    return "";
  }

  try {
    const result = value();
    return typeof result === "string" ? result : "";
  } catch {
    return "";
  }
}

function detectRuntimeShell(): RuntimeShellInfo {
  const host = window as Window & Record<string, any>;
  const appHost = host.NativeShell?.AppHost;
  const appName = callString(appHost?.appName);
  const layout = callString(appHost?.getDefaultLayout);
  const jmpMode = readString(host.jmpInfo?.mode);
  const hasNativeShell = !!host.NativeShell;
  const hasJmpNative = !!host.jmpNative;
  const hasMpvApi = !!host.api?.player && (typeof host.mpvVideoPlayer === "function" || !!host._mpvVideoPlayerInstance);
  const userAgent = navigator.userAgent || readString(host.jmpInfo?.userAgent);
  const appNameIsDesktop = appName.toLowerCase() === "jellyfin desktop";
  const desktopBridgeSignals = [hasNativeShell, hasJmpNative, hasMpvApi, jmpMode === "desktop" || layout === "desktop"].filter(Boolean).length;
  const isJellyfinDesktop = appNameIsDesktop
    || desktopBridgeSignals >= 3
    || (/jellyfin desktop/i.test(userAgent) && desktopBridgeSignals >= 1);

  return {
    runtimeShell: isJellyfinDesktop ? "jellyfin-desktop" : (hasNativeShell ? "native-shell" : "browser"),
    clientShell: appName || jmpMode || layout || (hasNativeShell ? "native-shell" : "browser"),
    isJellyfinDesktop
  };
}

export function getDrawerSide(): DrawerSide {
  try {
    const stored = window.localStorage?.getItem(drawerSideStorageKey);
    return stored === "left" ? "left" : "right";
  } catch {
    return "right";
  }
}

export function setDrawerSide(side: DrawerSide): void {
  try {
    window.localStorage?.setItem(drawerSideStorageKey, side);
  } catch {
    // Storage can be unavailable in locked-down WebViews.
  }
}

export function getJellyChatLayoutRect(): JellyChatLayoutRect {
  const drawerOpen = isDrawerOpen();
  const drawerSide = getDrawerSide();
  const drawerWidth = drawerOpen ? drawerWidthPx : 0;
  return {
    leftInset: drawerOpen && drawerSide === "left" ? drawerWidth : 0,
    rightInset: drawerOpen && drawerSide === "right" ? drawerWidth : 0,
    drawerWidth,
    drawerSide,
    drawerOpen,
    isVideoRoute: detectVideoRoute(),
    isFullscreen: !!getFullscreenHost()
  };
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

function setDebugError(message: string): void {
  if (window.JellyChatDebug) {
    window.JellyChatDebug.lastError = message;
  }
}

function clearDebugError(prefix: string): void {
  if (window.JellyChatDebug && typeof window.JellyChatDebug.lastError === "string" && window.JellyChatDebug.lastError.indexOf(prefix) === 0) {
    window.JellyChatDebug.lastError = null;
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
    "jellychat-mobile",
    "jellychat-drawer-left",
    "jellychat-drawer-right"
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

function elementLooksLikeAppShellRoot(element: Element | null): boolean {
  if (!element) return false;
  const id = elementId(element);
  const label = (className(element) + " " + id).toLowerCase();
  return id === "reactRoot"
    || /\blibrarydocument\b|\bskinbody\b|\bmainanimatedpages\b|\bdashboarddocument\b/.test(label);
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
  if (!element || isSkippableSurfaceElement(element) || elementLooksLikeAppShellRoot(element) || elementLooksLikeTopControllerOnly(element)) {
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

function usableSurface(element: Element | null, host: Element, video: Element | null, controls: Element | null, subtitles: Element | null): boolean {
  if (!element || element === host || isSkippableSurfaceElement(element) || tag(element) === "video") return false;
  if (elementLooksLikeAppShellRoot(element)) return false;
  if (elementLooksLikeTopControllerOnly(element)) return false;
  if (video && !element.contains(video)) return false;
  if (controls && !element.contains(controls)) return false;
  if (subtitles && !element.contains(subtitles)) return false;
  return true;
}

function playerRootSelectors(): string[] {
  return [
    ".videoPlayerPage",
    ".htmlVideoPlayer",
    ".videoPlayer",
    ".videoPlayerContainer",
    ".videoOsd",
    ".videoOsdContainer",
    ".videoOsdBottom",
    ".subtitleSync",
    ".itemVideo",
    ".nowPlayingPage",
    ".nowPlayingBar",
    '[class*="videoPlayerPage"]',
    '[class*="VideoPlayerPage"]',
    '[class*="htmlVideoPlayer"]',
    '[class*="videoPlayer"]',
    '[class*="VideoPlayer"]',
    '[class*="videoOsd"]',
    '[class*="VideoOsd"]',
    '[class*="subtitle"]',
    '[class*="Subtitle"]',
    '[class*="caption"]',
    '[class*="Caption"]',
    '[class*="nowPlaying"]',
    '[class*="NowPlaying"]'
  ];
}

function subtitleSelectors(): string[] {
  return [
    ".subtitleSync",
    ".subtitleContainer",
    ".videoSubtitles",
    ".captionContainer",
    '[class*="subtitle"]',
    '[class*="Subtitle"]',
    '[class*="caption"]',
    '[class*="Caption"]',
    '[class*="subtitles"]',
    '[class*="Subtitles"]',
    "track"
  ];
}

function findSubtitleElement(host: Element): Element | null {
  const candidates = querySelectorList(host, subtitleSelectors()).filter((element) => {
    if (tag(element) === "track") return false;
    if (!isVisibleLayoutElement(element)) return false;
    const elementRect = rect(element);
    const hostRect = rect(host);
    return !!(elementRect && hostRect
      && elementRect.width > 80
      && elementRect.height > 8
      && elementRect.top >= hostRect.top + hostRect.height * 0.35);
  });

  return candidates.sort((first, second) => elementArea(second) - elementArea(first))[0] || null;
}

function elementArea(element: Element | null): number {
  const elementRect = rect(element);
  return elementRect ? elementRect.width * elementRect.height : 0;
}

function playerRootScore(element: Element, host: Element, video: Element | null, controls: Element | null, subtitles: Element | null): number {
  if (element === host || element === document.body || tag(element) === "html" || tag(element) === "body") {
    return -1000;
  }

  const label = (className(element) + " " + elementId(element)).toLowerCase();
  let score = 0;
  if (/htmlvideoplayer|video-player|videoplayer|video/.test(label)) score += 40;
  if (/player|nowplaying/.test(label)) score += 24;
  if (/osd/.test(label)) score += 16;
  if (/page|view|container|content/.test(label)) score += 8;
  if (/button|progress|slider|volume|favorite|settings|fullscreen/.test(label)) score -= 30;
  if (/caption|subtitle/.test(label)) score -= 18;

  const elementRect = rect(element);
  const hostRect = rect(host);
  const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
  if (elementRect) {
    if (elementRect.width > window.innerWidth * 0.55) score += 12;
    if (elementRect.height > window.innerHeight * 0.55) score += 12;
    if (elementArea(element) > viewportArea * 0.45) score += 10;
  }
  if (elementRect && hostRect) {
    const nearFullWidth = elementRect.width >= hostRect.width * 0.72;
    const nearFullHeight = elementRect.height >= hostRect.height * 0.82;
    const reachesTop = elementRect.top <= hostRect.top + Math.max(12, hostRect.height * 0.03);
    const reachesBottom = elementRect.bottom >= hostRect.bottom - Math.max(16, hostRect.height * 0.05);
    if (nearFullWidth) score += 20;
    if (nearFullHeight) score += 34;
    if (reachesTop && reachesBottom) score += 30;
    if (nearFullWidth && nearFullHeight && reachesTop && reachesBottom) score += 42;
  }

  if (video && element.contains(video)) score += 14;
  if (controls && element.contains(controls)) score += 34;
  if (subtitles && element.contains(subtitles)) score += 28;
  if (element.querySelector(".videoOsdBottom,[class*=\"videoOsdBottom\"],[class*=\"VideoOsdBottom\"]")) score += 24;
  if (element.querySelector(".subtitleSync,.subtitleContainer,.captionContainer,[class*=\"subtitle\"],[class*=\"Subtitle\"],[class*=\"caption\"],[class*=\"Caption\"]")) score += 18;

  return score;
}

function ancestorsUntilHost(element: Element | null, host: Element): Element[] {
  const ancestors: Element[] = [];
  let current = element?.parentElement || null;
  while (current && current.nodeType === 1) {
    if (current === host) break;
    ancestors.push(current);
    current = current.parentElement;
  }
  return ancestors;
}

function commonAncestor(elements: Array<Element | null>, host: Element): Element | null {
  const anchors = uniqueElements(elements).filter((element) => host.contains(element));
  if (anchors.length === 0) return null;

  let current: Element | null = anchors[0];
  while (current && current !== host) {
    if (anchors.every((element) => current?.contains(element))) {
      return current;
    }
    current = current.parentElement;
  }

  return null;
}

function findPlayerRootSurface(host: Element, video: Element | null, controls: Element | null, subtitles: Element | null): Element | null {
  if (!video) return null;
  const playerAnchors = uniqueElements([video, controls, subtitles]);
  const candidates = uniqueElements([
    commonAncestor(playerAnchors, host),
    lowestCommonAncestor(video, controls, host),
    lowestCommonAncestor(video, subtitles, host),
    ...playerAnchors.map((anchor) => directChildUnderHost(anchor, host)),
    ...ancestorsUntilHost(video, host),
    ...ancestorsUntilHost(controls, host),
    ...ancestorsUntilHost(subtitles, host),
    ...querySelectorList(host, playerRootSelectors())
  ]).filter((element) => {
    if (!usableSurface(element, host, video, controls, subtitles)) return false;
    if (!isVisibleLayoutElement(element)) return false;
    const score = playerRootScore(element, host, video, controls, subtitles);
    return score > -100;
  });

  return candidates.sort((first, second) => {
    const scoreDelta = playerRootScore(second, host, video, controls, subtitles) - playerRootScore(first, host, video, controls, subtitles);
    return scoreDelta !== 0 ? scoreDelta : elementArea(second) - elementArea(first);
  })[0] || null;
}

function fallbackSurfaces(host: Element, video: Element | null, controls: Element | null, subtitles: Element | null): Element[] {
  const playerRoot = findPlayerRootSurface(host, video, controls, subtitles);
  if (playerRoot) return [playerRoot];

  const direct = uniqueElements([directChildUnderHost(video, host), directChildUnderHost(controls, host), directChildUnderHost(subtitles, host)])
    .filter((element) => !isSkippableSurfaceElement(element) && !elementLooksLikeAppShellRoot(element) && !elementLooksLikeTopControllerOnly(element));
  if (direct.length > 0) return filterTopLevelTargets(direct);

  return filterTopLevelTargets(querySelectorList(host, playerRootSelectors())
    .filter((element) => !elementLooksLikeAppShellRoot(element) && !elementLooksLikeTopControllerOnly(element) && isVisibleLayoutElement(element)));
}

function inspectPlayerSurface(host: Element): { video: Element | null; controls: Element | null; subtitles: Element | null; surface: Element | null; fallback: Element[] } {
  const video = findVideoElement(host);
  const controls = findControlsElement(host);
  const subtitles = findSubtitleElement(host);
  let surface: Element | null = null;

  if (video) {
    surface = findPlayerRootSurface(host, video, controls, subtitles);
  }

  return {
    video,
    controls,
    subtitles,
    surface,
    fallback: surface ? [] : fallbackSurfaces(host, video, controls, subtitles)
  };
}

function visibleContentRect(layoutRect: JellyChatLayoutRect): JellyChatVisibleRect {
  const left = layoutRect.leftInset > 0 ? layoutRect.leftInset + "px" : emptyInsetValue;
  const right = layoutRect.rightInset > 0 ? layoutRect.rightInset + "px" : emptyInsetValue;
  return {
    left,
    right,
    width: "calc(100% - " + left + " - " + right + ")"
  };
}

function restoreInsetTarget(element: Element): void {
  const htmlElement = element as HTMLElement;
  if (styleSnapshots.has(htmlElement)) {
    htmlElement.style.cssText = styleSnapshots.get(htmlElement) || "";
    styleSnapshots.delete(htmlElement);
  } else {
    htmlElement.style.removeProperty("--jellychat-content-left-inset");
    htmlElement.style.removeProperty("--jellychat-content-right-inset");
    htmlElement.style.removeProperty("--jellychat-content-width");
  }

  element.classList.remove(
    fullscreenSurfaceClass,
    normalContentInsetClass,
    headerControlsInsetClass,
    playerControlsInsetClass,
    playerProgressInsetClass,
    playerSubtitlesInsetClass,
    insetTargetClass,
    blockInsetClass,
    fixedInsetClass,
    positionedSurfaceClass
  );
  element.removeAttribute(fullscreenSurfaceAttribute);
}

function restoreInsetTargets(targets: Element[], selector: string): void {
  const known = targets.slice();
  document.querySelectorAll(selector).forEach((element) => {
    if (!known.includes(element)) known.push(element);
  });

  known.forEach(restoreInsetTarget);
}

function applyInsetTarget(element: Element, layoutRect: JellyChatLayoutRect, markerClassName: string): void {
  if (isWithinJellyChatElement(element)) {
    return;
  }

  const htmlElement = element as HTMLElement;
  if (!styleSnapshots.has(htmlElement)) {
    styleSnapshots.set(htmlElement, htmlElement.style.cssText);
  }

  const visibleRect = visibleContentRect(layoutRect);
  htmlElement.style.setProperty("--jellychat-content-left-inset", visibleRect.left);
  htmlElement.style.setProperty("--jellychat-content-right-inset", visibleRect.right);
  htmlElement.style.setProperty("--jellychat-content-width", visibleRect.width);
  element.classList.add(markerClassName, insetTargetClass);
  if (markerClassName === fullscreenSurfaceClass) {
    element.setAttribute(fullscreenSurfaceAttribute, "true");
  }

  const position = window.getComputedStyle ? window.getComputedStyle(element).position : "";
  const positioned = ["absolute", "fixed", "sticky"].includes(position);
  element.classList.toggle(positionedSurfaceClass, positioned);
  element.classList.toggle(fixedInsetClass, positioned);
  element.classList.toggle(blockInsetClass, !positioned);
}

function clearDockedLayout(): void {
  restoreInsetTargets(fullscreenLayoutSurfaces, "[" + fullscreenSurfaceAttribute + "], ." + fullscreenSurfaceClass);
  fullscreenLayoutSurfaces = [];
}

function clearNormalContentInset(): void {
  restoreInsetTargets(normalContentInsetSurfaces, "." + normalContentInsetClass);
  normalContentInsetSurfaces = [];
}

function clearHeaderControlsInset(): void {
  restoreInsetTargets(headerControlsInsetSurfaces, "." + headerControlsInsetClass);
  headerControlsInsetSurfaces = [];
}

function clearPlayerControlsInset(): void {
  restoreInsetTargets(playerControlsInsetSurfaces, "." + playerControlsInsetClass);
  playerControlsInsetSurfaces = [];
}

function clearPlayerProgressInset(): void {
  restoreInsetTargets(playerProgressInsetSurfaces, "." + playerProgressInsetClass);
  playerProgressInsetSurfaces = [];
}

function clearPlayerSubtitlesInset(): void {
  restoreInsetTargets(playerSubtitlesInsetSurfaces, "." + playerSubtitlesInsetClass);
  playerSubtitlesInsetSurfaces = [];
}

function clearPlayerOverlayInsets(): void {
  clearPlayerControlsInset();
  clearPlayerProgressInset();
  clearPlayerSubtitlesInset();
}

function isVisibleLayoutElement(element: Element): boolean {
  const elementRect = rect(element);
  if (!elementRect || elementRect.width <= 0 || elementRect.height <= 0) {
    return false;
  }

  if (window.getComputedStyle) {
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;
  }

  return true;
}

function normalContentSelectors(): string[] {
  return [
    "main",
    '[role="main"]',
    ".mainAnimatedPages",
    ".page:not(.hide)",
    ".libraryPage:not(.hide)",
    ".dashboardDocument"
  ];
}

function findNormalContentSurfaces(): Element[] {
  const candidates = querySelectorList(document.body, normalContentSelectors())
    .filter((element) => !isWithinJellyChatElement(element) && isVisibleLayoutElement(element));
  const topLevel = candidates.filter((candidate) => !candidates.some((other) => other !== candidate && other.contains(candidate)));

  if (topLevel.length > 0) {
    return topLevel.slice(0, 3);
  }

  return [];
}

function headerControlsSelectors(): string[] {
  return [
    ".skinHeader",
    ".dashboardHeader",
    ".viewMenuBar",
    ".videoOsdHeader",
    ".videoOsdTop",
    ".videoOsdTopControls",
    ".videoOsd .headerRight",
    ".videoOsd .headerRightItems",
    ".headerRight",
    ".headerRightItems",
    ".skinHeader .headerRight",
    ".skinHeader .headerRightItems",
    "header",
    "header .headerRight",
    "header .headerRightItems",
    '[class*="videoOsdHeader"]',
    '[class*="VideoOsdHeader"]',
    '[class*="videoOsdTop"]',
    '[class*="VideoOsdTop"]',
    '[class*="headerRight"]',
    '[class*="HeaderRight"]',
    '[class*="topRight"]',
    '[class*="TopRight"]'
  ];
}

function findHeaderControlsSurfaces(host: Element, videoRoute: boolean): Element[] {
  const candidates = querySelectorList(host, headerControlsSelectors())
    .filter((element) => !isWithinJellyChatElement(element) && isVisibleLayoutElement(element));
  const viewportWidth = window.innerWidth || 0;
  const surfaces = filterNestedTargets(candidates.filter((element) => {
    const elementRect = rect(element);
    if (!elementRect) return false;
    if (elementRect.width <= 24 || elementRect.height <= 8) return false;
    if (videoRoute) return elementRect.top < 120;
    return elementRect.top < 96 && elementRect.right > viewportWidth * 0.45;
  })).filter((element) => !elementLooksLikeAppShellRoot(element));

  return surfaces.slice(0, 8);
}

function applyHeaderControlsInset(host: Element | null, shouldInset: boolean, layoutRect: JellyChatLayoutRect, videoRoute: boolean): Element[] {
  clearHeaderControlsInset();
  if (!host || !shouldInset) {
    updateTargetDebug("headerControlsTarget", []);
    clearDebugError("JellyChat layout target not found: header controls");
    return [];
  }

  const surfaces = findHeaderControlsSurfaces(host, videoRoute);
  surfaces.forEach((element) => {
    applyInsetTarget(element, layoutRect, headerControlsInsetClass);
  });
  headerControlsInsetSurfaces = surfaces;
  updateTargetDebug("headerControlsTarget", surfaces);
  if (surfaces.length === 0) {
    setDebugError("JellyChat layout target not found: header controls");
  } else {
    clearDebugError("JellyChat layout target not found: header controls");
  }
  return surfaces;
}

function applyNormalContentInset(shouldInset: boolean, layoutRect: JellyChatLayoutRect): Element[] {
  clearNormalContentInset();
  if (!shouldInset) {
    clearDebugError("JellyChat layout target not found: page content");
    return [];
  }

  const surfaces = findNormalContentSurfaces();
  surfaces.forEach((element) => {
    applyInsetTarget(element, layoutRect, normalContentInsetClass);
  });
  normalContentInsetSurfaces = surfaces;
  if (surfaces.length === 0) {
    setDebugError("JellyChat layout target not found: page content");
  } else {
    clearDebugError("JellyChat layout target not found: page content");
  }
  return surfaces;
}

function updateSurfaceDebug(host: Element | null, detection: ReturnType<typeof inspectPlayerSurface> | null, surfaces: Element[], shouldDock: boolean): void {
  const primary = surfaces[0] || null;
  const state = debug();
  state.fullscreenHostTag = tag(host);
  state.fullscreenHostId = elementId(host);
  state.fullscreenHostClass = className(host);
  state.videoElementFound = !!detection?.video;
  state.controlsElementFound = !!detection?.controls;
  state.subtitleElementFound = !!detection?.subtitles;
  state.fullscreenPlayerSurfaceSelector = surfaces.map(describeElementSelector).join(", ");
  state.fullscreenPlayerSurfaceTag = tag(primary);
  state.fullscreenPlayerSurfaceId = elementId(primary);
  state.fullscreenPlayerSurfaceClass = className(primary);
  state.videoReservedWidth = shouldDock && surfaces.length > 0 ? drawerWidthPx : 0;
}

function updateTargetDebug(prefix: string, surfaces: Element[]): void {
  const primary = surfaces[0] || null;
  const state = debug();
  state[prefix + "Selector"] = surfaces.map(describeElementSelector).join(", ");
  state[prefix + "Tag"] = tag(primary);
  state[prefix + "Id"] = elementId(primary);
  state[prefix + "Class"] = className(primary);
}

function filterNestedTargets(elements: Element[]): Element[] {
  return elements.filter((element) => !elements.some((other) => other !== element && other.contains(element)));
}

function filterTopLevelTargets(elements: Element[]): Element[] {
  return elements.filter((element) => !elements.some((other) => other !== element && other.contains(element)));
}

function isCoveredBySurface(element: Element, surfaces: Element[]): boolean {
  return surfaces.some((surface) => surface === element || surface.contains(element));
}

function elementLooksLikeVolumeTarget(element: Element, host: Element): boolean {
  const chain = uniqueElements([element, ...ancestorsUntilHost(element, host)]);
  return chain.some((candidate) => {
    const label = (className(candidate) + " " + elementId(candidate)).toLowerCase();
    return /volume|mute/.test(label);
  });
}

function computedPosition(element: Element | null): string {
  return element && window.getComputedStyle ? window.getComputedStyle(element).position : "";
}

function isPositionedInsetCandidate(element: Element | null): boolean {
  return ["absolute", "fixed", "sticky"].includes(computedPosition(element));
}

function targetScore(element: Element, host: Element, pattern: RegExp, anchor: Element): number {
  if (element === host || elementLooksLikeAppShellRoot(element) || isSkippableSurfaceElement(element)) return -1000;
  const elementRect = rect(element);
  if (!elementRect || elementRect.width <= 0 || elementRect.height <= 0) return -1000;

  const label = (className(element) + " " + elementId(element)).toLowerCase();
  let score = 0;
  if (element === anchor) score += 40;
  if (pattern.test(label)) score += 40;
  if (isPositionedInsetCandidate(element)) score += 28;
  if (elementRect.width > 120) score += 12;
  if (elementRect.width > window.innerWidth * 0.35) score += 12;
  if (/videoplayer|htmlvideoplayer|video-player|videoosdcontainer/.test(label) && element !== anchor && !pattern.test(label)) score -= 80;
  if (/button|icon|item/.test(label) || tag(element) === "button") score -= 30;
  return score;
}

function nearestInsetSurface(element: Element, host: Element, pattern: RegExp): Element | null {
  const candidates = uniqueElements([element, ...ancestorsUntilHost(element, host)])
    .filter((candidate) => {
      if (candidate === host || elementLooksLikeAppShellRoot(candidate) || isWithinJellyChatElement(candidate) || !isVisibleLayoutElement(candidate)) return false;
      if (candidate !== element) {
        const label = (className(candidate) + " " + elementId(candidate)).toLowerCase();
        if (!pattern.test(label)) return false;
      }
      return true;
    });
  return candidates.sort((first, second) => targetScore(second, host, pattern, element) - targetScore(first, host, pattern, element))[0] || null;
}

function targetSurfaces(host: Element, selectors: string[], pattern: RegExp, minimumWidth: number, minimumHeight: number): Element[] {
  const candidates = querySelectorList(host, selectors).filter((element) => {
    if (tag(element) === "track") return false;
    if (!isVisibleLayoutElement(element)) return false;
    const elementRect = rect(element);
    return !!(elementRect && elementRect.width >= minimumWidth && elementRect.height >= minimumHeight);
  });

  return filterTopLevelTargets(uniqueElements(candidates.map((element) => nearestInsetSurface(element, host, pattern))));
}

function playerControlsSelectors(): string[] {
  return [
    ".videoOsd",
    ".videoOsdBottom",
    ".videoOsdBottom-maincontrols",
    ".videoOsdControls",
    ".osdControls",
    ".playbackControls",
    ".playerControls",
    ".nowPlayingBar",
    ".volumeSliderContainer",
    ".buttons",
    '[class*="videoOsd"]',
    '[class*="VideoOsd"]',
    '[class*="osdControls"]',
    '[class*="OsdControls"]',
    '[class*="playbackControls"]',
    '[class*="PlaybackControls"]',
    '[class*="playerControls"]',
    '[class*="PlayerControls"]'
  ];
}

function playerProgressSelectors(): string[] {
  return [
    ".progressContainer",
    ".videoOsdBottom-progress",
    ".osdProgress",
    ".sliderContainer",
    '[class*="progress"]',
    '[class*="Progress"]',
    '[class*="timeline"]',
    '[class*="Timeline"]',
    '[class*="seek"]',
    '[class*="Seek"]',
    '[role="slider"]',
    '[role="progressbar"]',
    'input[type="range"]',
    "progress"
  ];
}

function findPlayerControlsSurfaces(host: Element, coveredSurfaces: Element[]): Element[] {
  const surfaces = targetSurfaces(host, playerControlsSelectors(), /videoosd|osd|bottom|control|transport|playback|nowplaying/, 80, 8);
  return surfaces.filter((element) => !coveredSurfaces.includes(element)).slice(0, 12);
}

function findPlayerProgressSurfaces(host: Element, coveredSurfaces: Element[]): Element[] {
  const surfaces = targetSurfaces(host, playerProgressSelectors(), /progress|timeline|seek|slider/, 80, 2)
    .filter((element) => !elementLooksLikeVolumeTarget(element, host))
    .map((element) => coveredSurfaces.find((surface) => surface !== element && surface.contains(element)) || element);
  return filterTopLevelTargets(uniqueElements(surfaces)).slice(0, 8);
}

function findPlayerSubtitleSurfaces(host: Element, coveredSurfaces: Element[]): Element[] {
  const surfaces = targetSurfaces(host, subtitleSelectors(), /subtitle|caption|texttrack|videoosd/, 40, 8);
  return surfaces.filter((element) => !coveredSurfaces.includes(element)).slice(0, 8);
}

function filterVideoSurfaceTargets(host: Element, surfaces: Element[], avoidVideoSurface: boolean): Element[] {
  if (!avoidVideoSurface) {
    return surfaces;
  }

  const video = findVideoElement(host);
  if (!video) {
    return surfaces;
  }

  return surfaces.filter((element) => element !== video && !element.contains(video));
}

function applyPlayerControlsInset(host: Element | null, shouldInset: boolean, layoutRect: JellyChatLayoutRect, coveredSurfaces: Element[], avoidVideoSurface = false): Element[] {
  if (!host || !shouldInset) {
    updateTargetDebug("playerControlsTarget", []);
    clearDebugError("JellyChat layout target not found: player controls");
    return [];
  }

  const surfaces = filterVideoSurfaceTargets(host, findPlayerControlsSurfaces(host, coveredSurfaces), avoidVideoSurface);
  surfaces.forEach((element) => applyInsetTarget(element, layoutRect, playerControlsInsetClass));
  playerControlsInsetSurfaces = surfaces;
  updateTargetDebug("playerControlsTarget", surfaces);
  if (surfaces.length === 0 && coveredSurfaces.length === 0) {
    setDebugError("JellyChat layout target not found: player controls");
  } else {
    clearDebugError("JellyChat layout target not found: player controls");
  }
  return surfaces;
}

function applyPlayerProgressInset(host: Element | null, shouldInset: boolean, layoutRect: JellyChatLayoutRect, coveredSurfaces: Element[], avoidVideoSurface = false): Element[] {
  if (!host || !shouldInset) {
    updateTargetDebug("playerProgressTarget", []);
    clearDebugError("JellyChat layout target not found: player progress");
    return [];
  }

  const surfaces = filterVideoSurfaceTargets(host, findPlayerProgressSurfaces(host, coveredSurfaces), avoidVideoSurface);
  surfaces.forEach((element) => applyInsetTarget(element, layoutRect, playerProgressInsetClass));
  playerProgressInsetSurfaces = surfaces;
  updateTargetDebug("playerProgressTarget", surfaces);
  if (surfaces.length === 0 && coveredSurfaces.length === 0) {
    setDebugError("JellyChat layout target not found: player progress");
  } else {
    clearDebugError("JellyChat layout target not found: player progress");
  }
  return surfaces;
}

function applyPlayerSubtitlesInset(host: Element | null, shouldInset: boolean, layoutRect: JellyChatLayoutRect, coveredSurfaces: Element[], avoidVideoSurface = false): Element[] {
  if (!host || !shouldInset) {
    updateTargetDebug("playerSubtitlesTarget", []);
    clearDebugError("JellyChat layout target not found: player subtitles");
    return [];
  }

  const surfaces = filterVideoSurfaceTargets(host, findPlayerSubtitleSurfaces(host, coveredSurfaces), avoidVideoSurface);
  surfaces.forEach((element) => applyInsetTarget(element, layoutRect, playerSubtitlesInsetClass));
  playerSubtitlesInsetSurfaces = surfaces;
  updateTargetDebug("playerSubtitlesTarget", surfaces);
  if (surfaces.length === 0 && coveredSurfaces.length === 0) {
    setDebugError("JellyChat layout target not found: player subtitles");
  } else {
    clearDebugError("JellyChat layout target not found: player subtitles");
  }
  return surfaces;
}

function applyDockedLayout(host: Element | null, shouldDock: boolean, layoutRect: JellyChatLayoutRect): Element[] {
  clearDockedLayout();
  if (!host) {
    updateSurfaceDebug(null, null, [], false);
    clearDebugError("JellyChat layout target not found: video player");
    return [];
  }

  const detection = inspectPlayerSurface(host);
  const surfaces = shouldDock
    ? filterTopLevelTargets(uniqueElements([
      detection.surface,
      ...detection.fallback
    ]))
    : [];
  if (!shouldDock) {
    clearDebugError("JellyChat layout target not found: video player");
  }
  surfaces.forEach((element) => applyInsetTarget(element, layoutRect, fullscreenSurfaceClass));
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

  if (shouldDock && surfaces.length === 0) {
    setDebugError("JellyChat layout target not found: video player");
  } else {
    clearDebugError("JellyChat layout target not found: video player");
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

function isFloatingButtonFocused(): boolean {
  const floatingHost = document.getElementById(floatingHostId);
  return !!(floatingHost && document.activeElement && floatingHost.contains(document.activeElement));
}

export function setFloatingButtonPointerInside(isInside: boolean): void {
  floatingPointerInside = isInside;
  if (isInside) {
    setFloatingButtonHidden(false);
    clearFloatingButtonTimer();
  } else {
    showFloatingButton("floating-pointer-leave");
  }
}

function setFloatingButtonHidden(hidden: boolean): void {
  setLayoutClass(floatingHiddenClass, hidden);
  if (window.JellyChatDebug) {
    window.JellyChatDebug.floatingButtonAutoHidden = hidden;
  }
}

function controlsHost(): Element | null {
  return getFullscreenHost() || document.body || null;
}

function controlsElementIsVisible(element: Element | null): boolean {
  if (!element || !element.isConnected) return false;
  const elementRect = rect(element);
  if (!elementRect || elementRect.width <= 0 || elementRect.height <= 0) return false;
  const label = (className(element) + " " + elementId(element)).toLowerCase();
  if (/\bhide\b|\bhidden\b|hide-osd|osd-hidden|controls-hidden/.test(label)) return false;
  if (!window.getComputedStyle) return true;
  const style = window.getComputedStyle(element);
  return style.display !== "none"
    && style.visibility !== "hidden"
    && Number(style.opacity || "1") > 0.05;
}

function updateFloatingButtonFromControlsVisibility(reason: string): boolean {
  if (!detectVideoRoute()) {
    setFloatingButtonHidden(false);
    return false;
  }

  if (isDrawerOpen() || isFloatingButtonFocused() || floatingPointerInside) {
    setFloatingButtonHidden(false);
    clearFloatingButtonTimer();
    return true;
  }

  const host = controlsHost();
  const controls = host ? findControlsElement(host) : null;
  if (!controls) {
    if (window.JellyChatDebug) {
      window.JellyChatDebug.controlsVisibilitySource = "fallback-timer";
    }
    return false;
  }

  observeControlsVisibility(controls);
  const visible = controlsElementIsVisible(controls);
  if (window.JellyChatDebug) {
    window.JellyChatDebug.controlsVisibilitySource = "jellyfin-osd";
    if (visible) {
      window.JellyChatDebug.lastControlsVisibleAt = new Date().toISOString();
    } else {
      window.JellyChatDebug.lastControlsHiddenAt = new Date().toISOString();
    }
    window.JellyChatDebug.lastControlsVisibilityReason = reason;
  }

  setFloatingButtonHidden(!visible);
  return true;
}

function observeControlsVisibility(element: Element): void {
  if (observedControlsElement === element && controlsVisibilityObserver) {
    return;
  }

  if (controlsVisibilityObserver) {
    controlsVisibilityObserver.disconnect();
    controlsVisibilityObserver = null;
  }

  observedControlsElement = element;
  observedControlsTargets = [];
  if (typeof MutationObserver === "undefined") {
    return;
  }

  controlsVisibilityObserver = new MutationObserver(() => {
    updateFloatingButtonFromControlsVisibility("jellyfin-osd");
  });
  const host = controlsHost();
  const ancestors = host ? ancestorsUntilHost(element, host) : [];
  observedControlsTargets = uniqueElements([element, ...ancestors]).filter((target) => {
    const label = (className(target) + " " + elementId(target)).toLowerCase();
    return target === element || /videoosd|osd|control|player|nowplaying/.test(label);
  }).slice(0, 6);
  observedControlsTargets.forEach((target) => {
    controlsVisibilityObserver?.observe(target, {
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "aria-hidden"]
    });
  });
}

function visibleControlsExist(): boolean {
  const selectors = controlsSelectors();
  return selectors.some((selector) => {
    try {
      return Array.from(document.querySelectorAll(selector)).some((element) => {
        if (isWithinJellyChatElement(element)) return false;
        const elementRect = rect(element);
        if (!elementRect || elementRect.width <= 0 || elementRect.height <= 0) return false;
        if (!window.getComputedStyle) return true;
        const style = window.getComputedStyle(element);
        return style.display !== "none"
          && style.visibility !== "hidden"
          && Number(style.opacity || "1") > 0.05;
      });
    } catch {
      return false;
    }
  });
}

function clearFloatingButtonTimer(): void {
  if (floatingButtonTimer) {
    window.clearTimeout(floatingButtonTimer);
    floatingButtonTimer = 0;
  }
}

function hideFloatingButtonIfIdle(): void {
  floatingButtonTimer = 0;
  if (!detectVideoRoute() || isDrawerOpen() || isFloatingButtonFocused() || floatingPointerInside) {
    setFloatingButtonHidden(false);
    return;
  }

  if (updateFloatingButtonFromControlsVisibility("fallback-check")) {
    return;
  }

  if (visibleControlsExist()) {
    scheduleFloatingButtonAutoHide();
    return;
  }

  setFloatingButtonHidden(true);
}

function scheduleFloatingButtonAutoHide(): void {
  clearFloatingButtonTimer();
  if (!detectVideoRoute() || isDrawerOpen() || isFloatingButtonFocused() || floatingPointerInside) {
    setFloatingButtonHidden(false);
    return;
  }

  if (window.JellyChatDebug) {
    window.JellyChatDebug.controlsVisibilitySource = "fallback-timer";
  }

  floatingButtonTimer = window.setTimeout(hideFloatingButtonIfIdle, floatingIdleDelayMs);
}

export function showFloatingButton(reason: string): void {
  setFloatingButtonHidden(false);
  if (window.JellyChatDebug) {
    window.JellyChatDebug.lastFloatingButtonShowReason = reason;
    window.JellyChatDebug.lastControlsVisibleAt = new Date().toISOString();
  }
  const host = controlsHost();
  const controls = host ? findControlsElement(host) : null;
  if (controls) {
    observeControlsVisibility(controls);
    if (window.JellyChatDebug) {
      window.JellyChatDebug.controlsVisibilitySource = "jellyfin-osd";
    }
  }
  scheduleFloatingButtonAutoHide();
}

export function handleFloatingButtonFocusChange(reason: string): void {
  if (isFloatingButtonFocused() || isDrawerOpen() || floatingPointerInside) {
    setFloatingButtonHidden(false);
    clearFloatingButtonTimer();
    return;
  }

  showFloatingButton(reason);
}

function layoutMode(drawerOpen: boolean, mobile: boolean, fullscreen: boolean, videoRoute: boolean, canDock: boolean): string {
  if (fullscreen) return drawerOpen && canDock ? "fullscreen-docked" : "fullscreen-overlay";
  if (canDock) return "normal-docked";
  if (mobile) return "mobile";
  return "normal-docked";
}

function isDocked(mode: string, drawerOpen: boolean): boolean {
  return drawerOpen && (mode === "normal-docked" || mode === "fullscreen-docked");
}

function updateFullscreenHostClasses(host: Element | null, drawerOpen: boolean, mode: string, mobile: boolean, drawerSide: DrawerSide): void {
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
  setElementClass(host, "jellychat-drawer-left", drawerSide === "left");
  setElementClass(host, "jellychat-drawer-right", drawerSide === "right");
  (host as HTMLElement).style.setProperty("--jellychat-drawer-width", drawerWidthPx + "px");
}

export function updateLayout(reason: string): void {
  if (!document.body) return;

  const fullscreenHost = getFullscreenHost();
  const fullscreenActive = !!fullscreenHost;
  const targetHost = fullscreenHost || getNormalMountHost();
  moveJellyChatRootToHost(targetHost);

  const layoutRect = getJellyChatLayoutRect();
  const drawerOpen = layoutRect.drawerOpen;
  const drawerSide = layoutRect.drawerSide;
  const videoRoute = layoutRect.isVideoRoute;
  const viewportWidth = Math.max(
    window.innerWidth || 0,
    document.documentElement?.clientWidth || 0,
    window.visualViewport?.width || 0
  );
  const mobile = viewportWidth <= mobileLayoutMaxWidthPx;
  const hasRoomForDockedDrawer = viewportWidth >= drawerWidthPx + 360;
  const canDock = !mobile || hasRoomForDockedDrawer;
  const runtimeShell = detectRuntimeShell();
  const desktopVideoSafeMode = runtimeShell.isJellyfinDesktop && drawerOpen && videoRoute && canDock;
  const mode = desktopVideoSafeMode ? "desktop-video-safe" : layoutMode(drawerOpen, mobile, fullscreenActive, videoRoute, canDock);
  const docked = isDocked(mode, drawerOpen);
  const shouldDockPlayerSurface = drawerOpen && videoRoute && canDock && !desktopVideoSafeMode;
  const shouldInsetPlayerOverlays = drawerOpen && videoRoute && canDock;
  const shouldInsetNormalContent = docked && drawerOpen && !videoRoute && !fullscreenActive && canDock;
  const shouldInsetHeaderControls = shouldInsetPlayerOverlays || shouldInsetNormalContent;
  const mobileClassEnabled = mode === "mobile" || (fullscreenActive && mobile && !canDock);

  document.documentElement.style.setProperty("--jellychat-drawer-width", drawerWidthPx + "px");
  document.documentElement.style.setProperty("--jellychat-content-left-inset", layoutRect.leftInset + "px");
  document.documentElement.style.setProperty("--jellychat-content-right-inset", layoutRect.rightInset + "px");
  document.documentElement.style.setProperty("--jellychat-content-width", "calc(100% - " + layoutRect.leftInset + "px - " + layoutRect.rightInset + "px)");
  updateFullscreenHostClasses(fullscreenHost, drawerOpen, mode, mobileClassEnabled, drawerSide);
  const layoutHost = fullscreenHost || (videoRoute ? document.body : null);
  const playerSurfaces = applyDockedLayout(layoutHost, shouldDockPlayerSurface, layoutRect);
  const coveredPlayerSurfaces = playerSurfaces.slice();
  clearPlayerOverlayInsets();
  const playerControlAvoidSurfaces = desktopVideoSafeMode ? [] : coveredPlayerSurfaces;
  const playerSubtitleAvoidSurfaces = desktopVideoSafeMode ? [] : coveredPlayerSurfaces;
  const playerControlSurfaces = applyPlayerControlsInset(layoutHost, shouldInsetPlayerOverlays, layoutRect, playerControlAvoidSurfaces, desktopVideoSafeMode);
  const playerProgressAvoidSurfaces = desktopVideoSafeMode ? [] : coveredPlayerSurfaces.concat(playerControlSurfaces);
  const playerProgressSurfaces = applyPlayerProgressInset(layoutHost, shouldInsetPlayerOverlays, layoutRect, playerProgressAvoidSurfaces, desktopVideoSafeMode);
  const playerSubtitleSurfaces = applyPlayerSubtitlesInset(layoutHost, shouldInsetPlayerOverlays, layoutRect, playerSubtitleAvoidSurfaces, desktopVideoSafeMode);
  const contentSurfaces = applyNormalContentInset(shouldInsetNormalContent, layoutRect);
  const headerSurfaces = applyHeaderControlsInset(layoutHost || document.body, shouldInsetHeaderControls, layoutRect, videoRoute);

  setLayoutClass("jellychat-drawer-open", drawerOpen);
  setLayoutClass("jellychat-video-route", videoRoute);
  setLayoutClass("jellychat-docked", docked);
  setLayoutClass("jellychat-mobile", mobileClassEnabled);
  setLayoutClass("jellychat-fullscreen", fullscreenActive);
  setLayoutClass("jellychat-desktop-video-safe", desktopVideoSafeMode);
  setLayoutClass("jellychat-drawer-left", drawerSide === "left");
  setLayoutClass("jellychat-drawer-right", drawerSide === "right");
  setLayoutClass("jellychat-content-inset-found", contentSurfaces.length > 0);

  if (drawerOpen || !videoRoute) {
    setFloatingButtonHidden(false);
    clearFloatingButtonTimer();
  } else if (reason === "routechange" || reason === "hashchange" || reason === "popstate" || reason === "fullscreenchange" || reason === "react-mount" || reason === "start") {
    showFloatingButton(reason);
  } else if (videoRoute) {
    scheduleFloatingButtonAutoHide();
  }

  if (window.JellyChatDebug) {
    if (reason === "fullscreenchange") {
      window.JellyChatDebug.lastFullscreenChangeAt = new Date().toISOString();
    }

    window.JellyChatDebug.layoutMode = mode;
    window.JellyChatDebug.drawerSide = drawerSide;
    window.JellyChatDebug.isVideoRoute = videoRoute;
    window.JellyChatDebug.videoRoute = videoRoute;
    window.JellyChatDebug.isFullscreen = fullscreenActive;
    window.JellyChatDebug.drawerOpen = drawerOpen;
    window.JellyChatDebug.triggerPlacement = fullscreenActive ? "fullscreen-safe" : (mode === "mobile" ? "mobile" : (videoRoute ? "video-safe" : "normal"));
    window.JellyChatDebug.drawerWidth = drawerWidthPx;
    window.JellyChatDebug.viewportWidth = viewportWidth;
    window.JellyChatDebug.canDock = canDock;
    window.JellyChatDebug.leftInset = layoutRect.leftInset;
    window.JellyChatDebug.rightInset = layoutRect.rightInset;
    window.JellyChatDebug.lastLayoutUpdateAt = new Date().toISOString();
    const playerOverlayInsetApplied = playerControlSurfaces.length > 0 || playerProgressSurfaces.length > 0 || playerSubtitleSurfaces.length > 0;
    const desktopOverlayCssFallbackApplied = desktopVideoSafeMode && shouldInsetPlayerOverlays;
    window.JellyChatDebug.runtimeShell = runtimeShell.runtimeShell;
    window.JellyChatDebug.clientShell = runtimeShell.clientShell;
    window.JellyChatDebug.isJellyfinDesktop = runtimeShell.isJellyfinDesktop;
    window.JellyChatDebug.desktopVideoSafeMode = desktopVideoSafeMode;
    window.JellyChatDebug.desktopOverlayCssFallbackApplied = desktopOverlayCssFallbackApplied;
    window.JellyChatDebug.videoSurfaceInsetApplied = shouldDockPlayerSurface && playerSurfaces.length > 0;
    window.JellyChatDebug.videoSurfaceResizeSuppressed = desktopVideoSafeMode;
    window.JellyChatDebug.layoutTargetsFound = (!shouldInsetNormalContent || contentSurfaces.length > 0) && (!shouldInsetHeaderControls || headerSurfaces.length > 0) && (!shouldInsetPlayerOverlays || (playerOverlayInsetApplied || desktopOverlayCssFallbackApplied || (!desktopVideoSafeMode && playerSurfaces.length > 0)));
    window.JellyChatDebug.contentInsetApplied = shouldInsetNormalContent && contentSurfaces.length > 0;
    window.JellyChatDebug.headerControlsInsetApplied = shouldInsetHeaderControls && headerSurfaces.length > 0;
    window.JellyChatDebug.playerInsetApplied = shouldDockPlayerSurface && playerSurfaces.length > 0;
    window.JellyChatDebug.playerSurfaceInsetApplied = shouldDockPlayerSurface && playerSurfaces.length > 0;
    window.JellyChatDebug.playerControlsInsetApplied = shouldInsetPlayerOverlays && playerControlSurfaces.length > 0;
    window.JellyChatDebug.playerProgressInsetApplied = shouldInsetPlayerOverlays && playerProgressSurfaces.length > 0;
    window.JellyChatDebug.playerSubtitlesInsetApplied = shouldInsetPlayerOverlays && playerSubtitleSurfaces.length > 0;
    window.JellyChatDebug.normalContentInsetApplied = shouldInsetNormalContent && contentSurfaces.length > 0;
    window.JellyChatDebug.controlsInsetApplied = shouldInsetPlayerOverlays && (playerSurfaces.length > 0 || playerOverlayInsetApplied) && !!window.JellyChatDebug.controlsElementFound;
    window.JellyChatDebug.fullscreenElementTag = tag(fullscreenHost);
    window.JellyChatDebug.fullscreenHostTag = tag(fullscreenHost);
    window.JellyChatDebug.fullscreenHostId = elementId(fullscreenHost);
    window.JellyChatDebug.fullscreenHostClass = className(fullscreenHost);
    window.JellyChatDebug.controlsOverlapAvoided = !drawerOpen
      || (shouldDockPlayerSurface && (playerSurfaces.length > 0 || playerControlSurfaces.length > 0 || playerProgressSurfaces.length > 0 || playerSubtitleSurfaces.length > 0))
      || (desktopVideoSafeMode && (playerOverlayInsetApplied || desktopOverlayCssFallbackApplied))
      || (mode === "fullscreen-overlay" && mobile)
      || (!fullscreenActive && docked)
      || mode === "mobile"
      || !videoRoute;
  }

  updateMountDebug(targetHost);
  if (lastLayoutMode !== mode) {
    logDebug("Layout mode changed", { mode, reason, videoRoute, drawerOpen, drawerSide });
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
