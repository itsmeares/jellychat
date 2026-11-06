import type { PlaybackAction, ReplyTarget, RoomEvent, RoomInfo, ServerConfig, SyncResponse } from "./types";

type Bag = Record<string, unknown>;

export function normalizeId(value: string): string {
  return value.replace(/-/g, "").toLowerCase();
}

function bag(value: unknown): Bag {
  return value && typeof value === "object" ? (value as Bag) : {};
}

function pick(source: Bag, pascal: string): unknown {
  if (pascal in source) {
    return source[pascal];
  }
  const camel = pascal.charAt(0).toLowerCase() + pascal.slice(1);
  return source[camel];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function nullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function nullableBool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function normalizeReply(value: unknown): ReplyTarget | null {
  const source = bag(value);
  const eventId = text(pick(source, "EventId")).trim();
  const messagePreview = text(pick(source, "MessagePreview")).trim();
  if (!eventId || !messagePreview) {
    return null;
  }
  return {
    eventId,
    userId: text(pick(source, "UserId")).trim(),
    userName: text(pick(source, "UserName")).trim() || "Someone",
    messagePreview,
    createdAt: text(pick(source, "CreatedAt")).trim()
  };
}

export function normalizeEvent(value: unknown): RoomEvent {
  const source = bag(value);
  const action = text(pick(source, "PlaybackAction"));
  return {
    id: text(pick(source, "Id")),
    sequence: nullableNumber(pick(source, "Sequence")) ?? 0,
    type: text(pick(source, "Type")),
    userId: normalizeId(text(pick(source, "UserId"))),
    userName: text(pick(source, "UserName")),
    createdAt: text(pick(source, "CreatedAtUtc")),
    text: text(pick(source, "Text")),
    replyTo: normalizeReply(pick(source, "ReplyTo")),
    emoji: text(pick(source, "Emoji")),
    playbackAction: oneOf<PlaybackAction | "">(action, ["start", "play", "pause", "seek", ""], ""),
    fromTicks: nullableNumber(pick(source, "FromPositionTicks")),
    toTicks: nullableNumber(pick(source, "ToPositionTicks")),
    positionSeconds: nullableNumber(pick(source, "PositionSeconds")),
    itemName: text(pick(source, "ItemName")),
    clientEventId: text(pick(source, "ClientEventId")),
    isTyping: nullableBool(pick(source, "IsTyping"))
  };
}

export function normalizeRoom(value: unknown): RoomInfo {
  const source = bag(value);
  const participants = pick(source, "Participants");
  return {
    inGroup: bool(pick(source, "InGroup"), false),
    groupId: text(pick(source, "GroupId")),
    groupName: text(pick(source, "GroupName")),
    sessionId: text(pick(source, "SessionId")),
    participants: Array.isArray(participants) ? participants.map(text).filter(Boolean) : [],
    passwordProtected: bool(pick(source, "PasswordProtected"), false),
    authorized: bool(pick(source, "Authorized"), false),
    isOwner: bool(pick(source, "IsOwner"), false)
  };
}

export function normalizeSync(value: unknown): SyncResponse {
  const source = bag(value);
  const events = pick(source, "Events");
  return {
    room: normalizeRoom(pick(source, "Room")),
    events: Array.isArray(events) ? events.map(normalizeEvent) : [],
    roomVersion: text(pick(source, "RoomVersion"))
  };
}

export const defaultServerConfig: ServerConfig = {
  theme: "violet",
  layout: "docked",
  messageSide: "left",
  messageStyle: "bubbles",
  autoHide: true,
  shortcutEnabled: true,
  allowUserAppearance: true,
  customBase: "violet",
  customCorners: "soft",
  customGlass: false
};

export function normalizeServerConfig(value: unknown): ServerConfig {
  const source = bag(value);
  const fallback = defaultServerConfig;
  return {
    theme: oneOf(pick(source, "Theme"), ["violet", "glass", "custom"], fallback.theme),
    layout: oneOf(pick(source, "Layout"), ["docked", "floating"], fallback.layout),
    messageSide: oneOf(pick(source, "MessageSide"), ["left", "right"], fallback.messageSide),
    messageStyle: oneOf(pick(source, "MessageStyle"), ["bubbles", "flat"], fallback.messageStyle),
    autoHide: bool(pick(source, "AutoHide"), fallback.autoHide),
    shortcutEnabled: bool(pick(source, "ShortcutEnabled"), fallback.shortcutEnabled),
    allowUserAppearance: bool(pick(source, "AllowUserAppearance"), fallback.allowUserAppearance),
    customBase: oneOf(pick(source, "CustomBase"), ["violet", "glass"], fallback.customBase),
    customCorners: oneOf(pick(source, "CustomCorners"), ["sharp", "soft", "pill"], fallback.customCorners),
    customGlass: bool(pick(source, "CustomGlass"), fallback.customGlass)
  };
}
