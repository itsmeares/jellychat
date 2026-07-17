import type { ReactionEvent, ReactionOverlayItem, RoomEvent } from "../types";

type Subscriber = (items: ReactionOverlayItem[]) => void;

const overlayDurationMinMs = 2250;
const overlayDurationMaxMs = 2850;
const hardOverlayCap = 120;
const baseOverlayCap = 40;
const participantOverlayStep = 20;
const finishingWindowMs = 420;
const subscribers = new Set<Subscriber>();

let overlays: ReactionOverlayItem[] = [];
let cleanupTimer = 0;
let participantCount = 1;

function nowIso(): string {
  return new Date().toISOString();
}

function getOverlayMax(): number {
  return Math.min(hardOverlayCap, baseOverlayCap + Math.max(0, participantCount - 1) * participantOverlayStep);
}

function updateDebug(reason?: string): void {
  if (!window.JellyChatDebug) {
    return;
  }

  window.JellyChatDebug.reactionOverlayCount = overlays.length;
  window.JellyChatDebug.reactionOverlayMax = getOverlayMax();
  if (reason) {
    window.JellyChatDebug.lastReactionDroppedReason = reason;
  }
}

function emit(reason?: string): void {
  updateDebug(reason);
  const snapshot = overlays.slice();
  subscribers.forEach((subscriber) => subscriber(snapshot));
}

function cleanupExpired(): void {
  const now = Date.now();
  const next = overlays.filter((item) => item.expiresAtMs > now);
  if (next.length !== overlays.length) {
    overlays = next;
    emit();
  }
}

function scheduleCleanup(): void {
  if (cleanupTimer) {
    window.clearTimeout(cleanupTimer);
  }

  const nextExpiry = overlays.reduce((min, item) => Math.min(min, item.expiresAtMs), Number.POSITIVE_INFINITY);
  if (!Number.isFinite(nextExpiry)) {
    cleanupTimer = 0;
    return;
  }

  cleanupTimer = window.setTimeout(() => {
    cleanupTimer = 0;
    cleanupExpired();
    scheduleCleanup();
  }, Math.max(120, nextExpiry - Date.now() + 80));
}

export function subscribeReactionOverlays(subscriber: Subscriber): () => void {
  subscribers.add(subscriber);
  subscriber(overlays.slice());
  return () => subscribers.delete(subscriber);
}

export function clearReactionOverlays(): void {
  if (overlays.length === 0) {
    return;
  }

  overlays = [];
  emit("room-access-cleared");
}

export function setReactionParticipantCount(count: number): void {
  participantCount = Math.max(1, Math.floor(Number.isFinite(count) ? count : 1));
  updateDebug();
}

function isJellyChatElement(element: Element | null): boolean {
  return !!(element && element.closest("#jellyChatRoot,[data-jellychat-root],[data-jellychat-drawer],[data-jellychat-host]"));
}

function rectFromVideo(): DOMRect | null {
  const videos = Array.from(document.querySelectorAll<HTMLVideoElement>("video"))
    .filter((video) => !isJellyChatElement(video))
    .map((video) => video.getBoundingClientRect())
    .filter((rect) => rect.width > 80 && rect.height > 80);

  return videos.sort((left, right) => right.width * right.height - left.width * left.height)[0] || null;
}

function rectFromSafeHost(): DOMRect | null {
  const fullscreenHost = document.fullscreenElement;
  if (fullscreenHost && typeof fullscreenHost.getBoundingClientRect === "function") {
    const rect = fullscreenHost.getBoundingClientRect();
    if (rect.width > 80 && rect.height > 80) {
      return rect;
    }
  }

  const isVideoRoute = !!(document.body?.classList.contains("jellychat-video-route") || window.JellyChatDebug?.videoRoute);
  if (!isVideoRoute) {
    return null;
  }

  return new DOMRect(0, 0, window.innerWidth || document.documentElement.clientWidth, window.innerHeight || document.documentElement.clientHeight);
}

function getOverlayBounds(): { left: number; right: number; top: number; bottom: number; width: number; height: number } | null {
  const rawRect = rectFromVideo() || rectFromSafeHost();
  if (!rawRect) {
    return null;
  }

  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || rawRect.right;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || rawRect.bottom;
  const leftInset = Math.max(0, Number(window.JellyChatDebug?.leftInset || 0));
  const rightInset = Math.max(0, Number(window.JellyChatDebug?.rightInset || 0));
  const left = Math.max(0, rawRect.left, leftInset);
  const right = Math.min(viewportWidth, rawRect.right, viewportWidth - rightInset);
  const top = Math.max(0, rawRect.top);
  const bottom = Math.min(viewportHeight, rawRect.bottom);
  const width = right - left;
  const height = bottom - top;

  if (width < 72 || height < 96) {
    return null;
  }

  return { left, right, top, bottom, width, height };
}

function prefersReducedMotion(): boolean {
  return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

function createOverlayItem(reaction: ReactionEvent): ReactionOverlayItem | null {
  const bounds = getOverlayBounds();
  if (!bounds) {
    updateDebug("no-safe-overlay-host");
    return null;
  }

  const reducedMotion = prefersReducedMotion();
  const durationMs = reducedMotion
    ? 900
    : overlayDurationMinMs + Math.round(Math.random() * (overlayDurationMaxMs - overlayDurationMinMs));
  const horizontalPadding = Math.min(42, Math.max(18, bounds.width * 0.08));
  const leftMin = bounds.left + horizontalPadding;
  const leftMax = bounds.right - horizontalPadding;
  const startLeft = leftMin + Math.random() * Math.max(1, leftMax - leftMin);
  const startTop = bounds.bottom - Math.max(58, bounds.height * 0.16) + (Math.random() * 26 - 13);
  const rise = Math.min(
    Math.max(170, bounds.height - 72),
    Math.max(220, bounds.height * (0.7 + Math.random() * 0.1))
  );

  return {
    id: reaction.clientEventId + ":" + Date.now() + ":" + Math.random().toString(36).slice(2),
    emoji: reaction.emoji,
    clientEventId: reaction.clientEventId,
    createdAtMs: Date.now(),
    expiresAtMs: Date.now() + durationMs,
    left: Math.round(startLeft),
    top: Math.round(Math.max(bounds.top + 24, Math.min(bounds.bottom - 44, startTop))),
    dx: reducedMotion ? 0 : Math.round(Math.random() * 56 - 28),
    rise: reducedMotion ? 18 : Math.round(rise),
    durationMs,
    scale: reducedMotion ? 1 : 0.8 + Math.random() * 0.4,
    reducedMotion
  };
}

function makeRoomReaction(event: RoomEvent): ReactionEvent {
  return {
    emoji: event.emoji,
    clientEventId: event.clientEventId || event.eventKey,
    userId: event.userId,
    userName: event.userName,
    groupId: event.groupId,
    itemId: event.itemId,
    itemName: event.itemName,
    positionSeconds: event.positionSeconds,
    createdAtUtc: event.createdAtUtc
  };
}

function reserveOverlaySlot(now: number): boolean {
  const max = getOverlayMax();
  overlays = overlays.filter((item) => item.expiresAtMs > now);
  while (overlays.length >= max) {
    const finishingIndex = overlays.findIndex((item) => item.expiresAtMs - now <= finishingWindowMs);
    if (finishingIndex === -1) {
      updateDebug("capacity");
      return false;
    }

    overlays.splice(finishingIndex, 1);
    updateDebug("pruned-finishing");
  }

  return true;
}

export function addReactionOverlay(reaction: ReactionEvent): boolean {
  const emoji = reaction.emoji.trim();
  if (!emoji) {
    updateDebug("missing-emoji");
    return false;
  }

  const now = Date.now();
  if (!reserveOverlaySlot(now)) {
    emit();
    return false;
  }

  const item = createOverlayItem({ ...reaction, emoji });
  if (!item) {
    emit();
    return false;
  }

  overlays = overlays.concat(item);
  if (window.JellyChatDebug) {
    window.JellyChatDebug.lastReactionEmoji = emoji;
    window.JellyChatDebug.lastReactionClientEventId = reaction.clientEventId || null;
    window.JellyChatDebug.lastReactionDroppedReason = null;
  }
  emit();
  scheduleCleanup();
  return true;
}

export function addRoomReactionOverlay(event: RoomEvent): boolean {
  return addReactionOverlay(makeRoomReaction(event));
}

export function recordReactionReceived(event: RoomEvent): void {
  if (!window.JellyChatDebug) {
    return;
  }

  window.JellyChatDebug.reactionEventCount = Number(window.JellyChatDebug.reactionEventCount || 0) + 1;
  window.JellyChatDebug.lastReactionEmoji = event.emoji || null;
  window.JellyChatDebug.lastReactionReceivedAt = nowIso();
  window.JellyChatDebug.lastReactionClientEventId = event.clientEventId || null;
}
