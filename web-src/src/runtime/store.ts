import type { ChatActions, ChatMessage, ChatState, MessageGroupModel, PlaybackEventType, ReactionEvent, RoomEvent, SyncPlayContext, TimelineItem } from "../types";
import { getEvents, normalizeChatMessage, postChatMessage, postEmojiReaction, postPlaybackEvent } from "../api/events";
import { fetchJson } from "../api/jellyfin";
import { buildTimelineItems, countDebugNodes, createClientEventId, formId, groupingWindowMs, groupMessages, inputId, isUsableDisplayName, logDebug, normalizeId, recordError, refreshIntervalMs } from "./util";
import { getActiveMountHost, getDrawerSide, handleFloatingButtonFocusChange, isDrawerOpen, moveJellyChatRootToHost, scheduleLayoutUpdate, setDrawerSide, showFloatingButton, updateLayout } from "./layout";
import { getCurrentPlaybackSnapshot, installPlaybackActionLogging, scanPlaybackTarget } from "./playback";
import { addReactionOverlay, addRoomReactionOverlay, recordReactionReceived, setReactionParticipantCount } from "./reactions";

type Subscriber = (state: ChatState) => void;
type PlaybackPostRequest = {
  type: PlaybackEventType;
  positionSeconds?: number;
  fromSeconds?: number;
  itemId?: string;
  itemName?: string;
};

let refreshInProgress = false;
let sendInProgress = false;
let eventFetchInProgress = false;
let lastPollStartedAt = 0;
let historyEvents: RoomEvent[] = [];
let historyMessages: ChatMessage[] = [];
let groupedMessages: MessageGroupModel[] = [];
let timelineItems: TimelineItem[] = [];
let lastEventGroupId = "";
let lastSequence = 0;
let optimisticSequence = 0;
let cachedLocalActorName = "";
let cachedCurrentSessionIds: string[] = [];
const localClientEventIds = new Set<string>();
const seenReactionEventKeys = new Set<string>();
let currentSyncPlayContext: SyncPlayContext = {
  inGroup: false,
  groupId: "",
  groupName: "",
  participantCount: 1,
  unavailable: true
};
let state: ChatState = {
  drawerOpen: false,
  drawerSide: getDrawerSide(),
  syncPlay: currentSyncPlayContext,
  messages: [],
  groups: [],
  timelineItems: [],
  sending: false
};

const subscribers = new Set<Subscriber>();
const slowPollIntervalMs = 2000;

function getNextOptimisticSequence(): number {
  optimisticSequence = Math.max(optimisticSequence + 1, lastSequence + 1);
  return optimisticSequence;
}

function setActorDebug(actorName: string, fallbackReason: string): void {
  if (!window.JellyChatDebug) {
    return;
  }

  window.JellyChatDebug.lastResolvedActorName = actorName || null;
  window.JellyChatDebug.lastActorFallbackReason = fallbackReason || null;
}

function emit(): void {
  state = {
    drawerOpen: isDrawerOpen(),
    drawerSide: getDrawerSide(),
    syncPlay: currentSyncPlayContext,
    messages: historyMessages.slice(),
    groups: groupedMessages.slice(),
    timelineItems: timelineItems.slice(),
    sending: sendInProgress
  };

  if (window.JellyChatDebug) {
    window.JellyChatDebug.messageCount = historyMessages.length;
    window.JellyChatDebug.groupCount = groupedMessages.length;
    window.JellyChatDebug.timelineCount = timelineItems.length;
    window.JellyChatDebug.currentGroupId = currentSyncPlayContext.groupId;
    window.JellyChatDebug.lastSequence = lastSequence;
    countDebugNodes();
  }

  subscribers.forEach((subscriber) => subscriber(state));
}

export function getState(): ChatState {
  return state;
}

export function subscribe(subscriber: Subscriber): () => void {
  subscribers.add(subscriber);
  subscriber(state);
  return () => subscribers.delete(subscriber);
}

function createRoomEvent(args: {
  id: string;
  type: string;
  groupId: string;
  userName: string;
  clientEventId: string;
  text?: string;
  emoji?: string;
  fromPositionTicks?: number;
  toPositionTicks?: number;
  positionSeconds?: number;
  itemId?: string;
  itemName?: string;
  optimistic?: boolean;
}): RoomEvent {
  const actorName = resolveEventActorName({
    userId: getCurrentUserId(),
    userName: args.userName,
    sessionId: "",
    clientEventId: args.clientEventId,
    optimistic: args.optimistic
  });
  return {
    id: args.id,
    sequence: args.optimistic ? getNextOptimisticSequence() : lastSequence,
    groupId: args.groupId,
    type: args.type,
    userId: getCurrentUserId(),
    userName: actorName,
    sessionId: "",
    createdAtUtc: new Date().toISOString(),
    text: args.text || "",
    emoji: args.emoji || "",
    playbackAction: args.type.replace("playback.", ""),
    fromPositionTicks: args.fromPositionTicks ?? null,
    toPositionTicks: args.toPositionTicks ?? null,
    positionSeconds: args.positionSeconds ?? null,
    itemId: args.itemId || "",
    itemName: args.itemName || "",
    clientEventId: args.clientEventId,
    eventKey: args.clientEventId ? "client:" + args.clientEventId : "id:" + args.id,
    optimistic: args.optimistic
  };
}

function isCurrentUserEvent(event: Pick<RoomEvent, "userId" | "sessionId" | "clientEventId">): boolean {
  const currentUserId = normalizeId(getCurrentUserId());
  const eventUserId = normalizeId(event.userId);
  if (currentUserId && eventUserId && currentUserId === eventUserId) {
    return true;
  }

  const eventSessionId = normalizeId(event.sessionId);
  return !!(eventSessionId && cachedCurrentSessionIds.map(normalizeId).includes(eventSessionId));
}

function resolveEventActorName(event: Pick<RoomEvent, "userId" | "userName" | "sessionId" | "clientEventId"> & { optimistic?: boolean }, existing?: RoomEvent): string {
  if (existing && isUsableDisplayName(existing.userName)) {
    setActorDebug(existing.userName.trim(), "existing-event");
    return existing.userName.trim();
  }

  if (isUsableDisplayName(event.userName)) {
    setActorDebug(event.userName.trim(), "event-payload");
    return event.userName.trim();
  }

  if (event.optimistic || localClientEventIds.has(event.clientEventId) || isCurrentUserEvent(event)) {
    const local = resolveLocalActorName();
    return local.actorName;
  }

  setActorDebug("Someone", "anonymous-remote-event");
  return "Someone";
}

function getStableEventKey(event: RoomEvent): string {
  return event.eventKey
    || (event.clientEventId ? "client:" + event.clientEventId : "")
    || (event.sequence > 0 ? "sequence:" + event.sequence : "")
    || (event.id ? "id:" + event.id : "")
    || "fallback:" + event.type + ":" + event.createdAtUtc;
}

function mergeConfirmedEvent(existing: RoomEvent, incoming: RoomEvent): RoomEvent {
  const userName = resolveEventActorName(incoming, existing);
  return {
    ...existing,
    ...incoming,
    id: incoming.id || existing.id,
    sequence: incoming.sequence || existing.sequence,
    createdAtUtc: incoming.createdAtUtc || existing.createdAtUtc,
    text: incoming.text || existing.text,
    emoji: incoming.emoji || existing.emoji,
    fromPositionTicks: incoming.fromPositionTicks ?? existing.fromPositionTicks,
    toPositionTicks: incoming.toPositionTicks ?? existing.toPositionTicks,
    positionSeconds: incoming.positionSeconds ?? existing.positionSeconds,
    itemId: incoming.itemId || existing.itemId,
    itemName: incoming.itemName || existing.itemName,
    userName,
    clientEventId: incoming.clientEventId || existing.clientEventId,
    eventKey: existing.eventKey || getStableEventKey(existing),
    optimistic: false
  };
}

function getPendingOptimisticCount(): number {
  return historyEvents.filter((event) => event.optimistic).length;
}

function deriveTimelineFromHistory(): void {
  historyMessages = historyEvents
    .map(normalizeChatMessage)
    .filter((message): message is ChatMessage => !!(message && message.id && message.text));
  groupedMessages = groupMessages(historyMessages, groupingWindowMs);
  timelineItems = buildTimelineItems(historyEvents, groupingWindowMs);
  lastSequence = historyEvents.reduce((maxSequence, event) => event.optimistic ? maxSequence : Math.max(maxSequence, Number(event.sequence || 0)), lastSequence);
  optimisticSequence = Math.max(optimisticSequence, lastSequence);

  if (window.JellyChatDebug) {
    window.JellyChatDebug.lastSequence = lastSequence;
    window.JellyChatDebug.groupingWindowMs = groupingWindowMs;
    window.JellyChatDebug.lastGroupedAt = new Date().toISOString();
  }
}

function mergeHistoryEvents(events: RoomEvent[]): void {
  const byKey: Record<string, RoomEvent> = {};
  const clientIdToKey: Record<string, string> = {};
  const sequenceToKey: Record<string, string> = {};
  let addedCount = 0;
  let updatedCount = 0;
  let preservedCount = 0;
  let replacedCount = 0;
  let confirmedCount = Number(window.JellyChatDebug?.confirmedOptimisticEventCount || 0);
  let lastConfirmedClientEventId = "";
  historyEvents.forEach((event) => {
    event.eventKey = getStableEventKey(event);
    const key = event.eventKey;
    byKey[key] = event;
    if (event.clientEventId) clientIdToKey[event.clientEventId] = key;
    if (event.sequence > 0) sequenceToKey[String(event.sequence)] = key;
  });
  events.forEach((event) => {
    event.eventKey = getStableEventKey(event);
    const sequenceKey = event.sequence > 0 ? sequenceToKey[String(event.sequence)] : "";
    if (event.clientEventId && clientIdToKey[event.clientEventId]) {
      const key = clientIdToKey[event.clientEventId];
      const existing = byKey[key];
      byKey[key] = mergeConfirmedEvent(existing, event);
      if (existing.optimistic && !event.optimistic) {
        confirmedCount += 1;
        lastConfirmedClientEventId = event.clientEventId;
      }
      updatedCount += 1;
      preservedCount += 1;
      return;
    }

    if (sequenceKey && byKey[sequenceKey]) {
      const existing = byKey[sequenceKey];
      byKey[sequenceKey] = {
        ...existing,
        ...event,
        userName: resolveEventActorName(event, existing),
        eventKey: existing.eventKey || event.eventKey,
        optimistic: existing.optimistic && event.optimistic
      };
      updatedCount += 1;
      preservedCount += 1;
      return;
    }

    const key = event.eventKey;
    if (byKey[key]) {
      byKey[key] = {
        ...byKey[key],
        ...event,
        userName: resolveEventActorName(event, byKey[key]),
        eventKey: byKey[key].eventKey || event.eventKey
      };
      updatedCount += 1;
      preservedCount += 1;
    } else {
      event.userName = resolveEventActorName(event);
      byKey[key] = event;
      addedCount += 1;
    }
    if (event.clientEventId) clientIdToKey[event.clientEventId] = key;
    if (event.sequence > 0) sequenceToKey[String(event.sequence)] = key;
  });

  historyEvents = Object.keys(byKey)
    .map((id) => byKey[id])
    .sort((left, right) => {
      if (left.optimistic !== right.optimistic) {
        return left.optimistic ? 1 : -1;
      }

      const leftSequence = Number(left.sequence || 0);
      const rightSequence = Number(right.sequence || 0);
      return leftSequence !== rightSequence
        ? leftSequence - rightSequence
        : String(left.createdAtUtc).localeCompare(String(right.createdAtUtc));
    });

  if (historyEvents.length > 100) {
    historyEvents = historyEvents.slice(historyEvents.length - 100);
  }

  deriveTimelineFromHistory();
  if (window.JellyChatDebug) {
    window.JellyChatDebug.lastEventMergeCount = events.length;
    window.JellyChatDebug.optimisticEventCount = getPendingOptimisticCount();
    window.JellyChatDebug.pendingOptimisticEventCount = getPendingOptimisticCount();
    window.JellyChatDebug.confirmedOptimisticEventCount = confirmedCount;
    window.JellyChatDebug.lastConfirmedClientEventId = lastConfirmedClientEventId || window.JellyChatDebug.lastConfirmedClientEventId || null;
    window.JellyChatDebug.lastTimelineMergeStrategy = "stable-event-key";
    window.JellyChatDebug.lastTimelinePreservedCount = preservedCount;
    window.JellyChatDebug.lastTimelineReplacedCount = replacedCount;
    window.JellyChatDebug.lastTimelineAddedCount = addedCount;
    window.JellyChatDebug.lastTimelineUpdatedCount = updatedCount;
  }
  emit();
}

function updateLastSequenceFromEvents(events: RoomEvent[]): void {
  events.forEach((roomEvent) => {
    lastSequence = Math.max(lastSequence, Number(roomEvent.sequence || 0));
  });
  optimisticSequence = Math.max(optimisticSequence, lastSequence);

  if (window.JellyChatDebug) {
    window.JellyChatDebug.lastSequence = lastSequence;
    window.JellyChatDebug.eventCount = Number(window.JellyChatDebug.eventCount || 0) + events.length;
  }
}

function getReactionEventKey(event: RoomEvent): string {
  return event.clientEventId || event.eventKey || (event.sequence > 0 ? "sequence:" + event.sequence : "id:" + event.id);
}

function isReactionEvent(event: RoomEvent): boolean {
  return event.type === "reaction.emoji" && !!event.emoji;
}

function recordSeenReactionEvents(events: RoomEvent[]): void {
  events.filter(isReactionEvent).forEach((event) => {
    seenReactionEventKeys.add(getReactionEventKey(event));
  });
}

function processReactionEvents(events: RoomEvent[], skipOverlay: boolean): void {
  const reactionEvents = events.filter(isReactionEvent);
  if (reactionEvents.length === 0) {
    return;
  }

  if (skipOverlay) {
    recordSeenReactionEvents(reactionEvents);
    return;
  }

  reactionEvents.forEach((event) => {
    const key = getReactionEventKey(event);
    if (seenReactionEventKeys.has(key)) {
      return;
    }

    seenReactionEventKeys.add(key);
    recordReactionReceived(event);
    if (skipOverlay || localClientEventIds.has(event.clientEventId)) {
      return;
    }

    addRoomReactionOverlay(event);
  });
}

async function fetchChatEvents(forceFull: boolean): Promise<void> {
  if (eventFetchInProgress || !currentSyncPlayContext.inGroup || !currentSyncPlayContext.groupId) {
    return;
  }

  let shouldFetchFull = forceFull;
  if (lastEventGroupId !== currentSyncPlayContext.groupId) {
    lastEventGroupId = currentSyncPlayContext.groupId;
    lastSequence = 0;
    optimisticSequence = 0;
    shouldFetchFull = true;
  }

  eventFetchInProgress = true;
  try {
    const startedAt = Date.now();
    const events = await getEvents(currentSyncPlayContext.groupId, lastSequence, 100, shouldFetchFull);
    if (window.JellyChatDebug) {
      window.JellyChatDebug.lastEventPollAt = new Date().toISOString();
      window.JellyChatDebug.lastEventRoundTripMs = Date.now() - startedAt;
    }
    updateLastSequenceFromEvents(events);
    processReactionEvents(events, shouldFetchFull);
    const timelineEvents = events.filter((event) => !isReactionEvent(event));
    if (timelineEvents.length > 0 || shouldFetchFull) {
      mergeHistoryEvents(timelineEvents);
    } else {
      emit();
    }
  } catch (err) {
    logDebug("Failed to fetch JellyChat events", err);
  } finally {
    eventFetchInProgress = false;
  }
}

function setCurrentSyncPlayContext(context: SyncPlayContext): void {
  const wasInGroup = currentSyncPlayContext.inGroup;
  const groupChanged = context.groupId !== currentSyncPlayContext.groupId;
  currentSyncPlayContext = {
    inGroup: !!context.inGroup,
    groupId: context.groupId || "",
    groupName: context.groupName || "",
    participantCount: Math.max(1, Math.floor(context.participantCount || 1)),
    unavailable: !!context.unavailable
  };
  setReactionParticipantCount(currentSyncPlayContext.participantCount);

  if (!currentSyncPlayContext.inGroup || groupChanged) {
    const hadTimeline = historyEvents.length > 0 || timelineItems.length > 0;
    historyEvents = [];
    historyMessages = [];
    groupedMessages = [];
    timelineItems = [];
    lastSequence = 0;
    optimisticSequence = 0;
    lastEventGroupId = currentSyncPlayContext.groupId;
    seenReactionEventKeys.clear();
    if (window.JellyChatDebug) {
      if (hadTimeline) {
        window.JellyChatDebug.lastTimelineClearedAt = new Date().toISOString();
      }
      window.JellyChatDebug.optimisticEventCount = 0;
      window.JellyChatDebug.pendingOptimisticEventCount = 0;
    }
  }

  emit();
  if (!wasInGroup && currentSyncPlayContext.inGroup && isDrawerOpen()) {
    focusComposer("group-joined");
  }
}

function getCurrentUserId(): string {
  if (!window.ApiClient) return "";
  if (typeof window.ApiClient.getCurrentUserId === "function") return window.ApiClient.getCurrentUserId() || "";
  if (typeof window.ApiClient.userId === "function") return window.ApiClient.userId() || "";
  if (typeof window.ApiClient._userId === "string") return window.ApiClient._userId;
  if (window.ApiClient._serverInfo && typeof window.ApiClient._serverInfo.UserId === "string") return window.ApiClient._serverInfo.UserId;
  return "";
}

function getCurrentUserIds(): string[] {
  const raw = getCurrentUserId();
  const ids = raw ? [raw] : [];
  const normalized = normalizeId(raw);
  if (normalized && !ids.includes(normalized)) ids.push(normalized);
  return ids;
}

function getCurrentUserName(): string {
  if (!window.ApiClient) return "";
  const serverInfo = window.ApiClient._serverInfo;
  if (serverInfo && typeof serverInfo.UserName === "string" && serverInfo.UserName.length > 0) return serverInfo.UserName;
  if (window.Dashboard && window.Dashboard.getCurrentUser) {
    const currentUser = window.Dashboard.getCurrentUser();
    if (currentUser && typeof currentUser.Name === "string" && currentUser.Name.length > 0) return currentUser.Name;
  }
  return "";
}

function getSessionUserName(session: any): string {
  const value = (session && session.UserName)
    || (session && session.User && session.User.Name)
    || (session && session.User && session.User.Username)
    || "";
  return typeof value === "string" ? value.trim() : "";
}

function resolveLocalActorName(sessions: any[] = [], currentSession: any | null = null): { actorName: string; fallbackReason: string } {
  const apiUserName = getCurrentUserName();
  if (isUsableDisplayName(apiUserName)) {
    cachedLocalActorName = apiUserName.trim();
    setActorDebug(cachedLocalActorName, "api-current-user");
    return { actorName: cachedLocalActorName, fallbackReason: "api-current-user" };
  }

  const currentSessionName = getSessionUserName(currentSession);
  if (isUsableDisplayName(currentSessionName)) {
    cachedLocalActorName = currentSessionName;
    setActorDebug(cachedLocalActorName, "current-session");
    return { actorName: cachedLocalActorName, fallbackReason: "current-session" };
  }

  const matchingSessionName = sessions
    .filter(matchesCurrentUser)
    .map(getSessionUserName)
    .find(isUsableDisplayName);
  if (matchingSessionName) {
    cachedLocalActorName = matchingSessionName;
    setActorDebug(cachedLocalActorName, "matching-session");
    return { actorName: cachedLocalActorName, fallbackReason: "matching-session" };
  }

  if (isUsableDisplayName(cachedLocalActorName)) {
    setActorDebug(cachedLocalActorName, "cached-local-user");
    return { actorName: cachedLocalActorName, fallbackReason: "cached-local-user" };
  }

  setActorDebug("Someone", "missing-local-user");
  return { actorName: "Someone", fallbackReason: "missing-local-user" };
}

function getCurrentDeviceId(): string {
  if (!window.ApiClient) return "";
  if (typeof window.ApiClient.deviceId === "function") return window.ApiClient.deviceId() || "";
  if (typeof window.ApiClient._deviceId === "string") return window.ApiClient._deviceId;
  return "";
}

function matchesCurrentUser(session: any): boolean {
  const currentUserIds = getCurrentUserIds();
  if (!currentUserIds.length) return true;
  const sessionUserId = (session && session.UserId) || (session && session.User && session.User.Id) || "";
  return currentUserIds.some((id) => normalizeId(id) === normalizeId(sessionUserId));
}

function getCurrentSessionIds(sessions: any[]): string[] {
  return sessions.filter(matchesCurrentUser).map((session) => session && session.Id).filter((id): id is string => typeof id === "string" && id.length > 0);
}

function getCurrentSession(sessions: any[]): any | null {
  const currentDeviceId = normalizeId(getCurrentDeviceId());
  const matchingUserSessions = sessions.filter(matchesCurrentUser);
  if (currentDeviceId) {
    const exact = matchingUserSessions.find((session) => normalizeId(session && session.DeviceId) === currentDeviceId);
    if (exact) return exact;
  }
  return matchingUserSessions.length > 0 ? matchingUserSessions[0] : null;
}

function collectStringValues(value: unknown, output: string[]): void {
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    output.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStringValues(item, output));
    return;
  }
  if (typeof value === "object") {
    Object.keys(value as Record<string, unknown>).forEach((key) => collectStringValues((value as Record<string, unknown>)[key], output));
  }
}

function normalizeSessionsResponse(response: unknown): any[] {
  if (Array.isArray(response)) return response;
  if (response && typeof response === "object" && Array.isArray((response as { Items?: unknown[] }).Items)) return (response as { Items: unknown[] }).Items;
  if (response && typeof response === "object" && Array.isArray((response as { Sessions?: unknown[] }).Sessions)) return (response as { Sessions: unknown[] }).Sessions;
  return [];
}

function normalizeGroupsResponse(response: unknown): any[] {
  if (Array.isArray(response)) return response;
  if (response && typeof response === "object" && Array.isArray((response as { Groups?: unknown[] }).Groups)) return (response as { Groups: unknown[] }).Groups;
  if (response && typeof response === "object" && Array.isArray((response as { Items?: unknown[] }).Items)) return (response as { Items: unknown[] }).Items;
  return [];
}

function objectContainsString(value: unknown, expectedLowerValue: string): boolean {
  if (!value || !expectedLowerValue) return false;
  if (typeof value === "string") {
    const actual = normalizeId(value);
    const expected = normalizeId(expectedLowerValue);
    return !!(actual && expected && actual === expected);
  }
  if (Array.isArray(value)) return value.some((item) => objectContainsString(item, expectedLowerValue));
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).some((key) => objectContainsString((value as Record<string, unknown>)[key], expectedLowerValue));
  return false;
}

function extractSyncPlayGroupId(session: any): string {
  const playState = session && session.PlayState;
  const groupId = (session && session.PlayState && session.PlayState.SyncPlayGroupId)
    || (session && session.PlayState && session.PlayState.SyncPlayGroup)
    || (session && session.SyncPlayGroupId)
    || (session && session.SyncPlayGroup)
    || (session && session.SyncPlayGroup && session.SyncPlayGroup.Id)
    || (playState && playState.SyncPlayGroup && playState.SyncPlayGroup.Id)
    || (playState && playState.SyncPlayInfo && playState.SyncPlayInfo.GroupId)
    || (session && session.AdditionalData && session.AdditionalData.SyncPlayGroupId)
    || "";
  return typeof groupId === "string" ? groupId : "";
}

function hasSyncPlayGroup(session: any): boolean {
  return extractSyncPlayGroupId(session).length > 0;
}

function buildSessionsPaths(): string[] {
  const paths = ["Sessions"];
  getCurrentUserIds().forEach((id) => {
    const path = "Sessions?UserId=" + encodeURIComponent(id);
    if (!paths.includes(path)) paths.push(path);
  });
  return paths;
}

async function fetchSessions(): Promise<any[]> {
  const sessionsById: Record<string, any> = {};
  const sessionsWithoutId: any[] = [];
  for (const path of buildSessionsPaths()) {
    try {
      const sessions = normalizeSessionsResponse(await fetchJson(path));
      sessions.forEach((session) => {
        const sessionId = session && session.Id;
        if (typeof sessionId === "string" && sessionId.length > 0) {
          sessionsById[sessionId] = session;
          return;
        }
        sessionsWithoutId.push(session);
      });
    } catch (err) {
      logDebug("Failed to fetch sessions path", { path, error: err });
    }
  }

  const deduped = Object.keys(sessionsById).map((id) => sessionsById[id]);
  return deduped.length === 0 && sessionsWithoutId.length > 0 ? sessionsWithoutId : deduped;
}

function isLikelySessionId(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return /^[a-f0-9]{32}$/i.test(trimmed) || /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(trimmed);
}

function resolveSyncPlayGroupId(group: any): string {
  const direct = (group && group.Id) || (group && group.GroupId) || (group && group.Group && group.Group.Id) || (group && group.GroupInfo && group.GroupInfo.Id) || "";
  if (typeof direct === "string" && direct.length > 0) return direct;
  const values: string[] = [];
  collectStringValues(group, values);
  return values.find(isLikelySessionId) || "";
}

function resolveSyncPlayGroupName(group: any): string {
  const direct = (group && group.GroupName)
    || (group && group.Name)
    || (group && group.DisplayName)
    || (group && group.Group && group.Group.GroupName)
    || (group && group.Group && group.Group.Name)
    || (group && group.GroupInfo && group.GroupInfo.GroupName)
    || (group && group.GroupInfo && group.GroupInfo.Name)
    || "";
  return typeof direct === "string" ? direct : "";
}

function getGroupIdsForCurrentUserSessions(sessions: any[]): string[] {
  const groupIds: string[] = [];
  sessions.filter(matchesCurrentUser).forEach((session) => {
    const groupId = extractSyncPlayGroupId(session);
    if (groupId && !groupIds.includes(groupId)) groupIds.push(groupId);
  });
  return groupIds;
}

function findGroupsByGroupIds(groups: any[], groupIds: string[]): any[] {
  if (!groups.length || !groupIds.length) return [];
  const normalizedGroupIds = groupIds.map(normalizeId).filter(Boolean);
  return groups.filter((group) => normalizedGroupIds.includes(normalizeId(resolveSyncPlayGroupId(group))));
}

function buildCurrentIdentityTokens(sessions: any[]): string[] {
  const tokens: string[] = [];
  getCurrentUserIds().forEach((id) => {
    if (id && !tokens.includes(id)) tokens.push(id);
  });
  const currentUserName = getCurrentUserName();
  if (currentUserName && !tokens.includes(currentUserName)) tokens.push(currentUserName);
  getCurrentSessionIds(sessions).forEach((sessionId) => {
    if (sessionId && !tokens.includes(sessionId)) tokens.push(sessionId);
  });
  sessions.filter(matchesCurrentUser).forEach((session) => {
    const userName = (session && session.UserName) || (session && session.User && session.User.Name) || "";
    if (userName && !tokens.includes(userName)) tokens.push(userName);
  });
  return tokens;
}

function groupsContainCurrentUser(groups: any[], sessions: any[]): boolean {
  const tokens = buildCurrentIdentityTokens(sessions);
  if (tokens.length === 0) return false;
  return groups.some((group) => tokens.some((token) => objectContainsString(group, token)));
}

function extractParticipantsFromGroups(groups: any[]): string[] {
  const participants: string[] = [];
  groups.forEach((group) => {
    const groupParticipants = group && group.Participants;
    if (!Array.isArray(groupParticipants)) return;
    groupParticipants.forEach((participant: any) => {
      if (typeof participant === "string" && participant.length > 0 && !participants.includes(participant)) {
        participants.push(participant);
        return;
      }
      if (participant && typeof participant === "object") {
        const userName = participant.UserName || (participant.User && participant.User.Name) || "";
        const deviceName = participant.DeviceName || participant.Device || "";
        if (typeof userName === "string" && userName.length > 0 && !participants.includes(userName)) participants.push(userName);
        if (typeof deviceName === "string" && deviceName.length > 0 && !participants.includes(deviceName)) participants.push(deviceName);
      }
    });
  });
  return participants;
}

function getGroupParticipantCount(group: any): number {
  const participants = group && group.Participants;
  return Array.isArray(participants) && participants.length > 0 ? participants.length : 1;
}

function getEventPollIntervalMs(): number {
  return isDrawerOpen() && currentSyncPlayContext.inGroup && currentSyncPlayContext.groupId
    ? refreshIntervalMs
    : slowPollIntervalMs;
}

async function refreshEventsImmediately(): Promise<void> {
  if (!currentSyncPlayContext.inGroup || !currentSyncPlayContext.groupId) {
    return;
  }

  if (window.JellyChatDebug) {
    window.JellyChatDebug.lastImmediateRefreshAt = new Date().toISOString();
  }
  await fetchChatEvents(false);
}

async function resolveEventPostContext(): Promise<{ senderSessionId: string; groupId: string; participants: string[]; userName: string } | null> {
  const sessions = await fetchSessions();
  const groups = normalizeGroupsResponse(await fetchJson("SyncPlay/List"));
  const currentSession = getCurrentSession(sessions);
  cachedCurrentSessionIds = getCurrentSessionIds(sessions);
  const groupIds = getGroupIdsForCurrentUserSessions(sessions);
  const groupsBySessionGroupIds = findGroupsByGroupIds(groups, groupIds);
  const relevantGroups = groups.filter((group) => groupsContainCurrentUser([group], sessions));
  const groupsForSend = groupsBySessionGroupIds.length > 0 ? groupsBySessionGroupIds : (relevantGroups.length > 0 ? relevantGroups : (groups.length === 1 ? [groups[0]] : []));
  const participants = extractParticipantsFromGroups(groupsForSend.length > 0 ? groupsForSend : groups);
  const preferredGroupId = groupIds.length > 0 ? groupIds[0] : resolveSyncPlayGroupId(groupsForSend[0] || groups[0]);

  if (!preferredGroupId) {
    return null;
  }

  const actor = resolveLocalActorName(sessions, currentSession);
  return {
    senderSessionId: currentSession && currentSession.Id,
    groupId: preferredGroupId,
    participants,
    userName: actor.actorName
  };
}

function secondsToTicks(positionSeconds: number | undefined): number | undefined {
  if (positionSeconds === undefined || !Number.isFinite(positionSeconds)) {
    return undefined;
  }

  return Math.max(0, Math.round(positionSeconds * 10000000));
}

async function resolveCurrentSyncPlayContext(): Promise<SyncPlayContext> {
  if (!window.ApiClient) {
    return { inGroup: false, groupId: "", groupName: "", participantCount: 1, unavailable: true };
  }

  const sessions = await fetchSessions();
  cachedCurrentSessionIds = getCurrentSessionIds(sessions);
  const matchingUserSessions = sessions.filter(matchesCurrentUser);
  if (matchingUserSessions.length === 0) {
    return { inGroup: false, groupId: "", groupName: "", participantCount: 1, unavailable: false };
  }

  const groupIds = getGroupIdsForCurrentUserSessions(sessions);
  let groups: any[] = [];
  let groupsUnavailable = false;
  try {
    groups = normalizeGroupsResponse(await fetchJson("SyncPlay/List"));
  } catch (err) {
    groupsUnavailable = true;
    logDebug("SyncPlay list request failed", err);
  }

  if (groupIds.length > 0 || matchingUserSessions.some(hasSyncPlayGroup)) {
    const preferredGroupId = groupIds.length > 0 ? groupIds[0] : "";
    const matchingGroup = findGroupsByGroupIds(groups, groupIds)[0] || null;
    return {
      inGroup: true,
      groupId: preferredGroupId || resolveSyncPlayGroupId(matchingGroup),
      groupName: resolveSyncPlayGroupName(matchingGroup),
      participantCount: getGroupParticipantCount(matchingGroup),
      unavailable: false
    };
  }

  if (groups.length > 0) {
    const matchingGroup = groups.filter((group) => groupsContainCurrentUser([group], sessions))[0] || null;
    if (matchingGroup) {
      return {
        inGroup: true,
        groupId: resolveSyncPlayGroupId(matchingGroup),
        groupName: resolveSyncPlayGroupName(matchingGroup),
        participantCount: getGroupParticipantCount(matchingGroup),
        unavailable: false
      };
    }
  }

  return { inGroup: false, groupId: "", groupName: "", participantCount: 1, unavailable: groupsUnavailable };
}

async function refreshSyncPlayState(): Promise<void> {
  if (refreshInProgress) return;
  refreshInProgress = true;
  try {
    setCurrentSyncPlayContext(await resolveCurrentSyncPlayContext());
  } catch (err) {
    logDebug("Failed to refresh SyncPlay state", err);
    setCurrentSyncPlayContext({ inGroup: false, groupId: "", groupName: "", participantCount: 1, unavailable: true });
  } finally {
    refreshInProgress = false;
  }
}

export async function pollJellyChat(): Promise<void> {
  const now = Date.now();
  const pollIntervalMs = getEventPollIntervalMs();
  if (window.JellyChatDebug) {
    window.JellyChatDebug.eventPollIntervalMs = pollIntervalMs;
  }

  if (lastPollStartedAt > 0 && now - lastPollStartedAt < pollIntervalMs) {
    return;
  }

  lastPollStartedAt = now;
  await refreshSyncPlayState();
  scanPlaybackTarget();
  if (currentSyncPlayContext.inGroup && (isDrawerOpen() || currentSyncPlayContext.groupId)) {
    await fetchChatEvents(false);
  }
}

export function getCurrentGroupLabel(): string {
  if (currentSyncPlayContext.groupName) return currentSyncPlayContext.groupName;
  if (currentSyncPlayContext.groupId) return "Group " + currentSyncPlayContext.groupId.slice(0, 8);
  return "Current group";
}

function clearComposerInput(): void {
  const input = document.getElementById(inputId) as HTMLTextAreaElement | null;
  if (input) {
    input.value = "";
    input.style.height = "auto";
  }
}

export function focusComposer(reason: string): void {
  const focus = () => {
    const input = document.getElementById(inputId) as HTMLTextAreaElement | null;
    if (!input || input.disabled || !currentSyncPlayContext.inGroup || !isDrawerOpen()) return;
    try {
      input.focus({ preventScroll: true });
    } catch {
      input.focus();
    }
    if (window.JellyChatDebug) {
      window.JellyChatDebug.inputFocused = document.activeElement === input;
      window.JellyChatDebug.lastFocusReason = reason;
    }
  };

  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(focus);
  } else {
    window.setTimeout(focus, 0);
  }
}

export const actions: ChatActions = {
  openDrawer: () => {
    moveJellyChatRootToHost(getActiveMountHost());
    emit();
    window.setTimeout(() => {
      const drawer = document.getElementById("jellyChatDrawer");
      if (drawer) {
        drawer.classList.add("is-open");
        drawer.setAttribute("aria-hidden", "false");
        if ("inert" in drawer) {
          (drawer as HTMLElement & { inert?: boolean }).inert = false;
        }
      }
      emit();
      updateLayout("drawer-open");
      pollJellyChat();
      focusComposer("drawer-open");
    }, 0);
  },
  closeDrawer: () => {
    const drawer = document.getElementById("jellyChatDrawer");
    if (drawer) {
      drawer.classList.remove("is-open");
      drawer.setAttribute("aria-hidden", "true");
      if ("inert" in drawer) {
        (drawer as HTMLElement & { inert?: boolean }).inert = true;
      }
    }
    emit();
    updateLayout("drawer-close");
  },
  toggleDrawer: () => {
    if (isDrawerOpen()) {
      actions.closeDrawer();
    } else {
      actions.openDrawer();
    }
  },
  toggleDrawerSide: () => {
    const nextSide = getDrawerSide() === "right" ? "left" : "right";
    setDrawerSide(nextSide);
    emit();
    updateLayout("drawer-side");
  },
  sendMessage: async (text: string) => {
    const trimmedText = text.trim();
    if (!trimmedText || sendInProgress) return false;
    if (!currentSyncPlayContext.inGroup) {
      logDebug("Send blocked because the current session is not in a SyncPlay group.");
      emit();
      return false;
    }

    sendInProgress = true;
    emit();
    try {
      const postContext = await resolveEventPostContext();
      if (!postContext) {
        logDebug("Send blocked because no active SyncPlay group could be resolved.");
        return false;
      }

      const clientEventId = createClientEventId();
      localClientEventIds.add(clientEventId);
      const optimisticEvent = createRoomEvent({
        id: "optimistic-" + clientEventId,
        type: "chat.message",
        groupId: postContext.groupId,
        userName: postContext.userName,
        clientEventId,
        text: trimmedText,
        optimistic: true
      });
      mergeHistoryEvents([optimisticEvent]);
      if (window.JellyChatDebug) {
        window.JellyChatDebug.lastOptimisticClientEventId = clientEventId;
        window.JellyChatDebug.lastOptimisticActorName = optimisticEvent.userName;
      }

      const result = await postChatMessage({
        text: trimmedText,
        senderSessionId: postContext.senderSessionId,
        groupId: postContext.groupId,
        participants: postContext.participants,
        clientEventId
      });

      if (window.JellyChatDebug) {
        window.JellyChatDebug.lastEventPostAt = new Date().toISOString();
      }

      if (result && result.id) {
        mergeHistoryEvents([{
          ...createRoomEvent({
            id: result.id,
            type: "chat.message",
            groupId: result.groupId,
            userName: result.userName,
            clientEventId,
            text: result.text
          }),
          sequence: result.sequence,
          userId: result.userId,
          createdAtUtc: result.createdAtUtc,
          optimistic: false
        }]);
        void refreshEventsImmediately();
        clearComposerInput();
        focusComposer("send-success");
        return true;
      }

      logDebug("Failed to send SyncPlay chat message.");
      return false;
    } catch (err) {
      logDebug("Failed to send SyncPlay chat message", err);
      return false;
    } finally {
      sendInProgress = false;
      emit();
      focusComposer("send-success");
    }
  },
  sendReaction: async (emoji: string) => {
    const normalizedEmoji = emoji.trim();
    if (!normalizedEmoji || !currentSyncPlayContext.inGroup) {
      return false;
    }

    const clientEventId = createClientEventId();
    localClientEventIds.add(clientEventId);
    seenReactionEventKeys.add(clientEventId);
    const playback = getCurrentPlaybackSnapshot();
    const positionSeconds = typeof playback.positionSeconds === "number" && Number.isFinite(playback.positionSeconds)
      ? playback.positionSeconds
      : undefined;
    const localReaction: ReactionEvent = {
      emoji: normalizedEmoji,
      clientEventId,
      userId: getCurrentUserId(),
      userName: "",
      groupId: currentSyncPlayContext.groupId,
      itemId: playback.itemId || "",
      itemName: playback.itemName || "",
      positionSeconds: positionSeconds ?? null,
      createdAtUtc: new Date().toISOString()
    };
    addReactionOverlay(localReaction);
    if (window.JellyChatDebug) {
      const now = new Date().toISOString();
      window.JellyChatDebug.reactionEventCount = Number(window.JellyChatDebug.reactionEventCount || 0) + 1;
      window.JellyChatDebug.lastReactionEmoji = normalizedEmoji;
      window.JellyChatDebug.lastReactionSentAt = now;
      window.JellyChatDebug.lastReactionClientEventId = clientEventId;
    }

    try {
      const postContext = await resolveEventPostContext();
      if (!postContext) {
        logDebug("Reaction blocked because no active SyncPlay group could be resolved.");
        return false;
      }

      setReactionParticipantCount(Math.max(1, postContext.participants.length || currentSyncPlayContext.participantCount));

      const result = await postEmojiReaction({
        emoji: normalizedEmoji,
        senderSessionId: postContext.senderSessionId,
        groupId: postContext.groupId,
        participants: postContext.participants,
        itemId: playback.itemId,
        itemName: playback.itemName,
        positionSeconds,
        clientEventId
      });
      if (window.JellyChatDebug) {
        window.JellyChatDebug.lastEventPostAt = new Date().toISOString();
      }

      if (result && result.id) {
        seenReactionEventKeys.add(getReactionEventKey(result));
        void refreshEventsImmediately();
        return true;
      }

      logDebug("Failed to send emoji reaction.");
      return false;
    } catch (err) {
      logDebug("Failed to send emoji reaction", err);
      return false;
    }
  },
  setInputFocused: (focused: boolean) => {
    if (window.JellyChatDebug) {
      window.JellyChatDebug.inputFocused = focused;
    }
  }
};

export async function postLocalPlaybackEvent(request: PlaybackPostRequest): Promise<boolean> {
  if (!currentSyncPlayContext.inGroup) {
    return false;
  }

  try {
    const postContext = await resolveEventPostContext();
    if (!postContext) {
      logDebug("Playback event blocked because no active SyncPlay group could be resolved.");
      return false;
    }

    const clientEventId = createClientEventId();
    localClientEventIds.add(clientEventId);
    const fromPositionTicks = secondsToTicks(request.fromSeconds);
    const toPositionTicks = secondsToTicks(request.positionSeconds);
    const optimisticEvent = createRoomEvent({
      id: "optimistic-" + clientEventId,
      type: request.type,
      groupId: postContext.groupId,
      userName: postContext.userName,
      clientEventId,
      fromPositionTicks,
      toPositionTicks,
      itemId: request.itemId,
      itemName: request.itemName,
      optimistic: true
    });
    mergeHistoryEvents([optimisticEvent]);
    if (window.JellyChatDebug) {
      window.JellyChatDebug.lastOptimisticClientEventId = clientEventId;
      window.JellyChatDebug.lastOptimisticActorName = optimisticEvent.userName;
    }

    const result = await postPlaybackEvent({
      type: request.type,
      senderSessionId: postContext.senderSessionId,
      groupId: postContext.groupId,
      participants: postContext.participants,
      fromPositionTicks,
      toPositionTicks,
      itemId: request.itemId,
      itemName: request.itemName,
      clientEventId
    });

    if (result && result.id) {
      if (window.JellyChatDebug) {
        const now = new Date().toISOString();
        window.JellyChatDebug.lastEventPostAt = now;
        window.JellyChatDebug.lastPlaybackEventPostAt = now;
        window.JellyChatDebug.lastPlaybackEventType = request.type;
        window.JellyChatDebug.playbackEventCount = Number(window.JellyChatDebug.playbackEventCount || 0) + 1;
      }
      mergeHistoryEvents([result]);
      void refreshEventsImmediately();
      return true;
    }

    return false;
  } catch (err) {
    logDebug("Failed to send playback event", err);
    return false;
  }
}

export function installRouteWatcher(): void {
  if (window.__JELLYCHAT_HISTORY_PATCHED__) return;
  const originalPushState = window.history && window.history.pushState;
  const originalReplaceState = window.history && window.history.replaceState;
  const emitRouteChange = () => window.dispatchEvent(new Event("jellychat-routechange"));

  if (typeof originalPushState === "function") {
    window.history.pushState = function pushState(...args: Parameters<History["pushState"]>) {
      const result = originalPushState.apply(this, args);
      emitRouteChange();
      return result;
    };
  }

  if (typeof originalReplaceState === "function") {
    window.history.replaceState = function replaceState(...args: Parameters<History["replaceState"]>) {
      const result = originalReplaceState.apply(this, args);
      emitRouteChange();
      return result;
    };
  }

  window.__JELLYCHAT_HISTORY_PATCHED__ = true;
}

function bindEvent(target: EventTarget | null, type: string, handler: EventListener, options?: AddEventListenerOptions): void {
  if (!target || typeof target.addEventListener !== "function") return;
  target.addEventListener(type, handler, options);
  if (window.JellyChatDebug) {
    window.JellyChatDebug.listenerCount += 1;
  }
}

export function startRuntime(): void {
  window.__jellyChatLoaded = true;
  installRouteWatcher();
  installPlaybackActionLogging(postLocalPlaybackEvent);
  updateLayout("start");
  pollJellyChat();

  if (window.__JELLYCHAT_REFRESH_INTERVAL_ID__ === undefined || window.__JELLYCHAT_REFRESH_INTERVAL_ID__ === null) {
    window.__JELLYCHAT_REFRESH_INTERVAL_ID__ = window.setInterval(pollJellyChat, refreshIntervalMs);
  }
  if (window.JellyChatDebug) {
    window.JellyChatDebug.intervalCount = 1;
  }

  if (!window.__JELLYCHAT_LISTENERS_BOUND__) {
    bindEvent(window, "focus", () => pollJellyChat());
    bindEvent(document, "visibilitychange", () => {
      if (!document.hidden) pollJellyChat();
    });
    bindEvent(document, "mousemove", () => showFloatingButton("mousemove"), { passive: true });
    bindEvent(document, "pointermove", () => showFloatingButton("pointermove"), { passive: true });
    bindEvent(document, "touchstart", () => showFloatingButton("touchstart"), { passive: true });
    bindEvent(document, "focusin", () => handleFloatingButtonFocusChange("focusin"));
    bindEvent(document, "focusout", () => handleFloatingButtonFocusChange("focusout"));
    bindEvent(window, "resize", () => scheduleLayoutUpdate("resize"));
    bindEvent(document, "fullscreenchange", () => {
      showFloatingButton("fullscreenchange");
      scanPlaybackTarget();
      updateLayout("fullscreenchange");
      if (isDrawerOpen()) focusComposer("fullscreenchange");
    });
    bindEvent(window, "hashchange", () => {
      showFloatingButton("hashchange");
      scanPlaybackTarget();
      scheduleLayoutUpdate("hashchange");
    });
    bindEvent(window, "popstate", () => {
      showFloatingButton("popstate");
      scanPlaybackTarget();
      scheduleLayoutUpdate("popstate");
    });
    bindEvent(window, "jellychat-routechange", () => {
      showFloatingButton("routechange");
      scanPlaybackTarget();
      scheduleLayoutUpdate("routechange");
    });
    window.__JELLYCHAT_LISTENERS_BOUND__ = true;
  }
}

export function syncErrorBoundary(error: unknown): void {
  recordError(error);
  emit();
}

export function getComposerForm(): HTMLFormElement | null {
  return document.getElementById(formId) as HTMLFormElement | null;
}
