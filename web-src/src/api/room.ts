import type { RoomAccessInfo } from "../types";
import { deleteJson, postJson, putJson } from "./jellyfin";
import { getValue } from "../runtime/util";

export function normalizeRoomAccessInfo(response: unknown): RoomAccessInfo | null {
  if (!response || typeof response !== "object") {
    return null;
  }

  const rawParticipants = getValue(response, "Participants", "participants");
  return {
    inGroup: getValue(response, "InGroup", "inGroup") === true,
    groupId: String(getValue(response, "GroupId", "groupId") || "").trim(),
    groupName: String(getValue(response, "GroupName", "groupName") || "").trim(),
    sessionId: String(getValue(response, "SessionId", "sessionId") || "").trim(),
    deviceId: String(getValue(response, "DeviceId", "deviceId") || "").trim(),
    participants: Array.isArray(rawParticipants)
      ? rawParticipants.map((participant) => String(participant || "").trim()).filter(Boolean)
      : [],
    exactMembership: getValue(response, "ExactMembership", "exactMembership") === true,
    membershipSource: String(getValue(response, "MembershipSource", "membershipSource") || "").trim(),
    passwordProtected: getValue(response, "PasswordProtected", "passwordProtected") === true,
    authorized: getValue(response, "Authorized", "authorized") === true,
    isOwner: getValue(response, "IsOwner", "isOwner") === true
  };
}

export async function unlockRoom(senderSessionId: string, password: string): Promise<RoomAccessInfo | null> {
  return normalizeRoomAccessInfo(await postJson("JellyChat/Room/Unlock", {
    SenderSessionId: senderSessionId,
    Password: password
  }, true));
}

export async function setRoomPassword(senderSessionId: string, password: string): Promise<RoomAccessInfo | null> {
  return normalizeRoomAccessInfo(await putJson("JellyChat/Room/Password", {
    SenderSessionId: senderSessionId,
    Password: password
  }, true));
}

export async function disableRoomPassword(senderSessionId: string): Promise<RoomAccessInfo | null> {
  const query = senderSessionId ? "?senderSessionId=" + encodeURIComponent(senderSessionId) : "";
  return normalizeRoomAccessInfo(await deleteJson("JellyChat/Room/Password" + query, true));
}
