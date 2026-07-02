import type { ChatMessage, PlaybackEventType, ReplyTarget, RoomEvent } from "../types";
import { fetchJson, postJson } from "./jellyfin";
import { createClientEventId, getValue, isUsableDisplayName } from "../runtime/util";

export function normalizeRoomEvent(roomEvent: unknown): RoomEvent {
  const type = String(getValue(roomEvent, "Type", "type") || "");
  const sequence = Number(getValue(roomEvent, "Sequence", "sequence") || 0);
  const id = String(getValue(roomEvent, "Id", "id") || "");
  const clientEventId = String(getValue(roomEvent, "ClientEventId", "clientEventId") || "");

  return {
    id,
    sequence: Number.isFinite(sequence) ? sequence : 0,
    groupId: String(getValue(roomEvent, "GroupId", "groupId") || ""),
    type,
    userId: String(getValue(roomEvent, "UserId", "userId") || ""),
    userName: String(getValue(roomEvent, "UserName", "userName") || ""),
    sessionId: String(getValue(roomEvent, "SessionId", "sessionId") || ""),
    createdAtUtc: String(getValue(roomEvent, "CreatedAtUtc", "createdAtUtc") || ""),
    text: String(getValue(roomEvent, "Text", "text") || ""),
    replyTo: normalizeReplyTarget(getValue(roomEvent, "ReplyTo", "replyTo")),
    emoji: String(getValue(roomEvent, "Emoji", "emoji") || ""),
    playbackAction: String(getValue(roomEvent, "PlaybackAction", "playbackAction") || ""),
    fromPositionTicks: getValue(roomEvent, "FromPositionTicks", "fromPositionTicks"),
    toPositionTicks: getValue(roomEvent, "ToPositionTicks", "toPositionTicks"),
    positionSeconds: normalizeNullableNumber(getValue(roomEvent, "PositionSeconds", "positionSeconds")),
    itemId: String(getValue(roomEvent, "ItemId", "itemId") || ""),
    itemName: String(getValue(roomEvent, "ItemName", "itemName") || ""),
    clientEventId,
    eventKey: clientEventId ? "client:" + clientEventId : (sequence > 0 ? "sequence:" + sequence : "id:" + id),
    isTyping: normalizeNullableBoolean(getValue(roomEvent, "IsTyping", "isTyping"))
  };
}

function normalizeReplyTarget(value: unknown): ReplyTarget | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const eventId = String(getValue(value, "EventId", "eventId") || "").trim();
  const messagePreview = String(getValue(value, "MessagePreview", "messagePreview") || "").trim();
  if (!eventId || !messagePreview) {
    return null;
  }

  return {
    eventId,
    userId: String(getValue(value, "UserId", "userId") || "").trim(),
    userName: String(getValue(value, "UserName", "userName") || "").trim() || "Someone",
    messagePreview,
    createdAt: String(getValue(value, "CreatedAt", "createdAt") || "").trim()
  };
}

function normalizeNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeNullableBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }

  return null;
}

export function normalizeEventsResponse(response: unknown): RoomEvent[] {
  if (Array.isArray(response)) {
    return response
      .map(normalizeRoomEvent)
      .filter((event) => event.id && event.sequence > 0);
  }

  if (response && typeof response === "object" && Array.isArray((response as { Items?: unknown[] }).Items)) {
    return normalizeEventsResponse((response as { Items: unknown[] }).Items);
  }

  if (response && typeof response === "object" && Array.isArray((response as { items?: unknown[] }).items)) {
    return normalizeEventsResponse((response as { items: unknown[] }).items);
  }

  return [];
}

export function normalizeChatMessage(roomEvent: unknown): ChatMessage | null {
  const event = normalizeRoomEvent(roomEvent);
  if (event.type !== "chat.message") {
    return null;
  }

  return {
    id: event.id,
    sequence: event.sequence,
    groupId: event.groupId,
    userId: event.userId,
    userName: isUsableDisplayName(event.userName) ? event.userName.trim() : "Someone",
    text: event.text,
    replyTo: event.replyTo,
    createdAtUtc: event.createdAtUtc,
    eventKey: event.eventKey
  };
}

export async function getEvents(groupId: string, afterSequence: number, limit: number, forceFull: boolean): Promise<RoomEvent[]> {
  let path = "JellyChat/Events?groupId=" + encodeURIComponent(groupId) + "&limit=" + encodeURIComponent(String(limit));
  if (!forceFull && afterSequence > 0) {
    path += "&afterSequence=" + encodeURIComponent(String(afterSequence));
  }

  return normalizeEventsResponse(await fetchJson(path));
}

function normalizePostResponse(response: unknown): unknown {
  let normalized = response;
  if (typeof normalized === "string") {
    try {
      normalized = JSON.parse(normalized);
    } catch {
      normalized = null;
    }
  }

  if (normalized && typeof normalized === "object" && "responseJSON" in normalized) {
    normalized = (normalized as { responseJSON?: unknown }).responseJSON;
  }

  return normalized;
}

export async function postChatMessage(args: {
  groupId: string;
  senderSessionId: string;
  text: string;
  participants: string[];
  clientEventId?: string;
  replyTo?: ReplyTarget | null;
}): Promise<ChatMessage | null> {
  const payload: Record<string, unknown> = {
    GroupId: args.groupId || "",
    SenderSessionId: args.senderSessionId || "",
    Type: "chat.message",
    Text: args.text,
    ClientEventId: args.clientEventId || createClientEventId(),
    ParticipantsCsv: args.participants.join(",")
  };

  if (args.replyTo) {
    payload.ReplyTo = {
      EventId: args.replyTo.eventId,
      UserId: args.replyTo.userId,
      UserName: args.replyTo.userName,
      MessagePreview: args.replyTo.messagePreview,
      CreatedAt: args.replyTo.createdAt
    };
  }

  const response = await postJson("JellyChat/Events", payload, true);

  const normalized = normalizePostResponse(response);
  return normalized ? normalizeChatMessage(normalized) : null;
}

export async function postPlaybackEvent(args: {
  groupId: string;
  senderSessionId: string;
  type: PlaybackEventType;
  participants: string[];
  fromPositionTicks?: number;
  toPositionTicks?: number;
  itemId?: string;
  itemName?: string;
  clientEventId?: string;
}): Promise<RoomEvent | null> {
  const payload: Record<string, unknown> = {
    GroupId: args.groupId || "",
    SenderSessionId: args.senderSessionId || "",
    Type: args.type,
    PlaybackAction: args.type.replace("playback.", ""),
    ClientEventId: args.clientEventId || createClientEventId(),
    ParticipantsCsv: args.participants.join(",")
  };

  if (typeof args.fromPositionTicks === "number") {
    payload.FromPositionTicks = args.fromPositionTicks;
  }

  if (args.type === "playback.seek" && typeof args.toPositionTicks === "number") {
    payload.ToPositionTicks = args.toPositionTicks;
  }

  if (args.itemId) {
    payload.ItemId = args.itemId;
  }

  if (args.itemName) {
    payload.ItemName = args.itemName;
  }

  const normalized = normalizePostResponse(await postJson("JellyChat/Events", payload, true));
  return normalized ? normalizeRoomEvent(normalized) : null;
}

export async function postEmojiReaction(args: {
  groupId: string;
  senderSessionId: string;
  emoji: string;
  participants: string[];
  itemId?: string;
  itemName?: string;
  positionSeconds?: number;
  clientEventId?: string;
}): Promise<RoomEvent | null> {
  const payload: Record<string, unknown> = {
    GroupId: args.groupId || "",
    SenderSessionId: args.senderSessionId || "",
    Type: "reaction.emoji",
    Emoji: args.emoji,
    ClientEventId: args.clientEventId || createClientEventId(),
    ParticipantsCsv: args.participants.join(",")
  };

  if (args.itemId) {
    payload.ItemId = args.itemId;
  }

  if (args.itemName) {
    payload.ItemName = args.itemName;
  }

  if (typeof args.positionSeconds === "number" && Number.isFinite(args.positionSeconds)) {
    payload.PositionSeconds = args.positionSeconds;
  }

  const normalized = normalizePostResponse(await postJson("JellyChat/Events", payload, true));
  return normalized ? normalizeRoomEvent(normalized) : null;
}

export async function postTypingUpdate(args: {
  groupId: string;
  senderSessionId: string;
  isTyping: boolean;
  participants: string[];
  clientEventId?: string;
}): Promise<RoomEvent | null> {
  const normalized = normalizePostResponse(await postJson("JellyChat/Events", {
    GroupId: args.groupId || "",
    SenderSessionId: args.senderSessionId || "",
    Type: "typing.update",
    IsTyping: args.isTyping,
    ClientEventId: args.clientEventId || createClientEventId(),
    ParticipantsCsv: args.participants.join(",")
  }, true));

  return normalized ? normalizeRoomEvent(normalized) : null;
}
