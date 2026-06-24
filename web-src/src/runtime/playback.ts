import type { PlaybackEventType } from "../types";
import { logDebug, recordError } from "./util";

type PlaybackPostRequest = {
  type: PlaybackEventType;
  positionSeconds?: number;
  fromSeconds?: number;
  itemId?: string;
  itemName?: string;
};
type PlaybackPoster = (request: PlaybackPostRequest) => Promise<boolean>;
type LocalInputType = "playpause" | "seek";

const playPauseIntentWindowMs = 2500;
const seekIntentWindowMs = 6000;
const startIntentWindowMs = 30000;
const duplicateWindowMs = 1200;
const seekDuplicateWindowMs = 3000;
const seekThresholdSeconds = 2;
const seekSuppressPlaybackAfterMs = 1200;
const pauseCandidateWindowMs = 700;
const startupGuardMs = 8000;
export const seekDebounceMs = 900;

let postPlaybackEvent: PlaybackPoster | null = null;
let activeMedia: HTMLMediaElement | null = null;
let seekTimerId: number | null = null;
let pendingSeekToSeconds: number | null = null;
let pendingSeekFromSeconds: number | null = null;
let pendingPauseTimerId: number | null = null;
let pendingPauseSeconds: number | null = null;
let pendingPauseItem: { itemId: string; itemName: string } | null = null;
let nativeSeekInProgress = false;
let seekFromSeconds: number | null = null;
let lastStableSeconds: number | null = null;
let lastNativeSeekedAt = 0;
let lastLocalInputAt = 0;
let lastLocalPlayPauseIntentAt = 0;
let lastLocalSeekIntentAt = 0;
let lastPlaybackStartNavigationIntentAt = 0;
let lastLocalInputType: LocalInputType = "playpause";
let lastPostedType = "";
let lastPostedAt = 0;
let lastPostedSeekSecond = -1;
let lastPostedSeekAt = 0;
let seekSuppressPlaybackUntilMs = 0;
let playbackListenerCount = 0;
let currentPlaybackItemId = "";
let currentPlaybackItemTitle = "";
let playbackStartLoggedForItem = "";
let startupGuardUntilMs = 0;

function setDebug(values: Record<string, unknown>): void {
  if (window.JellyChatDebug) {
    Object.assign(window.JellyChatDebug, values);
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function isoFromMs(value: number): string | null {
  return value > 0 ? new Date(value).toISOString() : null;
}

function updatePlaybackListenerCount(): void {
  setDebug({
    playbackListenerCount,
    seekDebounceMs,
    seekIntentWindowMs,
    lastSeekIntentWindowMs: seekIntentWindowMs,
    seekThresholdSeconds,
    seekInProgress: nativeSeekInProgress,
    seekSuppressPlaybackUntil: isoFromMs(seekSuppressPlaybackUntilMs)
  });
}

function suppress(reason: string): void {
  setDebug({ lastPlaybackSuppressedReason: reason });
}

function suppressSeek(reason: string): void {
  setDebug({
    lastSeekSuppressedReason: reason,
    lastPlaybackSuppressedReason: reason
  });
}

function addPlaybackListener(target: EventTarget | null, type: string, handler: EventListener, options?: AddEventListenerOptions): void {
  if (!target || typeof target.addEventListener !== "function") {
    return;
  }

  target.addEventListener(type, handler, options);
  playbackListenerCount += 1;
  updatePlaybackListenerCount();
}

function removeMediaListeners(media: HTMLMediaElement): void {
  media.removeEventListener("play", handleMediaPlay);
  media.removeEventListener("playing", handleMediaPlaying);
  media.removeEventListener("pause", handleMediaPause);
  media.removeEventListener("seeking", handleMediaSeeking);
  media.removeEventListener("seeked", handleMediaSeeked);
  media.removeEventListener("timeupdate", handleMediaTimeUpdate);
  playbackListenerCount = Math.max(0, playbackListenerCount - 6);
  updatePlaybackListenerCount();
}

function bindMediaListeners(media: HTMLMediaElement): void {
  media.addEventListener("play", handleMediaPlay);
  media.addEventListener("playing", handleMediaPlaying);
  media.addEventListener("pause", handleMediaPause);
  media.addEventListener("seeking", handleMediaSeeking);
  media.addEventListener("seeked", handleMediaSeeked);
  media.addEventListener("timeupdate", handleMediaTimeUpdate);
  playbackListenerCount += 6;
  lastStableSeconds = getMediaSeconds(media);
  updatePlaybackListenerCount();
  updateCurrentPlaybackItem(media);
}

function isEditableElement(element: Element | null): boolean {
  if (!element) {
    return false;
  }

  const tag = element.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || element.hasAttribute("contenteditable");
}

function getElementText(element: Element): string {
  return [
    element.id,
    element.className,
    element.getAttribute("aria-label"),
    element.getAttribute("title"),
    element.getAttribute("role"),
    element.getAttribute("data-action")
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
}

function getTargetLabel(target: EventTarget | null): string {
  if (!(target instanceof Element)) {
    return "";
  }

  const parts = [target.tagName.toLowerCase()];
  if (target.id) {
    parts.push("#" + target.id);
  }

  const className = typeof target.className === "string" ? target.className.trim().replace(/\s+/g, ".") : "";
  if (className) {
    parts.push("." + className.slice(0, 120));
  }

  const ariaLabel = target.getAttribute("aria-label") || target.getAttribute("title");
  if (ariaLabel) {
    parts.push("[" + ariaLabel.slice(0, 80) + "]");
  }

  return parts.join("");
}

function hasPlayerMarker(element: Element): boolean {
  return /video|media|player|playback|osd|control|seek|slider|progress|pause|play/.test(getElementText(element));
}

function getPlayerCandidate(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) {
    return null;
  }

  if (target.closest("#jellyChatRoot")) {
    return null;
  }

  if (target.closest("video,audio")) {
    return target;
  }

  if (target instanceof HTMLInputElement && target.type === "range") {
    return target;
  }

  return target.closest("button,input,[role='button'],[role='slider'],[aria-label],[title],.videoOsdBottom,.videoOsd,.osdControls,.sliderContainer,.emby-slider,.htmlvideoplayer,.videoPlayerContainer,.videoContainer");
}

function isPlayerRelatedTarget(target: EventTarget | null): boolean {
  const candidate = getPlayerCandidate(target);
  return !!(candidate && (candidate.closest("video,audio") || candidate instanceof HTMLInputElement || hasPlayerMarker(candidate)));
}

function isSeekRelatedTarget(target: EventTarget | null): boolean {
  const candidate = getPlayerCandidate(target);
  if (!candidate) {
    return false;
  }

  if (candidate.closest("video,audio")) {
    return false;
  }

  if (candidate instanceof HTMLInputElement && candidate.type === "range") {
    return true;
  }

  return /seek|slider|progress|scrub|timeline|time/.test(getElementText(candidate));
}

function isPlayPauseButtonTarget(target: EventTarget | null): boolean {
  const candidate = getPlayerCandidate(target);
  if (!candidate || candidate.closest("video,audio")) {
    return false;
  }

  const text = getElementText(candidate);
  return /(^|\s|\.|#|-)play($|\s|\.|#|-)|pause|resume/.test(text)
    && !/seek|slider|progress|scrub|timeline|time/.test(text);
}

function getPointerPoint(event: Event): { x: number; y: number } | null {
  if (event instanceof MouseEvent) {
    return { x: event.clientX, y: event.clientY };
  }

  if (event instanceof TouchEvent && event.touches.length > 0) {
    return { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }

  return null;
}

function pointHitsSelector(point: { x: number; y: number }, selector: string): boolean {
  const elementAtPoint = document.elementFromPoint(point.x, point.y);
  if (elementAtPoint && elementAtPoint.closest(selector)) {
    return true;
  }

  return Array.from(document.querySelectorAll<HTMLElement>(selector)).some((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0
      && rect.height > 0
      && point.x >= rect.left
      && point.x <= rect.right
      && point.y >= rect.top
      && point.y <= rect.bottom;
  });
}

function isAmbiguousOsdSeekIntent(event: Event): boolean {
  const point = getPointerPoint(event);
  if (!point || isPlayPauseButtonTarget(event.target)) {
    return false;
  }

  return pointHitsSelector(point, "input[type='range'],[role='slider'],progress,.sliderContainer,.emby-slider")
    || pointHitsSelector(point, ".videoOsdBottom,.videoOsdBottom-maincontrols,.osdControls");
}

function hasMediaElement(): boolean {
  return !!document.querySelector("video,audio");
}

function isVideoRoute(): boolean {
  return document.body.classList.contains("jellychat-video-route")
    || /video|details|item|watch|play/.test(window.location.href.toLowerCase())
    || hasMediaElement();
}

function markLocalInput(type: LocalInputType, target: EventTarget | null): void {
  const now = Date.now();
  lastLocalInputAt = now;
  lastLocalInputType = type;
  if (type === "seek") {
    lastLocalSeekIntentAt = now;
  } else {
    lastLocalPlayPauseIntentAt = now;
  }

  setDebug({
    lastLocalPlaybackInputAt: nowIso(),
    lastLocalPlaybackInputType: type,
    lastLocalPlaybackInputTarget: getTargetLabel(target),
    lastLocalPlayPauseIntentAt: isoFromMs(lastLocalPlayPauseIntentAt),
    lastLocalSeekIntentAt: isoFromMs(lastLocalSeekIntentAt)
  });
}

function hasRecentLocalInput(type: LocalInputType): boolean {
  const sourceAt = type === "seek" ? lastLocalSeekIntentAt : lastLocalPlayPauseIntentAt;
  const windowMs = type === "seek" ? seekIntentWindowMs : playPauseIntentWindowMs;
  return Date.now() - sourceAt <= windowMs;
}

function getSeekIntentAgeMs(): number | null {
  return lastLocalSeekIntentAt > 0 ? Date.now() - lastLocalSeekIntentAt : null;
}

function isSeekIntentExpired(): boolean {
  const age = getSeekIntentAgeMs();
  return age === null || age > seekIntentWindowMs;
}

function hasRecentStartIntent(): boolean {
  return Date.now() - lastLocalPlayPauseIntentAt <= startIntentWindowMs;
}

function hasRecentPlaybackStartNavigationIntent(): boolean {
  return Date.now() - lastPlaybackStartNavigationIntentAt <= startIntentWindowMs;
}

function hasPlaybackStartLoggedForCurrentItem(): boolean {
  return !!(currentPlaybackItemId && playbackStartLoggedForItem === currentPlaybackItemId);
}

function extendSeekPlaybackSuppression(extraMs: number): void {
  seekSuppressPlaybackUntilMs = Math.max(seekSuppressPlaybackUntilMs, Date.now() + extraMs);
  setDebug({
    seekInProgress: nativeSeekInProgress,
    seekSuppressPlaybackUntil: isoFromMs(seekSuppressPlaybackUntilMs)
  });
}

function handlePointerIntent(event: Event): void {
  if (isAmbiguousOsdSeekIntent(event)) {
    markLocalInput("seek", event.target);
    if (activeMedia) {
      setDebug({
        lastSeekCandidateFromSeconds: getMediaSeconds(activeMedia),
        lastSeekCandidateReason: "ambiguous-osd-control"
      });
    }
    return;
  }

  if (isPlayerRelatedTarget(event.target)) {
    markLocalInput(isSeekRelatedTarget(event.target) ? "seek" : "playpause", event.target);
    return;
  }

  if (!(event.target instanceof Element) || event.target.closest("#jellyChatRoot")) {
    return;
  }

  if (!hasMediaElement()) {
    lastPlaybackStartNavigationIntentAt = Date.now();
    markLocalInput("playpause", event.target);
    return;
  }

  if (isVideoRoute()) {
    markLocalInput("playpause", event.target);
  }
}

function handleRangeIntent(event: Event): void {
  if (isPlayerRelatedTarget(event.target)) {
    markLocalInput("seek", event.target);
  }
}

function handleKeyIntent(event: Event): void {
  const keyboardEvent = event as KeyboardEvent;
  if (isEditableElement(document.activeElement) || !isVideoRoute()) {
    return;
  }

  if ([" ", "Spacebar", "MediaPlayPause", "k", "K", "Enter"].includes(keyboardEvent.key)) {
    markLocalInput("playpause", event.target);
    return;
  }

  if (["ArrowLeft", "ArrowRight", "Home", "End", "j", "J", "l", "L"].includes(keyboardEvent.key)) {
    markLocalInput("seek", event.target);
  }
}

function pickActiveMedia(): HTMLMediaElement | null {
  const mediaElements = Array.from(document.querySelectorAll<HTMLMediaElement>("video,audio"));
  if (mediaElements.length === 0) {
    return null;
  }

  return mediaElements.find((media) => !media.paused && !media.ended) || mediaElements[0];
}

function getMediaSeconds(media: HTMLMediaElement): number {
  return Number.isFinite(media.currentTime) ? media.currentTime : 0;
}

function normalizeTitle(value: string): string {
  return value
    .replace(/\s*[-|]\s*Jellyfin\s*$/i, "")
    .replace(/\s*-\s*Google Chrome\s*$/i, "")
    .trim();
}

function getUrlItemId(): string {
  const urlParts = [window.location.href, window.location.hash, window.location.search];
  for (const part of urlParts) {
    const match = part.match(/(?:itemId|id)=([a-f0-9-]{24,36})/i) || part.match(/([a-f0-9]{32})/i);
    if (match && match[1]) {
      return match[1];
    }
  }

  return "";
}

function getPageTitle(): string {
  return normalizeTitle(document.querySelector<HTMLElement>(".pageTitle")?.textContent || "");
}

function resolvePlaybackItem(media: HTMLMediaElement): { itemId: string; itemName: string; hasPageTitle: boolean } {
  const pageTitle = getPageTitle();
  const itemId = getUrlItemId() || [
    media.getAttribute("data-itemid"),
    media.currentSrc,
    media.src,
    window.location.href
  ].filter(Boolean).join("|");
  const itemName = normalizeTitle(
    pageTitle
      || media.getAttribute("aria-label")
      || media.getAttribute("title")
      || document.querySelector<HTMLElement>(".itemName, .videoOsdTitle, .nowPlayingPageTitle")?.textContent
      || document.title
      || ""
  );

  return {
    itemId: itemId || "unknown:" + normalizeTitle(document.title || window.location.href),
    itemName,
    hasPageTitle: pageTitle.length > 0
  };
}

function updateCurrentPlaybackItem(media: HTMLMediaElement): { itemId: string; itemName: string; changed: boolean; hasPageTitle: boolean } {
  const item = resolvePlaybackItem(media);
  const changed = item.itemId !== currentPlaybackItemId;
  if (changed) {
    currentPlaybackItemId = item.itemId;
    currentPlaybackItemTitle = item.itemName;
    startupGuardUntilMs = Date.now() + startupGuardMs;
    setDebug({
      currentPlaybackItemId,
      currentPlaybackItemTitle,
      startupGuardUntil: isoFromMs(startupGuardUntilMs)
    });
  } else if (item.hasPageTitle && item.itemName && item.itemName !== currentPlaybackItemTitle) {
    currentPlaybackItemTitle = item.itemName;
    setDebug({
      currentPlaybackItemTitle
    });
  }

  return {
    ...item,
    changed
  };
}

function cancelPendingSeek(reason: string): void {
  if (seekTimerId !== null) {
    window.clearTimeout(seekTimerId);
    seekTimerId = null;
  }

  pendingSeekToSeconds = null;
  pendingSeekFromSeconds = null;
  nativeSeekInProgress = false;
  seekFromSeconds = null;
  setDebug({ seekInProgress: false });
  suppressSeek(reason);
}

function clearPendingPause(): void {
  if (pendingPauseTimerId !== null) {
    window.clearTimeout(pendingPauseTimerId);
    pendingPauseTimerId = null;
  }

  pendingPauseSeconds = null;
  pendingPauseItem = null;
}

function flushPendingPause(reason: string): void {
  if (pendingPauseSeconds === null || !pendingPauseItem) {
    return;
  }

  const item = pendingPauseItem;
  clearPendingPause();
  setDebug({ lastPlaybackSuppressedReason: reason });
  postPlayback({
    type: "playback.pause",
    itemId: item.itemId,
    itemName: item.itemName
  });
}

function queuePauseCandidate(media: HTMLMediaElement, item: { itemId: string; itemName: string }, flushAsPause: boolean): void {
  clearPendingPause();
  pendingPauseSeconds = getMediaSeconds(media);
  pendingPauseItem = item;
  setDebug({
    lastSeekFromSeconds: pendingPauseSeconds,
    lastSeekCandidateFromSeconds: pendingPauseSeconds,
    lastPlaybackSuppressedReason: "pause-candidate"
  });
  pendingPauseTimerId = window.setTimeout(() => {
    pendingPauseTimerId = null;
    if (flushAsPause) {
      flushPendingPause("pause-candidate-confirmed");
      return;
    }

    clearPendingPause();
    suppress("pause-suppressed-during-seek-candidate");
  }, flushAsPause ? pauseCandidateWindowMs : seekIntentWindowMs);
}

function maybeConvertPendingPauseToSeek(media: HTMLMediaElement, item: { itemId: string; itemName: string }): boolean {
  if (pendingPauseSeconds === null) {
    return false;
  }

  const toSeconds = getMediaSeconds(media);
  const deltaSeconds = Math.abs(toSeconds - pendingPauseSeconds);
  setDebug({
    lastSeekFromSeconds: pendingPauseSeconds,
    lastSeekToSeconds: toSeconds,
    lastSeekDeltaSeconds: deltaSeconds,
    lastSeekDirection: toSeconds < pendingPauseSeconds ? "backward" : "forward"
  });

  if (deltaSeconds < seekThresholdSeconds) {
    return false;
  }

  if (!hasPlaybackStartLoggedForCurrentItem()) {
    clearPendingPause();
    suppressSeek("startup-resume-before-start");
    setDebug({
      lastSeekCandidateToSeconds: toSeconds,
      lastSeekCandidateReason: "startup-resume-before-start"
    });
    return true;
  }

  const fromSeconds = pendingPauseSeconds;
  clearPendingPause();
  setDebug({
    lastSeekStartedAt: nowIso(),
    lastSeekSettledAt: nowIso(),
    lastSeekCandidateToSeconds: toSeconds,
    lastSeekCandidateReason: "resume-delta-classified-as-seek",
    lastPlaybackSuppressedReason: "resume-delta-classified-as-seek",
    lastSeekSuppressedReason: null
  });
  extendSeekPlaybackSuppression(seekDebounceMs + seekSuppressPlaybackAfterMs);
  scheduleSeekPost(fromSeconds, toSeconds);
  return true;
}

function postPlayback(request: PlaybackPostRequest): void {
  if (!postPlaybackEvent) {
    suppress("poster-missing");
    return;
  }

  const now = Date.now();
  if (request.type !== "playback.seek" && lastPostedType === request.type && now - lastPostedAt < duplicateWindowMs) {
    suppress("duplicate-" + request.type);
    return;
  }

  if (request.type === "playback.seek") {
    const roundedSecond = Math.max(0, Math.round(request.positionSeconds || 0));
    if (lastPostedSeekSecond === roundedSecond && now - lastPostedSeekAt < seekDuplicateWindowMs) {
      suppressSeek("duplicate-playback.seek");
      return;
    }
    lastPostedSeekSecond = roundedSecond;
    lastPostedSeekAt = now;
    setDebug({ lastSeekEventAt: nowIso() });
  }

  if (request.type === "playback.start") {
    playbackStartLoggedForItem = request.itemId || currentPlaybackItemId;
    startupGuardUntilMs = Date.now() + startupGuardMs;
    setDebug({
      playbackStartLoggedForItem,
      lastPlaybackStartAt: nowIso(),
      lastPlaybackStartTitle: request.itemName || currentPlaybackItemTitle || null,
      lastPlaybackStartItemId: playbackStartLoggedForItem || null,
      startupGuardUntil: isoFromMs(startupGuardUntilMs)
    });
  }

  lastPostedType = request.type;
  lastPostedAt = now;

  setDebug({
    lastPlaybackEventType: request.type,
    lastPlaybackSuppressedReason: ""
  });

  postPlaybackEvent(request).catch((error) => {
    recordError(error);
    logDebug("Failed to post playback event", error);
  });
}

function maybePostPlaybackStart(media: HTMLMediaElement, source: string): boolean {
  const item = updateCurrentPlaybackItem(media);
  if (!item.itemId || playbackStartLoggedForItem === item.itemId) {
    return false;
  }

  if (!item.hasPageTitle || !item.itemName) {
    suppress(source + "-start-title-pending");
    setDebug({
      lastPlaybackStartTitle: null,
      lastPlaybackStartItemId: item.itemId || null
    });
    return true;
  }

  const isWithinStartupGuard = Date.now() < startupGuardUntilMs;
  if (!hasRecentPlaybackStartNavigationIntent() && !(isWithinStartupGuard && hasRecentStartIntent())) {
    suppress(source + "-start-not-local");
    return true;
  }

  postPlayback({
    type: "playback.start",
    itemId: item.itemId,
    itemName: item.itemName
  });
  return true;
}

function handleStartOrPlay(media: HTMLMediaElement, source: "play" | "playing"): void {
  setDebug({ lastPlayDetectedAt: nowIso() });
  const item = updateCurrentPlaybackItem(media);
  const isWithinStartupGuard = Date.now() < startupGuardUntilMs;
  if (maybePostPlaybackStart(media, source)) {
    return;
  }

  if (isWithinStartupGuard) {
    suppress(source + "-startup-guard");
    return;
  }

  if (maybeConvertPendingPauseToSeek(media, item)) {
    return;
  }

  if (Date.now() < seekSuppressPlaybackUntilMs || nativeSeekInProgress) {
    suppress(source + "-seek-in-progress");
    return;
  }

  if (hasRecentLocalInput("seek")) {
    clearPendingPause();
    suppress(source + "-seek-candidate");
    return;
  }

  if (!hasRecentLocalInput("playpause")) {
    suppress(source + "-not-local");
    return;
  }

  flushPendingPause(source + "-resume-after-pause");

  postPlayback({
    type: "playback.play",
    itemId: item.itemId,
    itemName: item.itemName
  });
}

function handleMediaPlay(event: Event): void {
  handleStartOrPlay(event.currentTarget as HTMLMediaElement, "play");
}

function handleMediaPlaying(event: Event): void {
  handleStartOrPlay(event.currentTarget as HTMLMediaElement, "playing");
}

function handleMediaPause(event: Event): void {
  const media = event.currentTarget as HTMLMediaElement;
  setDebug({ lastPauseDetectedAt: nowIso() });

  if (!nativeSeekInProgress) {
    cancelPendingSeek("pause-without-seek");
  }

  lastStableSeconds = getMediaSeconds(media);
  if (Date.now() < startupGuardUntilMs) {
    suppress("pause-startup-guard");
    return;
  }

  if (Date.now() < seekSuppressPlaybackUntilMs || nativeSeekInProgress) {
    suppress("pause-seek-in-progress");
    return;
  }

  const item = updateCurrentPlaybackItem(media);
  if (hasRecentLocalInput("seek")) {
    extendSeekPlaybackSuppression(seekIntentWindowMs);
    queuePauseCandidate(media, item, false);
    suppress("pause-seek-candidate");
    return;
  }

  if (!hasRecentLocalInput("playpause")) {
    suppress("pause-not-local");
    return;
  }

  queuePauseCandidate(media, item, true);
}

function scheduleSeekPost(fromSeconds: number, toSeconds: number): void {
  pendingSeekFromSeconds = fromSeconds;
  pendingSeekToSeconds = toSeconds;
  if (seekTimerId !== null) {
    window.clearTimeout(seekTimerId);
  }

  seekTimerId = window.setTimeout(() => {
    seekTimerId = null;
    if (pendingSeekToSeconds === null || pendingSeekFromSeconds === null) {
      suppressSeek("seek-missing-target");
      return;
    }

    const direction = pendingSeekToSeconds < pendingSeekFromSeconds ? "backward" : "forward";
    setDebug({
      lastSeekSettledAt: nowIso(),
      lastSeekDirection: direction
    });
    const item = activeMedia ? updateCurrentPlaybackItem(activeMedia) : { itemId: currentPlaybackItemId, itemName: currentPlaybackItemTitle };
    postPlayback({
      type: "playback.seek",
      fromSeconds: pendingSeekFromSeconds,
      positionSeconds: pendingSeekToSeconds,
      itemId: item.itemId,
      itemName: item.itemName
    });
    pendingSeekToSeconds = null;
    pendingSeekFromSeconds = null;
    nativeSeekInProgress = false;
    seekFromSeconds = null;
    extendSeekPlaybackSuppression(seekSuppressPlaybackAfterMs);
    setDebug({ seekInProgress: false });
  }, seekDebounceMs);
}

function handleMediaSeeking(event: Event): void {
  const media = event.currentTarget as HTMLMediaElement;
  const currentSeconds = getMediaSeconds(media);
  updateCurrentPlaybackItem(media);
  nativeSeekInProgress = true;
  seekFromSeconds = lastStableSeconds ?? currentSeconds;

  setDebug({
    lastSeekStartedAt: nowIso(),
    lastSeekFromSeconds: seekFromSeconds,
    lastSeekIntentAgeMs: getSeekIntentAgeMs(),
    seekInProgress: true
  });

  if (isSeekIntentExpired()) {
    nativeSeekInProgress = false;
    setDebug({ seekInProgress: false });
    suppressSeek("seek-intent-expired");
    return;
  }

  if (!hasPlaybackStartLoggedForCurrentItem()) {
    nativeSeekInProgress = false;
    setDebug({ seekInProgress: false });
    suppressSeek("startup-seek-before-start");
    return;
  }

  extendSeekPlaybackSuppression(seekDebounceMs + seekSuppressPlaybackAfterMs);
}

function handleMediaSeeked(event: Event): void {
  const media = event.currentTarget as HTMLMediaElement;
  updateCurrentPlaybackItem(media);
  const toSeconds = getMediaSeconds(media);
  const fromSeconds = seekFromSeconds ?? lastStableSeconds ?? toSeconds;
  const deltaSeconds = Math.abs(toSeconds - fromSeconds);
  lastNativeSeekedAt = Date.now();
  lastStableSeconds = toSeconds;
  const seekIntentAgeMs = getSeekIntentAgeMs();

  setDebug({
    lastSeekSettledAt: nowIso(),
    lastSeekFromSeconds: fromSeconds,
    lastSeekToSeconds: toSeconds,
    lastSeekDirection: toSeconds < fromSeconds ? "backward" : "forward",
    lastSeekDeltaSeconds: deltaSeconds,
    lastSeekIntentAgeMs: seekIntentAgeMs,
    seekInProgress: nativeSeekInProgress
  });

  if (deltaSeconds < seekThresholdSeconds) {
    nativeSeekInProgress = false;
    seekFromSeconds = null;
    setDebug({ seekInProgress: false });
    suppressSeek("below-threshold");
    return;
  }

  if (!hasPlaybackStartLoggedForCurrentItem()) {
    nativeSeekInProgress = false;
    seekFromSeconds = null;
    setDebug({ seekInProgress: false });
    suppressSeek("startup-seeked-before-start");
    return;
  }

  if (Date.now() < startupGuardUntilMs) {
    nativeSeekInProgress = false;
    seekFromSeconds = null;
    setDebug({ seekInProgress: false });
    suppressSeek("seeked-startup-guard");
    return;
  }

  if (isSeekIntentExpired()) {
    nativeSeekInProgress = false;
    seekFromSeconds = null;
    setDebug({ seekInProgress: false });
    suppressSeek("seek-intent-expired");
    return;
  }

  extendSeekPlaybackSuppression(seekDebounceMs + seekSuppressPlaybackAfterMs);
  scheduleSeekPost(fromSeconds, toSeconds);
}

function handleMediaTimeUpdate(event: Event): void {
  const media = event.currentTarget as HTMLMediaElement;
  updateCurrentPlaybackItem(media);
  const currentSeconds = getMediaSeconds(media);
  const previousSeconds = lastStableSeconds;
  lastStableSeconds = currentSeconds;

  if (nativeSeekInProgress || !hasRecentLocalInput("seek") || Date.now() - lastNativeSeekedAt < playPauseIntentWindowMs) {
    return;
  }

  if (previousSeconds === null || Math.abs(currentSeconds - previousSeconds) < seekThresholdSeconds) {
    return;
  }

  if (!hasPlaybackStartLoggedForCurrentItem()) {
    suppressSeek("startup-timeupdate-before-start");
    return;
  }

  if (Date.now() < startupGuardUntilMs) {
    suppressSeek("timeupdate-startup-guard");
    return;
  }

  setDebug({
    lastSeekStartedAt: nowIso(),
    lastSeekSettledAt: nowIso(),
    lastSeekFromSeconds: previousSeconds,
    lastSeekToSeconds: currentSeconds,
    lastSeekDirection: currentSeconds < previousSeconds ? "backward" : "forward",
    lastSeekDeltaSeconds: Math.abs(currentSeconds - previousSeconds),
    lastSeekIntentAgeMs: getSeekIntentAgeMs()
  });
  extendSeekPlaybackSuppression(seekDebounceMs + seekSuppressPlaybackAfterMs);
  scheduleSeekPost(previousSeconds, currentSeconds);
}

export function scanPlaybackTarget(): void {
  const nextMedia = pickActiveMedia();
  if (nextMedia === activeMedia) {
    if (activeMedia) {
      updateCurrentPlaybackItem(activeMedia);
      if (!activeMedia.paused && !activeMedia.ended) {
        maybePostPlaybackStart(activeMedia, "scan");
      }
    }
    return;
  }

  if (activeMedia) {
    removeMediaListeners(activeMedia);
  }

  activeMedia = nextMedia;
  if (activeMedia) {
    bindMediaListeners(activeMedia);
    if (!activeMedia.paused && !activeMedia.ended) {
      maybePostPlaybackStart(activeMedia, "scan");
    }
  }
}

export function installPlaybackActionLogging(poster: PlaybackPoster): void {
  postPlaybackEvent = poster;
  setDebug({ seekDebounceMs });

  if (window.__JELLYCHAT_PLAYBACK_LISTENERS_BOUND__) {
    scanPlaybackTarget();
    return;
  }

  addPlaybackListener(document, "pointerdown", handlePointerIntent, { capture: true, passive: true });
  addPlaybackListener(document, "click", handlePointerIntent, { capture: true, passive: true });
  addPlaybackListener(document, "touchstart", handlePointerIntent, { capture: true, passive: true });
  addPlaybackListener(document, "keydown", handleKeyIntent, { capture: true });
  addPlaybackListener(document, "input", handleRangeIntent, { capture: true, passive: true });
  addPlaybackListener(document, "change", handleRangeIntent, { capture: true, passive: true });
  addPlaybackListener(document, "pointerup", handleRangeIntent, { capture: true, passive: true });
  window.__JELLYCHAT_PLAYBACK_LISTENERS_BOUND__ = true;
  scanPlaybackTarget();
}
