import type { ChatMessage, RoomEvent } from "../types";
import { fetchJson, postJson } from "./jellyfin";
import { createClientEventId, getValue, isUsableDisplayName } from "../runtime/util";

export function normalizeRoomEvent(roomEvent: unknown): RoomEvent {
  const type = String(getValue(roomEvent, "Type", "type") || "");
  const sequence = Number(getValue(roomEvent, "Sequence", "sequence") || 0);

  return {
    id: String(getValue(roomEvent, "Id", "id") || ""),
    sequence: Number.isFinite(sequence) ? sequence : 0,
    groupId: String(getValue(roomEvent, "GroupId", "groupId") || ""),
    type,
    userId: String(getValue(roomEvent, "UserId", "userId") || ""),
    userName: String(getValue(roomEvent, "UserName", "userName") || ""),
    sessionId: String(getValue(roomEvent, "SessionId", "sessionId") || ""),
    createdAtUtc: String(getValue(roomEvent, "CreatedAtUtc", "createdAtUtc") || ""),
    text: String(getValue(roomEvent, "Text", "text") || ""),
    emoji: String(getValue(roomEvent, "Emoji", "emoji") || ""),
    playbackAction: String(getValue(roomEvent, "PlaybackAction", "playbackAction") || ""),
    fromPositionTicks: getValue(roomEvent, "FromPositionTicks", "fromPositionTicks"),
    toPositionTicks: getValue(roomEvent, "ToPositionTicks", "toPositionTicks"),
    itemId: String(getValue(roomEvent, "ItemId", "itemId") || ""),
    itemName: String(getValue(roomEvent, "ItemName", "itemName") || ""),
    clientEventId: String(getValue(roomEvent, "ClientEventId", "clientEventId") || "")
  };
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
    createdAtUtc: event.createdAtUtc
  };
}

export async function getEvents(groupId: string, afterSequence: number, limit: number, forceFull: boolean): Promise<RoomEvent[]> {
  let path = "JellyChat/Events?groupId=" + encodeURIComponent(groupId) + "&limit=" + encodeURIComponent(String(limit));
  if (!forceFull && afterSequence > 0) {
    path += "&afterSequence=" + encodeURIComponent(String(afterSequence));
  }

  return normalizeEventsResponse(await fetchJson(path));
}

export async function postChatMessage(args: {
  groupId: string;
  senderSessionId: string;
  text: string;
  participants: string[];
}): Promise<ChatMessage | null> {
  const response = await postJson("JellyChat/Events", {
    GroupId: args.groupId || "",
    SenderSessionId: args.senderSessionId || "",
    Type: "chat.message",
    Text: args.text,
    ClientEventId: createClientEventId(),
    ParticipantsCsv: args.participants.join(",")
  }, true);

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

  return normalized ? normalizeChatMessage(normalized) : null;
}
