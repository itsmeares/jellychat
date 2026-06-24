import type { ChatMessage, MessageGroupModel, PlaybackEventType, PlaybackTimelineItem, RoomEvent, TimelineItem } from "../types";

export const rootId = "jellyChatRoot";
export const buttonId = "jellyChatButton";
export const markerClass = "jellyChatButton";
export const floatingHostId = "jellyChatFloatingHost";
export const drawerId = "jellyChatDrawer";
export const titleId = "jellyChatTitle";
export const closeButtonId = "jellyChatCloseButton";
export const sideToggleButtonId = "jellyChatSideToggleButton";
export const statusId = "jellyChatStatus";
export const messagesId = "jellyChatMessages";
export const emptyStateId = "jellyChatEmptyState";
export const formId = "jellyChatForm";
export const inputId = "jellyChatInput";
export const sendButtonId = "jellyChatSendButton";
export const refreshIntervalMs = 850;
export const groupingWindowMs = 5 * 60 * 1000;
export const drawerWidthPx = 340;
export const mobileLayoutMaxWidthPx = 899;

export function summarizeError(error: unknown): string {
  if (!error) {
    return "Unknown error";
  }

  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "object") {
    const candidate = error as Record<string, unknown>;
    if (candidate.status || candidate.statusText) {
      return "HTTP " + (candidate.status || "unknown") + " " + String(candidate.statusText || "").trim();
    }

    if (candidate.responseText) {
      return String(candidate.responseText).slice(0, 500);
    }

    try {
      return JSON.stringify(error).slice(0, 500);
    } catch {
      return "Unserializable error object";
    }
  }

  return String(error);
}

export function recordError(error: unknown): void {
  if (window.JellyChatDebug) {
    window.JellyChatDebug.lastError = summarizeError(error);
  }
}

export function logDebug(message: string, details?: unknown): void {
  if (details instanceof Error || (details && typeof details === "object" && "error" in details)) {
    recordError(details instanceof Error ? details : (details as { error: unknown }).error);
  }

  if (!window.console || typeof window.console.log !== "function") {
    return;
  }

  if (details === undefined) {
    window.console.log("[JellyChat]", message);
    return;
  }

  window.console.log("[JellyChat]", message, details);
}

export function normalizeId(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function getValue(source: unknown, pascalName: string, camelName: string): unknown {
  if (!source || typeof source !== "object") {
    return "";
  }

  const record = source as Record<string, unknown>;
  if (record[pascalName] !== undefined && record[pascalName] !== null) {
    return record[pascalName];
  }

  if (record[camelName] !== undefined && record[camelName] !== null) {
    return record[camelName];
  }

  return "";
}

export function isUsableDisplayName(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();
  return trimmed.length > 0
    && trimmed.toLowerCase() !== "true"
    && trimmed.toLowerCase() !== "false";
}

export function createClientEventId(): string {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return String(Date.now()) + "-" + Math.random().toString(36).slice(2);
}

export function formatMessageTime(message: { createdAtUtc: string }): string {
  if (!message.createdAtUtc) {
    return "";
  }

  const createdAt = new Date(message.createdAtUtc);
  if (Number.isNaN(createdAt.getTime())) {
    return "";
  }

  return createdAt.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function coerceTicks(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function formatPlaybackPosition(ticks: number | null): string {
  if (ticks === null || !Number.isFinite(ticks) || ticks < 0) {
    return "0:00";
  }

  const totalSeconds = Math.max(0, Math.round(ticks / 10000000));
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const paddedSeconds = String(seconds).padStart(2, "0");

  if (hours > 0) {
    return hours + ":" + String(minutes).padStart(2, "0") + ":" + paddedSeconds;
  }

  return totalMinutes + ":" + paddedSeconds;
}

export function getPlaybackMessage(item: PlaybackTimelineItem): string {
  const userName = isUsableDisplayName(item.userName) ? item.userName.trim() : "Someone";
  if (item.type === "playback.start") {
    return item.itemName
      ? userName + " started playing " + item.itemName
      : userName + " started playback";
  }

  if (item.type === "playback.pause") {
    return userName + " paused";
  }

  if (item.type === "playback.play") {
    return userName + " resumed";
  }

  const verb = item.fromPositionTicks !== null
    && item.toPositionTicks !== null
    && item.toPositionTicks < item.fromPositionTicks
    ? " jumped back to "
    : " jumped to ";
  return userName + verb + formatPlaybackPosition(item.toPositionTicks);
}

function getMessageTime(message: ChatMessage): number {
  const createdAt = new Date(message.createdAtUtc);
  const ticks = createdAt.getTime();
  return Number.isNaN(ticks) ? 0 : ticks;
}

function getMessageSenderKey(message: ChatMessage): string {
  return message.userId ? "id:" + message.userId : "name:" + message.userName;
}

function createChatMessage(event: RoomEvent): ChatMessage | null {
  if (event.type !== "chat.message" || !event.id || !event.text) {
    return null;
  }

  return {
    id: event.id,
    sequence: event.sequence,
    groupId: event.groupId,
    userId: event.userId,
    userName: isUsableDisplayName(event.userName) ? event.userName.trim() : "Someone",
    text: event.text,
    createdAtUtc: event.createdAtUtc,
    eventKey: event.eventKey
  };
}

function isPlaybackEventType(value: string): value is PlaybackEventType {
  return value === "playback.start" || value === "playback.play" || value === "playback.pause" || value === "playback.seek";
}

function createPlaybackTimelineItem(event: RoomEvent): PlaybackTimelineItem | null {
  if (!isPlaybackEventType(event.type) || !event.id) {
    return null;
  }

  return {
    kind: "playback",
    key: event.eventKey,
    id: event.id,
    sequence: event.sequence,
    type: event.type,
    userName: isUsableDisplayName(event.userName) ? event.userName.trim() : "Someone",
    createdAtUtc: event.createdAtUtc,
    fromPositionTicks: coerceTicks(event.fromPositionTicks),
    toPositionTicks: coerceTicks(event.toPositionTicks),
    itemId: event.itemId,
    itemName: event.itemName,
    eventKey: event.eventKey
  };
}

export function groupMessages(messages: ChatMessage[], windowMs: number): MessageGroupModel[] {
  const sortedMessages = messages.slice().sort((left, right) => getMessageTime(left) - getMessageTime(right));
  const groups: MessageGroupModel[] = [];

  sortedMessages.forEach((message) => {
    const previousGroup = groups.length > 0 ? groups[groups.length - 1] : null;
    const previousMessage = previousGroup && previousGroup.messages.length > 0
      ? previousGroup.messages[previousGroup.messages.length - 1]
      : null;
    const senderKey = getMessageSenderKey(message);
    const messageTime = getMessageTime(message);
    const previousMessageTime = previousMessage ? getMessageTime(previousMessage) : 0;
    const shouldStartGroup = !previousMessage
      || previousGroup?.senderKey !== senderKey
      || Math.abs(messageTime - previousMessageTime) > windowMs;

    if (shouldStartGroup) {
      groups.push({
        key: message.eventKey,
        senderKey,
        userName: message.userName,
        createdAtUtc: message.createdAtUtc,
        messages: [message]
      });
      return;
    }

    previousGroup.messages.push(message);
  });

  return groups;
}

export function buildTimelineItems(events: RoomEvent[], windowMs: number): TimelineItem[] {
  const items: TimelineItem[] = [];
  let currentGroup: MessageGroupModel | null = null;

  const pushGroup = (): void => {
    if (currentGroup) {
      items.push({
        kind: "messageGroup",
        key: currentGroup.key,
        group: currentGroup
      });
      currentGroup = null;
    }
  };

  events
    .slice()
    .sort((left, right) => {
      const leftSequence = Number(left.sequence || 0);
      const rightSequence = Number(right.sequence || 0);
      return leftSequence !== rightSequence
        ? leftSequence - rightSequence
        : String(left.createdAtUtc).localeCompare(String(right.createdAtUtc));
    })
    .forEach((event) => {
      const message = createChatMessage(event);
      if (message) {
        const previousMessage = currentGroup && currentGroup.messages.length > 0
          ? currentGroup.messages[currentGroup.messages.length - 1]
          : null;
        const senderKey = getMessageSenderKey(message);
        const shouldStartGroup = !previousMessage
          || currentGroup?.senderKey !== senderKey
          || Math.abs(getMessageTime(message) - getMessageTime(previousMessage)) > windowMs;

        if (shouldStartGroup) {
          pushGroup();
          currentGroup = {
            key: message.eventKey,
            senderKey,
            userName: message.userName,
            createdAtUtc: message.createdAtUtc,
            messages: [message]
          };
          return;
        }

        if (currentGroup) {
          currentGroup.messages.push(message);
        }
        return;
      }

      const playbackItem = createPlaybackTimelineItem(event);
      if (playbackItem) {
        pushGroup();
        items.push(playbackItem);
      }
    });

  pushGroup();
  return items;
}

export function countDebugNodes(): void {
  if (!window.JellyChatDebug) {
    return;
  }

  window.JellyChatDebug.rootCount = document.querySelectorAll("[data-jellychat-root]").length;
  window.JellyChatDebug.buttonCount = document.querySelectorAll("[data-jellychat-button]").length;
}

export function cleanupDuplicateRoots(preferredHost: HTMLElement): HTMLElement | null {
  const roots = Array.from(document.querySelectorAll<HTMLElement>("[data-jellychat-root]"));
  if (roots.length <= 1) {
    countDebugNodes();
    return roots[0] || null;
  }

  logDebug("Duplicate JellyChat roots detected; removing stale roots.", { rootCount: roots.length });
  const activeRoot = roots.find((root) => root.querySelector("[data-jellychat-button]") || root.querySelector("#" + drawerId))
    || roots.find((root) => root.id === rootId)
    || roots[0];

  roots.forEach((root) => {
    if (root === activeRoot) {
      return;
    }

    if (root.contains(activeRoot)) {
      root.parentElement?.insertBefore(activeRoot, root);
    }

    root.remove();
  });

  if (!activeRoot.isConnected) {
    preferredHost.appendChild(activeRoot);
  }

  activeRoot.id = rootId;
  activeRoot.setAttribute("data-jellychat-root", "true");
  countDebugNodes();
  return activeRoot;
}

export function waitForStylesheet(): Promise<void> {
  const link = document.querySelector<HTMLLinkElement>('link[data-jellychat-style="true"]');
  if (!link) {
    return Promise.resolve();
  }

  if ((link as HTMLLinkElement).sheet) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      recordError("JellyChat stylesheet load timed out.");
      resolve();
    }, 2500);

    link.addEventListener("load", () => {
      window.clearTimeout(timeout);
      resolve();
    }, { once: true });

    link.addEventListener("error", () => {
      window.clearTimeout(timeout);
      recordError("JellyChat stylesheet failed to load.");
      resolve();
    }, { once: true });
  });
}
