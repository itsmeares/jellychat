import type { ChatMessage, MessageGroupModel } from "../types";

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
export const refreshIntervalMs = 2000;
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

function getMessageTime(message: ChatMessage): number {
  const createdAt = new Date(message.createdAtUtc);
  const ticks = createdAt.getTime();
  return Number.isNaN(ticks) ? 0 : ticks;
}

function getMessageSenderKey(message: ChatMessage): string {
  return message.userId ? "id:" + message.userId : "name:" + message.userName;
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
        key: message.id,
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
